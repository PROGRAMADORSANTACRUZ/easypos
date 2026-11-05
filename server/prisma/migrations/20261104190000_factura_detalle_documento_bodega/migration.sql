BEGIN;

LOCK TABLE "FacturaDetalle", "Factura", "Bodega" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF to_regclass('"FacturaDetalle_backup_20261104"') IS NOT NULL THEN
    RAISE EXCEPTION 'Ya existe la tabla de respaldo FacturaDetalle_backup_20261104';
  END IF;
END $$;

CREATE TABLE "FacturaDetalle_reordenada" (
  "CompaniaCodigo" VARCHAR(3),
  "CentroOperacionCodigo" VARCHAR(10),
  "numero" INTEGER,
  "CodigoProducto" VARCHAR(50),
  "NombreProducto" VARCHAR(250),
  "Cantidad" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "Unidad" VARCHAR(10),
  "PrecioUnitario" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "IVA" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "Total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "Bodega" UUID,
  "TipoDocumento" VARCHAR(20),
  "Id" UUID NOT NULL,
  "FacturaId" UUID,
  "ProductoId" UUID,
  CONSTRAINT "FacturaDetalle_reordenada_pkey" PRIMARY KEY ("Id"),
  CONSTRAINT "FacturaDetalle_reordenada_FacturaId_fkey" FOREIGN KEY ("FacturaId") REFERENCES "FacturaOperacion"("Id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "FacturaDetalle_reordenada_documento_fkey" FOREIGN KEY ("CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero") REFERENCES "Factura"("CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "FacturaDetalle_reordenada_CompaniaCodigo_fkey" FOREIGN KEY ("CompaniaCodigo") REFERENCES "Compania"("Codigo") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "FacturaDetalle_reordenada_CentroOperacionCodigo_fkey" FOREIGN KEY ("CentroOperacionCodigo") REFERENCES "CentrosOperaciones"("Codigo") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "FacturaDetalle_reordenada_ProductoId_fkey" FOREIGN KEY ("ProductoId") REFERENCES "Producto"("Id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "FacturaDetalle_reordenada_Bodega_fkey" FOREIGN KEY ("Bodega") REFERENCES "Bodega"("Id") ON UPDATE CASCADE ON DELETE SET NULL
);

INSERT INTO "FacturaDetalle_reordenada" (
  "CompaniaCodigo", "CentroOperacionCodigo", "numero", "CodigoProducto", "NombreProducto",
  "Cantidad", "Unidad", "PrecioUnitario", "IVA", "Total", "Bodega", "TipoDocumento",
  "Id", "FacturaId", "ProductoId"
)
SELECT
  COALESCE(f."CompaniaCodigo", d."CompaniaCodigo"),
  COALESCE(f."CentroOperacionCodigo", d."CentroOperacionCodigo"),
  f."numero",
  d."CodigoProducto", d."NombreProducto", d."Cantidad", d."Unidad", d."PrecioUnitario",
  d."IVA", d."Total", NULL, f."TipoDocumento", d."Id", d."FacturaId", d."ProductoId"
FROM "FacturaDetalle" d
LEFT JOIN "FacturaOperacion" f ON f."Id" = d."FacturaId";

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM "FacturaDetalle") <> (SELECT COUNT(*) FROM "FacturaDetalle_reordenada") THEN
    RAISE EXCEPTION 'La copia no conserva el conteo de detalles; se cancela la migración';
  END IF;
  IF EXISTS (
    SELECT "Id", "FacturaId", "ProductoId", "CompaniaCodigo", "CentroOperacionCodigo", "CodigoProducto",
      "NombreProducto", "Cantidad", "Unidad", "PrecioUnitario", "IVA", "Total"
    FROM "FacturaDetalle"
    EXCEPT ALL
    SELECT "Id", "FacturaId", "ProductoId", "CompaniaCodigo", "CentroOperacionCodigo", "CodigoProducto",
      "NombreProducto", "Cantidad", "Unidad", "PrecioUnitario", "IVA", "Total"
    FROM "FacturaDetalle_reordenada"
  ) OR EXISTS (
    SELECT "Id", "FacturaId", "ProductoId", "CompaniaCodigo", "CentroOperacionCodigo", "CodigoProducto",
      "NombreProducto", "Cantidad", "Unidad", "PrecioUnitario", "IVA", "Total"
    FROM "FacturaDetalle_reordenada"
    EXCEPT ALL
    SELECT "Id", "FacturaId", "ProductoId", "CompaniaCodigo", "CentroOperacionCodigo", "CodigoProducto",
      "NombreProducto", "Cantidad", "Unidad", "PrecioUnitario", "IVA", "Total"
    FROM "FacturaDetalle"
  ) THEN
    RAISE EXCEPTION 'Los datos del detalle no coinciden; se cancela la migración';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "FacturaDetalle_reordenada" d
    JOIN "FacturaOperacion" f ON f."Id" = d."FacturaId"
    WHERE d."numero" IS DISTINCT FROM f."numero"
      OR d."TipoDocumento" IS DISTINCT FROM f."TipoDocumento"
      OR d."CompaniaCodigo" IS DISTINCT FROM f."CompaniaCodigo"
      OR d."CentroOperacionCodigo" IS DISTINCT FROM f."CentroOperacionCodigo"
  ) THEN
    RAISE EXCEPTION 'La clave documental copiada no coincide con la factura asociada';
  END IF;
END $$;

ALTER TABLE "FacturaDetalle" RENAME TO "FacturaDetalle_backup_20261104";
ALTER TABLE "FacturaDetalle_backup_20261104" RENAME CONSTRAINT "FacturaDetalle_pkey" TO "FacturaDetalle_backup_20261104_pkey";
ALTER TABLE "FacturaDetalle_reordenada" RENAME TO "FacturaDetalle";
ALTER TABLE "FacturaDetalle" RENAME CONSTRAINT "FacturaDetalle_reordenada_pkey" TO "FacturaDetalle_pkey";
ALTER TABLE "FacturaDetalle" RENAME CONSTRAINT "FacturaDetalle_reordenada_FacturaId_fkey" TO "FacturaDetalle_FacturaId_fkey";
ALTER TABLE "FacturaDetalle" RENAME CONSTRAINT "FacturaDetalle_reordenada_documento_fkey" TO "FacturaDetalle_documento_fkey";
ALTER TABLE "FacturaDetalle" RENAME CONSTRAINT "FacturaDetalle_reordenada_CompaniaCodigo_fkey" TO "FacturaDetalle_CompaniaCodigo_fkey";
ALTER TABLE "FacturaDetalle" RENAME CONSTRAINT "FacturaDetalle_reordenada_CentroOperacionCodigo_fkey" TO "FacturaDetalle_CentroOperacionCodigo_fkey";
ALTER TABLE "FacturaDetalle" RENAME CONSTRAINT "FacturaDetalle_reordenada_ProductoId_fkey" TO "FacturaDetalle_ProductoId_fkey";
ALTER TABLE "FacturaDetalle" RENAME CONSTRAINT "FacturaDetalle_reordenada_Bodega_fkey" TO "FacturaDetalle_Bodega_fkey";

COMMIT;
