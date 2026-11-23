import assert from 'node:assert/strict';
import test from 'node:test';
import { tenantStorage } from '../src/prisma.js';
import { procesarPendientes } from '../src/siesaAgenteNucleo.js';
import { listarPendientesSiesa, seleccionarPendientes } from '../src/siesaProgramador.js';
import { autenticarAgente } from '../src/routes/siesaAgente.js';
import { intentarEnvioSiesa, modoAgenteSiesa } from '../src/siesaVentas.js';

const respuestaOk = { status: 200, cuerpo: '<ImportarXMLResult><NewDataSet/></ImportarXMLResult>' };
const respuestaError = { status: 200, cuerpo: '<NewDataSet><Resultado><f_detalle>Cliente no existe</f_detalle></Resultado></NewDataSet>' };
const cfg = { url: 'u', conexion: 'c', idCia: '4', usuario: 'x', clave: 'y' };
const item = (clave, extra = {}) => ({ clave, tipo: clave.split(':')[0], lineas: ['a', 'b'], ...extra });

test('agente: ordena los resultados por documento', async () => {
  const informados = [];
  let indice = 0;
  // Respuestas en el orden de los envios reales (v1 se salta porque su cliente fallo).
  const respuestas = [respuestaError, respuestaOk, respuestaOk, respuestaOk, { status: 0, cuerpo: 'sin red' }];
  const items = [
    item('CLIENTE:c1'), item('VENTA:v1', { depende: 'CLIENTE:c1' }),
    item('VENTA:v2'), item('CLIENTE:c3'), item('VENTA:v3', { depende: 'CLIENTE:c3' }), item('VENTA:v4'),
  ];
  const resumen = await procesarPendientes(items, {
    cfg,
    enviar: async () => respuestas[indice++],
    informar: async (r) => { informados.push(`${r.clave}:${r.estado}`); },
  });
  assert.deepEqual(informados, [
    'CLIENTE:c1:ERROR', 'VENTA:v2:OK', 'CLIENTE:c3:OK', 'VENTA:v3:OK', 'VENTA:v4:REINTENTAR',
  ]);
  assert.deepEqual(resumen, { OK: 3, ERROR: 1, REINTENTAR: 1, SALTADOS: 1, YA_EN_SIESA: 0 });
});

test('agente: una factura que ya esta en Siesa (t350) se marca OK sin enviarla', async () => {
  const informados = [];
  const enviados = [];
  const verificados = [];
  const resumen = await procesarPendientes([
    item('VENTA:v1', { verificar: { compania: 4, centro: '420', tipo: 'FEV', numero: 8 } }),
    item('VENTA:v2', { verificar: { compania: 4, centro: '420', tipo: 'FEV', numero: 15 } }),
  ], {
    cfg,
    existeEnSiesa: async (doc) => { verificados.push(doc.numero); return doc.numero === 8; },
    enviar: async () => { enviados.push(1); return respuestaOk; },
    informar: async (r) => { informados.push(`${r.clave}:${r.estado}:${r.mensaje}`); },
  });
  assert.deepEqual(verificados, [8, 15]);
  assert.equal(enviados.length, 1);
  assert.match(informados[0], /^VENTA:v1:OK:Ya existia en Siesa/);
  assert.equal(resumen.YA_EN_SIESA, 1);
  assert.equal(resumen.OK, 1);
});

test('agente: si la consulta a Siesa falla (sin VPN) el ciclo se aborta sin informar', async () => {
  const informados = [];
  await assert.rejects(procesarPendientes([item('VENTA:v1', { verificar: { compania: 4, centro: '420', tipo: 'FEV', numero: 1 } })], {
    cfg,
    existeEnSiesa: async () => { throw new Error('timeout de conexion'); },
    enviar: async () => respuestaOk,
    informar: async (r) => { informados.push(r); },
  }), /timeout/);
  assert.deepEqual(informados, []);
});

test('pendientes: un reenvio pedido a mano reabre el documento y reinicia los rechazos', () => {
  const logs = [
    ...Array.from({ length: 5 }, () => ({ tipo: 'VENTA:a', estado: 'ERROR' })),
    { tipo: 'VENTA:b', estado: 'OK' },
    { tipo: 'VENTA:c', estado: 'OK' }, { tipo: 'VENTA:c', estado: 'REINICIADO' },
  ];
  logs.splice(5, 0, { tipo: 'VENTA:a', estado: 'REINICIADO' });
  const pendientes = seleccionarPendientes([{ id: 'a' }, { id: 'b' }, { id: 'c' }], logs).map(({ id }) => id);
  assert.deepEqual(pendientes, ['a', 'c']);
});

test('listarPendientesSiesa: clientes primero, la venta depende del cliente y se omiten los que ya estan', async () => {
  const creados = [];
  const cliente = {
    abono: { findMany: async () => [{ id: 3 }] },
    factura: { findMany: async () => [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }] },
    facturaVenta: { findMany: async () => [] },
    logIntegracion: {
      findMany: async ({ where }) => (where.tipo.startsWith ? [] : [
        { tipo: 'CLIENTE:cOk', estado: 'OK' },
        ...Array.from({ length: 5 }, () => ({ tipo: 'CLIENTE:cMalo', estado: 'ERROR' })),
      ].filter(({ tipo }) => where.tipo.in.includes(tipo))),
      create: async ({ data }) => { creados.push(`${data.tipo}:${data.estado}`); return data; },
    },
  };
  const ventas = {
    f1: { lineas: ['v1'], clienteId: 'cNuevo' }, f2: { lineas: ['v2'], clienteId: 'cOk' },
    f3: { lineas: ['v3'], clienteId: 'cMalo' },
  };
  const items = await tenantStorage.run(cliente, () => listarPendientesSiesa({
    desde: new Date('2026-11-21T00:00:00-05:00'),
    cfg,
    preparar: {
      venta: async (modelo, id) => ventas[id],
      cliente: async (id) => (id === 'cNuevo' ? { lineas: [`c:${id}`] } : { omitido: 'sin nit' }),
      recibo: async (id) => ({ lineas: [`r:${id}`] }),
    },
  }));
  assert.deepEqual(items.map((i) => i.clave), ['CLIENTE:cNuevo', 'RECIBO:3', 'VENTA:f1', 'VENTA:f2']);
  assert.equal(items[2].depende, 'CLIENTE:cNuevo');
  assert.equal(items[3].depende, null);
  assert.deepEqual(creados, []);
});

test('listarPendientesSiesa: un cliente pedido a mano se envia solo, sin facturas, y uno ya aceptado no', async () => {
  const logs = [
    { tipo: 'CLIENTE:cPedido', estado: 'REINICIADO' },
    { tipo: 'CLIENTE:cViejo', estado: 'OK' }, { tipo: 'CLIENTE:cViejo', estado: 'REINICIADO' }, { tipo: 'CLIENTE:cViejo', estado: 'OK' },
    { tipo: 'CLIENTE:cMalo', estado: 'REINICIADO' }, ...Array.from({ length: 5 }, () => ({ tipo: 'CLIENTE:cMalo', estado: 'ERROR' })),
  ];
  const cliente = {
    abono: { findMany: async () => [] },
    factura: { findMany: async () => [] },
    facturaVenta: { findMany: async () => [] },
    logIntegracion: {
      findMany: async ({ where }) => (where.tipo.startsWith
        ? [...new Set(logs.filter((l) => l.estado === 'REINICIADO').map((l) => l.tipo))].map((tipo) => ({ tipo }))
        : logs.filter(({ tipo }) => where.tipo.in.includes(tipo))),
      create: async () => ({}),
    },
  };
  const items = await tenantStorage.run(cliente, () => listarPendientesSiesa({
    desde: new Date('2026-11-21T00:00:00-05:00'),
    cfg,
    preparar: { cliente: async (id) => ({ lineas: [`c:${id}`] }) },
  }));
  assert.deepEqual(items.map((i) => i.clave), ['CLIENTE:cPedido']);
  assert.equal(items[0].depende, undefined);
});

test('listarPendientesSiesa: lo que no se puede armar queda registrado y no se envia', async () => {
  const creados = [];
  const cliente = {
    abono: { findMany: async () => [] },
    factura: { findMany: async () => [{ id: 'f1' }, { id: 'f2' }] },
    facturaVenta: { findMany: async () => [] },
    logIntegracion: { findMany: async () => [], create: async ({ data }) => { creados.push(`${data.tipo}:${data.estado}`); return data; } },
  };
  const items = await tenantStorage.run(cliente, () => listarPendientesSiesa({
    desde: new Date(),
    cfg,
    preparar: {
      venta: async (modelo, id) => {
        if (id === 'f1') return { omitido: 'credito' };
        throw new Error('sin detalle');
      },
    },
  }));
  assert.deepEqual(items, []);
  assert.deepEqual(creados, ['VENTA:f1:OMITIDO', 'VENTA:f2:ERROR']);
});

test('API del agente: exige SIESA_AGENTE_TOKEN y lo compara en el encabezado', () => {
  const respuesta = () => {
    const r = { codigo: null };
    r.status = (c) => { r.codigo = c; return r; };
    r.json = (cuerpo) => { r.cuerpo = cuerpo; return r; };
    return r;
  };
  const original = process.env.SIESA_AGENTE_TOKEN;
  try {
    delete process.env.SIESA_AGENTE_TOKEN;
    const sinToken = respuesta();
    autenticarAgente({ header: () => 'x' }, sinToken, () => assert.fail('no debe continuar'));
    assert.equal(sinToken.codigo, 503);

    process.env.SIESA_AGENTE_TOKEN = 'secreto-largo';
    const malo = respuesta();
    autenticarAgente({ header: () => 'otro' }, malo, () => assert.fail('no debe continuar'));
    assert.equal(malo.codigo, 401);
    const vacio = respuesta();
    autenticarAgente({ header: () => undefined }, vacio, () => assert.fail('no debe continuar'));
    assert.equal(vacio.codigo, 401);

    let siguio = false;
    autenticarAgente({ header: () => 'secreto-largo' }, respuesta(), () => { siguio = true; });
    assert.equal(siguio, true);
  } finally {
    if (original === undefined) delete process.env.SIESA_AGENTE_TOKEN;
    else process.env.SIESA_AGENTE_TOKEN = original;
  }
});

test('modo agente: el reenvio manual solo programa el envio y respeta lo ya aceptado', async () => {
  const env = { SIESA_AGENTE_TOKEN: 'x' };
  assert.equal(modoAgenteSiesa(env), true);
  assert.equal(modoAgenteSiesa({ ...env, SIESA_VENTAS_ACTIVO: 'true' }), false);
  assert.equal(modoAgenteSiesa({}), false);

  const creados = [];
  let hayOk = false;
  const cliente = {
    logIntegracion: {
      findFirst: async () => (hayOk ? { id: 1 } : null),
      create: async ({ data }) => { creados.push(`${data.tipo}:${data.estado}`); return data; },
    },
  };
  const preparar = async () => assert.fail('no debe armar el plano en modo agente');
  const programado = await tenantStorage.run(cliente, () => intentarEnvioSiesa('VENTA:f1', preparar, { env, manual: true }));
  assert.equal(programado.estado, 'PROGRAMADO');
  assert.deepEqual(creados, ['VENTA:f1:REINICIADO']);

  hayOk = true;
  const yaEnviado = await tenantStorage.run(cliente, () => intentarEnvioSiesa('VENTA:f1', preparar, { env, manual: true }));
  assert.equal(yaEnviado.estado, 'OK');
  const forzado = await tenantStorage.run(cliente, () => intentarEnvioSiesa('CLIENTE:c1', preparar, { env, manual: true, forzar: true }));
  assert.equal(forzado.estado, 'PROGRAMADO');

  const sinManual = await intentarEnvioSiesa('VENTA:f1', preparar, { env });
  assert.equal(sinManual.estado, 'INACTIVO');
});
