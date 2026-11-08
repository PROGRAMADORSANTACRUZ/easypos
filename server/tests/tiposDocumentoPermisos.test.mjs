import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { tenantStorage } from '../src/prisma.js';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:1/test';
const { default: tiposDocumentoRouter } = await import('../src/routes/tiposDocumento.js');

async function entorno(t) {
  const db = { tipoDocumento: { findMany: async () => [] } };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.usuario = { permisos: String(req.header('x-permisos') || '').split(',').filter(Boolean), centrosOperacion: [] };
    tenantStorage.run(db, next);
  });
  app.use('/tipos-documento', tiposDocumentoRouter);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const solicitar = async (method, ruta, permisos = '') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/tipos-documento${ruta}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-permisos': permisos },
      ...(method !== 'GET' && { body: JSON.stringify({}) }),
    });
    return response.status;
  };
  return solicitar;
}

test('tipos de documento requiere permiso de lectura o edición apropiado', async (t) => {
  const solicitar = await entorno(t);
  assert.equal(await solicitar('GET', '/', 'pedidos.ver'), 403);
  assert.equal(await solicitar('GET', '/', 'empresa.ver'), 200);
  assert.equal(await solicitar('GET', '/asignados?clase=FACTURA%20ELECTRONICA%20DE%20VENTA', 'pedidos.ver'), 403);
  assert.equal(await solicitar('GET', '/asignados?clase=FACTURA%20ELECTRONICA%20DE%20VENTA', 'facturas.crear'), 200);
  assert.equal(await solicitar('POST', '/', 'empresa.ver'), 403);
  assert.equal(await solicitar('PUT', '/tipo-1', 'empresa.ver'), 403);
  assert.equal(await solicitar('DELETE', '/tipo-1', 'empresa.ver'), 403);
});