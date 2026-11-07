import assert from 'node:assert/strict';
import express from 'express';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

process.env.JWT_SECRET ||= 'prueba-bajas';
process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:1/test';
const { default: bajasRouter } = await import('../src/routes/bajas.js');
const { tenantStorage } = await import('../src/prisma.js');

test('migración de bajas exige foto, artículo válido y aprobación de otra persona', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE "Usuarios" ("Id" UUID PRIMARY KEY);
      CREATE TABLE "Producto" ("Id" UUID PRIMARY KEY);
      CREATE TABLE "InventarioItem" ("id" SERIAL PRIMARY KEY);
      CREATE TABLE "Bodega" ("Id" UUID PRIMARY KEY);
      INSERT INTO "Usuarios" VALUES
        ('00000000-0000-4000-8000-000000000001'),
        ('00000000-0000-4000-8000-000000000002');
      INSERT INTO "Producto" VALUES ('00000000-0000-4000-8000-000000000003');
      INSERT INTO "Bodega" VALUES ('00000000-0000-4000-8000-000000000004');
    `);
    await db.exec(await readFile(new URL('../prisma/migrations/20261107235900_bajas_inventario/migration.sql', import.meta.url), 'utf8'));

    const valores = [
      '00000000-0000-4000-8000-000000000005', 'PRODUCTO',
      '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004', 1,
      '["data:image/png;base64,AA=="]', '00000000-0000-4000-8000-000000000001', 'mesero1', 'Mesero Uno',
    ];
    await db.query(`INSERT INTO "BajasInventario" ("id", "tipoItem", "productoId", "bodegaId", "cantidad", "fotos", "solicitadoPorId", "solicitanteCuenta", "solicitanteNombre") VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)`, valores);
    await assert.rejects(
      db.query(`INSERT INTO "BajasInventario" ("id", "tipoItem", "productoId", "bodegaId", "cantidad", "fotos", "solicitadoPorId", "solicitanteCuenta", "solicitanteNombre") VALUES ('00000000-0000-4000-8000-000000000006', 'PRODUCTO', $1, $2, 1, '[]'::jsonb, $3, 'mesero1', 'Mesero Uno')`, [valores[2], valores[3], valores[6]]),
      /BajasInventario_fotos_check/,
    );
    await assert.rejects(
      db.query(`INSERT INTO "BajasInventario" ("id", "tipoItem", "productoId", "bodegaId", "cantidad", "fotos", "estado", "solicitadoPorId", "solicitanteCuenta", "solicitanteNombre", "decididoPorId", "decisionCuenta", "decisionNombre", "decididoAt") VALUES ('00000000-0000-4000-8000-000000000007', 'PRODUCTO', $1, $2, 1, $3::jsonb, 'APROBADA', $4, 'mesero1', 'Mesero Uno', $4, 'mesero1', 'Mesero Uno', now())`, [valores[2], valores[3], valores[5], valores[6]]),
      /BajasInventario_otroAprobador_check/,
    );
    assert.equal((await db.query('SELECT count(*)::int AS total FROM "BajasInventario"')).rows[0].total, 1);
  } finally {
    await db.close();
  }
});

async function entornoRutas(t) {
  let stockProducto = 5;
  let stockInsumo = 8;
  let stockTotalInsumo = 8;
  let secuencia = 10;
  const solicitudes = new Map();
  const movimientos = [];
  const producto = { id: '00000000-0000-4000-8000-000000000003', nombre: 'Producto prueba', costo: 1500 };
  const item = { id: 7, nombre: 'Insumo prueba', unidad: 'KG', costo: 800 };
  const bodega = { id: '00000000-0000-4000-8000-000000000004', nombre: 'Principal' };
  const creador = { id: '00000000-0000-4000-8000-000000000001', usuario: 'mesero1', nombre: 'Mesero Uno', permisos: ['inventario.ver', 'inventario.crear', 'inventario.editar'] };
  const aprobador = { id: '00000000-0000-4000-8000-000000000002', usuario: 'admin2', nombre: 'Admin Dos', permisos: ['inventario.ver', 'inventario.editar'] };
  const db = {
    bodega: {
      findUnique: async ({ where }) => where.id === bodega.id ? bodega : null,
      findMany: async () => [bodega],
    },
    inventario: {
      findMany: async () => [{ productoId: producto.id, bodegaId: bodega.id, cantidad: stockProducto, producto, bodega }],
      findFirst: async ({ where }) => where.productoId === producto.id && where.bodegaId === bodega.id
        ? { id: 'existencia-producto', cantidad: stockProducto, producto, bodega } : null,
      updateMany: async ({ where, data }) => {
        if (where.id !== 'existencia-producto' || stockProducto < where.cantidad.gte) return { count: 0 };
        stockProducto -= data.cantidad.decrement;
        return { count: 1 };
      },
    },
    inventarioItemBodega: {
      findMany: async () => [{ itemId: item.id, bodegaId: bodega.id, stock: stockInsumo, item, bodega }],
      findUnique: async ({ where }) => where.itemId_bodegaId.itemId === item.id && where.itemId_bodegaId.bodegaId === bodega.id
        ? { itemId: item.id, bodegaId: bodega.id, stock: stockInsumo, item, bodega } : null,
      updateMany: async ({ where, data }) => {
        if (stockInsumo < where.stock.gte) return { count: 0 };
        stockInsumo -= data.stock.decrement;
        return { count: 1 };
      },
    },
    inventarioItem: { update: async ({ data }) => { stockTotalInsumo += data.stock.increment; return { ...item, stock: stockTotalInsumo }; } },
    bajaInventario: {
      findMany: async ({ where }) => [...solicitudes.values()]
        .filter((baja) => !where || !where.estado || baja.estado === where.estado)
        .map(({ fotos, ...baja }) => baja),
      findUnique: async ({ where }) => solicitudes.get(where.id) || null,
      create: async ({ data }) => {
        const id = `00000000-0000-4000-8000-${String(secuencia++).padStart(12, '0')}`;
        const baja = { id, estado: 'PENDIENTE', createdAt: new Date(), ...data, producto: data.productoId ? producto : null, item: data.itemId ? item : null, bodega };
        solicitudes.set(id, baja);
        const { fotos, ...respuesta } = baja;
        return respuesta;
      },
      update: async ({ where, data }) => {
        const actualizado = Object.assign(solicitudes.get(where.id), data);
        const { fotos, ...respuesta } = actualizado;
        return respuesta;
      },
    },
    movimientoInventario: { create: async ({ data }) => { movimientos.push(data); return data; } },
    auditoria: { create: async () => ({ id: 1 }) },
    $queryRaw: async () => [],
    $transaction: async (operation) => operation(db),
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.usuario = req.header('x-actor') === 'aprobador' ? aprobador : creador;
    tenantStorage.run(db, next);
  });
  app.use('/bajas', bajasRouter);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const solicitar = async (method, ruta, body, actor = 'creador') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/bajas${ruta}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-actor': actor },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  return { solicitar, solicitudes, movimientos, get stockProducto() { return stockProducto; }, get stockInsumo() { return stockInsumo; }, get stockTotalInsumo() { return stockTotalInsumo; } };
}

const fotoPrueba = 'data:image/png;base64,AA==';

test('solicitar una baja no descuenta hasta que otra persona la aprueba', async (t) => {
  const entorno = await entornoRutas(t);
  const creada = await entorno.solicitar('POST', '/', {
    tipoItem: 'PRODUCTO', productoId: '00000000-0000-4000-8000-000000000003', bodegaId: '00000000-0000-4000-8000-000000000004', cantidad: 2, fotos: [fotoPrueba], notas: 'Se dañó el empaque',
  });
  assert.equal(creada.status, 201);
  assert.equal(entorno.stockProducto, 5);
  assert.equal(creada.body.estado, 'PENDIENTE');

  const propia = await entorno.solicitar('POST', `/${creada.body.id}/aprobar`, {}, 'creador');
  assert.equal(propia.status, 403);
  assert.equal(entorno.stockProducto, 5);

  const aprobada = await entorno.solicitar('POST', `/${creada.body.id}/aprobar`, {}, 'aprobador');
  assert.equal(aprobada.status, 200);
  assert.equal(aprobada.body.estado, 'APROBADA');
  assert.equal(aprobada.body.decisionNombre, 'Admin Dos');
  assert.equal(entorno.stockProducto, 3);
  assert.equal(entorno.movimientos.length, 1);
  assert.equal(entorno.movimientos[0].tipoMovimiento, 'BAJA');
  assert.equal(entorno.movimientos[0].cantidad, 2);

  const repetida = await entorno.solicitar('POST', `/${creada.body.id}/aprobar`, {}, 'aprobador');
  assert.equal(repetida.status, 409);
  assert.equal(entorno.stockProducto, 3);
});

test('la baja de insumo descuenta existencias de bodega y stock acumulado', async (t) => {
  const entorno = await entornoRutas(t);
  const creada = await entorno.solicitar('POST', '/', {
    tipoItem: 'INSUMO', itemId: 7, bodegaId: '00000000-0000-4000-8000-000000000004', cantidad: 3, fotos: [fotoPrueba],
  });
  assert.equal(creada.status, 201);
  assert.equal(entorno.stockInsumo, 8);
  const aprobada = await entorno.solicitar('POST', `/${creada.body.id}/aprobar`, {}, 'aprobador');
  assert.equal(aprobada.status, 200);
  assert.equal(entorno.stockInsumo, 5);
  assert.equal(entorno.stockTotalInsumo, 5);
  assert.equal(entorno.movimientos[0].itemId, 7);
});

test('el catálogo incluye stocks por bodega y las fotos se descargan aparte', async (t) => {
  const entorno = await entornoRutas(t);
  const creada = await entorno.solicitar('POST', '/', {
    tipoItem: 'PRODUCTO', productoId: '00000000-0000-4000-8000-000000000003', bodegaId: '00000000-0000-4000-8000-000000000004', cantidad: 1, fotos: [fotoPrueba],
  });
  const [opciones, lista, evidencia] = await Promise.all([
    entorno.solicitar('GET', '/opciones'),
    entorno.solicitar('GET', '/?estado=PENDIENTE'),
    entorno.solicitar('GET', `/${creada.body.id}/fotos`),
  ]);
  assert.equal(opciones.status, 200);
  assert.equal(opciones.body.productos[0].cantidad, 5);
  assert.equal(opciones.body.insumos[0].stock, 8);
  assert.equal(lista.status, 200);
  assert.equal('fotos' in lista.body[0], false);
  assert.deepEqual(evidencia.body.fotos, [fotoPrueba]);
});

test('una foto es obligatoria y rechazar no afecta el inventario', async (t) => {
  const entorno = await entornoRutas(t);
  const sinFoto = await entorno.solicitar('POST', '/', {
    tipoItem: 'PRODUCTO', productoId: '00000000-0000-4000-8000-000000000003', bodegaId: '00000000-0000-4000-8000-000000000004', cantidad: 1, fotos: [],
  });
  assert.equal(sinFoto.status, 400);
  const creada = await entorno.solicitar('POST', '/', {
    tipoItem: 'PRODUCTO', productoId: '00000000-0000-4000-8000-000000000003', bodegaId: '00000000-0000-4000-8000-000000000004', cantidad: 1, fotos: [fotoPrueba],
  });
  const rechazada = await entorno.solicitar('POST', `/${creada.body.id}/rechazar`, { respuesta: 'No corresponde' }, 'aprobador');
  assert.equal(rechazada.status, 200);
  assert.equal(rechazada.body.estado, 'RECHAZADA');
  assert.equal(entorno.stockProducto, 5);
  assert.equal(entorno.movimientos.length, 0);
});