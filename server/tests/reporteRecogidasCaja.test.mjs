import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { columnasRecogidas, filaRecogida, totalesRecogidas } from '../../client/src/reporteRecogidasCaja.js';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:1/test';
const { default: router } = await import('../src/routes/reportes.js');
const { tenantStorage } = await import('../src/prisma.js');

const fecha = (valor) => new Date(valor);
const factura = (id, aperturaId, creada, total, metodoPago) => ({
  id, aperturaId, metodoPago, pagos: [], cabecera: { createdAt: fecha(creada), total, propina: 0, credito: false },
});

function datosPrueba() {
  const aperturas = [
    {
      id: 'turno-a', valorInicial: 300000, estado: 'CERRADA', fechaApertura: fecha('2026-11-11T13:00:00Z'),
      fechaCierre: fecha('2026-11-11T23:00:00Z'), valorEsperado: 450000, valorContado: 449000, diferencia: -1000,
      observacionCierre: 'Cierre del día', usuarioId: 'u-ana', usuario: { nombre: 'Ana' }, caja: { id: 'caja-1', nombre: 'Principal' },
    },
    {
      id: 'turno-b', valorInicial: 100000, estado: 'ABIERTA', fechaApertura: fecha('2026-11-10T13:00:00Z'), fechaCierre: null,
      usuarioId: 'u-ana', usuario: { nombre: 'Ana' }, caja: { id: 'caja-1', nombre: 'Principal' },
    },
  ];
  const movimientos = [
    { id: 'rb', aperturaId: 'turno-b', tipo: 'RECOGIDA', monto: 10, fecha: fecha('2026-11-10T15:00:00Z'), motivo: 'Anterior', usuarioId: 'u-ana', usuario: { nombre: 'Ana' } },
    { id: 'ing', aperturaId: 'turno-a', tipo: 'INGRESO', monto: 50000, fecha: fecha('2026-11-11T16:00:00Z'), motivo: 'Ajuste', usuarioId: 'u-ana', usuario: { nombre: 'Ana' } },
    { id: 'r1', aperturaId: 'turno-a', tipo: 'RECOGIDA', monto: 1000000, fecha: fecha('2026-11-11T17:00:00Z'), motivo: 'Recogida parcial', usuarioId: 'u-luis', usuario: { nombre: 'Luis' } },
    { id: 'r2', aperturaId: 'turno-a', tipo: 'RECOGIDA', monto: 300000, fecha: fecha('2026-11-11T19:00:00Z'), motivo: 'Segunda', usuarioId: 'u-luis', usuario: { nombre: 'Luis' } },
  ];
  return {
    aperturas, movimientos,
    facturas: [factura('f1', 'turno-a', '2026-11-11T15:00:00Z', 1200000, 'EFE'), factura('f2', 'turno-a', '2026-11-11T17:30:00Z', 100000, 'QR')],
    ventas: [factura('v1', 'turno-a', '2026-11-11T18:00:00Z', 200000, 'EFE')],
    auditorias: [{ accion: 'CERRAR', entidad: 'apertura_caja', entidadId: 'turno-a', usuarioId: 'u-marta', usuario: { nombre: 'Marta' }, createdAt: fecha('2026-11-11T23:00:01Z') }],
  };
}

async function entorno(t, datos) {
  const enLista = (valor, filtro) => filtro?.in ? filtro.in.includes(valor) : true;
  const db = {
    movimientoCaja: { findMany: async ({ where }) => datos.movimientos.filter((m) => (!where.tipo || m.tipo === where.tipo) && enLista(m.aperturaId, where.aperturaId)) },
    aperturaCaja: { findMany: async ({ where }) => datos.aperturas.filter((a) => (!where.estado || (a.estado === where.estado && a.fechaCierre)) && enLista(a.id, where.id)) },
    factura: { findMany: async ({ where }) => datos.facturas.filter((f) => enLista(f.aperturaId, where.aperturaId)) },
    facturaVenta: { findMany: async ({ where }) => datos.ventas.filter((f) => enLista(f.aperturaId, where.aperturaId)) },
    formaPago: { findMany: async () => [{ id: 'EFE', formaPago: 'Efectivo', formaPagoDian: '10-Efectivo', activo: true }, { id: 'QR', formaPago: 'QR', activo: true }] },
    auditoria: { findMany: async ({ where }) => datos.auditorias.filter((a) => a.accion === where.accion && enLista(a.entidadId, where.entidadId)) },
  };
  const app = express();
  app.use((req, res, next) => tenantStorage.run(db, next));
  app.use('/reportes', router);
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => servidor.once('listening', resolve));
  t.after(() => new Promise((resolve) => servidor.close(resolve)));
  return async (params) => {
    const respuesta = await fetch(`http://127.0.0.1:${servidor.address().port}/reportes/recogidas-caja?${params}`);
    return { status: respuesta.status, body: await respuesta.json() };
  };
}

test('lista recogidas parciales y el cierre con consecutivo, responsable y saldo despues de cada una', async (t) => {
  const solicitar = await entorno(t, datosPrueba());
  const { status, body } = await solicitar('desde=2026-11-11&hasta=2026-11-11');
  assert.equal(status, 200);
  assert.deepEqual(body.map((fila) => [fila.consecutivo, fila.tipo, fila.cajero, fila.numeroEnTurno, fila.efectivoAntes, fila.monto, fila.saldoDespues]), [
    ['RC-000002', 'PARCIAL', 'Luis', 1, 1550000, 1000000, 550000],
    ['RC-000003', 'PARCIAL', 'Luis', 2, 750000, 300000, 450000],
    ['RC-000004', 'FINAL', 'Marta', null, 450000, 449000, 0],
  ]);
  const final = body[2];
  assert.deepEqual([final.esperado, final.contado, final.diferencia, final.sinConteo, final.caja, final.observacion], [450000, 449000, -1000, false, 'Principal', 'Cierre del día']);
  assert.equal((await solicitar('desde=2026-11-12&hasta=2026-11-11')).status, 400);
});

test('no inventa el saldo cuando una factura del turno tiene pagos inconsistentes y marca cierres sin conteo', async (t) => {
  const datos = datosPrueba();
  datos.facturas[0].pagos = [{ formaPago: 'EFE', monto: 1 }];
  datos.aperturas[0].valorContado = null;
  const solicitar = await entorno(t, datos);
  const { body } = await solicitar('desde=2026-11-11&hasta=2026-11-11');
  assert.deepEqual(body.filter((fila) => fila.tipo === 'PARCIAL').map((fila) => [fila.efectivoAntes, fila.saldoDespues, fila.monto]), [[null, null, 1000000], [null, null, 300000]]);
  assert.deepEqual([body[2].monto, body[2].sinConteo, body[2].saldoDespues], [450000, true, 0]);
});

test('presenta cada valor en su columna y suma parciales y finales por separado', () => {
  const filas = [
    { tipo: 'PARCIAL', monto: 1000000.5 }, { tipo: 'PARCIAL', monto: 300000 }, { tipo: 'FINAL', monto: 449000 }, { tipo: 'FINAL', monto: null },
  ];
  assert.deepEqual(totalesRecogidas(filas), { parciales: 1300000.5, finales: 449000 });
  const valores = filaRecogida({
    consecutivo: 'RC-000004', tipo: 'FINAL', fecha: '2026-11-11T23:00:00Z', fechaApertura: '2026-11-11T13:00:00Z',
    cajero: 'Marta', caja: 'Principal', base: 300000, efectivoAntes: 450000, monto: 450000, saldoDespues: 0,
    esperado: 450000, contado: null, diferencia: null, sinConteo: true, observacion: 'Cierre',
  });
  assert.equal(valores.length, columnasRecogidas.length);
  const fila = Object.fromEntries(columnasRecogidas.map((columna, indice) => [columna, valores[indice]]));
  assert.equal(fila.Fecha, '11/11/2026');
  assert.match(fila.Hora, /6:00:00/);
  assert.equal(fila.Tipo, 'Final (cierre de caja)');
  assert.match(fila['Valor recogido'], /450\.000 \(sin conteo\)/);
  assert.equal(fila['Contado al cierre'], 'No disponible');
  assert.match(fila['Saldo después'], /\$\s*0/);
});
