BEGIN;

LOCK TABLE "FacturaVentaDetalle" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF to_regclass('"FacturaVentaDetalle_backup_20261105"') IS NOT NULL
    OR to_regclass('"FacturaVentaDetalle_reordenada_20261105"') IS NOT NULL THEN
    RAISE EXCEPTION 'Ya existen tablas para la reorganización de FacturaVentaDetalle';
  END IF;
END $$;

CREATE TABLE "FacturaVentaDetalle_reordenada_20261105" (
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
  "Bodega" UUID,
  "Id" UUID NOT NULL,
  "FacturaVentaId" UUID,
  "ProductoId" UUID,
  CONSTRAINT "FacturaVentaDetalle_reordenada_20261105_pkey" PRIMARY KEY ("Id"),
  CONSTRAINT "FacturaVentaDetalle_reordenada_20261105_FacturaVentaId_fkey" FOREIGN KEY ("FacturaVentaId") REFERENCES "FacturaVentaOperacion"("Id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "FacturaVentaDetalle_reordenada_20261105_documento_fkey" FOREIGN KEY ("CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero") REFERENCES "FacturaVenta"("CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "FacturaVentaDetalle_reordenada_20261105_CompaniaCodigo_fkey" FOREIGN KEY ("CompaniaCodigo") REFERENCES "Compania"("Codigo") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "FacturaVentaDetalle_reordenada_20261105_CentroOperacionCodigo_fkey" FOREIGN KEY ("CentroOperacionCodigo") REFERENCES "CentrosOperaciones"("Codigo") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "FacturaVentaDetalle_reordenada_20261105_ProductoId_fkey" FOREIGN KEY ("ProductoId") REFERENCES "Producto"("Id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "FacturaVentaDetalle_reordenada_20261105_Bodega_fkey" FOREIGN KEY ("Bodega") REFERENCES "Bodega"("Id") ON UPDATE CASCADE ON DELETE SET NULL
);

INSERT INTO "FacturaVentaDetalle_reordenada_20261105" (
  "CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero", "CodigoProducto",
  "NombreProducto", "Cantidad", "Unidad", "PrecioUnitario", "IVA", "Total", "Bodega",
  "Id", "FacturaVentaId", "ProductoId"
)
SELECT
  d."CompaniaCodigo", d."CentroOperacionCodigo", f."TipoDocumento", f."numero", d."CodigoProducto",
  d."NombreProducto", d."Cantidad", d."Unidad", d."PrecioUnitario", d."IVA", d."Total", NULL,
  d."Id", d."FacturaVentaId", d."ProductoId"
FROM "FacturaVentaDetalle" d
LEFT JOIN "FacturaVentaOperacion" f ON f."Id" = d."FacturaVentaId";

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM "FacturaVentaDetalle") <> (SELECT COUNT(*) FROM "FacturaVentaDetalle_reordenada_20261105") THEN
    RAISE EXCEPTION 'La copia no conserva el conteo de detalles de venta; se cancela la migración';
  END IF;
  IF EXISTS (
    SELECT "CompaniaCodigo", "CentroOperacionCodigo", "CodigoProducto", "NombreProducto", "Cantidad",
      "Unidad", "PrecioUnitario", "IVA", "Total", "Id", "FacturaVentaId", "ProductoId"
    FROM "FacturaVentaDetalle"
    EXCEPT ALL
    SELECT "CompaniaCodigo", "CentroOperacionCodigo", "CodigoProducto", "NombreProducto", "Cantidad",
      "Unidad", "PrecioUnitario", "IVA", "Total", "Id", "FacturaVentaId", "ProductoId"
    FROM "FacturaVentaDetalle_reordenada_20261105"
  ) OR EXISTS (
    SELECT "CompaniaCodigo", "CentroOperacionCodigo", "CodigoProducto", "NombreProducto", "Cantidad",
      "Unidad", "PrecioUnitario", "IVA", "Total", "Id", "FacturaVentaId", "ProductoId"
    FROM "FacturaVentaDetalle_reordenada_20261105"
    EXCEPT ALL
    SELECT "CompaniaCodigo", "CentroOperacionCodigo", "CodigoProducto", "NombreProducto", "Cantidad",
      "Unidad", "PrecioUnitario", "IVA", "Total", "Id", "FacturaVentaId", "ProductoId"
    FROM "FacturaVentaDetalle"
  ) THEN
    RAISE EXCEPTION 'Los datos originales del detalle de venta no coinciden';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "FacturaVentaDetalle_reordenada_20261105" d
    JOIN "FacturaVentaOperacion" f ON f."Id" = d."FacturaVentaId"
    WHERE d."TipoDocumento" IS DISTINCT FROM f."TipoDocumento"
      OR d."numero" IS DISTINCT FROM f."numero"
      OR d."CompaniaCodigo" IS DISTINCT FROM f."CompaniaCodigo"
      OR d."CentroOperacionCodigo" IS DISTINCT FROM f."CentroOperacionCodigo"
  ) THEN
    RAISE EXCEPTION 'La clave documental copiada no coincide con la factura de venta';
  END IF;
END $$;

ALTER TABLE "FacturaVentaDetalle" RENAME TO "FacturaVentaDetalle_backup_20261105";
ALTER TABLE "FacturaVentaDetalle_backup_20261105" RENAME CONSTRAINT "FacturaVentaDetalle_pkey" TO "FacturaVentaDetalle_backup_20261105_pkey";
ALTER TABLE "FacturaVentaDetalle_reordenada_20261105" RENAME TO "FacturaVentaDetalle";
ALTER TABLE "FacturaVentaDetalle" RENAME CONSTRAINT "FacturaVentaDetalle_reordenada_20261105_pkey" TO "FacturaVentaDetalle_pkey";
ALTER TABLE "FacturaVentaDetalle" RENAME CONSTRAINT "FacturaVentaDetalle_reordenada_20261105_FacturaVentaId_fkey" TO "FacturaVentaDetalle_FacturaVentaId_fkey";
ALTER TABLE "FacturaVentaDetalle" RENAME CONSTRAINT "FacturaVentaDetalle_reordenada_20261105_documento_fkey" TO "FacturaVentaDetalle_documento_fkey";
ALTER TABLE "FacturaVentaDetalle" RENAME CONSTRAINT "FacturaVentaDetalle_reordenada_20261105_CompaniaCodigo_fkey" TO "FacturaVentaDetalle_CompaniaCodigo_fkey";
ALTER TABLE "FacturaVentaDetalle" RENAME CONSTRAINT "FacturaVentaDetalle_reordenada_20261105_CentroOperacionCodigo_fkey" TO "FacturaVentaDetalle_CentroOperacionCodigo_fkey";
ALTER TABLE "FacturaVentaDetalle" RENAME CONSTRAINT "FacturaVentaDetalle_reordenada_20261105_ProductoId_fkey" TO "FacturaVentaDetalle_ProductoId_fkey";
ALTER TABLE "FacturaVentaDetalle" RENAME CONSTRAINT "FacturaVentaDetalle_reordenada_20261105_Bodega_fkey" TO "FacturaVentaDetalle_Bodega_fkey";

COMMIT;
