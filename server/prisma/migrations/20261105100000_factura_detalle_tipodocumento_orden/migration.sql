BEGIN;

LOCK TABLE "FacturaDetalle" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF to_regclass('"FacturaDetalle_backup_20261105"') IS NOT NULL
    OR to_regclass('"FacturaDetalle_reordenada_20261105"') IS NOT NULL THEN
    RAISE EXCEPTION 'Ya existen tablas para la reorganización de FacturaDetalle';
  END IF;
END $$;

CREATE TABLE "FacturaDetalle_reordenada_20261105" (
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
  "FacturaId" UUID,
  "ProductoId" UUID,
  CONSTRAINT "FacturaDetalle_reordenada_20261105_pkey" PRIMARY KEY ("Id"),
  CONSTRAINT "FacturaDetalle_reordenada_20261105_FacturaId_fkey" FOREIGN KEY ("FacturaId") REFERENCES "FacturaOperacion"("Id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "FacturaDetalle_reordenada_20261105_documento_fkey" FOREIGN KEY ("CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero") REFERENCES "Factura"("CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "FacturaDetalle_reordenada_20261105_CompaniaCodigo_fkey" FOREIGN KEY ("CompaniaCodigo") REFERENCES "Compania"("Codigo") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "FacturaDetalle_reordenada_20261105_CentroOperacionCodigo_fkey" FOREIGN KEY ("CentroOperacionCodigo") REFERENCES "CentrosOperaciones"("Codigo") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "FacturaDetalle_reordenada_20261105_ProductoId_fkey" FOREIGN KEY ("ProductoId") REFERENCES "Producto"("Id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "FacturaDetalle_reordenada_20261105_Bodega_fkey" FOREIGN KEY ("Bodega") REFERENCES "Bodega"("Id") ON UPDATE CASCADE ON DELETE SET NULL
);

INSERT INTO "FacturaDetalle_reordenada_20261105" (
  "CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero", "CodigoProducto",
  "NombreProducto", "Cantidad", "Unidad", "PrecioUnitario", "IVA", "Total", "Bodega",
  "Id", "FacturaId", "ProductoId"
)
SELECT
  "CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero", "CodigoProducto",
  "NombreProducto", "Cantidad", "Unidad", "PrecioUnitario", "IVA", "Total", "Bodega",
  "Id", "FacturaId", "ProductoId"
FROM "FacturaDetalle";

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM "FacturaDetalle") <> (SELECT COUNT(*) FROM "FacturaDetalle_reordenada_20261105") THEN
    RAISE EXCEPTION 'La copia no conserva el conteo de detalles; se cancela la migración';
  END IF;
  IF EXISTS (
    SELECT "CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero", "CodigoProducto",
      "NombreProducto", "Cantidad", "Unidad", "PrecioUnitario", "IVA", "Total", "Bodega", "Id", "FacturaId", "ProductoId"
    FROM "FacturaDetalle"
    EXCEPT ALL
    SELECT "CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero", "CodigoProducto",
      "NombreProducto", "Cantidad", "Unidad", "PrecioUnitario", "IVA", "Total", "Bodega", "Id", "FacturaId", "ProductoId"
    FROM "FacturaDetalle_reordenada_20261105"
  ) OR EXISTS (
    SELECT "CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero", "CodigoProducto",
      "NombreProducto", "Cantidad", "Unidad", "PrecioUnitario", "IVA", "Total", "Bodega", "Id", "FacturaId", "ProductoId"
    FROM "FacturaDetalle_reordenada_20261105"
    EXCEPT ALL
    SELECT "CompaniaCodigo", "CentroOperacionCodigo", "TipoDocumento", "numero", "CodigoProducto",
      "NombreProducto", "Cantidad", "Unidad", "PrecioUnitario", "IVA", "Total", "Bodega", "Id", "FacturaId", "ProductoId"
    FROM "FacturaDetalle"
  ) THEN
    RAISE EXCEPTION 'Los datos del detalle no coinciden; se cancela la migración';
  END IF;
END $$;

ALTER TABLE "FacturaDetalle" RENAME TO "FacturaDetalle_backup_20261105";
ALTER TABLE "FacturaDetalle_backup_20261105" RENAME CONSTRAINT "FacturaDetalle_pkey" TO "FacturaDetalle_backup_20261105_pkey";
ALTER TABLE "FacturaDetalle_reordenada_20261105" RENAME TO "FacturaDetalle";
ALTER TABLE "FacturaDetalle" RENAME CONSTRAINT "FacturaDetalle_reordenada_20261105_pkey" TO "FacturaDetalle_pkey";
ALTER TABLE "FacturaDetalle" RENAME CONSTRAINT "FacturaDetalle_reordenada_20261105_FacturaId_fkey" TO "FacturaDetalle_FacturaId_fkey";
ALTER TABLE "FacturaDetalle" RENAME CONSTRAINT "FacturaDetalle_reordenada_20261105_documento_fkey" TO "FacturaDetalle_documento_fkey";
ALTER TABLE "FacturaDetalle" RENAME CONSTRAINT "FacturaDetalle_reordenada_20261105_CompaniaCodigo_fkey" TO "FacturaDetalle_CompaniaCodigo_fkey";
ALTER TABLE "FacturaDetalle" RENAME CONSTRAINT "FacturaDetalle_reordenada_20261105_CentroOperacionCodigo_fkey" TO "FacturaDetalle_CentroOperacionCodigo_fkey";
ALTER TABLE "FacturaDetalle" RENAME CONSTRAINT "FacturaDetalle_reordenada_20261105_ProductoId_fkey" TO "FacturaDetalle_ProductoId_fkey";
ALTER TABLE "FacturaDetalle" RENAME CONSTRAINT "FacturaDetalle_reordenada_20261105_Bodega_fkey" TO "FacturaDetalle_Bodega_fkey";

COMMIT;
