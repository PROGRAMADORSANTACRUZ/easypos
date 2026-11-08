import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:1/test';
const { default: aperturasRouter } = await import('../src/routes/aperturas.js');
const { tenantStorage } = await import('../src/prisma.js');

async function entorno(t) {
  const aperturas = [];
  const movimientos = [];
  const db = {
    aperturaCaja: {
      create: async ({ data }) => {
        const apertura = { id: 'turno-1', estado: 'ABIERTA', ...data, caja: null, usuario: null };
        aperturas.push(apertura);
        return apertura;
      },
      findFirst: async ({ where }) => aperturas.find((apertura) => apertura.estado === where.estado && apertura.usuarioId === where.usuarioId) || null,
      findUnique: async ({ where }) => aperturas.find((apertura) => apertura.id === where.id) || { id: where.id, estado: 'ABIERTA' },
    },
    movimientoCaja: { create: async ({ data }) => { movimientos.push(data); return data; } },
    cuentaContable: { findUnique: async () => ({ id: 'cuenta-1', activo: true, tipo: 'GASTO' }) },
    formaPago: { findMany: async () => [] },
    factura: { findMany: async () => [] },
    facturaVenta: { findMany: async () => [] },
    auditoria: { create: async () => ({ id: 1, createdAt: new Date() }) },
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.usuario = {
      id: 'usuario-autenticado',
      usuario: 'CAJERO1',
      nombre: 'Cajero Uno',
      permisos: String(req.header('x-permisos') || '').split(',').filter(Boolean),
    };
    tenantStorage.run(db, next);
  });
  app.use('/aperturas', aperturasRouter);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const solicitar = async (method, ruta, body, permisos = '', headers = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/aperturas${ruta}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-permisos': permisos, ...headers },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  return { solicitar, aperturas, movimientos };
}

test('aperturas y movimientos requieren permiso y usan al usuario autenticado', async (t) => {
  const { solicitar, aperturas, movimientos } = await entorno(t);
  assert.equal((await solicitar('POST', '/', { usuarioId: 'suplantado', valorInicial: 100 }, 'caja.ver')).status, 403);

  const abierta = await solicitar('POST', '/', { usuarioId: 'suplantado', valorInicial: 100 }, 'caja.abrir');
  assert.equal(abierta.status, 201);
  assert.equal(aperturas[0].usuarioId, 'usuario-autenticado');

  const activa = await solicitar('GET', '/activa?usuarioId=suplantado', undefined, 'facturas.crear');
  assert.equal(activa.status, 200);
  assert.equal(activa.body.usuarioId, 'usuario-autenticado');

  const movimiento = await solicitar('POST', '/turno-1/movimientos', {
    tipo: 'INGRESO', monto: 25, motivo: 'Ajuste',
  }, 'caja.crear', { 'x-usuario-id': 'suplantado' });
  assert.equal(movimiento.status, 201);
  assert.equal(movimientos[0].usuarioId, 'usuario-autenticado');
});

test('no permite leer o cerrar caja sin permisos correspondientes', async (t) => {
  const { solicitar } = await entorno(t);
  assert.equal((await solicitar('GET', '/', undefined, 'pedidos.ver')).status, 403);
  assert.equal((await solicitar('POST', '/turno-1/cerrar', { valorContado: 0 }, 'caja.ver')).status, 403);
});