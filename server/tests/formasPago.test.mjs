import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import formasPagoRouter, { codigoConcepto, datosDesdeBody } from '../src/routes/formasPago.js';
import { tenantStorage } from '../src/prisma.js';

test('normaliza conceptos y valida los campos editables del maestro', () => {
  assert.equal(codigoConcepto(' efe '), 'EFE');
  for (const codigo of ['', 'A B', 'X'.repeat(11), 123]) assert.throws(() => codigoConcepto(codigo), { status: 400 });
  const datos = datosDesdeBody({ claseConcepto: 'Adición', formaPago: ' DOMICILIOS ', medioPago: 'dom', moneda: 'cop' });
  assert.equal(datos.claseConcepto, 'ADICION');
  assert.equal(datos.formaPago, 'DOMICILIOS');
  assert.equal(datos.medioPago, 'DOM');
  assert.equal(datos.moneda, 'COP');
  assert.equal(datos.activo, true);
  assert.deepEqual(datosDesdeBody({ formaPago: 'Nueva descripción' }, { parcial: true }), { formaPago: 'Nueva descripción' });
  assert.throws(() => datosDesdeBody({ claseConcepto: 'OTRO' }), { status: 400 });
});

test('Cpto caja identifica el registro y no cambia al editar descripcion, medio o moneda', async (t) => {
  const registros = new Map();
  const db = {
    formaPago: {
      create: async ({ data }) => {
        if (registros.has(data.id)) throw Object.assign(new Error('Duplicado'), { code: 'P2002' });
        const registro = { ...data, createdAt: new Date() };
        registros.set(data.id, registro);
        return registro;
      },
      update: async ({ where, data }) => {
        const registro = registros.get(where.id);
        if (!registro) throw Object.assign(new Error('No existe'), { code: 'P2025' });
        Object.assign(registro, data);
        return registro;
      },
      findUnique: async ({ where }) => registros.get(where.id) || null,
      findMany: async () => [...registros.values()],
    },
    auditoria: { create: async () => ({}) },
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.usuario = { permisos: String(req.header('x-permisos') || 'empresa.ver,empresa.editar').split(',').filter(Boolean) };
    tenantStorage.run(db, next);
  });
  app.use('/formas-pago', formasPagoRouter);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const solicitar = async (method, ruta = '', body, permisos = 'empresa.ver,empresa.editar') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/formas-pago${ruta}`, {
      method, headers: { 'Content-Type': 'application/json', 'x-permisos': permisos }, ...(body && { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
  const inicial = { cptoCaja: 'efe', claseConcepto: 'RECOGIDA', formaPago: 'REC EFECTIVO', medioPago: 'EFE', moneda: 'COP' };
  assert.equal((await solicitar('POST', '', inicial)).status, 201);
  assert.equal((await solicitar('POST', '', inicial)).status, 409);
  assert.equal((await solicitar('PUT', '/EFE', { cptoCaja: 'DAT' })).status, 409);
  const editado = await solicitar('PUT', '/EFE', { cptoCaja: 'EFE', claseConcepto: 'ADICION', formaPago: 'EFECTIVO VENTAS', medioPago: 'DAT', moneda: 'USD' });
  assert.equal(editado.status, 200);
  assert.equal(editado.body.id, 'EFE');
  assert.equal(editado.body.formaPago, 'EFECTIVO VENTAS');
  assert.equal(editado.body.medioPago, 'DAT');
  assert.equal(editado.body.moneda, 'USD');
  assert.equal((await solicitar('GET', '/efe')).body.id, 'EFE');
  assert.equal((await solicitar('GET', '/DAT')).status, 404);
  assert.equal(registros.size, 1);
});

test('formas de pago requieren permiso de lectura y edición', async (t) => {
  const registros = new Map();
  const db = {
    formaPago: {
      findMany: async () => [...registros.values()],
      create: async ({ data }) => { registros.set(data.id, data); return data; },
    },
    auditoria: { create: async () => ({}) },
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.usuario = { permisos: String(req.header('x-permisos') || '').split(',').filter(Boolean) };
    tenantStorage.run(db, next);
  });
  app.use('/formas-pago', formasPagoRouter);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const solicitar = async (method, ruta, body, permisos) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/formas-pago${ruta}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-permisos': permisos },
      ...(body && { body: JSON.stringify(body) }),
    });
    return response.status;
  };
  const body = { cptoCaja: 'EFE', claseConcepto: 'RECOGIDA', formaPago: 'EFECTIVO', medioPago: 'EFE', moneda: 'COP' };
  assert.equal(await solicitar('GET', '', undefined, ''), 403);
  assert.equal(await solicitar('GET', '', undefined, 'facturas.ver'), 200);
  assert.equal(await solicitar('POST', '', body, 'empresa.ver'), 403);
  assert.equal(await solicitar('POST', '', body, 'empresa.editar'), 201);
});

test('migra a CptoCaja primario, crea los ocho conceptos y conserva los datos anteriores', async () => {
  const db = new PGlite();
  const uuid = '00000000-0000-4000-8000-000000000001';
  try {
    await db.exec(`CREATE TABLE "FormasPago" (
      "Id" UUID PRIMARY KEY, "FormaPago" VARCHAR(120) NOT NULL,
      "ManejaDocumento" BOOLEAN NOT NULL DEFAULT false, "Cuenta" VARCHAR(30), "Exportado" BOOLEAN NOT NULL DEFAULT false,
      "ConsignarEn" VARCHAR(60), "TipoDatafono" VARCHAR(40), "IdBodega" INTEGER DEFAULT 0,
      "FormaPagoDian" VARCHAR(40), "Activo" BOOLEAN NOT NULL DEFAULT true, "FechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    ); INSERT INTO "FormasPago" VALUES ('${uuid}', 'MEDIO ANTERIOR', true, '110505', true, 'BANCO', 'Redeban', 4, '47-Transferencia', false, '2026-01-01 12:00:00.123');`);
    await db.exec(await readFile(new URL('../prisma/migrations/20261106130000_formas_pago_cpto_caja/migration.sql', import.meta.url), 'utf8'));
    const legado = (await db.query('SELECT * FROM "FormasPago" WHERE "Id" = $1', [uuid])).rows[0];
    assert.equal(legado.CptoCaja, 'LEG000001');
    assert.equal(legado.DescCptoCaja, 'MEDIO ANTERIOR');
    assert.equal(legado.Cuenta, '110505');
    assert.equal(legado.FormaPagoDian, '47-Transferencia');
    assert.equal(legado.Activo, false);
    const conceptos = (await db.query(`SELECT "CptoCaja" FROM "FormasPago" WHERE "Id" IS NULL ORDER BY "CptoCaja"`)).rows;
    assert.deepEqual(conceptos.map((registro) => registro.CptoCaja), ['DAT', 'DOM', 'DTF', 'EFE', 'PSE', 'QR', 'TRE', 'TRH']);
    const clave = (await db.query(`SELECT pg_get_constraintdef(oid) AS definicion FROM pg_constraint WHERE conname = 'FormasPago_pkey'`)).rows[0];
    assert.match(clave.definicion, /PRIMARY KEY \("CptoCaja"\)/);
    await assert.rejects(db.exec(`INSERT INTO "FormasPago" ("CptoCaja", "DescCptoCaja", "MedioPago") VALUES ('EFE', 'DUPLICADO', 'EFE')`), /duplicate key/i);
    await db.exec(`UPDATE "FormasPago" SET "DescCptoCaja" = 'EFECTIVO EDITADO', "Moneda" = 'USD' WHERE "CptoCaja" = 'EFE'`);
    assert.equal((await db.query(`SELECT "CptoCaja" FROM "FormasPago" WHERE "DescCptoCaja" = 'EFECTIVO EDITADO'`)).rows[0].CptoCaja, 'EFE');
  } finally { await db.close(); }
});