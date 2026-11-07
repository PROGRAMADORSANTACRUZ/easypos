import assert from 'node:assert/strict';
import express from 'express';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { descontarStockMesa00, devolverStockMesa00, itemsDeInventarioNormal, validarSinSolicitudesMesa00Pendientes } from '../src/stockMesa00.js';

process.env.JWT_SECRET ||= 'prueba-mesa00';
process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:1/test';
const { default: mesa00Router } = await import('../src/routes/mesa00.js');
const { tenantStorage } = await import('../src/prisma.js');

test('descuenta la cantidad tomada y conserva el saldo para otros clientes', async () => {
  const stocks = new Map([['producto-1', { productoId: 'producto-1', cantidad: 3 }]]);
  const tx = {
    $queryRaw: async () => [],
    stockMesa00: {
      findUnique: async ({ where }) => stocks.get(where.productoId) || null,
      update: async ({ where, data }) => Object.assign(stocks.get(where.productoId), data),
      delete: async ({ where }) => stocks.delete(where.productoId),
      upsert: async ({ where, create, update }) => {
        const actual = stocks.get(where.productoId);
        if (actual) actual.cantidad += update.cantidad.increment;
        else stocks.set(where.productoId, create);
        return stocks.get(where.productoId);
      },
    },
  };
  assert.equal(await descontarStockMesa00(tx, 'producto-1', 2), 1);
  assert.equal(stocks.get('producto-1').cantidad, 1);
  await devolverStockMesa00(tx, 'producto-1', 2);
  assert.equal(stocks.get('producto-1').cantidad, 3);
  await assert.rejects(descontarStockMesa00(tx, 'producto-1', 4), /existencia sugerida/);
});

test('la migracion crea Mesa 00 no facturable, stock parcial y estados de solicitud auditables', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE "Mesa" ("id" SERIAL PRIMARY KEY, "numero" INTEGER UNIQUE NOT NULL, "capacidad" INTEGER NOT NULL DEFAULT 4, "estado" TEXT NOT NULL DEFAULT 'LIBRE');
      CREATE TABLE "Producto" ("Id" UUID PRIMARY KEY, "Nombre" VARCHAR(250) NOT NULL);
      CREATE TABLE "Pedido" ("id" SERIAL PRIMARY KEY);
      CREATE TABLE "PedidoItem" ("id" SERIAL PRIMARY KEY, "pedidoId" INTEGER NOT NULL, "cantidad" INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE "HistorialPedidos" ("id" SERIAL PRIMARY KEY, "accion" VARCHAR(30) NOT NULL CONSTRAINT "HistorialPedidos_accion_check" CHECK ("accion" IN ('CREAR', 'PLATO_LISTO', 'PLATO_ITEM_LISTO', 'ENTREGAR')));
      INSERT INTO "Producto" VALUES ('00000000-0000-4000-8000-000000000001', 'Chuzo');
      INSERT INTO "Pedido" DEFAULT VALUES;
    `);
    await db.exec(await readFile(new URL('../prisma/migrations/20261106220000_mesa00_solicitudes/migration.sql', import.meta.url), 'utf8'));

    const mesa = await db.query('SELECT "numero", "esFantasma" FROM "Mesa" WHERE "numero" = 0');
    assert.deepEqual(mesa.rows, [{ numero: 0, esFantasma: true }]);
    await db.query('INSERT INTO "StockMesa00" ("productoId", "cantidad", "actualizado") VALUES ($1, 3, now())', ['00000000-0000-4000-8000-000000000001']);
    await db.query('UPDATE "StockMesa00" SET "cantidad" = "cantidad" - 2 WHERE "productoId" = $1', ['00000000-0000-4000-8000-000000000001']);
    assert.equal((await db.query('SELECT "cantidad" FROM "StockMesa00"')).rows[0].cantidad, 1);
    await assert.rejects(db.query('UPDATE "StockMesa00" SET "cantidad" = -1'), /StockMesa00_cantidad_check/);
    await db.query(`INSERT INTO "SolicitudesMovimientoMesa00" ("id", "pedidoId", "pedidoItemId", "productoId", "productoNombre", "cantidad", "solicitadoPorId", "solicitadoPor", "solicitanteNombre") VALUES ($1, 1, 7, $2, 'Chuzo', 2, $3, 'mesero1', 'Mesero')`, [
      '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201',
    ]);
    await db.query('INSERT INTO "HistorialPedidos" ("accion") VALUES ($1)', ['SOLICITAR_MESA00']);
    assert.equal((await db.query('SELECT count(*)::int AS total FROM "SolicitudesMovimientoMesa00"')).rows[0].total, 1);
  } finally {
    await db.close();
  }
});

test('no permite cerrar una factura mientras haya solicitudes de Mesa00 pendientes', async () => {
  let pendientes = 1;
  const tx = { solicitudMovimientoMesa00: { count: async () => pendientes } };
  await assert.rejects(validarSinSolicitudesMesa00Pendientes(tx, 7), /pendientes de aprobación/);
  pendientes = 0;
  await assert.doesNotReject(validarSinSolicitudesMesa00Pendientes(tx, 7));
});

async function entornoRutas(t, { componentes = [], stockInsumo = 10 } = {}) {
  const productoId = '00000000-0000-4000-8000-000000000001';
  const producto = { id: productoId, nombre: 'Chuzo', precio: 8000, activo: true, componentes };
  const pedido = {
    id: 1, estado: 'ABIERTO', mesaId: 5, tipo: 'MESA', usuarioId: 'mesero1',
    mesa: { numero: 1 }, mesera: { nombre: 'Mesero' }, cambios: '', observaciones: null,
    items: [{ id: 7, pedidoId: 1, productoId, producto, cantidad: 3, cantidadMesa00: 0, precioUnit: 8000, notas: null }],
  };
  const solicitudes = [];
  const stock = new Map();
  const existencias = new Map(componentes.map((item) => [item.itemId, stockInsumo]));
  const eventos = [];
  const db = {
    usuarioRol: { findFirst: async ({ where }) => where.usuarioId === 'admin1' ? { usuarioId: 'admin1' } : null },
    pedido: {
      findUnique: async () => pedido,
      update: async ({ data }) => Object.assign(pedido, data),
    },
    pedidoItem: {
      findFirst: async ({ where }) => {
        const item = pedido.items.find((actual) => actual.id === where.id && actual.pedidoId === where.pedidoId
          && (where.productoId === undefined || actual.productoId === where.productoId));
        return item ? { ...item, pedido: { inventarioDescontado: false } } : null;
      },
      update: async ({ where, data }) => Object.assign(pedido.items.find((item) => item.id === where.id), data),
      delete: async ({ where }) => { pedido.items = pedido.items.filter((item) => item.id !== where.id); },
      count: async ({ where }) => pedido.items.filter((item) => item.pedidoId === where.pedidoId).length,
    },
    solicitudMovimientoMesa00: {
      aggregate: async ({ where }) => ({ _sum: { cantidad: solicitudes.filter((item) => item.pedidoId === where.pedidoId
        && item.pedidoItemId === where.pedidoItemId && item.estado === where.estado).reduce((sum, item) => sum + item.cantidad, 0) || null } }),
      count: async ({ where }) => solicitudes.filter((item) => item.estado === where.estado && (where.pedidoId === undefined || item.pedidoId === where.pedidoId)).length,
      create: async ({ data }) => { const item = { id: `sol-${solicitudes.length + 1}`, estado: 'PENDIENTE', createdAt: new Date(), ...data }; solicitudes.push(item); return item; },
      findUnique: async ({ where }) => { const item = solicitudes.find((actual) => actual.id === where.id); return item ? { ...item, producto } : null; },
      findMany: async ({ where }) => solicitudes.filter((item) => (!where || where.estado === undefined || item.estado === where.estado)
        && (!where || where.pedidoId === undefined || item.pedidoId === where.pedidoId)).map((item) => ({ ...item })),
      update: async ({ where, data }) => Object.assign(solicitudes.find((item) => item.id === where.id), data),
    },
    stockMesa00: {
      findMany: async () => [...stock.values()].map((item) => ({ ...item, producto })),
      findUnique: async ({ where }) => stock.get(where.productoId) || null,
      update: async ({ where, data }) => Object.assign(stock.get(where.productoId), data),
      delete: async ({ where }) => stock.delete(where.productoId),
      upsert: async ({ where, create, update }) => {
        const existente = stock.get(where.productoId);
        if (existente) existente.cantidad += update.cantidad.increment;
        else stock.set(where.productoId, create);
        return stock.get(where.productoId);
      },
    },
    bodega: { findFirst: async () => ({ id: 4, nombre: 'Compras' }) },
    inventarioItemBodega: {
      findMany: async ({ where }) => [...existencias].filter(([itemId]) => where.itemId.in.includes(itemId))
        .map(([itemId, stockActual]) => ({ itemId, bodegaId: 4, stock: stockActual, item: { nombre: `Insumo ${itemId}` } })),
      updateMany: async ({ where, data }) => {
        const stockActual = existencias.get(where.itemId);
        if (stockActual < where.stock.gte) return { count: 0 };
        existencias.set(where.itemId, stockActual - data.stock.decrement);
        return { count: 1 };
      },
      findUnique: async ({ where }) => ({ stock: existencias.get(where.itemId) || 0 }),
      upsert: async ({ where, create, update }) => {
        const stockActual = existencias.get(where.itemId_bodegaId.itemId) || 0;
        const siguiente = stockActual + update.stock.increment;
        existencias.set(where.itemId_bodegaId.itemId, siguiente);
        return { ...create, stock: siguiente };
      },
    },
    inventarioItem: {
      findUnique: async ({ where }) => ({ id: where.id, nombre: `Insumo ${where.id}` }),
      update: async () => ({}),
    },
    movimientoInventario: { create: async () => ({}) },
    pedidoEvento: { create: async ({ data }) => { eventos.push(data); return data; } },
    mesa: { update: async () => ({}) },
    $queryRaw: async () => [],
    $transaction: async (operacion) => operacion(db),
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const admin = req.header('x-admin') === 'true';
    req.usuario = { id: admin ? 'admin1' : 'mesero1', usuario: admin ? 'admin' : 'mesero1', nombre: admin ? 'Admin' : 'Mesero', permisos: ['pedidos.ver', 'pedidos.editar'] };
    tenantStorage.run(db, next);
  });
  app.use('/mesa00', mesa00Router);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const solicitar = async (method, ruta, datos, admin = false) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${ruta}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(admin && { 'x-admin': 'true' }) },
      ...(datos !== undefined && { body: JSON.stringify(datos) }),
    });
    return { status: response.status, body: await response.json() };
  };
  return { solicitar, pedido, solicitudes, stock, existencias, eventos, productoId };
}

test('solicitar no cambia la comanda; ADMIN aprueba cantidad parcial y rechaza no-administradores', async (t) => {
  const { solicitar, pedido, solicitudes, stock, eventos } = await entornoRutas(t);
  const solicitud = await solicitar('POST', '/mesa00/pedidos/1/solicitudes', { pedidoItemId: 7, cantidad: 2 });
  assert.equal(solicitud.status, 201);
  assert.equal(pedido.items[0].cantidad, 3);
  assert.equal(stock.size, 0);
  assert.equal((await solicitar('GET', '/mesa00/solicitudes')).status, 403);
  const pendientes = await solicitar('GET', '/mesa00/solicitudes/pendientes/count', undefined, true);
  assert.equal(pendientes.body.count, 1);
  assert.deepEqual(pendientes.body.ids, [solicitud.body.id]);

  const aprobada = await solicitar('POST', `/mesa00/solicitudes/${solicitud.body.id}/aprobar`, {}, true);
  assert.equal(aprobada.status, 200);
  assert.equal(aprobada.body.estado, 'APROBADA');
  assert.equal(pedido.items[0].cantidad, 1);
  assert.equal(stock.get(pedido.items[0].productoId).cantidad, 2);
  assert.deepEqual(eventos.map((evento) => evento.accion), ['SOLICITAR_MESA00', 'APROBAR_MESA00']);
  assert.equal(solicitudes[0].decididoPor, 'admin');
});

test('rechazar conserva la cantidad original del pedido y requiere ser ADMIN', async (t) => {
  const { solicitar, pedido, stock, eventos } = await entornoRutas(t);
  const solicitud = await solicitar('POST', '/mesa00/pedidos/1/solicitudes', { pedidoItemId: 7, cantidad: 1 });
  const rechazada = await solicitar('POST', `/mesa00/solicitudes/${solicitud.body.id}/rechazar`, { respuesta: 'Se mantiene en la mesa' }, true);
  assert.equal(rechazada.status, 200);
  assert.equal(rechazada.body.estado, 'RECHAZADA');
  assert.equal(pedido.items[0].cantidad, 3);
  assert.equal(stock.size, 0);
  assert.equal(eventos.at(-1).accion, 'RECHAZAR_MESA00');
});

test('aprobar unidades originales descuenta insumos una vez antes de guardarlas en Mesa00', async (t) => {
  const { solicitar, existencias } = await entornoRutas(t, { componentes: [{ itemId: 9, cantidad: 2 }], stockInsumo: 10 });
  const solicitud = await solicitar('POST', '/mesa00/pedidos/1/solicitudes', { pedidoItemId: 7, cantidad: 2 });
  const aprobada = await solicitar('POST', `/mesa00/solicitudes/${solicitud.body.id}/aprobar`, {}, true);
  assert.equal(aprobada.status, 200);
  assert.equal(existencias.get(9), 6);
});

test('excluye las unidades de Mesa00 de los descuentos de inventario normal', () => {
  const items = itemsDeInventarioNormal([
    { productoId: 'p1', cantidad: 3, cantidadMesa00: 2 },
    { productoId: 'p2', cantidad: 2, cantidadMesa00: 2 },
    { productoId: 'p3', cantidad: 1 },
  ]);
  assert.deepEqual(items.map((item) => [item.productoId, item.cantidad]), [['p1', 1], ['p3', 1]]);
});

test('la migracion permite asignar cada mesa normal a un usuario', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE "Usuarios" ("Id" UUID PRIMARY KEY);
      CREATE TABLE "Mesa" ("id" SERIAL PRIMARY KEY, "numero" INTEGER UNIQUE NOT NULL, "esFantasma" BOOLEAN NOT NULL DEFAULT false);
      INSERT INTO "Usuarios" VALUES ('00000000-0000-4000-8000-000000000001');
      INSERT INTO "Mesa" ("numero", "esFantasma") VALUES (1, false), (0, true);
    `);
    await db.exec(await readFile(new URL('../prisma/migrations/20261107230000_mesas_asignadas_mesero/migration.sql', import.meta.url), 'utf8'));
    await db.query('UPDATE "Mesa" SET "usuarioAsignadoId" = $1 WHERE "numero" = 1', ['00000000-0000-4000-8000-000000000001']);
    assert.equal((await db.query('SELECT "usuarioAsignadoId" FROM "Mesa" WHERE "numero" = 1')).rows[0].usuarioAsignadoId, '00000000-0000-4000-8000-000000000001');
    assert.equal((await db.query('SELECT "usuarioAsignadoId" FROM "Mesa" WHERE "numero" = 0')).rows[0].usuarioAsignadoId, null);
  } finally {
    await db.close();
  }
});