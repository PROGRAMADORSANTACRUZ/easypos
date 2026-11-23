import assert from 'node:assert/strict';
import test from 'node:test';
import { tenantStorage } from '../src/prisma.js';
import {
  buscarTerceroPorNit, consultaDisponible, consultarTerceroCliente, erroresSiesa, guardarTerceroCliente, separarNombreSiesa,
} from '../src/siesaTerceros.js';

const env = { CONSULTA_API_URL: 'https://api.prueba/', CONSULTA_API_KEY: 'clave', SIESA_WS_CIA: '4' };
const cliente = {
  tipoCliente: 'NATURAL', tipoDocumento: 'CC', numeroDocumento: '1044616409', nombres: 'Oscar David', apellidos: 'Hernandez Guzman',
  direccion: 'Cra 15A # 68-15', telefono: '3001234567', email: 'a@b.co', municipioSiesaCodigo: '16908001',
};
const SIN_ERRORES = '<soap:Envelope><diffgr:diffgram /></soap:Envelope>';

// API simulada: estado de los NIT en Siesa y registro de llamadas.
function apiSimulada({
  existentes = new Map(), crear = { estado: 'ok', respuesta_siesa: SIN_ERRORES }, crearCliente = { estado: 'ok', respuesta_siesa: SIN_ERRORES },
  efecto = true, efectoCliente = true, datos = [],
} = {}) {
  const llamadas = [];
  const solicitar = async (url, opciones) => {
    const ruta = url.replace('https://api.prueba', '');
    const cuerpo = opciones.body ? JSON.parse(opciones.body) : null;
    llamadas.push({ ruta, cuerpo, clave: opciones.headers['X-API-Key'] });
    const responder = (json) => ({ ok: true, status: 200, text: async () => JSON.stringify(json) });
    if (ruta === '/verificar-cliente') return responder({ resultado: existentes.get(cuerpo.nit) ?? 0 });
    if (ruta.startsWith('/clientes?')) return responder({ data: datos });
    if (ruta.startsWith('/crear/terceros')) {
      if (efecto && crear.estado === 'ok') existentes.set(cuerpo[0].nit, Math.max(existentes.get(cuerpo[0].nit) ?? 0, 1));
      return responder(crear);
    }
    if (ruta.startsWith('/crear/clientes')) {
      if (efectoCliente && crearCliente.estado === 'ok' && (existentes.get(cuerpo[0].nit) ?? 0) > 0) existentes.set(cuerpo[0].nit, 2);
      return responder(crearCliente);
    }
    throw new Error(`ruta inesperada ${ruta}`);
  };
  return { llamadas, solicitar, existentes };
}

const logs = [];
const base = { logIntegracion: { create: async ({ data }) => { logs.push(`${data.tipo}:${data.estado}:${data.mensaje}`); return data; } } };
const enBase = (fn) => tenantStorage.run(base, fn);

test('la consulta a Siesa solo esta disponible con CONSULTA_API_KEY', () => {
  assert.equal(consultaDisponible({}), false);
  assert.equal(consultaDisponible(env), true);
});

test('consultar: tercero nuevo no trae datos; uno existente devuelve lo que hoy tiene Siesa', async () => {
  const nuevo = apiSimulada();
  const r1 = await consultarTerceroCliente(cliente, { env, solicitar: nuevo.solicitar });
  assert.equal(r1.existe, false);
  assert.equal(r1.existente, null);
  assert.equal(r1.tercero.razon_social, 'HERNANDEZ GUZMAN OSCAR DAVID');
  assert.deepEqual(nuevo.llamadas.map((l) => l.ruta), ['/verificar-cliente']);
  assert.deepEqual(nuevo.llamadas[0].cuerpo, { nit: '1044616409', compania: 4 });
  assert.equal(nuevo.llamadas[0].clave, 'clave');

  const existente = apiSimulada({
    existentes: new Map([['1044616409', 2]]),
    datos: [{ TERCERO: 'HERNANDEZ GUZMAN OSCAR DAVID', SUCURSAL: '001', DIRECCION: 'carrera 15A #68-15 ', CIUDAD_MUNICIPIO: 'Barranquilla', DEPARTAMENTO: 'Atlántico', CELULAR: '1044616409', EMAIL: 'x@y.co' }],
  });
  const r2 = await consultarTerceroCliente(cliente, { env, solicitar: existente.solicitar });
  assert.equal(r2.existe, true);
  assert.equal(r2.resultado, 2);
  assert.deepEqual(r2.existente, {
    nombre: 'HERNANDEZ GUZMAN OSCAR DAVID', sucursal: '001', direccion: 'carrera 15A #68-15', ciudad: 'Barranquilla, Atlántico', ciudadNombre: 'Barranquilla',
    departamentoCodigo: '', municipioCodigo: '', telefono: '1044616409', email: 'x@y.co',
  });
  assert.equal(existente.llamadas[1].ruta, '/clientes?cia=4&nit=1044616409');
});

test('guardar: crea el tercero, luego el cliente 001, y solo responde cuando Siesa confirma ambos', async () => {
  logs.length = 0;
  const api = apiSimulada();
  const r = await enBase(() => guardarTerceroCliente(cliente, { env, solicitar: api.solicitar }));
  assert.deepEqual(r, { accion: 'creado', nit: '1044616409', resultado: 2 });
  assert.deepEqual(api.llamadas.map((l) => l.ruta), [
    '/verificar-cliente', '/crear/terceros?cia=4', '/verificar-cliente', '/crear/clientes?cia=4', '/verificar-cliente',
  ]);
  assert.equal(api.llamadas[1].cuerpo[0].primer_apellido, 'HERNANDEZ');
  assert.deepEqual(api.llamadas[3].cuerpo, [{
    nit: '1044616409', sucursal: '001', razon_social: 'HERNANDEZ GUZMAN OSCAR DAVID', direccion: 'CRA 15A # 68-15',
    departamento: '08', ciudad: '001', telefono: '3001234567', correo_electronico: 'a@b.co',
  }]);
  assert.deepEqual(logs, ['TERCERO:1044616409:OK:Tercero creado en Siesa', 'CLIENTEAPI:1044616409:OK:Cliente creado en Siesa']);

  const sinCondiciones = apiSimulada();
  await enBase(() => guardarTerceroCliente(cliente, { env: { ...env, CONSULTA_CLIENTES_SIN_CONDICIONES: 'true' }, solicitar: sinCondiciones.solicitar }));
  assert.equal(sinCondiciones.llamadas[3].ruta, '/crear/clientes?cia=4&sin_condiciones=true');
});

test('guardar: un tercero existente solo se reemplaza si se confirma la actualizacion', async () => {
  const api = apiSimulada({ existentes: new Map([['1044616409', 2]]) });
  await assert.rejects(enBase(() => guardarTerceroCliente(cliente, { env, solicitar: api.solicitar })), { status: 409 });
  assert.deepEqual(api.llamadas.map((l) => l.ruta), ['/verificar-cliente']);

  const r = await enBase(() => guardarTerceroCliente(cliente, { env, solicitar: api.solicitar, actualizar: true }));
  assert.equal(r.accion, 'actualizado');
  // Solo tercero: se crea el cliente sobre el tercero existente.
  const soloTercero = apiSimulada({ existentes: new Map([['1044616409', 1]]) });
  const r2 = await enBase(() => guardarTerceroCliente(cliente, { env, solicitar: soloTercero.solicitar, actualizar: true }));
  assert.deepEqual([r2.accion, r2.resultado], ['creado', 2]);
});

test('guardar: los rechazos de Siesa (f_detalle) y las cargas sin efecto quedan como error', async () => {
  logs.length = 0;
  const rechazo = apiSimulada({
    crear: { estado: 'ok', respuesta_siesa: '<NewDataSet><Table><f_detalle>Ciudad no existe</f_detalle></Table></NewDataSet>' },
  });
  await assert.rejects(enBase(() => guardarTerceroCliente(cliente, { env, solicitar: rechazo.solicitar })), /Ciudad no existe/);
  assert.equal(rechazo.llamadas.some((l) => l.ruta.startsWith('/crear/clientes')), false);

  const sinEfecto = apiSimulada({ efecto: false });
  await assert.rejects(enBase(() => guardarTerceroCliente(cliente, { env, solicitar: sinEfecto.solicitar })), /no confirmo el tercero/);

  const clienteRechazado = apiSimulada({
    crearCliente: { estado: 'ok', respuesta_siesa: '<f_detalle>El tercero no existe.</f_detalle>' },
  });
  await assert.rejects(enBase(() => guardarTerceroCliente(cliente, { env, solicitar: clienteRechazado.solicitar })), /rechazo el cliente: El tercero no existe/);

  const clienteSinEfecto = apiSimulada({ efectoCliente: false });
  await assert.rejects(enBase(() => guardarTerceroCliente(cliente, { env, solicitar: clienteSinEfecto.solicitar })), /no confirmo el cliente/);
  assert.deepEqual(logs.map((l) => l.split(':').slice(0, 3).join(':')), [
    'TERCERO:1044616409:ERROR', 'TERCERO:1044616409:ERROR',
    'TERCERO:1044616409:OK', 'CLIENTEAPI:1044616409:ERROR',
    'TERCERO:1044616409:OK', 'CLIENTEAPI:1044616409:ERROR',
  ]);
});

test('errores de la API y de la red se informan con status 502', async () => {
  const caida = async () => ({ ok: false, status: 500, text: async () => 'boom' });
  await assert.rejects(consultarTerceroCliente(cliente, { env, solicitar: caida }), { status: 502, message: /HTTP 500/ });
  const sinRed = async () => { throw new Error('ECONNREFUSED'); };
  await assert.rejects(consultarTerceroCliente(cliente, { env, solicitar: sinRed }), { status: 502, message: /No se pudo conectar/ });
});

test('buscar por NIT: separa el nombre, arma los codigos de ubicacion y avisa si no existe', async () => {
  const fila = (extra) => ({ TERCERO: 'HERNANDEZ GUZMAN OSCAR DAVID', SUCURSAL: '001', DIRECCION: 'carrera 15A', COD_DEPTO: '08', COD_CIUDAD: '001', CIUDAD_MUNICIPIO: 'Barranquilla', DEPARTAMENTO: 'Atlántico', CELULAR: '300', EMAIL: 'a@b.co', ...extra });
  const existente = apiSimulada({ existentes: new Map([['1044616409', 2]]), datos: [fila({ SUCURSAL: '002', DIRECCION: 'otra' }), fila()] });
  const r = await buscarTerceroPorNit('1044616409', { env, solicitar: existente.solicitar });
  assert.equal(r.existe, true);
  assert.equal(r.datos.direccion, 'carrera 15A'); // prefiere la sucursal 001
  assert.deepEqual([r.datos.primerApellido, r.datos.segundoApellido, r.datos.nombres], ['HERNANDEZ', 'GUZMAN', 'OSCAR DAVID']);
  assert.deepEqual([r.datos.departamentoCodigo, r.datos.municipioCodigo, r.datos.ciudadNombre], ['16908', '16908001', 'Barranquilla']);

  const nuevo = apiSimulada();
  assert.deepEqual(await buscarTerceroPorNit('1048324073', { env, solicitar: nuevo.solicitar }), { existe: false, resultado: 0 });

  const soloTercero = apiSimulada({ existentes: new Map([['900', 1]]) });
  const r3 = await buscarTerceroPorNit('900', { env, solicitar: soloTercero.solicitar });
  assert.deepEqual([r3.existe, r3.datos], [true, null]);

  assert.deepEqual(separarNombreSiesa('PEREZ ANA'), { primerApellido: 'PEREZ', segundoApellido: '', nombres: 'ANA' });
  assert.deepEqual(separarNombreSiesa(''), { primerApellido: '', segundoApellido: '', nombres: '' });
});

test('erroresSiesa lee f_detalle crudos o escapados', () => {
  assert.deepEqual(erroresSiesa('<f_detalle>Uno</f_detalle><f_detalle> </f_detalle>&lt;f_detalle&gt;Dos &amp; tres&lt;/f_detalle&gt;'), ['Uno', 'Dos & tres']);
  assert.deepEqual(erroresSiesa(SIN_ERRORES), []);
});
