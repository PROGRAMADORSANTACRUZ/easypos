import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import express from 'express';
import test from 'node:test';

process.env.JWT_SECRET ||= 'prueba-login-mayusculas';
process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:1/test';
const { default: usuariosRouter } = await import('../src/routes/usuarios.js');
const { tenantStorage } = await import('../src/prisma.js');

async function entorno(t) {
  const usuario = {
    id: '00000000-0000-4000-8000-000000000001',
    usuario: 'rodolfo',
    nombre: 'Rodolfo',
    activo: true,
    passwordHash: bcrypt.hashSync('clave123', 4),
  };
  const db = {
    usuario: {
      findFirst: async ({ where }) => where.usuario.equals.toLocaleLowerCase('es') === usuario.usuario.toLocaleLowerCase('es') ? usuario : null,
    },
    usuarioRol: { findMany: async () => [] },
    usuarioCentroOperacion: { findMany: async () => [] },
    auditoria: { create: async () => ({ id: 1 }) },
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => tenantStorage.run(db, next));
  app.use('/usuarios', usuariosRouter);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const solicitar = async (usuarioNombre, password) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/usuarios/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-pos-session': 'cookie' },
      body: JSON.stringify({ usuario: usuarioNombre, password }),
    });
    return { status: response.status, body: await response.json() };
  };
  return solicitar;
}

test('el usuario escrito en mayúsculas permite entrar a cuentas históricas en minúsculas', async (t) => {
  const solicitar = await entorno(t);
  const response = await solicitar('RODOLFO', 'clave123');
  assert.equal(response.status, 200);
  assert.equal(response.body.usuario, 'rodolfo');
});

test('el bloqueo anti-fuerza-bruta agrupa intentos aunque cambie la capitalización', async (t) => {
  const solicitar = await entorno(t);
  for (const intento of ['rodolfo', 'RODOLFO', 'Rodolfo', 'rOdOlFo', 'RODOLFO']) {
    assert.equal((await solicitar(intento, 'incorrecta')).status, 401);
  }
  assert.equal((await solicitar('RODOLFO', 'clave123')).status, 429);
});