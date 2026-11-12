import assert from 'node:assert/strict';
import express from 'express';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:1/test';
const { default: aperturasRouter } = await import('../src/routes/aperturas.js');
const { tenantStorage } = await import('../src/prisma.js');

async function entorno(t) {
  const aperturas = [];
  const movimientos = [];
  const formas = [];
  const facturas = [];
  const ventas = [];
  const db = {
    aperturaCaja: {
      create: async ({ data }) => {
        const apertura = { id: 'turno-1', estado: 'ABIERTA', ...data, caja: null, usuario: null };
        aperturas.push(apertura);
        return apertura;
      },
      findFirst: async ({ where }) => aperturas.find((apertura) => apertura.estado === where.estado && apertura.usuarioId === where.usuarioId) || null,
      findUnique: async ({ where }) => aperturas.find((apertura) => apertura.id === where.id) || { id: where.id, estado: 'ABIERTA' },
      update: async ({ where, data }) => {
        const apertura = aperturas.find((item) => item.id === where.id);
        Object.assign(apertura, data);
        return apertura;
      },
    },
    movimientoCaja: {
      create: async ({ data }) => { movimientos.push(data); return data; },
      findMany: async () => movimientos,
    },
    cuentaContable: { findUnique: async () => ({ id: 'cuenta-1', activo: true, tipo: 'GASTO' }) },
    formaPago: { findMany: async () => formas },
    factura: { findMany: async () => facturas },
    facturaVenta: { findMany: async () => ventas },
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
  return { solicitar, aperturas, movimientos, formas, facturas, ventas };
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

test('cuadra medios activos y guarda conteos opcionales con base y movimientos separados', async (t) => {
  const { solicitar, aperturas, movimientos, formas, facturas, ventas } = await entorno(t);
  formas.push(
    { id: 'EFE', formaPago: 'Efectivo', formaPagoDian: '10-Efectivo', activo: true },
    { id: 'QR', formaPago: 'QR', activo: true },
    { id: 'DAT', formaPago: 'Datafono', activo: true },
    { id: 'PSE', formaPago: 'PSE', activo: false },
  );
  await solicitar('POST', '/', { valorInicial: 100 }, 'caja.abrir');
  movimientos.push({ tipo: 'INGRESO', monto: 30 }, { tipo: 'EGRESO', monto: 10 });
  facturas.push({ metodoPago: 'EFE $50 + QR $20', cabecera: { total: 70, propina: 0, credito: false } });
  ventas.push({ metodoPago: 'PSE', cabecera: { total: 15, propina: 0, credito: false } });
  const previo = await solicitar('GET', '/turno-1/cuadre', undefined, 'caja.ver');
  assert.equal(previo.status, 200);
  assert.equal(previo.body.valorEsperado, 170);
  assert.deepEqual(Object.fromEntries(previo.body.medios.map((medio) => [medio.id, medio.esperado])), { DAT: 0, EFE: 50, PSE: 15, QR: 20 });

  const conteoMedios = { base: 120, medios: [
    { id: 'DAT', contado: 0 }, { id: 'EFE', contado: 55 },
    { id: 'PSE', contado: null }, { id: 'QR', contado: 19 },
  ] };
  assert.equal((await solicitar('POST', '/turno-1/cerrar', { conteoMedios: { ...conteoMedios, medios: conteoMedios.medios.slice(1) } }, 'caja.cerrar')).status, 400);
  assert.equal((await solicitar('POST', '/turno-1/cerrar', { conteoMedios: { ...conteoMedios, base: -1 } }, 'caja.cerrar')).status, 400);
  assert.equal((await solicitar('POST', '/turno-1/cerrar', { conteoMedios: { ...conteoMedios, base: 1.001 } }, 'caja.cerrar')).status, 400);
  const cierre = await solicitar('POST', '/turno-1/cerrar', { conteoMedios }, 'caja.cerrar');
  assert.equal(cierre.status, 200);
  assert.equal(aperturas[0].valorContado, 175);
  assert.equal(aperturas[0].diferencia, 5);
  assert.equal(aperturas[0].cuadreMedios.base.esperado, 120);
  assert.equal(aperturas[0].cuadreMedios.medios.find((medio) => medio.id === 'QR').diferencia, -1);
  assert.equal(aperturas[0].cuadreMedios.medios.find((medio) => medio.id === 'PSE').diferencia, null);
});

test('no inventa reparto para pagos agrupados ni total de efectivo con conteo incompleto', async (t) => {
  const { solicitar, aperturas, formas, facturas } = await entorno(t);
  formas.push(
    { id: 'EFE', formaPago: 'Efectivo', activo: true },
    { id: 'DAT', formaPago: 'Datafono 1', activo: true },
    { id: 'DTF', formaPago: 'Datafono 2', activo: true },
  );
  await solicitar('POST', '/', { valorInicial: 100 }, 'caja.abrir');
  facturas.push({ metodoPago: 'DAT/DTF', cabecera: { total: 50, propina: 0, credito: false } });
  const previo = await solicitar('GET', '/turno-1/cuadre', undefined, 'caja.ver');
  assert.equal(previo.body.medios.find((medio) => medio.id === 'DAT').esperado, null);
  assert.equal(previo.body.medios.find((medio) => medio.id === 'DTF').esperado, null);
  assert.equal(previo.body.sinAsignar[0].monto, 50);
  const cierre = await solicitar('POST', '/turno-1/cerrar', { conteoMedios: {
    base: 100, medios: [{ id: 'EFE', contado: null }, { id: 'DAT', contado: 25 }, { id: 'DTF', contado: 25 }],
  } }, 'caja.cerrar');
  assert.equal(cierre.status, 200);
  assert.equal(aperturas[0].valorContado, null);
  assert.equal(aperturas[0].cuadreMedios.medios.find((medio) => medio.id === 'DAT').diferencia, null);
});

test('el efectivo historico no se reparte si hay varios medios de efectivo', async (t) => {
  const { solicitar, aperturas, formas, facturas } = await entorno(t);
  formas.push(
    { id: 'EFE', formaPago: 'Efectivo', activo: true },
    { id: 'CAJ', formaPago: 'Otro efectivo', formaPagoDian: '10-Efectivo', activo: true },
  );
  await solicitar('POST', '/', { valorInicial: 100 }, 'caja.abrir');
  facturas.push({ metodoPago: 'EFECTIVO', cabecera: { total: 40, propina: 0, credito: false } });
  const previo = await solicitar('GET', '/turno-1/cuadre', undefined, 'caja.ver');
  assert.equal(previo.body.valorEsperado, 140);
  assert.ok(previo.body.medios.every((medio) => medio.esperado === null));
  const cierre = await solicitar('POST', '/turno-1/cerrar', { conteoMedios: {
    base: 100, medios: [{ id: 'EFE', contado: 40 }, { id: 'CAJ', contado: 0 }],
  } }, 'caja.cerrar');
  assert.equal(cierre.status, 200);
  assert.equal(aperturas[0].valorContado, null);
});

test('la migracion conserva cierres anteriores y permite guardar el cuadre', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE "AperturasCaja" ("Id" integer PRIMARY KEY, "ValorContado" double precision); INSERT INTO "AperturasCaja" VALUES (1, 120)');
    await db.exec(await readFile(new URL('../prisma/migrations/20261112120000_cuadre_medios_pago/migration.sql', import.meta.url), 'utf8'));
    const anterior = await db.query('SELECT "ValorContado", "CuadreMedios" FROM "AperturasCaja" WHERE "Id" = 1');
    assert.deepEqual(anterior.rows[0], { ValorContado: 120, CuadreMedios: null });
    await db.query('UPDATE "AperturasCaja" SET "CuadreMedios" = $1 WHERE "Id" = 1', [JSON.stringify({ medios: [{ id: 'QR', contado: 0 }] })]);
    const guardado = await db.query('SELECT "CuadreMedios" FROM "AperturasCaja" WHERE "Id" = 1');
    assert.equal(guardado.rows[0].CuadreMedios.medios[0].contado, 0);
  } finally {
    await db.close();
  }
});

test('no permite leer o cerrar caja sin permisos correspondientes', async (t) => {
  const { solicitar } = await entorno(t);
  assert.equal((await solicitar('GET', '/', undefined, 'pedidos.ver')).status, 403);
  assert.equal((await solicitar('POST', '/turno-1/cerrar', { valorContado: 0 }, 'caja.ver')).status, 403);
});