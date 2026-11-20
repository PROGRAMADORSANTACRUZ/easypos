import assert from 'node:assert/strict';
import test from 'node:test';
import {
  configSiesa, construirPlanoVenta, construirSobreSoap, construirXmlImportar, interpretarRespuestaSiesa, mediosDePago,
} from '../src/siesaVentas.js';

const factura = (extra = {}) => ({
  companiaCodigo: '004',
  centroOperacionCodigo: '001',
  tipoDocumentoCodigo: 'Z1',
  prefijo: 'FEV',
  numeroFactura: '125',
  createdAt: new Date('2026-11-20T03:30:00Z'), // 22:30 del 19 en Colombia
  numeroDocumentoCliente: '900123456-7',
  nombreCliente: 'Cafetería Ñandú & Cía',
  direccionCliente: null,
  credito: false,
  metodoPago1: 'EFE', valor1: 10000,
  metodoPago2: 'DAT', valor2: 5000,
  metodoPago3: 'QR', valor3: 2500,
  metodoPago4: '0', valor4: 0,
  detalle: [
    { productoCodigo: '1001', cantidad: 2, total: 14000, unidad: 'U', producto: { codigo: '1001', siesaId: '5321', siesaIdUnidadInventario: 'UND' } },
    { productoCodigo: '10600', cantidad: 1, total: 3500, unidad: 'U', producto: null },
  ],
  ...extra,
});

const tipos = (lineas) => lineas.map((linea) => linea.slice(7, 11));

test('arma el plano con los anchos fijos de cada tipo de registro', () => {
  const lineas = construirPlanoVenta(factura());
  assert.deepEqual(tipos(lineas).slice(1, 7), ['0461', '0358', '0358', '0358', '0470', '0470']);
  assert.equal(lineas[0], '000000100000001004');
  assert.equal(lineas.at(-1), '000000899990001004');
  assert.equal(lineas[1].length, 3035);
  for (const linea of lineas.slice(2, 5)) assert.equal(linea.length, 445);
  for (const linea of lineas.slice(5, 7)) assert.equal(linea.length, 2678);
  assert.deepEqual(lineas.map((linea) => linea.slice(0, 7)), ['0000001', '0000002', '0000003', '0000004', '0000005', '0000006', '0000007', '0000008']);
});

test('encabezado: documento, fecha de Colombia, cliente y texto sin acentos ni desbordes', () => {
  const encabezado = construirPlanoVenta(factura())[1];
  assert.equal(encabezado.slice(15, 18), '004');
  assert.equal(encabezado.slice(21, 24), '001');
  assert.equal(encabezado.slice(24, 27), 'Z1 ');
  assert.equal(encabezado.slice(27, 35), '00000125');
  assert.equal(encabezado.slice(35, 43), '20261119');
  assert.equal(encabezado.slice(43, 58), '900123456      ');
  assert.match(encabezado, /Cafeteria Nandu & Cia\s+Calle 123 # 45-67/);
});

test('sin cliente usa el consumidor final y el item lleva el id de Siesa cuando existe', () => {
  const lineas = construirPlanoVenta(factura({ numeroDocumentoCliente: null, nombreCliente: 'Consumidor Final' }));
  assert.equal(lineas[1].slice(43, 58), '222222222      ');
  const [conId, propina] = lineas.slice(5, 7);
  assert.equal(conId.slice(2541, 2548), '0005321');
  assert.equal(propina.slice(2541, 2548), '0000000');
  assert.equal(conId.slice(2548, 2598).trim(), '1001');
  assert.equal(propina.slice(2548, 2598).trim(), '10600');
  assert.equal(conId.slice(32, 42), '0000000001');
  assert.equal(propina.slice(32, 42), '0000000002');
  assert.equal(conId.slice(179, 199), '000000000000002.0000');
  assert.equal(conId.slice(219, 239), '00000000014000.0000'.padStart(20, '0'));
});

test('agrupa los medios de pago de Siesa y trata el ajuste al peso como efectivo', () => {
  const medios = mediosDePago(factura({ metodoPago2: 'AJP', valor2: 40, metodoPago3: 'PSE', valor3: 2500, metodoPago4: 'QR', valor4: 100 }));
  assert.deepEqual(medios, [{ medio: 'EFE', valor: 10040 }, { medio: 'TRA', valor: 2600 }]);
  const pagos = construirPlanoVenta(factura()).slice(2, 5);
  assert.deepEqual(pagos.map((linea) => linea.slice(32, 35)), ['EFE', 'DAT', 'TRA']);
  assert.equal(pagos[0].slice(35, 55), '00000000000000010000');
});

test('rechaza facturas sin detalle o sin medios de pago', () => {
  assert.throws(() => construirPlanoVenta(factura({ detalle: [] })), /detalle/);
  assert.throws(() => construirPlanoVenta(factura({ valor1: 0, valor2: 0, valor3: 0 })), /medios de pago/);
});

test('el XML escapa los datos y el sobre SOAP lo envia dentro de CDATA', () => {
  const cfg = { conexion: 'Conexion', idCia: '4', usuario: 'user', clave: 'p&ss<1>' };
  const xml = construirXmlImportar(['linea & 1', 'linea 2'], cfg);
  assert.match(xml, /<Clave>p&amp;ss&lt;1&gt;<\/Clave>/);
  assert.match(xml, /<Datos><Linea>linea &amp; 1\n<\/Linea><Linea>linea 2\n<\/Linea><\/Datos>/);
  const sobre = construirSobreSoap(xml);
  assert.ok(sobre.includes(`<tem:pvstrDatos><![CDATA[${xml}]]></tem:pvstrDatos>`));
});

test('interpreta la respuesta de Siesa: errores de importacion, fallas SOAP y reintentos', () => {
  const vacio = '<ImportarXMLResult><NewDataSet/></ImportarXMLResult>';
  assert.equal(interpretarRespuestaSiesa(200, vacio).ok, true);
  const conError = '<diffgr:diffgram><NewDataSet><Resultado><f_detalle>Item no existe &amp; otro</f_detalle></Resultado></NewDataSet></diffgr:diffgram>';
  assert.deepEqual(interpretarRespuestaSiesa(200, conError), { ok: false, transitorio: false, mensaje: 'Item no existe & otro' });
  assert.match(interpretarRespuestaSiesa(500, '<faultstring>Boom</faultstring>').mensaje, /HTTP 500/);
  assert.equal(interpretarRespuestaSiesa(500, '').transitorio, true);
  assert.equal(interpretarRespuestaSiesa(0, 'fetch failed').transitorio, true);
  assert.deepEqual(interpretarRespuestaSiesa(200, '<soap:Fault><faultstring>Credenciales invalidas</faultstring></soap:Fault>'),
    { ok: false, transitorio: false, mensaje: 'Credenciales invalidas' });
});

test('el envio solo se activa con SIESA_VENTAS_ACTIVO=true', () => {
  assert.equal(configSiesa({}).activo, false);
  assert.equal(configSiesa({ SIESA_VENTAS_ACTIVO: 'TRUE', SIESA_WS_USER: 'u' }).activo, true);
});
