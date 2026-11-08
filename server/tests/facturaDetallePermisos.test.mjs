import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { tenantStorage } from '../src/prisma.js';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:1/test';
const { default: facturaDetalleRouter } = await import('../src/routes/facturaDetalle.js');

async function entorno(t) {
  const db = {
    producto: { findUnique: async () => ({ codigo: 'P1', nombre: 'Producto', unidad: { abreviatura: 'UND' } }) },
    facturaDetalle: { findMany: async () => [] },
    facturaVentaDetalle: {
      findMany: async () => [],
      create: async ({ data }) => ({ id: 'detalle-1', ...data, producto: { nombre: 'Producto' } }),
    },
    auditoria: { create: async () => ({}) },
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.usuario = { permisos: String(req.header('x-permisos') || '').split(',').filter(Boolean) };
    tenantStorage.run(db, next);
  });
  app.use('/factura-detalle', facturaDetalleRouter);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const solicitar = async (method, permisos, body = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/factura-detalle`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-permisos': permisos },
      ...(method !== 'GET' && { body: JSON.stringify(body) }),
    });
    return response.status;
  };
  return solicitar;
}

test('detalles de factura requieren permiso financiero de lectura o escritura', async (t) => {
  const solicitar = await entorno(t);
  assert.equal(await solicitar('GET', 'pedidos.ver'), 403);
  assert.equal(await solicitar('GET', 'facturas.ver'), 200);
  assert.equal(await solicitar('POST', 'facturas.ver'), 403);
  assert.equal(await solicitar('POST', 'factura_venta.crear', { electronica: false, productoId: 'p1', cantidad: 1 }), 201);
  assert.equal(await solicitar('DELETE', 'factura_venta.ver'), 403);
  assert.equal(await solicitar('DELETE', 'facturas.anular'), 404);
});