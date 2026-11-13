import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { escalaEje, porcentajeObjetivo } from '../../client/src/dashboardCalculos.js';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:1/test';
const { default: router, calcularDashboard, sumarDias, topProductos, vendedoresDelMes, formatearUltimoPedido } = await import('../src/routes/dashboard.js');
const { tenantStorage } = await import('../src/prisma.js');
const { permisoPorMetodo } = await import('../src/middleware/auth.js');

const fecha = (valor) => new Date(valor);

test('acumula ventas por periodos de Colombia, pedidos por hora y meses de ingresos vs egresos', () => {
  const ahora = fecha('2026-11-13T03:30:00Z'); // 12/11/2026 22:30 en Colombia
  const resultado = calcularDashboard({
    ahora,
    horas: 12,
    ventas: [
      { fecha: fecha('2026-11-12T05:00:00Z'), total: 100 }, // 12/11 00:00
      { fecha: fecha('2026-11-12T04:59:59Z'), total: 50 }, // 11/11 23:59
      { fecha: fecha('2026-11-06T12:00:00Z'), total: 20 }, // dentro de 7 dias
      { fecha: fecha('2026-11-05T12:00:00Z'), total: 30 }, // fuera de 7, dentro de 30
      { fecha: fecha('2026-01-01T05:00:00Z'), total: 1000 }, // inicio del ano
      { fecha: fecha('2025-12-31T12:00:00Z'), total: 7 }, // ano anterior
    ],
    pedidos: [{ createdAt: fecha('2026-11-13T03:10:00Z') }, { createdAt: fecha('2026-11-13T03:59:00Z') }, { createdAt: fecha('2026-11-12T16:00:00Z') }],
    compras: [{ fecha: fecha('2026-11-10T12:00:00Z'), total: 40 }],
    egresosCaja: [{ fecha: fecha('2026-11-11T12:00:00Z'), total: 10 }, { fecha: fecha('2025-11-01T12:00:00Z'), total: 5 }],
    objetivos: { objetivoHoy: 1000, objetivo7Dias: null, objetivo30Dias: 500, objetivoAnio: 100000 },
  });
  assert.equal(resultado.hoy, '2026-11-12');
  assert.deepEqual(resultado.indicadores.map((i) => [i.id, i.valor, i.objetivo]), [
    ['hoy', 100, 1000], ['dias7', 170, null], ['dias30', 200, 500], ['anio', 1200, 100000],
  ]);
  assert.equal(resultado.pedidosPorHora.length, 12);
  assert.deepEqual(resultado.pedidosPorHora.at(-1), { hora: '22:00', cantidad: 2 });
  assert.deepEqual(resultado.pedidosPorHora[0], { hora: '11:00', cantidad: 1 });
  assert.deepEqual(resultado.facturado7Dias.map((d) => [d.fecha, d.etiqueta, d.total]), [
    ['2026-11-06', 'Viernes', 20], ['2026-11-07', 'Sábado', 0], ['2026-11-08', 'Domingo', 0], ['2026-11-09', 'Lunes', 0],
    ['2026-11-10', 'Martes', 0], ['2026-11-11', 'Miércoles', 50], ['2026-11-12', 'Hoy', 100],
  ]);
  assert.equal(resultado.ingresosEgresos.length, 12);
  assert.deepEqual(resultado.ingresosEgresos[0], { mes: '2025-12', etiqueta: 'Dic 2025', ingresos: 7, egresos: 0 });
  assert.deepEqual(resultado.ingresosEgresos.at(-1), { mes: '2026-11', etiqueta: 'Nov 2026', ingresos: 200, egresos: 50 });
  assert.equal(sumarDias('2026-03-01', -1), '2026-02-28');
});

test('el dashboard exige su permiso y valida los objetivos', async (t) => {
  const guardados = [];
  const db = {
    objetivoDashboard: { upsert: async (consulta) => { guardados.push(consulta); return { id: 1, ...consulta.create }; } },
    auditoria: { create: async () => ({}) },
  };
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.usuario = { id: 'u1', permisos: String(req.header('x-permisos') || '').split(',').filter(Boolean) };
    tenantStorage.run(db, next);
  });
  app.use('/dashboard', permisoPorMetodo('dashboard'), router);
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => servidor.once('listening', resolve));
  t.after(() => new Promise((resolve) => servidor.close(resolve)));
  const pedir = (metodo, ruta, permisos, body) => fetch(`http://127.0.0.1:${servidor.address().port}/dashboard${ruta}`, {
    method: metodo, headers: { 'Content-Type': 'application/json', 'x-permisos': permisos }, body: body && JSON.stringify(body),
  });
  assert.equal((await pedir('GET', '/', 'reportes.ver')).status, 403);
  assert.equal((await pedir('PUT', '/objetivos', 'dashboard.ver', { hoy: 1 })).status, 403);
  assert.equal((await pedir('PUT', '/objetivos', 'dashboard.ver,dashboard.editar', { hoy: -1 })).status, 400);
  const ok = await pedir('PUT', '/objetivos', 'dashboard.ver,dashboard.editar', { hoy: '3000000', dias7: '', anio: 700000000.456 });
  assert.equal(ok.status, 200);
  assert.deepEqual(guardados[0].update, { objetivoHoy: 3000000, objetivo7Dias: null, objetivoAnio: 700000000.46 });
});

test('el eje usa pasos redondos y el avance no se calcula sin objetivo', () => {
  assert.deepEqual(escalaEje(70000), { tope: 80000, paso: 20000 });
  assert.deepEqual(escalaEje(6), { tope: 8, paso: 2 });
  assert.deepEqual(escalaEje(0), { tope: 4, paso: 1 });
  assert.equal(porcentajeObjetivo(48250, 3000000), 1.61);
  assert.equal(porcentajeObjetivo(10, null), null);
  assert.equal(porcentajeObjetivo(10, 0), null);
});

test('la migracion crea los objetivos y da el permiso solo al rol ADMIN, sin duplicar al repetirse', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { readFile } = await import('node:fs/promises');
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE "Rol" (id SERIAL PRIMARY KEY, nombre TEXT UNIQUE NOT NULL);
      CREATE TABLE "Permiso" (id SERIAL PRIMARY KEY, codigo TEXT UNIQUE NOT NULL, nombre TEXT NOT NULL, modulo TEXT);
      CREATE TABLE "RolPermiso" (id SERIAL PRIMARY KEY, "rolId" INT NOT NULL, "permisoId" INT NOT NULL, UNIQUE ("rolId", "permisoId"));
      INSERT INTO "Rol" (nombre) VALUES ('ADMIN'), ('CAJERO');
    `);
    const sql = await readFile(new URL('../prisma/migrations/20261113010000_dashboard/migration.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    await db.exec(sql);
    const { rows } = await db.query(`SELECT r.nombre, p.codigo FROM "RolPermiso" rp JOIN "Rol" r ON r.id = rp."rolId" JOIN "Permiso" p ON p.id = rp."permisoId" ORDER BY 1, 2`);
    assert.deepEqual(rows, [{ nombre: 'ADMIN', codigo: 'dashboard.editar' }, { nombre: 'ADMIN', codigo: 'dashboard.ver' }]);
    await db.exec(`INSERT INTO "ObjetivosDashboard" ("ObjetivoHoy") VALUES (3000000)`);
    assert.equal((await db.query(`SELECT "Id", "ObjetivoHoy" FROM "ObjetivosDashboard"`)).rows[0].Id, 1);
  } finally {
    await db.close();
  }
});

test('top 5 por valor sin propina, ranking de vendedores y formato de ultimos pedidos', () => {
  const lineas = [
    { productoId: 'p1', nombre: 'Hamburguesa', cantidad: 2, total: 36000 },
    { productoId: 'p1', nombre: 'Hamburguesa', cantidad: 1, total: 18000 },
    { productoId: 'p2', nombre: 'Capuchino', cantidad: 3, total: 21000 },
    { productoId: null, nombre: 'Propina', cantidad: 1, total: 99999, esPropina: true },
    ...['p3', 'p4', 'p5', 'p6'].map((id, i) => ({ productoId: id, nombre: `Producto ${id}`, cantidad: 1, total: 1000 * (i + 1) })),
  ];
  const top = topProductos(lineas);
  assert.equal(top.length, 5);
  assert.deepEqual(top.slice(0, 2).map((p) => [p.nombre, p.cantidad, p.total]), [['Hamburguesa', 3, 54000], ['Capuchino', 3, 21000]]);
  assert.ok(!top.some((p) => p.nombre === 'Propina'));
  assert.ok(!top.some((p) => p.id === 'p3'));

  assert.deepEqual(vendedoresDelMes([
    { vendedorId: 'u:1', vendedor: 'Eloy', total: 50000 },
    { vendedorId: 'u:2', vendedor: 'Ana', total: 70000 },
    { vendedorId: 'u:1', vendedor: 'Eloy', total: 28500 },
  ]).map((v) => [v.nombre, v.facturas, v.total]), [['Eloy', 2, 78500], ['Ana', 1, 70000]]);

  const base = { id: 9, cantidad: 2, producto: { nombre: 'Pepsi' } };
  assert.deepEqual(formatearUltimoPedido({ ...base, pedido: { id: 3, createdAt: 'x', estado: 'FACTURADO', tipo: 'MESA', mesa: { numero: 5 }, usuario: { nombre: 'Eloy' } } }),
    { id: 9, pedidoId: 3, mesa: 'Mesa 5', producto: 'Pepsi', fecha: 'x', cantidad: 2, estado: 'Pagada', vendedor: 'Eloy' });
  const domicilio = formatearUltimoPedido({ ...base, pedido: { estado: 'ABIERTO', tipo: 'DOMICILIO', mesera: { nombre: 'Rosa' } } });
  assert.deepEqual([domicilio.mesa, domicilio.estado, domicilio.vendedor], ['Domicilio', 'En espera', 'Rosa']);
  assert.equal(formatearUltimoPedido({ ...base, pedido: { estado: 'FACTURADO', tipo: 'MESA' } }).mesa, 'Venta directa');
  assert.equal(formatearUltimoPedido({ ...base, pedido: { estado: 'FACTURADO', tipo: 'MESA', facturasVenta: [{ usuario: { usuario: 'CAJERO1' } }] } }).vendedor, 'CAJERO1');
});
