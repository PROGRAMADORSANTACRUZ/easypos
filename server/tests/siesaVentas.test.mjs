import assert from 'node:assert/strict';
import test from 'node:test';
import {
  codigoSucursalSiesa, configSiesa, construirPlanoVenta, construirSobreSoap, construirXmlImportar, interpretarRespuestaSiesa, mediosDePago,
} from '../src/siesaVentas.js';
import { tenantStorage } from '../src/prisma.js';
import { enviarPendientesSiesa, iniciarProgramadorSiesa, seleccionarPendientes } from '../src/siesaProgramador.js';
import { construirPlanoCliente, marcarClienteParaReenvio, sucursalesYaEnviadas } from '../src/siesaClientes.js';
import { construirPlanoRecibo } from '../src/siesaRecibos.js';

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

test('el programador salta lo ya enviado u omitido y limita los rechazos de Siesa', () => {
  const facturas = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id }));
  const log = (id, estado) => ({ tipo: `VENTA:${id}`, estado });
  const logs = [
    log('a', 'OK'), log('b', 'OMITIDO'), log('c', 'REINTENTAR'), log('c', 'REINTENTAR'),
    ...Array.from({ length: 5 }, () => log('d', 'ERROR')), log('e', 'ERROR'),
  ];
  assert.deepEqual(seleccionarPendientes(facturas, logs).map(({ id }) => id), ['c', 'e', 'f']);
  assert.deepEqual(seleccionarPendientes(facturas, logs, 2).map(({ id }) => id), ['c', 'e']);
});

test('enviarPendientesSiesa envia cliente, recibos y ventas en orden y salta lo ya enviado', async () => {
  const consultas = [];
  const cliente = {
    abono: { findMany: async () => [{ id: 7 }, { id: 8 }] },
    factura: {
      findMany: async (args) => {
        consultas.push(args);
        return [{ id: 'f1', clienteId: 'c1', numeroDocumentoCliente: '900' }, { id: 'f2', clienteId: 'c1', numeroDocumentoCliente: '900' }];
      },
    },
    facturaVenta: { findMany: async () => [{ id: 'v1', clienteId: null, numeroDocumentoCliente: null }] },
    logIntegracion: {
      findMany: async ({ where }) => [{ tipo: 'VENTA:f1', estado: 'OK' }, { tipo: 'RECIBO:7', estado: 'OK' }]
        .filter(({ tipo }) => where.tipo.in.includes(tipo)),
    },
  };
  const orden = [];
  const desde = new Date('2026-11-21T00:00:00-05:00');
  const resumen = await tenantStorage.run(cliente, () => enviarPendientesSiesa({
    desde,
    intentarCliente: async (id) => { orden.push(`cliente:${id}`); return { estado: 'OK' }; },
    intentarRecibo: async (id) => { orden.push(`recibo:${id}`); return { estado: 'OK' }; },
    intentar: async (modelo, id) => { orden.push(`${modelo}:${id}`); return { estado: id === 'v1' ? 'ERROR' : 'OK' }; },
  }));
  assert.deepEqual(orden, ['recibo:8', 'cliente:c1', 'factura:f2', 'facturaVenta:v1']);
  assert.deepEqual(resumen, { OK: 2, ERROR: 1, REINTENTAR: 0, OMITIDO: 0 });
  assert.deepEqual(consultas[0].where.AND, [{ cabecera: { is: { createdAt: { gte: desde } } } }]);
});

test('si el cliente no se acepta en Siesa, sus facturas esperan a la siguiente corrida', async () => {
  const cliente = {
    abono: { findMany: async () => [] },
    factura: { findMany: async () => [{ id: 'f1', clienteId: 'c1', numeroDocumentoCliente: '900' }] },
    facturaVenta: { findMany: async () => [] },
    logIntegracion: { findMany: async () => [] },
  };
  const enviadas = [];
  const resumen = await tenantStorage.run(cliente, () => enviarPendientesSiesa({
    desde: new Date(),
    intentarCliente: async () => ({ estado: 'ERROR' }),
    intentar: async (modelo, id) => { enviadas.push(id); return { estado: 'OK' }; },
  }));
  assert.deepEqual(enviadas, []);
  assert.equal(resumen.ERROR, 1);
});

const clienteSiesa = (extra = {}) => ({
  nombre: 'Maria Perez', razonSocial: 'Restaurante Ñandú & Cía SAS', numeroDocumento: '900.123.456-7', documento: null,
  direccion: 'Cra 5 # 6-7', barrio: 'Centro', telefono: '3001234567', email: 'a@b.co', condicionPago: 'CONTADO',
  creditoDias: null, creditoCupo: null, municipioSiesaCodigo: '16908001', createdAt: new Date('2026-11-20T03:30:00Z'), ...extra,
});

test('cliente: registro 201 con ancho 1117, ubicacion del catalogo y valores del POS', () => {
  const lineas = construirPlanoCliente(clienteSiesa(), '4');
  assert.equal(lineas[0], '000000100000001004');
  assert.equal(lineas[1].length, 1117);
  assert.equal(lineas[2], '000000399990001004');
  const r = lineas[1];
  assert.equal(r.slice(7, 11), '0201');
  assert.equal(r.slice(19, 34), '900123456      ');
  assert.equal(r.slice(38, 78).trim(), 'Restaurante Nandu & Cia SAS');
  assert.equal(r.slice(142, 143), '5');
  assert.equal(r.slice(168, 171), '420');
  assert.equal(r.slice(142 - 3, 142), '021');
  assert.equal(r.slice(599, 601), '08');
  assert.equal(r.slice(601, 604), '001');
  assert.equal(r.slice(949, 957), '20261119');
});

test('cliente: a credito usa dias y cupo; sin documento no se puede enviar', () => {
  const r = construirPlanoCliente(clienteSiesa({ condicionPago: 'CREDITO', creditoDias: 30, creditoCupo: 500000 }), 4)[1];
  assert.equal(r.slice(86, 89), '30D');
  assert.equal(r.slice(92, 113), '500000.0000'.padStart(21, '0'));
  assert.throws(() => construirPlanoCliente(clienteSiesa({ numeroDocumento: null }), 4), /NIT/);
});

test('recibo de caja: 350 y dos 351 con los anchos esperados y el cruce al propio documento', () => {
  const lineas = construirPlanoRecibo({ id: 12, monto: 25000, createdAt: new Date('2026-11-20T15:00:00Z'), nota: 'Abono mesa' }, '900.123.456-7', '4');
  assert.deepEqual(lineas.map((linea) => linea.length), [18, 318, 788, 1036, 18]);
  assert.deepEqual(lineas.slice(1, 4).map((linea) => linea.slice(7, 11)), ['0350', '0351', '0351']);
  assert.equal(lineas[1].slice(25, 33), '00000012');
  assert.equal(lineas[1].slice(41, 56), '900123456      ');
  assert.equal(lineas[2].slice(32, 52).trim(), '1110050401');
  assert.equal(lineas[3].slice(32, 52).trim(), '2805050501');
  assert.equal(lineas[3].slice(52, 67), '900123456      ');
  assert.equal(lineas[2].slice(115, 136), `+${'25000.0000'.padStart(20, '0')}`);
  assert.equal(lineas[4], '000000599990001004');
});

test('recibo de caja: sin NIT usa el cliente generico', () => {
  const lineas = construirPlanoRecibo({ id: 1, monto: 100, createdAt: new Date(), nota: null }, null, 4);
  assert.equal(lineas[1].slice(41, 56), '222222222      ');
});

const sucursal = (n, extra = {}) => ({ id: `001${String(n).padStart(6, '0')}`, nombre: `SEDE ${n}`, activo: true, createdAt: new Date('2026-11-01'), ...extra });

test('sucursales: el codigo de Siesa es la posicion entre todas las del cliente, por id', () => {
  const todas = [sucursal(30), sucursal(10), sucursal(20)];
  assert.equal(codigoSucursalSiesa(todas, { id: todas[1].id }), '001');
  assert.equal(codigoSucursalSiesa(todas, { id: todas[2].id }), '002');
  assert.equal(codigoSucursalSiesa(todas, { nombre: 'sede 30' }), '003');
  assert.equal(codigoSucursalSiesa(todas, { nombre: 'no existe' }), '001');
  assert.equal(codigoSucursalSiesa([], { nombre: 'x' }), '001');
  assert.equal(codigoSucursalSiesa(null), '001');
});

test('cliente con sucursales: un 201 por sucursal activa, con su codigo, datos y cierre correcto', () => {
  const sucursales = [
    sucursal(1, { direccion: 'CRA 1 # 2-3', telefono: '3111111111', municipioSiesaCodigo: '16911001' }),
    sucursal(2, { activo: false }),
    sucursal(3, { direccion: null, telefono: null }),
  ];
  const lineas = construirPlanoCliente(clienteSiesa({ sucursales }), 4);
  assert.equal(lineas.length, 4);
  assert.deepEqual(lineas.slice(1, 3).map((l) => l.length), [1117, 1117]);
  assert.deepEqual(lineas.slice(1, 3).map((l) => l.slice(34, 37)), ['001', '003']);
  assert.equal(lineas[1].slice(38, 78).trim(), 'SEDE 1');
  assert.equal(lineas[1].slice(516 - 40, 516).trim(), 'CRA 1 # 2-3');
  assert.equal(lineas[1].slice(596, 604), '16911001');
  // La sucursal 3 hereda la direccion y el telefono del cliente.
  assert.equal(lineas[2].slice(516 - 40, 516).trim(), 'Cra 5 # 6-7');
  assert.equal(lineas[2].slice(644, 664).trim(), '3001234567');
  assert.equal(lineas[3], '000000499990001004');
  assert.deepEqual(lineas.slice(0, 3).map((l) => l.slice(0, 7)), ['0000001', '0000002', '0000003']);
});

test('venta y recibo llevan la sucursal del cliente elegida al facturar', () => {
  const base = {
    companiaCodigo: '004', centroOperacionCodigo: '420', tipoDocumentoCodigo: 'FEV', prefijo: 'RM1C', numeroFactura: 20,
    createdAt: new Date('2026-11-20T20:00:00Z'), numeroDocumentoCliente: '900123456', nombreCliente: 'ACME', credito: false,
    metodoPago1: 'EFE', valor1: 1000, valor2: 0, valor3: 0, valor4: 0,
    detalle: [{ productoCodigo: '1', cantidad: 1, total: 1000, unidad: 'U', producto: null }],
  };
  const sinSucursal = construirPlanoVenta(base)[1];
  assert.equal(sinSucursal.slice(63, 66), '001');
  const conSucursal = construirPlanoVenta({ ...base, sucursalSiesa: '003' })[1];
  assert.equal(conSucursal.slice(63, 66), '003');
  assert.equal(conSucursal.slice(103, 106), '003');
  const recibo = construirPlanoRecibo({ id: 4, monto: 500, createdAt: new Date(), nota: null }, '900123456', 4, '002');
  assert.equal(recibo[3].slice(570, 573), '002');
});

test('sucursales ya enviadas a Siesa no se pueden borrar; las creadas despues si', async () => {
  const tx = { logIntegracion: { findFirst: async () => ({ fecha: new Date('2026-11-10') }) } };
  const enviadas = await sucursalesYaEnviadas(tx, 'c1', [
    { id: 'a', nombre: 'VIEJA', createdAt: new Date('2026-11-01') },
    { id: 'b', nombre: 'NUEVA', createdAt: new Date('2026-11-15') },
  ]);
  assert.deepEqual(enviadas.map(({ id }) => id), ['a']);
  const sinEnvio = await sucursalesYaEnviadas({ logIntegracion: { findFirst: async () => null } }, 'c1', [{ id: 'a', createdAt: new Date('2026-01-01') }]);
  assert.deepEqual(sinEnvio, []);
});

test('editar un cliente ya enviado lo marca para reenvio; uno nunca enviado no', async () => {
  const creados = [];
  let hayLog = true;
  const cliente = {
    logIntegracion: {
      findFirst: async () => (hayLog ? { id: 1 } : null),
      create: async ({ data }) => { creados.push(`${data.tipo}:${data.estado}`); return data; },
    },
  };
  await tenantStorage.run(cliente, () => marcarClienteParaReenvio('c1'));
  hayLog = false;
  await tenantStorage.run(cliente, () => marcarClienteParaReenvio('c2'));
  assert.deepEqual(creados, ['CLIENTE:c1:REINICIADO']);
});

test('el programador no arranca sin SIESA_ENVIO_DESDE valida', () => {
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal(iniciarProgramadorSiesa({ SIESA_VENTAS_ACTIVO: 'true' }), null);
    assert.equal(iniciarProgramadorSiesa({ SIESA_VENTAS_ACTIVO: 'true', SIESA_ENVIO_DESDE: 'no-es-fecha' }), null);
  } finally {
    console.error = original;
  }
  assert.equal(iniciarProgramadorSiesa({ SIESA_ENVIO_DESDE: '2026-11-21T00:00:00-05:00' }), null);
});
