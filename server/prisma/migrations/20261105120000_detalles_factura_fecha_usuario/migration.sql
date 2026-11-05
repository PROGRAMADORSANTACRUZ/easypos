BEGIN;

LOCK TABLE "FacturaDetalle", "FacturaVentaDetalle", "Factura", "FacturaVenta",
  "FacturaOperacion", "FacturaVentaOperacion" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF to_regclass('"FacturaDetalle_backup_20261105_fecha_usuario"') IS NOT NULL
    OR to_regclass('"FacturaVentaDetalle_backup_20261105_fecha_usuario"') IS NOT NULL
    OR to_regclass('"FacturaDetalle_reordenada_20261105_fecha_usuario"') IS NOT NULL
    OR to_regclass('"FacturaVentaDetalle_reordenada_20261105_fecha_usuario"') IS NOT NULL THEN
    RAISE EXCEPTION 'Ya existen tablas para la reorganización de fecha y usuario';
  END IF;
END $$;

CREATE TABLE "FacturaDetalle_reordenada_20261105_fecha_usuario" (
  "CompaniaCodigo" VARCHAR(3),
  "CentroOperacionCodigo" VARCHAR(10),
  "TipoDocumento" VARCHAR(20),
  "numero" INTEGER,
  "CodigoProducto" VARCHAR(50),
  "NombreProducto" VARCHAR(250),
  "Cantidad" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "Unidad" VARCHAR(10),
  "PrecioUnitario" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "IVA" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "Total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "fecha" TIMESTAMP(3),
  "usuario" VARCHAR(50),
  "Bodega" UUID,
  "Id" UUID NOT NULL,
  "FacturaId" UUID,
  "ProductoId" UUID,
  CONSTRAINT "FacturaDetalle_reordenada_20261105_fecha_usuario_pkey" PRIMARY KEY ("Id"),
  CONSTRAINT "FacturaDetalle_reordenada_20261105_fecha_usuario_FacturaId_fkey" FOREIGN KEY ("FacturaId") REFERENCES "FacturaOperacion"("Id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "FacturaDetalle_reordenada_20261105_fecha_usuario_documento_fkey" FOREIGN KEY ("CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero") REFERENCES "Factura"("CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "FacturaDetalle_reordenada_20261105_fecha_usuario_CompaniaCodigo_fkey" FOREIGN KEY ("CompaniaCodigo") REFERENCES "Compania"("Codigo") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "FacturaDetalle_reordenada_20261105_fecha_usuario_CentroOperacionCodigo_fkey" FOREIGN KEY ("CentroOperacionCodigo") REFERENCES "CentrosOperaciones"("Codigo") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "FacturaDetalle_reordenada_20261105_fecha_usuario_ProductoId_fkey" FOREIGN KEY ("ProductoId") REFERENCES "Producto"("Id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "FacturaDetalle_reordenada_20261105_fecha_usuario_Bodega_fkey" FOREIGN KEY ("Bodega") REFERENCES "Bodega"("Id") ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE TABLE "FacturaVentaDetalle_reordenada_20261105_fecha_usuario" (
  "CompaniaCodigo" VARCHAR(3),
  "CentroOperacionCodigo" VARCHAR(10),
  "TipoDocumento" VARCHAR(20),
  "numero" INTEGER,
  "CodigoProducto" VARCHAR(50),
  "NombreProducto" VARCHAR(250),
  "Cantidad" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "Unidad" VARCHAR(10),
  "PrecioUnitario" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "IVA" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "Total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "fecha" TIMESTAMP(3),
  "usuario" VARCHAR(50),
  "Bodega" UUID,
  "Id" UUID NOT NULL,
  "FacturaVentaId" UUID,
  "ProductoId" UUID,
  CONSTRAINT "FacturaVentaDetalle_reordenada_20261105_fecha_usuario_pkey" PRIMARY KEY ("Id"),
  CONSTRAINT "FacturaVentaDetalle_reordenada_20261105_fecha_usuario_FacturaVentaId_fkey" FOREIGN KEY ("FacturaVentaId") REFERENCES "FacturaVentaOperacion"("Id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "FacturaVentaDetalle_reordenada_20261105_fecha_usuario_documento_fkey" FOREIGN KEY ("CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero") REFERENCES "FacturaVenta"("CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "FacturaVentaDetalle_reordenada_20261105_fecha_usuario_CompaniaCodigo_fkey" FOREIGN KEY ("CompaniaCodigo") REFERENCES "Compania"("Codigo") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "FacturaVentaDetalle_reordenada_20261105_fecha_usuario_CentroOperacionCodigo_fkey" FOREIGN KEY ("CentroOperacionCodigo") REFERENCES "CentrosOperaciones"("Codigo") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "FacturaVentaDetalle_reordenada_20261105_fecha_usuario_ProductoId_fkey" FOREIGN KEY ("ProductoId") REFERENCES "Producto"("Id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "FacturaVentaDetalle_reordenada_20261105_fecha_usuario_Bodega_fkey" FOREIGN KEY ("Bodega") REFERENCES "Bodega"("Id") ON UPDATE CASCADE ON DELETE SET NULL
);

INSERT INTO "FacturaDetalle_reordenada_20261105_fecha_usuario" (
  "CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero", "CodigoProducto",
  "NombreProducto", "Cantidad", "Unidad", "PrecioUnitario", "IVA", "Total", "fecha",
  "usuario", "Bodega", "Id", "FacturaId", "ProductoId"
)
SELECT
  d."CompaniaCodigo", d."CentroOperacionCodigo", o."TipoDocumento", o."numero", d."CodigoProducto",
  d."NombreProducto", d."Cantidad", d."Unidad", d."PrecioUnitario", d."IVA", d."Total",
  h."fecha", h."Usuario", d."Bodega", d."Id", d."FacturaId", d."ProductoId"
FROM "FacturaDetalle" d
LEFT JOIN "FacturaOperacion" o ON o."Id" = d."FacturaId"
LEFT JOIN "Factura" h ON (h."CompaniaCodigo", h."CentroOperacionCodigo", h."TipoDocumento", h."numero") =
  (o."CompaniaCodigo", o."CentroOperacionCodigo", o."TipoDocumento", o."numero");

INSERT INTO "FacturaVentaDetalle_reordenada_20261105_fecha_usuario" (
  "CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero", "CodigoProducto",
  "NombreProducto", "Cantidad", "Unidad", "PrecioUnitario", "IVA", "Total", "fecha",
  "usuario", "Bodega", "Id", "FacturaVentaId", "ProductoId"
)
SELECT
  d."CompaniaCodigo", d."CentroOperacionCodigo", o."TipoDocumento", o."numero", d."CodigoProducto",
  d."NombreProducto", d."Cantidad", d."Unidad", d."PrecioUnitario", d."IVA", d."Total",
  h."fecha", h."Usuario", d."Bodega", d."Id", d."FacturaVentaId", d."ProductoId"
FROM "FacturaVentaDetalle" d
LEFT JOIN "FacturaVentaOperacion" o ON o."Id" = d."FacturaVentaId"
LEFT JOIN "FacturaVenta" h ON (h."CompaniaCodigo", h."CentroOperacionCodigo", h."TipoDocumento", h."numero") =
  (o."CompaniaCodigo", o."CentroOperacionCodigo", o."TipoDocumento", o."numero");

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM "FacturaDetalle") <> (SELECT COUNT(*) FROM "FacturaDetalle_reordenada_20261105_fecha_usuario")
    OR (SELECT COUNT(*) FROM "FacturaVentaDetalle") <> (SELECT COUNT(*) FROM "FacturaVentaDetalle_reordenada_20261105_fecha_usuario") THEN
    RAISE EXCEPTION 'La copia no conserva el conteo de líneas; se cancela la migración';
  END IF;
  IF EXISTS (
    SELECT "Id", "FacturaId", "ProductoId", "CompaniaCodigo", "CentroOperacionCodigo", "CodigoProducto",
      "NombreProducto", "Cantidad", "Unidad", "PrecioUnitario", "IVA", "Total", "Bodega"
    FROM "FacturaDetalle"
    EXCEPT ALL
    SELECT "Id", "FacturaId", "ProductoId", "CompaniaCodigo", "CentroOperacionCodigo", "CodigoProducto",
      "NombreProducto", "Cantidad", "Unidad", "PrecioUnitario", "IVA", "Total", "Bodega"
    FROM "FacturaDetalle_reordenada_20261105_fecha_usuario"
  ) OR EXISTS (
    SELECT "Id", "FacturaId", "ProductoId", "CompaniaCodigo", "CentroOperacionCodigo", "CodigoProducto",
      "NombreProducto", "Cantidad", "Unidad", "PrecioUnitario", "IVA", "Total", "Bodega"
    FROM "FacturaDetalle_reordenada_20261105_fecha_usuario"
    EXCEPT ALL
    SELECT "Id", "FacturaId", "ProductoId", "CompaniaCodigo", "CentroOperacionCodigo", "CodigoProducto",
      "NombreProducto", "Cantidad", "Unidad", "PrecioUnitario", "IVA", "Total", "Bodega"
    FROM "FacturaDetalle"
  ) OR EXISTS (
    SELECT "Id", "FacturaVentaId", "ProductoId", "CompaniaCodigo", "CentroOperacionCodigo", "CodigoProducto",
      "NombreProducto", "Cantidad", "Unidad", "PrecioUnitario", "IVA", "Total", "Bodega"
    FROM "FacturaVentaDetalle"
    EXCEPT ALL
    SELECT "Id", "FacturaVentaId", "ProductoId", "CompaniaCodigo", "CentroOperacionCodigo", "CodigoProducto",
      "NombreProducto", "Cantidad", "Unidad", "PrecioUnitario", "IVA", "Total", "Bodega"
    FROM "FacturaVentaDetalle_reordenada_20261105_fecha_usuario"
  ) OR EXISTS (
    SELECT "Id", "FacturaVentaId", "ProductoId", "CompaniaCodigo", "CentroOperacionCodigo", "CodigoProducto",
      "NombreProducto", "Cantidad", "Unidad", "PrecioUnitario", "IVA", "Total", "Bodega"
    FROM "FacturaVentaDetalle_reordenada_20261105_fecha_usuario"
    EXCEPT ALL
    SELECT "Id", "FacturaVentaId", "ProductoId", "CompaniaCodigo", "CentroOperacionCodigo", "CodigoProducto",
      "NombreProducto", "Cantidad", "Unidad", "PrecioUnitario", "IVA", "Total", "Bodega"
    FROM "FacturaVentaDetalle"
  ) THEN
    RAISE EXCEPTION 'Los datos originales del detalle no coinciden; se cancela la migración';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "FacturaDetalle_reordenada_20261105_fecha_usuario" d
    LEFT JOIN "FacturaOperacion" o ON o."Id" = d."FacturaId"
    LEFT JOIN "Factura" h ON (h."CompaniaCodigo", h."CentroOperacionCodigo", h."TipoDocumento", h."numero") =
      (o."CompaniaCodigo", o."CentroOperacionCodigo", o."TipoDocumento", o."numero")
    WHERE d."FacturaId" IS NOT NULL AND (o."Id" IS NULL OR h."CompaniaCodigo" IS NULL
      OR d."TipoDocumento" IS DISTINCT FROM o."TipoDocumento" OR d."numero" IS DISTINCT FROM o."numero"
      OR d."fecha" IS DISTINCT FROM h."fecha" OR d."usuario" IS DISTINCT FROM h."Usuario")
  ) OR EXISTS (
    SELECT 1 FROM "FacturaVentaDetalle_reordenada_20261105_fecha_usuario" d
    LEFT JOIN "FacturaVentaOperacion" o ON o."Id" = d."FacturaVentaId"
    LEFT JOIN "FacturaVenta" h ON (h."CompaniaCodigo", h."CentroOperacionCodigo", h."TipoDocumento", h."numero") =
      (o."CompaniaCodigo", o."CentroOperacionCodigo", o."TipoDocumento", o."numero")
    WHERE d."FacturaVentaId" IS NOT NULL AND (o."Id" IS NULL OR h."CompaniaCodigo" IS NULL
      OR d."TipoDocumento" IS DISTINCT FROM o."TipoDocumento" OR d."numero" IS DISTINCT FROM o."numero"
      OR d."fecha" IS DISTINCT FROM h."fecha" OR d."usuario" IS DISTINCT FROM h."Usuario")
  ) THEN
    RAISE EXCEPTION 'La fecha, usuario o clave copiados no coinciden con la cabecera';
  END IF;
END $$;

ALTER TABLE "FacturaDetalle" RENAME TO "FacturaDetalle_backup_20261105_fecha_usuario";
ALTER TABLE "FacturaDetalle_backup_20261105_fecha_usuario" RENAME CONSTRAINT "FacturaDetalle_pkey" TO "FacturaDetalle_backup_20261105_fecha_usuario_pkey";
ALTER TABLE "FacturaVentaDetalle" RENAME TO "FacturaVentaDetalle_backup_20261105_fecha_usuario";
ALTER TABLE "FacturaVentaDetalle_backup_20261105_fecha_usuario" RENAME CONSTRAINT "FacturaVentaDetalle_pkey" TO "FacturaVentaDetalle_backup_20261105_fecha_usuario_pkey";

ALTER TABLE "FacturaDetalle_reordenada_20261105_fecha_usuario" RENAME TO "FacturaDetalle";
ALTER TABLE "FacturaDetalle" RENAME CONSTRAINT "FacturaDetalle_reordenada_20261105_fecha_usuario_pkey" TO "FacturaDetalle_pkey";
ALTER TABLE "FacturaDetalle" RENAME CONSTRAINT "FacturaDetalle_reordenada_20261105_fecha_usuario_FacturaId_fkey" TO "FacturaDetalle_FacturaId_fkey";
ALTER TABLE "FacturaDetalle" RENAME CONSTRAINT "FacturaDetalle_reordenada_20261105_fecha_usuario_documento_fkey" TO "FacturaDetalle_documento_fkey";
ALTER TABLE "FacturaDetalle" RENAME CONSTRAINT "FacturaDetalle_reordenada_20261105_fecha_usuario_CompaniaCodigo_fkey" TO "FacturaDetalle_CompaniaCodigo_fkey";
ALTER TABLE "FacturaDetalle" RENAME CONSTRAINT "FacturaDetalle_reordenada_20261105_fecha_usuario_CentroOperacionCodigo_fkey" TO "FacturaDetalle_CentroOperacionCodigo_fkey";
ALTER TABLE "FacturaDetalle" RENAME CONSTRAINT "FacturaDetalle_reordenada_20261105_fecha_usuario_ProductoId_fkey" TO "FacturaDetalle_ProductoId_fkey";
ALTER TABLE "FacturaDetalle" RENAME CONSTRAINT "FacturaDetalle_reordenada_20261105_fecha_usuario_Bodega_fkey" TO "FacturaDetalle_Bodega_fkey";

ALTER TABLE "FacturaVentaDetalle_reordenada_20261105_fecha_usuario" RENAME TO "FacturaVentaDetalle";
ALTER TABLE "FacturaVentaDetalle" RENAME CONSTRAINT "FacturaVentaDetalle_reordenada_20261105_fecha_usuario_pkey" TO "FacturaVentaDetalle_pkey";
ALTER TABLE "FacturaVentaDetalle" RENAME CONSTRAINT "FacturaVentaDetalle_reordenada_20261105_fecha_usuario_FacturaVentaId_fkey" TO "FacturaVentaDetalle_FacturaVentaId_fkey";
ALTER TABLE "FacturaVentaDetalle" RENAME CONSTRAINT "FacturaVentaDetalle_reordenada_20261105_fecha_usuario_documento_fkey" TO "FacturaVentaDetalle_documento_fkey";
ALTER TABLE "FacturaVentaDetalle" RENAME CONSTRAINT "FacturaVentaDetalle_reordenada_20261105_fecha_usuario_CompaniaCodigo_fkey" TO "FacturaVentaDetalle_CompaniaCodigo_fkey";
ALTER TABLE "FacturaVentaDetalle" RENAME CONSTRAINT "FacturaVentaDetalle_reordenada_20261105_fecha_usuario_CentroOperacionCodigo_fkey" TO "FacturaVentaDetalle_CentroOperacionCodigo_fkey";
ALTER TABLE "FacturaVentaDetalle" RENAME CONSTRAINT "FacturaVentaDetalle_reordenada_20261105_fecha_usuario_ProductoId_fkey" TO "FacturaVentaDetalle_ProductoId_fkey";
ALTER TABLE "FacturaVentaDetalle" RENAME CONSTRAINT "FacturaVentaDetalle_reordenada_20261105_fecha_usuario_Bodega_fkey" TO "FacturaVentaDetalle_Bodega_fkey";

COMMIT;
