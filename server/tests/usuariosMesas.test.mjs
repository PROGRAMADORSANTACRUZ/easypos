import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';

process.env.JWT_SECRET ||= 'test-usuarios-mesas';
process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:1/test';
const { default: usuariosRouter } = await import('../src/routes/usuarios.js');
const { tenantStorage } = await import('../src/prisma.js');
const { firmarToken } = await import('../src/middleware/auth.js');

async function entorno(t) {
  const mesas = new Map([
    [1, { id: 1, numero: 1, esFantasma: false, usuarioAsignadoId: null }],
    [0, { id: 0, numero: 0, esFantasma: true, usuarioAsignadoId: null }],
  ]);
  const usuarios = [];
  const admin = {
    id: 'admin-id', usuario: 'admin', nombre: 'Admin', activo: true,
    roles: [{ rol: { nombre: 'ADMIN', permisos: [{ permiso: { codigo: 'usuarios.ver' } }, { permiso: { codigo: 'usuarios.crear' } }] } }],
    centrosOperacion: [],
  };
  let secuencia = 1;
  const db = {
    usuario: {
      findUnique: async ({ where }) => where.id === admin.id ? admin : null,
      findMany: async () => usuarios,
      create: async ({ data }) => { const user = { id: `mesero-${secuencia++}`, ...data, activo: true }; usuarios.push(user); return user; },
    },
    usuarioRol: { findFirst: async () => ({ usuarioId: admin.id, rol: { nombre: 'ADMIN' } }), createMany: async () => ({ count: 1 }) },
    rol: { findMany: async ({ where }) => where.nombre.in.map((nombre) => ({ id: nombre, nombre })) },
    centroOperacion: { findMany: async ({ where }) => where.codigo.in.map((codigo) => ({ codigo })) },
    usuarioCentroOperacion: { createMany: async () => ({ count: 1 }) },
    mesa: {
      findMany: async ({ where }) => where.id.in.map((id) => mesas.get(id)).filter((mesa) => mesa && mesa.esFantasma === where.esFantasma).map(({ id }) => ({ id })),
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const mesa of mesas.values()) {
          const cumpleDueno = where.usuarioAsignadoId === undefined || mesa.usuarioAsignadoId === where.usuarioAsignadoId;
          const cumpleId = where.id?.in ? where.id.in.includes(mesa.id) : where.id?.notIn ? !where.id.notIn.includes(mesa.id) : true;
          const cumpleFantasma = where.esFantasma === undefined || mesa.esFantasma === where.esFantasma;
          if (cumpleDueno && cumpleId && cumpleFantasma) { Object.assign(mesa, data); count += 1; }
        }
        return { count };
      },
    },
    auditoria: { create: async () => ({ id: 1 }) },
    $transaction: async (operation) => operation(db),
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => tenantStorage.run(db, next));
  app.use('/usuarios', usuariosRouter);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const solicitar = async (mesaIds) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/usuarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firmarToken(admin)}` },
      body: JSON.stringify({
        nombre: 'Mesero Prueba', usuario: `mesero${secuencia}`, password: 'clave123',
        roles: ['MESERO'], centrosOperacionCodigos: ['420'], mesaIds,
      }),
    });
    return { status: response.status, body: await response.json() };
  };
  return { solicitar, mesas };
}

test('ADMIN puede asignar mesas normales a un MESERO', async (t) => {
  const { solicitar, mesas } = await entorno(t);
  const response = await solicitar([1]);
  assert.equal(response.status, 201);
  assert.equal(mesas.get(1).usuarioAsignadoId, response.body.id);
  assert.equal(mesas.get(0).usuarioAsignadoId, null);
});

test('no permite asignar Mesa00 ni crear MESERO sin mesas', async (t) => {
  const { solicitar, mesas } = await entorno(t);
  assert.equal((await solicitar([0])).status, 400);
  assert.equal((await solicitar([])).status, 400);
  assert.equal(mesas.get(0).usuarioAsignadoId, null);
});
