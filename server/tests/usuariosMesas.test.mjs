import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { rangosMesas, resumenMesas } from '../../client/src/mesasResumen.js';

process.env.JWT_SECRET ||= 'test-usuarios-mesas';
process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:1/test';
const { default: usuariosRouter } = await import('../src/routes/usuarios.js');
const { tenantStorage } = await import('../src/prisma.js');
const { firmarToken } = await import('../src/middleware/auth.js');

async function entorno(t) {
  const mesas = new Map([
    [1, { id: 1, numero: 1, esFantasma: false }],
    [2, { id: 2, numero: 2, esFantasma: false }],
    [0, { id: 0, numero: 0, esFantasma: true }],
  ]);
  const asignaciones = [];
  const mesasDe = (usuarioId) => asignaciones.filter((a) => a.usuarioId === usuarioId).map((a) => a.mesaId).sort();
  const usuarios = [];
  const admin = {
    id: 'admin-id', usuario: 'admin', nombre: 'Admin', activo: true,
    roles: [{ rol: { nombre: 'ADMIN', permisos: [{ permiso: { codigo: 'usuarios.ver' } }, { permiso: { codigo: 'usuarios.crear' } }] } }],
    centrosOperacion: [],
  };
  const lector = {
    ...admin,
    id: 'lector-id',
    usuario: 'lector',
    roles: [{ rol: { nombre: 'CAJERO', permisos: [{ permiso: { codigo: 'pedidos.ver' } }] } }],
  };
  let secuencia = 1;
  const db = {
    usuario: {
      findUnique: async ({ where }) => where.id === admin.id ? admin : where.id === lector.id ? lector : null,
      findFirst: async ({ where }) => usuarios.find((user) => user.usuario.toUpperCase() === where.usuario.equals.toUpperCase()
        && (!where.id?.not || user.id !== where.id.not)) || null,
      findMany: async () => usuarios,
      create: async ({ data }) => { const user = { id: `mesero-${secuencia++}`, ...data, activo: true }; usuarios.push(user); return user; },
    },
    usuarioRol: { findFirst: async () => ({ usuarioId: admin.id, rol: { nombre: 'ADMIN' } }), createMany: async () => ({ count: 1 }) },
    rol: { findMany: async ({ where }) => where.nombre.in.map((nombre) => ({ id: nombre, nombre })) },
    centroOperacion: { findMany: async ({ where }) => where.codigo.in.map((codigo) => ({ codigo })) },
    usuarioCentroOperacion: { createMany: async () => ({ count: 1 }) },
    mesa: {
      findMany: async ({ where }) => where.id.in.map((id) => mesas.get(id)).filter((mesa) => mesa && mesa.esFantasma === where.esFantasma).map(({ id }) => ({ id })),
    },
    usuarioMesa: {
      deleteMany: async ({ where }) => {
        const antes = asignaciones.length;
        for (let i = asignaciones.length - 1; i >= 0; i -= 1) if (asignaciones[i].usuarioId === where.usuarioId) asignaciones.splice(i, 1);
        return { count: antes - asignaciones.length };
      },
      createMany: async ({ data }) => {
        for (const fila of data) if (!asignaciones.some((a) => a.usuarioId === fila.usuarioId && a.mesaId === fila.mesaId)) asignaciones.push(fila);
        return { count: data.length };
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
  const solicitar = async (mesaIds, usuario = `mesero${secuencia}`) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/usuarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firmarToken(admin)}` },
      body: JSON.stringify({
        nombre: 'Mesero Prueba', usuario, correo: 'mesero@ejemplo.com', password: 'clave123',
        roles: ['MESERO'], centrosOperacionCodigos: ['420'], mesaIds,
      }),
    });
    return { status: response.status, body: await response.json() };
  };
  const solicitarLista = async (usuarioId) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/usuarios`, {
      headers: { Authorization: `Bearer ${firmarToken({ id: usuarioId })}` },
    });
    return { status: response.status, body: await response.json() };
  };
  return { solicitar, solicitarLista, mesasDe, asignaciones };
}

test('ADMIN puede asignar mesas normales a un MESERO', async (t) => {
  const { solicitar, mesasDe } = await entorno(t);
  const response = await solicitar([1]);
  assert.equal(response.status, 201);
  assert.equal(response.body.nombre, 'MESERO PRUEBA');
  assert.equal(response.body.usuario, 'MESERO1');
  assert.equal(response.body.correo, 'MESERO@EJEMPLO.COM');
  assert.deepEqual(mesasDe(response.body.id), [1]);
});

test('varios meseros comparten las mismas mesas sin quitarselas entre ellos', async (t) => {
  const { solicitar, mesasDe } = await entorno(t);
  const primero = await solicitar([1, 2]);
  const segundo = await solicitar([1, 2]);
  assert.equal(primero.status, 201);
  assert.equal(segundo.status, 201);
  assert.deepEqual(mesasDe(primero.body.id), [1, 2]);
  assert.deepEqual(mesasDe(segundo.body.id), [1, 2]);
});

test('la lista de usuarios requiere permiso usuarios.ver', async (t) => {
  const { solicitarLista } = await entorno(t);
  assert.equal((await solicitarLista('admin-id')).status, 200);
  assert.equal((await solicitarLista('lector-id')).status, 403);
});

test('no permite duplicar un usuario con diferencias de mayúsculas', async (t) => {
  const { solicitar, mesasDe } = await entorno(t);
  const creado = await solicitar([1], 'mesero1');
  const duplicado = await solicitar([1], 'MESERO1');
  assert.equal(creado.status, 201);
  assert.equal(duplicado.status, 409);
  assert.deepEqual(mesasDe(creado.body.id), [1]);
});

test('GET usuarios exige usuarios.ver incluso con sesión autenticada', async (t) => {
  const { solicitarLista } = await entorno(t);
  const administrador = await solicitarLista('admin-id');
  const lectorPedidos = await solicitarLista('lector-id');
  assert.equal(administrador.status, 200);
  assert.equal(lectorPedidos.status, 403);
});

test('no permite asignar Mesa00 y permite crear MESERO sin mesas asignadas', async (t) => {
  const { solicitar, asignaciones } = await entorno(t);
  assert.equal((await solicitar([0])).status, 400);
  assert.equal((await solicitar([])).status, 201);
  assert.equal((await solicitar(undefined)).status, 201);
  assert.deepEqual(asignaciones, []);
});

test('la migracion copia las mesas asignadas, ignora Mesa00 y permite compartir mesas', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { readFile } = await import('node:fs/promises');
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE "Usuarios" ("Id" UUID PRIMARY KEY);
      CREATE TABLE "Mesa" (id SERIAL PRIMARY KEY, numero INT UNIQUE, "esFantasma" BOOLEAN DEFAULT false, "usuarioAsignadoId" UUID);
      INSERT INTO "Usuarios" VALUES ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002');
      INSERT INTO "Mesa" (numero, "esFantasma", "usuarioAsignadoId") VALUES
        (1, false, '00000000-0000-4000-8000-000000000001'), (2, false, NULL), (0, true, '00000000-0000-4000-8000-000000000001');
    `);
    const sql = await readFile(new URL('../prisma/migrations/20261113060000_mesas_compartidas_meseros/migration.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    await db.exec(sql);
    const copiadas = await db.query('SELECT "UsuarioId", m.numero FROM "UsuariosMesas" um JOIN "Mesa" m ON m.id = um."MesaId" ORDER BY 2');
    assert.deepEqual(copiadas.rows, [{ UsuarioId: '00000000-0000-4000-8000-000000000001', numero: 1 }]);
    await db.query(`INSERT INTO "UsuariosMesas" VALUES ('00000000-0000-4000-8000-000000000002', 1)`);
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM "UsuariosMesas" WHERE "MesaId" = 1')).rows[0].n, 2);
    await db.query(`DELETE FROM "Usuarios" WHERE "Id" = '00000000-0000-4000-8000-000000000002'`);
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM "UsuariosMesas"')).rows[0].n, 1);
  } finally {
    await db.close();
  }
});

test('resume las mesas marcadas en rangos, como Todas o como Ninguna', () => {
  assert.equal(rangosMesas([7, 1, 2, 3, 5, 8, 3]), '1–3, 5, 7–8');
  const mesas = (numeros) => numeros.map((numero) => ({ id: numero, numero }));
  assert.deepEqual(resumenMesas(mesas([1, 2, 3]), 3), { tipo: 'todas', texto: 'Todas (3)', detalle: '1–3' });
  assert.deepEqual(resumenMesas(mesas([4]), 45), { tipo: 'algunas', texto: '1 mesa', detalle: '4' });
  assert.deepEqual(resumenMesas([], 45), { tipo: 'ninguna', texto: 'Ninguna', detalle: '' });
});
