import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

process.env.JWT_SECRET ||= 'prueba-pedidos-usuario';
process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:1/test';
const { default: pedidosRouter } = await import('../src/routes/pedidos.js');
const { tenantStorage } = await import('../src/prisma.js');
const { default: mesasRouter } = await import('../src/routes/mesas.js');
const { filtroHistorialPedidos, estadoActualPedido } = await import('../src/historialPedidos.js');
const { default: reportesRouter } = await import('../src/routes/reportes.js');
const { permisoPorMetodo } = await import('../src/middleware/auth.js');
const { default: preparacionRouter } = await import('../src/routes/preparacionCocina.js');

test('el estado actual prioriza cancelado y facturado sobre el plato listo de cocina', () => {
  assert.equal(estadoActualPedido({ estado: 'ABIERTO', preparacion: { listo: true } }), 'DESPACHADO');
  assert.equal(estadoActualPedido({ estado: 'FACTURADO', preparacion: { listo: true } }), 'FACTURADO');
  assert.equal(estadoActualPedido({ estado: 'CANCELADO', preparacion: { listo: true } }), 'CANCELADO');
  assert.equal(estadoActualPedido({ estado: 'ABIERTO', preparacion: { listo: false } }), 'EN_COCINA');
  assert.equal(estadoActualPedido({ estado: 'ABIERTO', preparacion: null }), 'PENDIENTE');
});

test('cada mesero solo lista y opera las mesas asignadas', async (t) => {
  const { crear, solicitar } = await entorno(t, {
    mesasAsignadas: { 1: 'usuario-mesero-1', 2: 'usuario-mesero-2' },
  });
  await crear({}, { 'x-test-user': 'usuario-mesero-1', 'x-test-role': 'MESERO' });
  await crear({ mesaId: 2 }, { 'x-test-user': 'usuario-mesero-2', 'x-test-role': 'MESERO' });

  const primera = await solicitar('GET', '/mesas', undefined, { 'x-test-user': 'usuario-mesero-1', 'x-test-role': 'MESERO' });
  const segunda = await solicitar('GET', '/mesas', undefined, { 'x-test-user': 'usuario-mesero-2', 'x-test-role': 'MESERO' });
  assert.deepEqual(primera.body.map((mesa) => mesa.numero), [1]);
  assert.deepEqual(segunda.body.map((mesa) => mesa.numero), [2]);

  assert.equal((await solicitar('GET', '/pedidos/2', undefined, { 'x-test-user': 'usuario-mesero-1', 'x-test-role': 'MESERO' })).status, 403);
  const pedidoAjeno = await crear({ mesaId: 2 }, { 'x-test-user': 'usuario-mesero-1', 'x-test-role': 'MESERO' });
  assert.equal(pedidoAjeno.status, 403);
});

test('el filtro del historial incluye dias completos de Colombia y busca el motivo sin distinguir mayusculas', () => {
  const filtro = filtroHistorialPedidos({ desde: '2026-11-01', hasta: '2026-11-06', motivo: ' Cliente ' });
  assert.equal(filtro.fecha.gte.toISOString(), '2026-11-01T05:00:00.000Z');
  assert.equal(filtro.fecha.lt.toISOString(), '2026-11-07T05:00:00.000Z');
  assert.deepEqual(filtro.motivo, { contains: 'Cliente', mode: 'insensitive' });
  assert.deepEqual(filtroHistorialPedidos({ motivo: '   ' }), {});
  for (const datos of [{ desde: '2026-02-30' }, { hasta: 'ayer' }, { desde: '2026-11-07', hasta: '2026-11-06' }, { motivo: ['x'] }]) {
    assert.throws(() => filtroHistorialPedidos(datos), (error) => error.status === 400);
  }
});

test('el historial SQL conserva eventos, exige motivo y rechaza modificar o borrar', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE "Pedido" ("id" INTEGER PRIMARY KEY); INSERT INTO "Pedido" VALUES (1)');
    await db.exec('CREATE TABLE "PreparacionCocina" ("consecutivo" SERIAL PRIMARY KEY, "pedidoId" INTEGER UNIQUE, "productos" TEXT NOT NULL, "listo" BOOLEAN NOT NULL DEFAULT FALSE)');
    await db.exec(await readFile(new URL('../prisma/migrations/20261106100000_historial_pedidos/migration.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../prisma/migrations/20261106110000_historial_listo_entrega/migration.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../prisma/migrations/20261106210000_cocina_por_plato/migration.sql', import.meta.url), 'utf8'));
    await db.query(`INSERT INTO "HistorialPedidos" ("pedidoId", "usuarioId", "usuarioCuenta", "usuarioNombre", "accion", "motivo", "despues")
      VALUES (1, $1, 'mesero1', 'Mesero uno', 'CANCELAR', 'Cliente se retira', '{"estado":"CANCELADO"}')`, ['00000000-0000-4000-8000-000000000001']);
    await assert.rejects(db.exec('UPDATE "HistorialPedidos" SET "motivo" = \'Otro\''), /no se puede modificar/);
    await assert.rejects(db.exec('DELETE FROM "HistorialPedidos"'), /no se puede modificar/);
    await assert.rejects(db.exec('DELETE FROM "Pedido" WHERE "id" = 1'), /foreign key/i);
    await assert.rejects(db.query(`INSERT INTO "HistorialPedidos" ("pedidoId", "usuarioId", "usuarioCuenta", "usuarioNombre", "accion", "motivo", "despues")
      VALUES (1, $1, 'mesero1', 'Mesero uno', 'CANCELAR', '   ', '{}')`, ['00000000-0000-4000-8000-000000000001']), /motivo_check/);
    for (const accion of ['PLATO_LISTO', 'PLATO_ITEM_LISTO', 'ENTREGAR']) {
      await db.query(`INSERT INTO "HistorialPedidos" ("pedidoId", "usuarioId", "usuarioCuenta", "usuarioNombre", "accion", "despues")
        VALUES (1, $1, 'mesero1', 'Mesero uno', $2, '{}')`, ['00000000-0000-4000-8000-000000000001', accion]);
    }
    assert.equal((await db.query('SELECT count(*)::int AS total FROM "HistorialPedidos"')).rows[0].total, 4);
    assert.deepEqual((await db.query('SELECT "itemsListos" FROM "PreparacionCocina"')).rows, []);
  } finally { await db.close(); }
});

async function entorno(t, { ocupada = false, reportes = true, cocina = true, mesa00Stock = 0, mesasAsignadas = {} } = {}) {
  const responsables = new Map();
  const propietariosMesa = new Map(Object.entries(mesasAsignadas).map(([mesaId, usuarioId]) => [Number(mesaId), usuarioId]));
  const pedidos = [];
  const movimientos = [];
  const eventos = [];
  const auditorias = [];
  let actual;
  let falloHistorial = false;
  const producto = { id: 'producto-prueba', nombre: 'Producto', precio: 8000, componentes: [], unidad: null };
  const stockFantasma = new Map(mesa00Stock > 0 ? [[producto.id, { productoId: producto.id, cantidad: mesa00Stock }]] : []);
  const db = {
    producto: { findMany: async () => [producto], findUnique: async () => producto },
    mesa: {
      findUnique: async ({ where }) => ({ id: where.id, numero: where.id, esFantasma: where.id === 99, usuarioAsignadoId: propietariosMesa.get(where.id) || null, estado: ocupada ? 'OCUPADA' : 'LIBRE' }),
      findMany: async ({ where }) => [...propietariosMesa].filter(([id, usuarioId]) => where.usuarioAsignadoId === undefined || usuarioId === where.usuarioAsignadoId).map(([id, usuarioAsignadoId]) => ({ id, numero: id, usuarioAsignadoId, esFantasma: false })),
      count: async ({ where }) => where.usuarioAsignadoId?.not === null ? propietariosMesa.size : 0,
      update: async () => ({}),
    },
    mesera: {
      upsert: async ({ where, create, update }) => {
        const anterior = responsables.get(where.codigo);
        const responsable = anterior ? { ...anterior, ...update } : { id: responsables.size + 10, ...create };
        responsables.set(where.codigo, responsable);
        return responsable;
      },
    },
    pedido: {
      findFirst: async () => null,
      findMany: async ({ where }) => pedidos.filter((item) => (!where?.estado || item.estado === where.estado)
        && (!where?.mesaId?.in || where.mesaId.in.includes(item.mesaId))),
      create: async ({ data }) => {
        actual = {
          ...data,
          id: pedidos.length + 1,
          estado: 'ABIERTO',
          tipo: 'MESA',
          items: data.items.create.map((item, index) => ({ ...item, id: index + 1, producto })),
        };
        pedidos.push(actual);
        return actual;
      },
      findUnique: async ({ where }) => pedidos.find((item) => item.id === where.id) || null,
      update: async ({ data }) => Object.assign(actual, data),
    },
    pedidoItem: {
      findFirst: async ({ where }) => {
        const item = actual?.id === where.pedidoId && actual.items.find((linea) =>
          (where.id === undefined || linea.id === where.id)
          && (where.productoId === undefined || linea.productoId === where.productoId));
        return item ? { ...item, pedido: { inventarioDescontado: false } } : null;
      },
      update: async ({ where, data }) => {
        const item = actual.items.find((linea) => linea.id === where.id);
        for (const [campo, valor] of Object.entries(data)) {
          item[campo] = valor && typeof valor === 'object' && 'increment' in valor
            ? Number(item[campo] || 0) + valor.increment
            : valor;
        }
        return item;
      },
      delete: async ({ where }) => { actual.items = actual.items.filter((linea) => linea.id !== where.id); },
      create: async ({ data }) => {
        const linea = { ...data, id: Math.max(0, ...actual.items.map((item) => item.id)) + 1, producto };
        actual.items.push(linea);
        return linea;
      },
    },
    pedidoMesa: {
      create: async ({ data }) => { movimientos.push(data); return data; },
      findMany: async () => movimientos,
      updateMany: async () => ({ count: movimientos.length }),
    },
    pedidoEvento: {
      create: async ({ data }) => {
        if (falloHistorial) throw new Error('No se pudo guardar el historial');
        eventos.push({ id: eventos.length + 1, fecha: new Date().toISOString(), ...structuredClone(data) });
        return data;
      },
      findFirst: async ({ where, orderBy }) => {
        const encontrados = eventos.filter((evento) => evento.pedidoId === where.pedidoId
          && (where.accion === undefined || (where.accion.in || [where.accion]).includes(evento.accion))
          && (where.id?.gt === undefined || evento.id > where.id.gt)
          && (where.id?.lt === undefined || evento.id < where.id.lt));
        encontrados.sort((a, b) => orderBy.id === 'desc' ? b.id - a.id : a.id - b.id);
        return encontrados[0] || null;
      },
      findMany: async ({ where }) => eventos.filter((evento) => (
        (where.pedidoId === undefined || evento.pedidoId === where.pedidoId)
        && (!where.fecha?.gte || new Date(evento.fecha) >= where.fecha.gte)
        && (!where.fecha?.lt || new Date(evento.fecha) < where.fecha.lt)
        && (!where.motivo || (evento.motivo || '').toLowerCase().includes(where.motivo.contains.toLowerCase()))
      )).toReversed().map((evento) => ({ ...evento, pedido: evento.pedido || (actual?.id === evento.pedidoId ? actual : null) })),
    },
    solicitudMovimientoMesa00: {
      aggregate: async () => ({ _sum: { cantidad: 0 } }),
      count: async () => 0,
    },
    preparacionCocina: {
      findUnique: async () => actual?.preparacion || null,
      update: async ({ data }) => Object.assign(actual.preparacion, data),
      upsert: async ({ create, update }) => {
        actual.preparacion = actual.preparacion ? { ...actual.preparacion, ...update } : { consecutivo: 1, ...create };
        return actual.preparacion;
      },
      updateMany: async ({ data }) => {
        if (actual.preparacion) Object.assign(actual.preparacion, data);
        return { count: 1 };
      },
    },
    stockMesa00: {
      findUnique: async ({ where }) => stockFantasma.get(where.productoId) || null,
      findMany: async () => [...stockFantasma.values()],
      update: async ({ where, data }) => Object.assign(stockFantasma.get(where.productoId), data),
      delete: async ({ where }) => stockFantasma.delete(where.productoId),
      upsert: async ({ where, create, update }) => {
        const actualStock = stockFantasma.get(where.productoId);
        if (actualStock) actualStock.cantidad += update.cantidad.increment;
        else stockFantasma.set(where.productoId, create);
        return stockFantasma.get(where.productoId);
      },
    },
    solicitudMovimientoMesa00: {
      aggregate: async () => ({ _sum: { cantidad: 0 } }),
      count: async () => 0,
    },
    cocinero: { findUnique: async ({ where }) => ({ id: where.id, nombre: 'Cocinero prueba', activo: true }) },
    auditoria: {
      findFirst: async ({ where }) => auditorias.toReversed().find((fila) => fila.entidadId === where.entidadId
        && (!where.accion?.in || where.accion.in.includes(fila.accion))) || null,
      create: async ({ data }) => {
        const fila = { id: auditorias.length + 1, createdAt: new Date(), ...data };
        auditorias.push(fila);
        return fila;
      },
    },
    $queryRaw: async () => [],
    $transaction: async (trabajo) => {
      const anterior = structuredClone(actual);
      const pedidosAntes = structuredClone(pedidos);
      const eventosAntes = eventos.length;
      const movimientosAntes = movimientos.length;
      const auditoriasAntes = auditorias.length;
      const responsablesAntes = structuredClone(responsables);
      try { return await trabajo(db); } catch (error) {
        actual = anterior;
        pedidos.splice(0, pedidos.length, ...pedidosAntes);
        actual = pedidos.find((pedido) => pedido.id === anterior?.id) || pedidos.at(-1);
        eventos.length = eventosAntes;
        movimientos.length = movimientosAntes;
        auditorias.length = auditoriasAntes;
        responsables.clear();
        for (const [codigo, responsable] of responsablesAntes) responsables.set(codigo, responsable);
        throw error;
      }
    },
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.usuario = {
      id: req.header('x-test-user') || 'usuario-mesero-1',
      nombre: req.header('x-test-name') || 'Mesero uno',
      usuario: req.header('x-test-user') || 'mesero1',
      permisos: ['pedidos.ver', 'pedidos.crear', 'pedidos.editar', 'pedidos.eliminar', 'pedidos.observaciones', 'mesas.editar', ...(reportes ? ['reportes.ver'] : []), ...(cocina ? ['cocina.ver'] : [])],
      roles: req.header('x-test-role') ? [req.header('x-test-role')] : [],
    };
    tenantStorage.run(db, next);
  });
  app.use('/pedidos', pedidosRouter);
  app.use('/mesas', mesasRouter);
  app.use('/reportes', permisoPorMetodo('reportes'), reportesRouter);
  app.use('/preparacion-cocina', preparacionRouter);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message, stack: error.stack }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const solicitar = async (method, ruta, datos, headers = {}) => {
    const path = ruta.startsWith('/reportes/') || ruta.startsWith('/preparacion-cocina/') || ruta.startsWith('/mesas') || ruta.startsWith('/pedidos') ? ruta : `/pedidos${ruta}`;
    const respuesta = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      ...(datos !== undefined && { body: JSON.stringify(datos) }),
    });
    return { status: respuesta.status, body: await respuesta.json() };
  };
  const crear = (datos = {}, headers = {}) => solicitar('POST', '', {
    mesaId: 1, items: [{ productoId: producto.id, cantidad: 1 }], ...datos,
  }, headers);
  return { crear, solicitar, pedidos, movimientos, responsables, eventos, auditorias, stockFantasma, fallarHistorial: () => { falloHistorial = true; } };
}

test('el pedido y su bitacora se asignan al mesero autenticado sin selector', async (t) => {
  const { crear, pedidos, movimientos, responsables, eventos } = await entorno(t);
  const respuesta = await crear();
  assert.equal(respuesta.status, 201);
  assert.equal(pedidos[0].usuarioId, 'usuario-mesero-1');
  const responsable = responsables.get('usuario:usuario-mesero-1');
  assert.equal(responsable.nombre, 'Mesero uno');
  assert.equal(pedidos[0].meseraId, responsable.id);
  assert.equal(movimientos[0].meseraId, responsable.id);
  assert.equal(movimientos[0].pedidoId, pedidos[0].id);
  assert.equal(eventos[0].accion, 'CREAR');
  assert.equal(eventos[0].usuarioId, 'usuario-mesero-1');
  assert.equal(eventos[0].despues.items[0].cantidad, 1);
});

test('ignora usuarios y meseros ajenos enviados por el cliente y reutiliza el vinculo propio', async (t) => {
  const { crear, pedidos, responsables } = await entorno(t);
  assert.equal((await crear({ usuarioId: 'otro-usuario', meseraId: 999 })).status, 201);
  assert.equal((await crear({ mesaId: 2 })).status, 201);
  assert.equal(responsables.size, 1);
  assert.equal(pedidos[0].usuarioId, 'usuario-mesero-1');
  assert.equal(pedidos[1].usuarioId, 'usuario-mesero-1');
  assert.equal(pedidos[0].meseraId, pedidos[1].meseraId);
  assert.notEqual(pedidos[0].meseraId, 999);
  assert.equal((await crear({ mesaId: 3 }, { 'x-test-user': 'usuario-mesero-2', 'x-test-name': 'Mesero dos' })).status, 201);
  assert.equal(pedidos[2].usuarioId, 'usuario-mesero-2');
  assert.notEqual(pedidos[2].meseraId, pedidos[0].meseraId);
});

test('no cambia el responsable ni crea movimientos si la mesa ya esta ocupada', async (t) => {
  const { crear, pedidos, movimientos, responsables } = await entorno(t, { ocupada: true });
  assert.equal((await crear()).status, 409);
  assert.equal(pedidos.length, 0);
  assert.equal(movimientos.length, 0);
  assert.equal(responsables.size, 0);
});

test('cada MESERO ve y opera solo sus mesas asignadas', async (t) => {
  const { crear, solicitar } = await entorno(t, {
    mesasAsignadas: { 1: 'usuario-mesero-1', 2: 'usuario-mesero-2' },
  });
  assert.equal((await crear({}, { 'x-test-user': 'usuario-mesero-1', 'x-test-role': 'MESERO' })).status, 201);
  assert.equal((await crear({ mesaId: 2 }, { 'x-test-user': 'usuario-mesero-2', 'x-test-role': 'MESERO' })).status, 201);

  const primera = await solicitar('GET', '/mesas', undefined, { 'x-test-user': 'usuario-mesero-1', 'x-test-role': 'MESERO' });
  const segunda = await solicitar('GET', '/mesas', undefined, { 'x-test-user': 'usuario-mesero-2', 'x-test-role': 'MESERO' });
  assert.deepEqual(primera.body.map((mesa) => mesa.numero), [1]);
  assert.deepEqual(segunda.body.map((mesa) => mesa.numero), [2]);
  assert.deepEqual((await solicitar('GET', '/pedidos?estado=ABIERTO', undefined, { 'x-test-user': 'usuario-mesero-1', 'x-test-role': 'MESERO' })).body.map((pedido) => pedido.mesaId), [1]);
  assert.equal((await solicitar('GET', '/pedidos/2', undefined, { 'x-test-user': 'usuario-mesero-1', 'x-test-role': 'MESERO' })).status, 403);
  assert.equal((await crear({ mesaId: 2 }, { 'x-test-user': 'usuario-mesero-1', 'x-test-role': 'MESERO' })).status, 403);
  assert.deepEqual((await solicitar('GET', '/mesas', undefined, { 'x-test-user': 'usuario-sin-mesas', 'x-test-role': 'MESERO' })).body, []);
  assert.equal((await crear({}, { 'x-test-user': 'usuario-sin-mesas', 'x-test-role': 'MESERO' })).status, 403);
});

test('registra quien edita y los valores anteriores y posteriores de productos y observaciones', async (t) => {
  const { crear, solicitar, eventos } = await entorno(t);
  await crear();
  const editor = { 'x-test-user': 'usuario-editor', 'x-test-name': 'Editor' };
  assert.equal((await solicitar('PUT', '/1/items/1', { cantidad: 3 }, editor)).status, 200);
  assert.equal(eventos[1].usuarioId, 'usuario-editor');
  assert.equal(eventos[1].antes.items[0].cantidad, 1);
  assert.equal(eventos[1].despues.items[0].cantidad, 3);
  assert.equal(eventos[1].despues.usuarioId, 'usuario-mesero-1');
  assert.equal((await solicitar('POST', '/1/items', { productoId: 'producto-prueba', cantidad: 2 })).status, 201);
  assert.equal(eventos[2].accion, 'AGREGAR_PRODUCTO');
  assert.equal(eventos[2].despues.items[0].cantidad, 5);
  assert.equal((await solicitar('PUT', '/1/observaciones', { observaciones: 'Sin salsa' }, editor)).status, 200);
  assert.equal(eventos[3].accion, 'OBSERVACIONES');
  assert.equal(eventos[3].antes.observaciones, null);
  assert.equal(eventos[3].despues.observaciones, 'Sin salsa');
  assert.equal((await solicitar('POST', '/1/reenviar', { cambios: 'Cantidad corregida' }, editor)).status, 200);
  assert.equal(eventos[4].accion, 'REENVIAR');
  assert.equal(eventos[4].detalle, 'Cantidad corregida');
  assert.equal(eventos[4].antes.items[0].cantidad, 1);
  assert.equal(eventos[4].despues.items[0].cantidad, 5);
  assert.equal((await solicitar('DELETE', '/1/items/1')).status, 200);
  assert.equal(eventos[5].accion, 'QUITAR_PRODUCTO');
  assert.equal(eventos[5].antes.items.length, 1);
  assert.equal(eventos[5].despues.items.length, 0);
});

test('exige motivo de cancelacion y registra actor y estado sin reasignar al creador', async (t) => {
  const { crear, solicitar, eventos, pedidos } = await entorno(t);
  await crear();
  for (const motivo of [undefined, '', '   ', 'x'.repeat(1001)]) {
    assert.equal((await solicitar('POST', '/1/cancelar', { motivo })).status, 400);
  }
  assert.equal(eventos.length, 1);
  assert.equal(pedidos[0].estado, 'ABIERTO');
  const resultado = await solicitar('POST', '/1/cancelar', {
    motivo: '  Cliente se retira  ', usuarioId: 'suplantado',
  }, { 'x-test-user': 'usuario-supervisor', 'x-test-name': 'Supervisor' });
  assert.equal(resultado.status, 200);
  assert.equal(eventos[1].usuarioId, 'usuario-supervisor');
  assert.equal(eventos[1].motivo, 'Cliente se retira');
  assert.equal(eventos[1].antes.estado, 'ABIERTO');
  assert.equal(eventos[1].despues.estado, 'CANCELADO');
  assert.equal(eventos[1].despues.usuarioId, 'usuario-mesero-1');
  assert.equal((await solicitar('PUT', '/1/items/1', { cantidad: 9 })).status, 409);
  const historial = await solicitar('GET', '/reportes/historial-pedidos');
  assert.equal(historial.status, 200);
  assert.equal(historial.body[0].accion, 'CANCELAR');
});

test('el traslado conserva mesa anterior y nueva y no edita productos de otro pedido', async (t) => {
  const { crear, solicitar, eventos } = await entorno(t);
  await crear();
  assert.equal((await solicitar('POST', '/1/cambiar-mesa', { mesaId: 2 })).status, 200);
  assert.equal(eventos[1].accion, 'CAMBIAR_MESA');
  assert.equal(eventos[1].antes.mesaId, 1);
  assert.equal(eventos[1].despues.mesaId, 2);
  assert.equal((await solicitar('PUT', '/1/items/999', { cantidad: 2 })).status, 404);
  assert.equal(eventos.length, 2);
});

test('un error guardando historial revierte la edicion o cancelacion del pedido', async (t) => {
  const { crear, solicitar, eventos, pedidos, fallarHistorial } = await entorno(t);
  await crear();
  fallarHistorial();
  assert.equal((await solicitar('PUT', '/1/items/1', { cantidad: 8 })).status, 409);
  assert.equal(pedidos[0].items[0].cantidad, 1);
  assert.equal((await solicitar('POST', '/1/cancelar', { motivo: 'Prueba' })).status, 500);
  assert.equal(pedidos[0].estado, 'ABIERTO');
  assert.equal(eventos.length, 1);
});

test('el reporte filtra por fecha de evento Colombia y texto del motivo incluyendo cancelados', async (t) => {
  const { solicitar, eventos } = await entorno(t);
  for (const [id, fecha, motivo] of [
    [1, '2026-11-06T04:59:59.999Z', 'Cliente se retira'],
    [2, '2026-11-06T05:00:00.000Z', 'CLIENTE se retira'],
    [3, '2026-11-07T04:59:59.999Z', 'Sin producto'],
    [4, '2026-11-07T05:00:00.000Z', 'Cliente se retira'],
  ]) eventos.push({ id, fecha, motivo, accion: 'CANCELAR', pedidoId: 99, despues: { estado: 'CANCELADO' } });
  const resultado = await solicitar('GET', '/reportes/historial-pedidos?desde=2026-11-06&hasta=2026-11-06&motivo=cliente');
  assert.equal(resultado.status, 200);
  assert.deepEqual(resultado.body.map((evento) => evento.id), [2]);
  assert.equal(resultado.body[0].despues.estado, 'CANCELADO');
  const todos = await solicitar('GET', '/reportes/historial-pedidos?desde=2026-11-06&hasta=2026-11-06');
  assert.deepEqual(todos.body.map((evento) => evento.id), [3, 2]);
  assert.equal((await solicitar('GET', '/reportes/historial-pedidos?desde=2026-11-07&hasta=2026-11-06')).status, 400);
});

test('el historial requiere permiso de Reportes aunque el mesero pueda ver pedidos', async (t) => {
  const { solicitar } = await entorno(t, { reportes: false });
  assert.equal((await solicitar('GET', '/reportes/historial-pedidos')).status, 403);
});

test('el reporte muestra el estado actual sin modificar el estado historico del evento', async (t) => {
  const { crear, solicitar, pedidos, eventos } = await entorno(t);
  await crear();
  pedidos[0].preparacion = { listo: false };
  assert.equal((await solicitar('GET', '/reportes/historial-pedidos')).body[0].estado, 'EN_COCINA');
  pedidos[0].preparacion.listo = true;
  assert.equal((await solicitar('GET', '/reportes/historial-pedidos')).body[0].estado, 'DESPACHADO');
  pedidos[0].estado = 'FACTURADO';
  assert.equal((await solicitar('GET', '/reportes/historial-pedidos')).body[0].estado, 'FACTURADO');
  pedidos[0].estado = 'CANCELADO';
  assert.equal((await solicitar('GET', '/reportes/historial-pedidos')).body[0].estado, 'CANCELADO');
  assert.equal(eventos[0].despues.estado, 'ABIERTO');
});

test('el reporte reconstruye el Antes legacy de REENVIAR sin modificar la bitácora', async (t) => {
  const { crear, solicitar, eventos } = await entorno(t);
  await crear();
  assert.equal((await solicitar('PUT', '/1/items/1', { cantidad: 3 })).status, 200);
  const despuesEdicion = structuredClone(eventos[1].despues);
  const eventoLegacy = {
    id: 99,
    fecha: new Date().toISOString(),
    pedidoId: 1,
    accion: 'REENVIAR',
    detalle: 'Producto 1→3',
    antes: despuesEdicion,
    despues: despuesEdicion,
  };
  eventos.push(eventoLegacy);

  const respuesta = await solicitar('GET', '/reportes/historial-pedidos');
  const reenviado = respuesta.body.find((evento) => evento.id === 99);
  assert.equal(reenviado.antes.items[0].cantidad, 1);
  assert.equal(reenviado.despues.items[0].cantidad, 3);
  assert.equal(eventoLegacy.antes.items[0].cantidad, 3);
});

test('cocina marca listo y el mesero entrega con fecha, hora y actores separados', async (t) => {
  const { crear, solicitar, pedidos, eventos, auditorias } = await entorno(t);
  await crear();
  assert.equal((await solicitar('POST', '/1/entregar', {})).status, 409);
  const listo = await solicitar('PUT', '/preparacion-cocina/1/listo', {}, {
    'x-test-user': 'usuario-cocina', 'x-test-name': 'Cocina', 'x-usuario-id': 'suplantado',
  });
  assert.equal(listo.status, 200);
  assert.equal(listo.body.listo, true);
  assert.ok(Number.isFinite(Date.parse(listo.body.fechaListo)));
  assert.equal(eventos[1].accion, 'PLATO_LISTO');
  assert.equal(eventos[1].usuarioId, 'usuario-cocina');
  assert.equal(eventos[1].antes.platoListo, false);
  assert.equal(eventos[1].despues.platoListo, true, JSON.stringify({ despues: eventos[1].despues, preparacion: pedidos[0].preparacion }));
  assert.equal((await solicitar('PUT', '/preparacion-cocina/1/listo', {})).status, 409);
  assert.equal((await solicitar('GET', '/1/entrega')).body.estadoCocina, 'LISTO');
  const entrega = await solicitar('POST', '/1/entregar', { usuarioId: 'suplantado', fecha: '2000-01-01' }, {
    'x-test-user': 'usuario-mesero', 'x-test-name': 'Mesero',
  });
  assert.equal(entrega.status, 200);
  assert.equal(entrega.body.estadoCocina, 'ENTREGADO');
  assert.equal(entrega.body.entrega.usuarioId, 'usuario-mesero');
  assert.equal(entrega.body.entrega.usuarioNombre, 'Mesero');
  assert.ok(Date.parse(entrega.body.entrega.fecha) >= Date.parse(listo.body.fechaListo));
  assert.equal(eventos[2].accion, 'ENTREGAR');
  assert.equal(eventos[2].usuarioId, 'usuario-mesero');
  assert.deepEqual(auditorias.map((auditoria) => auditoria.accion), ['COCINA_ENTREGA_PARCIAL', 'COCINA_ENTREGADO']);
  assert.equal((await solicitar('POST', '/1/entregar', {})).status, 409);
  assert.equal(eventos.length, 3);
  const guardada = await solicitar('GET', '/1/entrega');
  assert.equal(guardada.body.entrega.fecha, entrega.body.entrega.fecha);
  assert.equal(guardada.body.entrega.usuarioNombre, 'Mesero');
});

test('el mesero confirma un plato listo sin entregar los demás y el pedido se completa al final', async (t) => {
  const { crear, solicitar, eventos, auditorias } = await entorno(t);
  await crear({ items: [
    { productoId: 'producto-prueba', cantidad: 1 },
    { productoId: 'producto-prueba', cantidad: 2 },
  ] });
  const cocina = { 'x-test-user': 'usuario-cocina', 'x-test-name': 'Cocina' };
  const mesero = { 'x-test-user': 'usuario-mesero', 'x-test-name': 'Mesero' };
  await solicitar('PUT', '/preparacion-cocina/1/items/1/listo', {}, cocina);

  const listo = await solicitar('GET', '/1/entrega');
  assert.equal(listo.body.estadoCocina, 'PENDIENTE');
  assert.equal(listo.body.itemsListos[0].entregadoAt, undefined);

  const primeraEntrega = await solicitar('POST', '/1/entregar', { pedidoItemIds: [1] }, mesero);
  assert.equal(primeraEntrega.status, 200);
  assert.equal(primeraEntrega.body.estadoCocina, 'PENDIENTE');
  assert.equal(primeraEntrega.body.entrega, null);
  assert.ok(primeraEntrega.body.itemsListos[0].entregadoAt);
  assert.equal(primeraEntrega.body.itemsListos[0].entregadoNombre, 'Mesero');
  assert.equal(primeraEntrega.body.itemsListos.length, 1);
  assert.equal(auditorias.some((fila) => fila.accion === 'COCINA_ENTREGA_PARCIAL'), true);
  assert.equal(eventos.filter((evento) => evento.accion === 'ENTREGAR').length, 1);

  const duplicada = await solicitar('POST', '/1/entregar', { pedidoItemIds: [1] }, mesero);
  assert.equal(duplicada.status, 409);
  await solicitar('PUT', '/preparacion-cocina/1/items/2/listo', {}, cocina);
  const segundaEntrega = await solicitar('POST', '/1/entregar', { pedidoItemIds: [2] }, mesero);
  assert.equal(segundaEntrega.status, 200);
  assert.equal(segundaEntrega.body.estadoCocina, 'ENTREGADO');
  assert.equal(segundaEntrega.body.itemsListos.length, 2);
  assert.ok(segundaEntrega.body.itemsListos.every((item) => item.entregadoAt));
  assert.equal(segundaEntrega.body.entrega.usuarioNombre, 'Mesero');
});

test('no se entrega desde cocina ni una comanda que cambio tras marcarla lista', async (t) => {
  const { crear, solicitar } = await entorno(t);
  await crear();
  assert.equal((await solicitar('PUT', '/preparacion-cocina/1/resultado', { estado: 'ENTREGADO' })).status, 400);
  assert.equal((await solicitar('PUT', '/preparacion-cocina/1/listo', {})).status, 200);
  assert.equal((await solicitar('PUT', '/1/items/1', { cantidad: 2 })).status, 200);
  assert.equal((await solicitar('POST', '/1/entregar', {})).status, 409);
});

test('un fallo del historial revierte plato listo y entrega incluida su auditoria', async (t) => {
  const base = await entorno(t);
  await base.crear();
  base.fallarHistorial();
  assert.equal((await base.solicitar('PUT', '/preparacion-cocina/1/listo', {})).status, 500);
  assert.equal(base.pedidos[0].preparacion.listo, false);
  const entrega = await entorno(t);
  await entrega.crear();
  await entrega.solicitar('PUT', '/preparacion-cocina/1/listo', {});
  entrega.fallarHistorial();
  assert.equal((await entrega.solicitar('POST', '/1/entregar', {})).status, 500);
  assert.equal(entrega.auditorias.length, 0);
  assert.equal((await entrega.solicitar('GET', '/1/entrega')).body.estadoCocina, 'LISTO');
});

test('marcar plato listo requiere acceso a cocina', async (t) => {
  const { crear, solicitar } = await entorno(t, { cocina: false });
  await crear();
  assert.equal((await solicitar('GET', '/preparacion-cocina/?listo=0')).status, 403);
  assert.equal((await solicitar('PUT', '/preparacion-cocina/1/listo', {})).status, 403);
  assert.equal((await solicitar('PUT', '/preparacion-cocina/1/resultado', { estado: 'REABIERTO' })).status, 403);
  assert.equal((await solicitar('PUT', '/preparacion-cocina/1/reabrir', {})).status, 403);
});

test('cocina marca cada plato y completa la comanda solo al confirmar todos', async (t) => {
  const { crear, solicitar, pedidos, eventos } = await entorno(t);
  await crear({ items: [
    { productoId: 'producto-prueba', cantidad: 1 },
    { productoId: 'producto-prueba', cantidad: 2 },
  ] });
  assert.equal(pedidos[0].items.length, 2);

  const primero = await solicitar('PUT', '/preparacion-cocina/1/items/1/listo', { cocineroId: 7 }, {
    'x-test-user': 'usuario-cocina', 'x-test-name': 'Cocina',
  });
  assert.equal(primero.status, 200);
  assert.equal(primero.body.listo, false);
  assert.deepEqual(primero.body.itemsListos.map((item) => item.pedidoItemId), [1]);
  assert.equal((await solicitar('PUT', '/preparacion-cocina/1/items/1/listo', {})).status, 409);

  const segundo = await solicitar('PUT', '/preparacion-cocina/1/items/2/listo', {});
  assert.equal(segundo.status, 200);
  assert.deepEqual(segundo.body.itemsListos.map((item) => item.pedidoItemId), [1, 2]);
  assert.equal(segundo.body.listo, true);
  assert.ok(Date.parse(segundo.body.fechaListo));
  assert.deepEqual(segundo.body.itemsListos.map((item) => item.pedidoItemId), [1, 2]);
  assert.equal(segundo.body.itemsListos[0].usuarioNombre, 'Cocina');
  assert.deepEqual(eventos.filter((evento) => evento.accion === 'PLATO_ITEM_LISTO').map((evento) => evento.detalle), [
    JSON.stringify({ pedidoItemId: 1, accion: 'PLATO_ITEM_LISTO' }),
    JSON.stringify({ pedidoItemId: 2, accion: 'PLATO_ITEM_LISTO' }),
  ]);
});

test('tomar 2 de 3 unidades de Mesa00 agrega la línea y deja 1 disponible en un pedido abierto', async (t) => {
  const { crear, solicitar, pedidos, stockFantasma } = await entorno(t, { mesa00Stock: 3 });
  await crear();
  const respuesta = await solicitar('POST', '/1/items', { productoId: 'producto-prueba', cantidad: 2, cantidadMesa00: 2 });
  assert.equal(respuesta.status, 201);
  assert.equal(pedidos[0].items.at(-1).cantidad, 2);
  assert.equal(pedidos[0].items.at(-1).cantidadMesa00, 2);
  assert.equal(stockFantasma.get('producto-prueba').cantidad, 1);
});

test('tomar Mesa00 al crear un pedido reserva solo la cantidad pedida y resta el saldo', async (t) => {
  const { crear, pedidos, stockFantasma } = await entorno(t, { mesa00Stock: 3 });
  const respuesta = await crear({ items: [{ productoId: 'producto-prueba', cantidad: 2, cantidadMesa00: 2 }] });
  assert.equal(respuesta.status, 201);
  assert.equal(pedidos[0].items[0].cantidadMesa00, 2);
  assert.equal(stockFantasma.get('producto-prueba').cantidad, 1);
  assert.equal(pedidos[0].preparacion.listo, true);
  assert.equal(pedidos[0].preparacion.itemsListos[0].usuarioNombre, 'Mesa 00');
});

test('una línea mixta de Mesa00 y menú normal queda pendiente de cocina', async (t) => {
  const { crear, pedidos, stockFantasma } = await entorno(t, { mesa00Stock: 2 });
  const respuesta = await crear({ items: [{ productoId: 'producto-prueba', cantidad: 3, cantidadMesa00: 2 }] });
  assert.equal(respuesta.status, 201);
  assert.equal(pedidos[0].preparacion.listo, false);
  assert.deepEqual(pedidos[0].preparacion.itemsListos, []);
  assert.equal(stockFantasma.has('producto-prueba'), false);
});

test('editar o eliminar una línea devuelve solo sus unidades de origen Mesa00', async (t) => {
  const { crear, solicitar, pedidos, stockFantasma } = await entorno(t, { mesa00Stock: 3 });
  await crear({ items: [{ productoId: 'producto-prueba', cantidad: 3, cantidadMesa00: 3 }] });
  assert.equal(stockFantasma.has('producto-prueba'), false);
  assert.equal((await solicitar('PUT', '/1/items/1', { cantidad: 2 })).status, 200);
  assert.equal(pedidos[0].items[0].cantidadMesa00, 2);
  assert.equal(stockFantasma.get('producto-prueba').cantidad, 1);
  assert.equal((await solicitar('DELETE', '/1/items/1')).status, 200);
  assert.equal(stockFantasma.get('producto-prueba').cantidad, 3);
});

test('cancelar un pedido devuelve a Mesa00 las unidades sugeridas que aún no se facturan', async (t) => {
  const { crear, solicitar, stockFantasma } = await entorno(t, { mesa00Stock: 2 });
  await crear({ items: [{ productoId: 'producto-prueba', cantidad: 2, cantidadMesa00: 2 }] });
  const cancelado = await solicitar('POST', '/1/cancelar', { motivo: 'Cliente ya no lo desea' });
  assert.equal(cancelado.status, 200);
  assert.equal(stockFantasma.get('producto-prueba').cantidad, 2);
});

test('rechaza pedidos normales dirigidos manualmente a la mesa fantasma', async (t) => {
  const { crear, pedidos, movimientos } = await entorno(t);
  const respuesta = await crear({ mesaId: 99 });
  assert.equal(respuesta.status, 400);
  assert.match(respuesta.body.error, /no recibe pedidos facturables/);
  assert.equal(pedidos.length, 0);
  assert.equal(movimientos.length, 0);
});