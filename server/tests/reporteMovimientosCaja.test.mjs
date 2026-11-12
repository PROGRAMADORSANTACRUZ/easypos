import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { columnasMovimientos, filaMovimiento } from '../../client/src/reporteMovimientosCaja.js';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:1/test';
const { default: router } = await import('../src/routes/reportes.js');
const { tenantStorage } = await import('../src/prisma.js');

async function entorno(t, movimientos) {
  const consultas = [];
  const db = {
    movimientoCaja: { findMany: async (consulta) => {
      consultas.push(consulta);
      const { gte, lt } = consulta.where.fecha;
      return movimientos.filter((m) => (!gte || m.fecha >= gte) && (!lt || m.fecha < lt))
        .sort((a, b) => b.fecha - a.fecha);
    } },
  };
  const app = express();
  app.use((req, res, next) => tenantStorage.run(db, next));
  app.use('/reportes', router);
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const solicitar = async (params) => {
    const respuesta = await fetch(`http://127.0.0.1:${server.address().port}/reportes/movimientos-caja?${params}`);
    return { status: respuesta.status, body: await respuesta.json() };
  };
  return { solicitar, consultas };
}

test('lista ingresos y egresos del día colombiano con sus datos propios y sin inventar documentos', async (t) => {
  const movimientos = [
    { id: 'm1', fecha: new Date('2026-11-11T05:00:00Z'), tipo: 'INGRESO', monto: 100.25, motivo: 'Ajuste', usuarioId: 'u1', usuario: { nombre: 'Cajera', usuario: 'CAJA' }, apertura: { caja: { id: 'c1', nombre: 'Principal' } } },
    { id: 'm2', fecha: new Date('2026-11-12T04:59:59Z'), tipo: 'EGRESO', monto: 30, motivo: 'Gasto', usuarioId: null, usuario: null, apertura: { caja: null } },
    { id: 'otro-dia', fecha: new Date('2026-11-12T05:00:00Z'), tipo: 'INGRESO', monto: 5, motivo: 'Otro', usuarioId: null, usuario: null, apertura: null },
  ];
  const { solicitar, consultas } = await entorno(t, movimientos);
  const respuesta = await solicitar('desde=2026-11-11&hasta=2026-11-11');
  assert.equal(respuesta.status, 200);
  assert.deepEqual(respuesta.body, [
    { id: 'm2', fecha: '2026-11-12T04:59:59.000Z', tipo: 'EGRESO', monto: 30, motivo: 'Gasto', cajeroId: '', cajero: 'Sin cajero', cajaId: '', caja: 'Sin caja' },
    { id: 'm1', fecha: '2026-11-11T05:00:00.000Z', tipo: 'INGRESO', monto: 100.25, motivo: 'Ajuste', cajeroId: 'u1', cajero: 'Cajera', cajaId: 'c1', caja: 'Principal' },
  ]);
  assert.equal(consultas[0].where.fecha.gte.toISOString(), '2026-11-11T05:00:00.000Z');
  assert.equal(consultas[0].where.fecha.lt.toISOString(), '2026-11-12T05:00:00.000Z');
  assert.deepEqual(consultas[0].orderBy, { fecha: 'desc' });
});

test('acepta filtros abiertos y rechaza fechas inválidas o invertidas', async (t) => {
  const { solicitar, consultas } = await entorno(t, []);
  assert.deepEqual(await solicitar(''), { status: 200, body: [] });
  assert.deepEqual(consultas[0].where.fecha, {});
  assert.equal((await solicitar('desde=2026-02-31')).status, 400);
  assert.equal((await solicitar('desde=2026-11-12&hasta=2026-11-11')).status, 400);
});

test('presenta y exporta cada valor en su columna sin inventar clasificaciones', () => {
  const valores = filaMovimiento({
    id: 'm1', fecha: '2026-11-11T05:00:00Z', tipo: 'INGRESO', monto: 100.25,
    motivo: 'Ajuste', cajero: 'Cajera', caja: 'Principal',
  });
  assert.equal(valores.length, columnasMovimientos.length);
  const fila = Object.fromEntries(columnasMovimientos.map((columna, indice) => [columna, valores[indice]]));
  assert.equal(fila['Nombre cajero'], 'Cajera');
  assert.equal(fila.Caja, 'Principal');
  assert.equal(fila.Tipo, 'INGRESO');
  assert.match(fila['Valor registrado'], /100,25/);
  assert.equal(fila['Referencia movimiento'], 'm1');
  for (const columna of ['C.O.', 'Nro documento', 'Estado', 'Adiciones', 'Otros ingresos', 'Otros egresos', 'Efectivo', 'Cheque', 'Tarjeta crédito', 'Tarjeta débito', 'Otros', 'Tercero', 'Razón social tercero']) {
    assert.equal(fila[columna], 'No disponible');
  }
  assert.doesNotMatch(fila.Recogidas, /[1-9]/);
  const recogida = filaMovimiento({ id: 'm2', fecha: '2026-11-11T06:00:00Z', tipo: 'RECOGIDA', monto: 400000, motivo: 'Recogida parcial', cajero: 'Cajera', caja: 'Principal' });
  assert.match(recogida[columnasMovimientos.indexOf('Recogidas')], /400\.000/);
});
