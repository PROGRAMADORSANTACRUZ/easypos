import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:1/test';
const { default: movimientosRouter } = await import('../src/routes/movimientos.js');
const { tenantStorage } = await import('../src/prisma.js');

async function entorno(t) {
  const llamadasStock = [];
  const movimiento = { id: 'baja-aprobada', tipoMovimiento: 'BAJA', productoId: 'producto-1', bodegaId: 'bodega-1', cantidad: 2 };
  const db = {
    movimientoInventario: {
      findUnique: async () => movimiento,
      update: async () => { throw new Error('No debe editarse'); },
      delete: async () => { throw new Error('No debe borrarse'); },
      create: async () => { throw new Error('No debe crearse manualmente'); },
    },
    inventario: { findFirst: async () => { llamadasStock.push('leer'); return { id: 'existencia-1', cantidad: 5 }; }, update: async () => { llamadasStock.push('actualizar'); } },
    auditoria: { create: async () => ({ id: 1 }) },
    $transaction: async (operation) => operation(db),
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => tenantStorage.run(db, next));
  app.use('/movimientos', movimientosRouter);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const solicitar = async (method, ruta, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/movimientos${ruta}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body && { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  return { solicitar, llamadasStock };
}

test('impide crear, editar o eliminar bajas fuera del flujo de aprobación', async (t) => {
  const { solicitar, llamadasStock } = await entorno(t);
  const crear = await solicitar('POST', '/', { tipoMovimiento: 'BAJA', productoId: 'producto-1', bodegaId: 'bodega-1', cantidad: 2 });
  const editar = await solicitar('PUT', '/baja-aprobada', { cantidad: 1 });
  const eliminar = await solicitar('DELETE', '/baja-aprobada');
  assert.equal(crear.status, 400);
  assert.equal(editar.status, 409);
  assert.equal(eliminar.status, 409);
  assert.deepEqual(llamadasStock, []);
});