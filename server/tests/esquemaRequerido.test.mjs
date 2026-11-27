import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { asegurarEsquema, sentenciasSql } from '../src/esquemaRequerido.js';

test('separa el SQL de una migracion en sentencias sin comentarios', () => {
  assert.deepEqual(sentenciasSql('-- comentario\nCREATE TABLE a (x INT);\n\nINSERT INTO a VALUES (1);\n'), ['CREATE TABLE a (x INT)', 'INSERT INTO a VALUES (1)']);
});

test('al arrancar crea las tablas y permisos de impresoras y devoluciones, y se puede repetir', async () => {
  const db = new PGlite();
  await db.exec(`CREATE TABLE "Permiso" (id SERIAL PRIMARY KEY, codigo TEXT UNIQUE NOT NULL, nombre TEXT NOT NULL, modulo TEXT);
    CREATE TABLE "Rol" (id SERIAL PRIMARY KEY, nombre TEXT UNIQUE NOT NULL);
    CREATE TABLE "RolPermiso" ("rolId" INT NOT NULL, "permisoId" INT NOT NULL, PRIMARY KEY ("rolId", "permisoId"));
    INSERT INTO "Rol" (nombre) VALUES ('ADMIN'), ('CAJERO'), ('MESERO');`);
  const cliente = { $executeRawUnsafe: (sql) => db.exec(sql) };
  const silencioso = { log() {}, error() {} };
  assert.deepEqual(await asegurarEsquema(cliente, { log: silencioso }), { listo: true, errores: [] });
  assert.deepEqual(await asegurarEsquema(cliente, { log: silencioso }), { listo: true, errores: [] });
  const tablas = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_name IN ('Impresoras', 'Devoluciones', 'DevolucionesDetalle') ORDER BY 1`);
  assert.deepEqual(tablas.rows.map((r) => r.table_name), ['Devoluciones', 'DevolucionesDetalle', 'Impresoras']);
  const permisos = await db.query(`SELECT r.nombre || ':' || p.codigo AS permiso FROM "RolPermiso" rp
    JOIN "Rol" r ON r.id = rp."rolId" JOIN "Permiso" p ON p.id = rp."permisoId" ORDER BY 1`);
  assert.deepEqual(permisos.rows.map((r) => r.permiso), ['ADMIN:devoluciones.crear', 'ADMIN:devoluciones.ver', 'CAJERO:devoluciones.crear', 'CAJERO:devoluciones.ver']);
});
