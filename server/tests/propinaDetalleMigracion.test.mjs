import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migracion = await readFile(new URL('../prisma/migrations/20261108235000_propina_lineas_detalle/migration.sql', import.meta.url), 'utf8');

test('migra propina a ambas tablas de detalle una sola vez y conserva cabeceras', async () => {
  const db = new PGlite();
  try {
    for (const [cabecera, operacion, detalle, vinculo] of [
      ['Factura', 'FacturaOperacion', 'FacturaDetalle', 'FacturaId'],
      ['FacturaVenta', 'FacturaVentaOperacion', 'FacturaVentaDetalle', 'FacturaVentaId'],
    ]) {
      await db.exec(`
        CREATE TABLE "${cabecera}" (
          "CompaniaCodigo" varchar(3), "CentroOperacionCodigo" varchar(10), "TipoDocumento" varchar(20),
          "numero" integer, "Propina" double precision, "fecha" timestamp, "Usuario" varchar(50),
          PRIMARY KEY ("CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero")
        );
        CREATE TABLE "${operacion}" (
          "Id" uuid PRIMARY KEY, "CompaniaCodigo" varchar(3), "CentroOperacionCodigo" varchar(10),
          "TipoDocumento" varchar(20), "numero" integer,
          UNIQUE ("CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero")
        );
        CREATE TABLE "${detalle}" (
          "Id" uuid PRIMARY KEY, "${vinculo}" uuid REFERENCES "${operacion}"("Id"),
          "CompaniaCodigo" varchar(3), "CentroOperacionCodigo" varchar(10), "TipoDocumento" varchar(20),
          "numero" integer, "CodigoProducto" varchar(50), "NombreProducto" varchar(250),
          "Cantidad" double precision NOT NULL DEFAULT 0, "Unidad" varchar(10),
          "PrecioUnitario" double precision NOT NULL DEFAULT 0, "IVA" double precision NOT NULL DEFAULT 0,
          "Total" double precision NOT NULL DEFAULT 0, "fecha" timestamp, "usuario" varchar(50), "Bodega" uuid,
          FOREIGN KEY ("CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero")
            REFERENCES "${cabecera}"("CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero")
        );
      `);
    }

    await db.exec(`
      INSERT INTO "Factura" VALUES ('004', '420', 'FEV', 10, 800, '2026-11-08 10:00:00', 'cajero');
      INSERT INTO "Factura" VALUES ('004', '420', 'FEV', 11, 0, '2026-11-08 10:05:00', 'cajero');
      INSERT INTO "FacturaOperacion" VALUES
        ('00000000-0000-4000-8000-000000000010', '004', '420', 'FEV', 10),
        ('00000000-0000-4000-8000-000000000011', '004', '420', 'FEV', 11);
      INSERT INTO "FacturaDetalle" (
        "Id", "FacturaId", "CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero",
        "CodigoProducto", "NombreProducto", "Cantidad", "Unidad", "PrecioUnitario", "IVA", "Total"
      ) VALUES (
        '00000000-0000-4000-8000-000000000110', '00000000-0000-4000-8000-000000000010',
        '004', '420', 'FEV', 10, '0004', 'CHUZO', 1, 'UND', 7360, 640, 8000
      );

      INSERT INTO "FacturaVenta" VALUES ('004', '420', 'DVP', 20, 250, '2026-11-08 10:10:00', 'cajero');
      INSERT INTO "FacturaVentaOperacion" VALUES
        ('00000000-0000-4000-8000-000000000020', '004', '420', 'DVP', 20);
    `);

    await db.exec(migracion);
    await db.exec(migracion);

    const electronica = (await db.query(`
      SELECT d."FacturaId", d."CodigoProducto", d."NombreProducto", d."Cantidad", d."Unidad",
        d."PrecioUnitario", d."IVA", d."Total", d."usuario", to_char(d."fecha", 'YYYY-MM-DD HH24:MI:SS') AS "fecha"
      FROM "FacturaDetalle" d WHERE d."CodigoProducto" = '0000'
    `)).rows;
    assert.equal(electronica.length, 1);
    assert.deepEqual(electronica[0], {
      FacturaId: '00000000-0000-4000-8000-000000000010',
      CodigoProducto: '0000', NombreProducto: 'Propina', Cantidad: 1, Unidad: 'UND',
      PrecioUnitario: 800, IVA: 0, Total: 800, usuario: 'cajero', fecha: '2026-11-08 10:00:00',
    });

    const venta = (await db.query(`
      SELECT d."FacturaVentaId", d."CodigoProducto", d."PrecioUnitario", d."IVA", d."Total"
      FROM "FacturaVentaDetalle" d WHERE d."CodigoProducto" = '0000'
    `)).rows;
    assert.deepEqual(venta, [{
      FacturaVentaId: '00000000-0000-4000-8000-000000000020',
      CodigoProducto: '0000', PrecioUnitario: 250, IVA: 0, Total: 250,
    }]);

    const cabeceras = (await db.query(`SELECT "numero", "Propina" FROM "Factura" ORDER BY "numero"`)).rows;
    assert.deepEqual(cabeceras, [{ numero: 10, Propina: 800 }, { numero: 11, Propina: 0 }]);
    const productos = (await db.query(`SELECT count(*)::int AS cantidad FROM "FacturaDetalle" WHERE "CodigoProducto" = '0004'`)).rows[0];
    assert.equal(productos.cantidad, 1);
  } finally {
    await db.close();
  }
});