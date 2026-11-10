import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULOS_RESTAURANTE_DEFAULT, restringirModuloRestaurante, validarModulosRestaurante } from '../src/modulosRestaurante.js';

function evaluar(path, modulos, { method = 'GET', query = {}, body = {} } = {}) {
  let siguiente = false;
  let status;
  let cuerpo;
  const req = { path, method, query, body, tenant: { modulos } };
  const res = {
    status(codigo) { status = codigo; return this; },
    json(datos) { cuerpo = datos; return this; },
  };
  restringirModuloRestaurante(req, res, () => { siguiente = true; });
  return { siguiente, status, cuerpo };
}

test('los permisos efectivos provienen de roles e ignoran submódulos guardados en usuario', async () => {
  process.env.JWT_SECRET ||= 'test-secret-for-role-permissions';
  const { permisosEfectivos, puedeLeerCatalogoParaPedidos } = await import('../src/middleware/auth.js');
  assert.deepEqual(permisosEfectivos(['facturas.ver', 'pedidos.crear'], ['factura_venta', 'cortesias']), [
    'facturas.ver',
    'pedidos.crear',
  ]);
  assert.equal(puedeLeerCatalogoParaPedidos('GET', '/', ['pedidos.ver']), true);
  assert.equal(puedeLeerCatalogoParaPedidos('GET', '/', ['domicilios.ver']), true);
  assert.equal(puedeLeerCatalogoParaPedidos('POST', '/', ['domicilios.ver']), false);
  assert.equal(puedeLeerCatalogoParaPedidos('GET', '/categorias', ['pedidos.ver']), false);
  assert.equal(puedeLeerCatalogoParaPedidos('POST', '/', ['pedidos.ver']), false);
});

async function evaluarPedidos(path, method, permisos, tipo = 'DOMICILIO', query = {}) {
  process.env.JWT_SECRET ||= 'test-pedidos-independientes';
  const { permisoAccesoPedidos } = await import('../src/middleware/auth.js');
  const { tenantStorage } = await import('../src/prisma.js');
  const req = { path, method, query, usuario: { permisos } };
  let siguiente = false;
  let status;
  const res = { status(codigo) { status = codigo; return this; }, json() { return this; } };
  await tenantStorage.run({ pedido: { findUnique: async () => tipo ? { tipo } : null } }, () =>
    permisoAccesoPedidos(req, res, (error) => { if (error) throw error; siguiente = true; }));
  return { req, siguiente, status };
}

test('mesero sin permisos de domicilio ni reparto conserva solo los pedidos de mesa', async () => {
  const permisos = ['pedidos.ver', 'pedidos.crear', 'pedidos.editar'];
  assert.equal((await evaluarPedidos('/', 'POST', permisos, 'MESA')).siguiente, true);
  assert.deepEqual((await evaluarPedidos('/', 'GET', permisos)).req.tiposPedidoPermitidos, ['MESA']);
  assert.equal((await evaluarPedidos('/online', 'POST', permisos)).status, 403);
  assert.equal((await evaluarPedidos('/ultimo-domicilio', 'GET', permisos)).status, 403);
  assert.equal((await evaluarPedidos('/1', 'GET', permisos)).status, 403);
  assert.equal((await evaluarPedidos('/1/estado-entrega', 'PUT', permisos)).status, 403);
  assert.equal((await evaluarPedidos('/1/ubicacion', 'POST', permisos)).status, 403);
  assert.equal((await evaluarPedidos('/1', 'GET', permisos, 'MESA')).siguiente, true);
});

test('Domicilios puede crear sin permisos de mesa, pero no gestionar reparto', async () => {
  const permisos = ['domicilios.ver', 'domicilios.crear'];
  assert.equal((await evaluarPedidos('/online', 'POST', permisos)).siguiente, true);
  assert.equal((await evaluarPedidos('/ultimo-domicilio', 'GET', permisos)).siguiente, true);
  assert.equal((await evaluarPedidos('/1/estado-entrega', 'PUT', permisos)).status, 403);
  assert.equal((await evaluarPedidos('/1', 'GET', permisos, 'MESA')).status, 403);
  assert.equal((await evaluarPedidos('/online', 'POST', ['domicilios.ver'])).status, 403);
});

test('Repartidor consulta y edita entregas sin permisos de mesa ni de Domicilios', async () => {
  const permisos = ['repartidor.ver', 'repartidor.editar'];
  assert.deepEqual((await evaluarPedidos('/', 'GET', permisos)).req.tiposPedidoPermitidos, ['DOMICILIO']);
  assert.equal((await evaluarPedidos('/1', 'GET', permisos)).siguiente, true);
  assert.equal((await evaluarPedidos('/1/estado-entrega', 'PUT', permisos)).siguiente, true);
  assert.equal((await evaluarPedidos('/1/ubicacion', 'POST', permisos)).siguiente, true);
  assert.equal((await evaluarPedidos('/online', 'POST', permisos)).status, 403);
  assert.equal((await evaluarPedidos('/1/estado-entrega', 'PUT', ['repartidor.ver'])).status, 403);
  assert.equal((await evaluarPedidos('/1/estado-entrega', 'PUT', permisos, 'MESA')).status, 400);
  assert.equal((await evaluarPedidos('/', 'GET', permisos, 'DOMICILIO', { tipo: 'MESA' })).status, 403);
});

test('la API filtra los pedidos por canal incluso sin un filtro enviado por el cliente', async (contexto) => {
  process.env.JWT_SECRET ||= 'test-api-canales';
  const { default: express } = await import('express');
  const { permisoAccesoPedidos } = await import('../src/middleware/auth.js');
  const { tenantStorage } = await import('../src/prisma.js');
  const { default: pedidosRouter } = await import('../src/routes/pedidos.js');
  const pedidos = [
    { id: 1, tipo: 'MESA', mesaId: 1, createdAt: new Date(), items: [] },
    { id: 2, tipo: 'DOMICILIO', mesaId: null, createdAt: new Date(), items: [] },
  ];
  const db = { pedido: {
    findMany: async ({ where }) => pedidos.filter((pedido) => !where?.tipo || (typeof where.tipo === 'string'
      ? pedido.tipo === where.tipo : where.tipo.in.includes(pedido.tipo))),
    findUnique: async ({ where }) => pedidos.find((pedido) => pedido.id === where.id),
  } };
  const app = express();
  app.use((req, _res, next) => {
    req.usuario = { id: 'prueba', roles: [], permisos: String(req.header('x-permisos') || '').split(',') };
    tenantStorage.run(db, next);
  });
  app.use('/pedidos', permisoAccesoPedidos, pedidosRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  contexto.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/pedidos`;
  for (const [permiso, tipo] of [['pedidos.ver', 'MESA'], ['domicilios.ver', 'DOMICILIO'], ['repartidor.ver', 'DOMICILIO']]) {
    const respuesta = await fetch(base, { headers: { 'x-permisos': permiso } });
    assert.equal(respuesta.status, 200);
    assert.deepEqual((await respuesta.json()).map((pedido) => pedido.tipo), [tipo]);
  }
  assert.equal((await fetch(`${base}/2`, { headers: { 'x-permisos': 'pedidos.ver' } })).status, 403);
  assert.equal((await fetch(`${base}/1`, { headers: { 'x-permisos': 'repartidor.ver' } })).status, 403);
});

test('la migracion separa los modulos, conserva permisos de mesa y puede repetirse', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { readFile } = await import('node:fs/promises');
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE "Rol" (id SERIAL PRIMARY KEY, nombre TEXT UNIQUE);
      CREATE TABLE "Permiso" (id SERIAL PRIMARY KEY, codigo TEXT UNIQUE, nombre TEXT, modulo TEXT);
      CREATE TABLE "RolPermiso" (id SERIAL PRIMARY KEY, "rolId" INTEGER REFERENCES "Rol", "permisoId" INTEGER REFERENCES "Permiso", UNIQUE ("rolId", "permisoId"));
      INSERT INTO "Rol" (nombre) VALUES ('ADMIN'), ('CAJERO'), ('MESERO'), ('LECTOR');
      INSERT INTO "Permiso" (codigo, nombre, modulo) VALUES
        ('pedidos.ver', 'ver', 'pedidos'), ('pedidos.crear', 'crear', 'pedidos'),
        ('pedidos.editar', 'editar', 'pedidos'), ('pedidos.eliminar', 'eliminar', 'pedidos'),
        ('pedidos.prefactura', 'prefactura', 'pedidos'), ('pedidos.observaciones', 'observaciones', 'pedidos');
      INSERT INTO "RolPermiso" ("rolId", "permisoId") SELECT r.id, p.id FROM "Rol" r CROSS JOIN "Permiso" p
        WHERE r.nombre <> 'LECTOR' OR p.codigo = 'pedidos.ver';
    `);
    const sql = await readFile(new URL('../prisma/migrations/20261110120000_permisos_domicilios_repartidor/migration.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    await db.exec(sql);
    const { rows } = await db.query(`SELECT r.nombre, p.codigo FROM "RolPermiso" rp
      JOIN "Rol" r ON r.id=rp."rolId" JOIN "Permiso" p ON p.id=rp."permisoId"`);
    const permisos = (nombre) => rows.filter((fila) => fila.nombre === nombre).map((fila) => fila.codigo);
    assert.equal(permisos('MESERO').length, 6);
    assert.ok(permisos('MESERO').every((codigo) => codigo.startsWith('pedidos.')));
    for (const rol of ['ADMIN', 'CAJERO']) {
      assert.equal(permisos(rol).length, 14);
      assert.ok(permisos(rol).includes('domicilios.crear'));
      assert.ok(permisos(rol).includes('repartidor.editar'));
    }
    assert.deepEqual(permisos('LECTOR').sort(), ['domicilios.ver', 'pedidos.ver', 'repartidor.ver']);
  } finally { await db.close(); }
});

test('requireAuth reemplaza el usuario de auditoría enviado por el cliente', async () => {
  process.env.JWT_SECRET ||= 'test-authenticated-audit-user';
  const { requireAuth, firmarToken } = await import('../src/middleware/auth.js');
  const { tenantStorage } = await import('../src/prisma.js');
  const usuario = { id: 'usuario-autenticado', usuario: 'mesero1', nombre: 'Mesero', activo: true, roles: [], centrosOperacion: [] };
  const db = { usuario: { findUnique: async () => usuario } };
  const req = {
    headers: {
      authorization: `Bearer ${firmarToken(usuario)}`,
      'x-usuario-id': 'usuario-suplantado',
    },
  };
  const res = { clearCookie() {} };
  let llamadaNext = false;
  await new Promise((resolve, reject) => tenantStorage.run(db, () => requireAuth(req, res, (error) => {
    if (error) return reject(error);
    llamadaNext = true;
    resolve();
  })));
  assert.equal(llamadaNext, true);
  assert.equal(req.headers['x-usuario-id'], usuario.id);
});

test('bloquea endpoints de grupos deshabilitados', () => {
  const resultado = evaluar('/api/mesas', ['inventario']);
  assert.equal(resultado.siguiente, false);
  assert.equal(resultado.status, 403);
  assert.match(resultado.cuerpo.error, /no está habilitado/i);
});

test('permite endpoints cuando el grupo está habilitado', () => {
  assert.equal(evaluar('/api/mesas', ['ventas']).siguiente, true);
  assert.equal(evaluar('/api/bajas', ['inventario']).siguiente, true);
  assert.equal(evaluar('/api/bajas/opciones', ['ventas']).status, 403);
});

test('el middleware de módulos no permite escrituras con permisos de solo lectura', async () => {
  process.env.JWT_SECRET ||= 'test-module-route-permissions';
  const { permisoPorMetodo } = await import('../src/middleware/auth.js');
  const revisar = (modulo, method, permisos) => {
    let siguiente = false;
    let status;
    const res = { status(codigo) { status = codigo; return this; }, json() { return this; } };
    permisoPorMetodo(modulo)({ method, usuario: { permisos } }, res, () => { siguiente = true; });
    return { siguiente, status };
  };
  assert.equal(revisar('bodegas', 'GET', ['pedidos.ver']).status, 403);
  assert.equal(revisar('bodegas', 'POST', ['bodegas.ver']).status, 403);
  assert.equal(revisar('bodegas', 'POST', ['bodegas.crear']).siguiente, true);
  assert.equal(revisar('cuentas', 'POST', ['facturas.ver']).status, 403);
  assert.equal(revisar('cuentas', 'POST', ['cuentas.abonar']).siguiente, true);
});

test('asignación de cajas y permisos respetan sus módulos RBAC', async () => {
  process.env.JWT_SECRET ||= 'test-module-route-permissions';
  const { permisoPorMetodo } = await import('../src/middleware/auth.js');
  const revisar = (modulo, method, permisos) => {
    let siguiente = false;
    let status;
    const res = { status(codigo) { status = codigo; return this; }, json() { return this; } };
    permisoPorMetodo(modulo)({ method, usuario: { permisos } }, res, () => { siguiente = true; });
    return { siguiente, status };
  };
  assert.equal(revisar('empresa', 'GET', ['caja.ver']).status, 403);
  assert.equal(revisar('empresa', 'POST', ['empresa.ver']).status, 403);
  assert.equal(revisar('empresa', 'POST', ['empresa.editar']).siguiente, true);
  assert.equal(revisar('roles', 'GET', ['usuarios.ver']).status, 403);
  assert.equal(revisar('roles', 'GET', ['roles.ver']).siguiente, true);
});

test('permite consultar productos desde ventas, pero solo inventario puede modificarlos', () => {
  assert.equal(evaluar('/api/productos', ['ventas']).siguiente, true);
  assert.equal(evaluar('/api/productos', ['ventas'], { method: 'POST' }).status, 403);
  assert.equal(evaluar('/api/productos', ['inventario'], { method: 'POST' }).siguiente, true);
});

test('la plataforma de restaurantes queda fuera de los módulos del tenant', () => {
  assert.equal(evaluar('/api/plataforma/restaurantes/publico', ['ventas']).siguiente, true);
  assert.equal(evaluar('/api/plataforma/restaurantes', ['ventas']).siguiente, true);
});

test('mantiene disponibles login y sesión sin el módulo de administración', () => {
  assert.equal(evaluar('/api/usuarios/login', ['ventas']).siguiente, true);
  assert.equal(evaluar('/api/usuarios/sesion', ['ventas']).siguiente, true);
});

test('separa factura electrónica y factura de venta', () => {
  assert.equal(evaluar('/api/facturas', ['dian']).siguiente, true);
  assert.equal(evaluar('/api/facturas', ['ventas'], { query: { electronica: 'false' } }).siguiente, true);
  assert.equal(evaluar('/api/facturas', ['dian'], { query: { electronica: 'false' } }).status, 403);
  assert.equal(evaluar('/api/facturas/123/reenviar-dian', ['ventas'], { method: 'POST' }).status, 403);
});

test('conserva todos los módulos por defecto y rechaza configuraciones inválidas', () => {
  assert.equal(MODULOS_RESTAURANTE_DEFAULT.length, 7);
  assert.equal(validarModulosRestaurante(MODULOS_RESTAURANTE_DEFAULT), true);
  assert.equal(validarModulosRestaurante([]), false);
  assert.equal(validarModulosRestaurante(['ventas', 'ventas']), false);
  assert.equal(validarModulosRestaurante(['desconocido']), false);
});
