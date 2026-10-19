import assert from 'node:assert/strict';
import test from 'node:test';
import { filtroFechaCocina, estadoPreparacion, combinarHistorialCocina, registrarResultadoCocina } from '../src/historialCocina.js';

const preparacion = { consecutivo: 1, pedidoId: 15, productos: '2x Plato', listo: true, fechaListo: '2026-10-19T16:00:00Z', pedido: { cambios: '' }, cocineroId: 3 };
const evento = (accion, datos = {}) => ({ id: 'evento', accion, createdAt: '2026-10-19T16:10:00Z', detalle: JSON.stringify({ pedidoId: 15, productos: '2x Plato', cocineroId: 3, motivo: 'Sin ingredientes', ...datos }) });

test('conserva los platos listos anteriores sin inventar una entrega', () => {
  const filas = combinarHistorialCocina([preparacion], []);
  assert.equal(filas[0].estado, 'LISTO');
  assert.equal(filas[0].pedidoId, 15);
  assert.equal(filas[0].cocineroId, 3);
});

test('conserva entregas y rechazos con su motivo sin duplicar el plato listo', () => {
  const filas = combinarHistorialCocina([preparacion], [evento('COCINA_ENTREGADO'), evento('COCINA_RECHAZADO', { pedidoId: 16 })]);
  assert.deepEqual(filas.map((fila) => fila.estado), ['ENTREGADO', 'RECHAZADO']);
  assert.equal(filas[1].motivo, 'Sin ingredientes');
});

test('una comanda cambiada o reabierta vuelve a pendientes', () => {
  assert.equal(estadoPreparacion(preparacion, evento('COCINA_ENTREGADO')), 'ENTREGADO');
  assert.equal(estadoPreparacion({ ...preparacion, listo: false }, evento('COCINA_RECHAZADO')), 'RECHAZADO');
  assert.equal(estadoPreparacion({ ...preparacion, productos: '3x Plato', listo: false }, evento('COCINA_RECHAZADO')), 'PENDIENTE');
  assert.equal(estadoPreparacion({ ...preparacion, listo: false }, evento('COCINA_REABIERTO')), 'PENDIENTE');
});

test('filtra fechas completas de Colombia y rechaza rangos invertidos', () => {
  const filtro = filtroFechaCocina('2026-10-19', '2026-10-19');
  assert.equal(filtro.gte.toISOString(), '2026-10-19T05:00:00.000Z');
  assert.equal(filtro.lt.toISOString(), '2026-10-20T05:00:00.000Z');
  assert.throws(() => filtroFechaCocina('2026-10-20', '2026-10-19'), /fecha inicial/);
  assert.throws(() => filtroFechaCocina('2026-02-30', ''), /Fecha invalida/);
  assert.throws(() => filtroFechaCocina('2026-99-99', ''), /Fecha invalida/);
});

function basePrueba({ listo = true, anterior = null, pedidoEstado = 'ABIERTO' } = {}) {
  const guardados = [];
  const tx = {
    pedido: { findUnique: async () => ({ id: 15, estado: pedidoEstado, mesaId: 1, mesa: { numero: 1 }, tipo: 'MESA', items: [{ cantidad: 2, producto: { nombre: 'Plato' } }] }) },
    preparacionCocina: { findUnique: async () => ({ ...preparacion, listo }), upsert: async () => {} },
    cocinero: { findUnique: async () => ({ id: 3, nombre: 'Ana', activo: true }) },
    auditoria: { findFirst: async () => anterior, create: async ({ data }) => { guardados.push(data); return { id: 'nuevo', createdAt: new Date(), ...data }; } },
  };
  return { db: { $transaction: async (operacion) => operacion(tx) }, guardados };
}

test('registra entrega y rechazo con una copia persistente de platos, responsable y motivo', async () => {
  const { db, guardados } = basePrueba();
  const entrega = await registrarResultadoCocina(db, { pedidoId: 15, estado: 'ENTREGADO', cocineroId: 3 });
  assert.equal(entrega.productos, '2x Plato');
  assert.equal(entrega.cocinero, 'Ana');
  assert.equal(guardados[0].accion, 'COCINA_ENTREGADO');
  const rechazo = await registrarResultadoCocina(db, { pedidoId: 15, estado: 'RECHAZADO', motivo: ' Sin ingredientes ' });
  assert.equal(rechazo.motivo, 'Sin ingredientes');
  assert.equal(JSON.parse(guardados[1].detalle).motivo, 'Sin ingredientes');
});

test('rechaza entrega no lista, rechazo sin motivo y resultados duplicados', async () => {
  await assert.rejects(registrarResultadoCocina(basePrueba({ listo: false }).db, { pedidoId: 15, estado: 'ENTREGADO' }), /primero/);
  await assert.rejects(registrarResultadoCocina(basePrueba().db, { pedidoId: 15, estado: 'RECHAZADO' }), /motivo/);
  await assert.rejects(registrarResultadoCocina(basePrueba({ anterior: evento('COCINA_ENTREGADO') }).db, { pedidoId: 15, estado: 'ENTREGADO' }), /ya tiene/);
  await assert.rejects(registrarResultadoCocina(basePrueba({ pedidoEstado: 'FACTURADO' }).db, { pedidoId: 15, estado: 'RECHAZADO', motivo: 'Prueba' }), /abiertos/);
});