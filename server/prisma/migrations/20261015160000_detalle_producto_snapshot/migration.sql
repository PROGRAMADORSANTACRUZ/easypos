BEGIN;

LOCK TABLE "FacturaDetalle", "FacturaVentaDetalle" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF to_regclass('"FacturaDetalle_backup_20261015"') IS NOT NULL
    OR to_regclass('"FacturaVentaDetalle_backup_20261015"') IS NOT NULL THEN
    RAISE EXCEPTION 'Ya existen tablas de respaldo para los detalles de factura';
  END IF;
END $$;

CREATE TABLE "FacturaDetalle_reordenada" (
  "CompaniaCodigo" VARCHAR(3),
  "CentroOperacionCodigo" VARCHAR(10),
  "CodigoProducto" VARCHAR(50),
  "NombreProducto" VARCHAR(250),
  "Cantidad" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "Unidad" VARCHAR(10),
  "PrecioUnitario" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "IVA" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "Total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "Id" UUID NOT NULL,
  "FacturaId" UUID,
  "ProductoId" UUID,
  CONSTRAINT "FacturaDetalle_reordenada_pkey" PRIMARY KEY ("Id"),
  CONSTRAINT "FacturaDetalle_reordenada_FacturaId_fkey" FOREIGN KEY ("FacturaId") REFERENCES "Factura"("Id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "FacturaDetalle_reordenada_CompaniaCodigo_fkey" FOREIGN KEY ("CompaniaCodigo") REFERENCES "Compania"("Codigo") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "FacturaDetalle_reordenada_CentroOperacionCodigo_fkey" FOREIGN KEY ("CentroOperacionCodigo") REFERENCES "CentrosOperaciones"("Codigo") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "FacturaDetalle_reordenada_ProductoId_fkey" FOREIGN KEY ("ProductoId") REFERENCES "Producto"("Id") ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE TABLE "FacturaVentaDetalle_reordenada" (
  "CompaniaCodigo" VARCHAR(3),
  "CentroOperacionCodigo" VARCHAR(10),
  "CodigoProducto" VARCHAR(50),
  "NombreProducto" VARCHAR(250),
  "Cantidad" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "Unidad" VARCHAR(10),
  "PrecioUnitario" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "IVA" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "Total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "Id" UUID NOT NULL,
  "FacturaVentaId" UUID,
  "ProductoId" UUID,
  CONSTRAINT "FacturaVentaDetalle_reordenada_pkey" PRIMARY KEY ("Id"),
  CONSTRAINT "FacturaVentaDetalle_reordenada_FacturaVentaId_fkey" FOREIGN KEY ("FacturaVentaId") REFERENCES "FacturaVenta"("Id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "FacturaVentaDetalle_reordenada_CompaniaCodigo_fkey" FOREIGN KEY ("CompaniaCodigo") REFERENCES "Compania"("Codigo") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "FacturaVentaDetalle_reordenada_CentroOperacionCodigo_fkey" FOREIGN KEY ("CentroOperacionCodigo") REFERENCES "CentrosOperaciones"("Codigo") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "FacturaVentaDetalle_reordenada_ProductoId_fkey" FOREIGN KEY ("ProductoId") REFERENCES "Producto"("Id") ON UPDATE CASCADE ON DELETE SET NULL
);

INSERT INTO "FacturaDetalle_reordenada" (
  "CompaniaCodigo", "CentroOperacionCodigo", "CodigoProducto", "NombreProducto", "Cantidad", "Unidad",
  "PrecioUnitario", "IVA", "Total", "Id", "FacturaId", "ProductoId"
)
SELECT
  d."CompaniaCodigo", d."CentroOperacionCodigo", p."Codigo", p."Nombre", d."Cantidad",
  CASE WHEN p."Id" IS NULL THEN NULL ELSE COALESCE(u."Abreviatura", 'UND') END,
  d."PrecioUnitario", d."IVA", d."Total", d."Id", d."FacturaId", d."ProductoId"
FROM "FacturaDetalle" d
LEFT JOIN "Producto" p ON p."Id" = d."ProductoId"
LEFT JOIN "UnidadesMedida" u ON u."Id" = p."UnidadId";

INSERT INTO "FacturaVentaDetalle_reordenada" (
  "CompaniaCodigo", "CentroOperacionCodigo", "CodigoProducto", "NombreProducto", "Cantidad", "Unidad",
  "PrecioUnitario", "IVA", "Total", "Id", "FacturaVentaId", "ProductoId"
)
SELECT
  d."CompaniaCodigo", d."CentroOperacionCodigo", p."Codigo", p."Nombre", d."Cantidad",
  CASE WHEN p."Id" IS NULL THEN NULL ELSE COALESCE(u."Abreviatura", 'UND') END,
  d."PrecioUnitario", d."IVA", d."Total", d."Id", d."FacturaVentaId", d."ProductoId"
FROM "FacturaVentaDetalle" d
LEFT JOIN "Producto" p ON p."Id" = d."ProductoId"
LEFT JOIN "UnidadesMedida" u ON u."Id" = p."UnidadId";

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM "FacturaDetalle") <> (SELECT COUNT(*) FROM "FacturaDetalle_reordenada")
    OR (SELECT COUNT(*) FROM "FacturaVentaDetalle") <> (SELECT COUNT(*) FROM "FacturaVentaDetalle_reordenada") THEN
    RAISE EXCEPTION 'La copia no conserva el conteo de líneas; se cancela la reorganización';
  END IF;
  IF EXISTS (
    SELECT "Id", "FacturaId", "CompaniaCodigo", "CentroOperacionCodigo", "ProductoId", "Cantidad", "PrecioUnitario", "IVA", "Total" FROM "FacturaDetalle"
    EXCEPT ALL
    SELECT "Id", "FacturaId", "CompaniaCodigo", "CentroOperacionCodigo", "ProductoId", "Cantidad", "PrecioUnitario", "IVA", "Total" FROM "FacturaDetalle_reordenada"
  ) OR EXISTS (
    SELECT "Id", "FacturaId", "CompaniaCodigo", "CentroOperacionCodigo", "ProductoId", "Cantidad", "PrecioUnitario", "IVA", "Total" FROM "FacturaDetalle_reordenada"
    EXCEPT ALL
    SELECT "Id", "FacturaId", "CompaniaCodigo", "CentroOperacionCodigo", "ProductoId", "Cantidad", "PrecioUnitario", "IVA", "Total" FROM "FacturaDetalle"
  ) OR EXISTS (
    SELECT "Id", "FacturaVentaId", "CompaniaCodigo", "CentroOperacionCodigo", "ProductoId", "Cantidad", "PrecioUnitario", "IVA", "Total" FROM "FacturaVentaDetalle"
    EXCEPT ALL
    SELECT "Id", "FacturaVentaId", "CompaniaCodigo", "CentroOperacionCodigo", "ProductoId", "Cantidad", "PrecioUnitario", "IVA", "Total" FROM "FacturaVentaDetalle_reordenada"
  ) OR EXISTS (
    SELECT "Id", "FacturaVentaId", "CompaniaCodigo", "CentroOperacionCodigo", "ProductoId", "Cantidad", "PrecioUnitario", "IVA", "Total" FROM "FacturaVentaDetalle_reordenada"
    EXCEPT ALL
    SELECT "Id", "FacturaVentaId", "CompaniaCodigo", "CentroOperacionCodigo", "ProductoId", "Cantidad", "PrecioUnitario", "IVA", "Total" FROM "FacturaVentaDetalle"
  ) THEN
    RAISE EXCEPTION 'Los datos originales de detalle no coinciden; se cancela la reorganización';
  END IF;
END $$;

ALTER TABLE "FacturaDetalle" RENAME TO "FacturaDetalle_backup_20261015";
ALTER TABLE "FacturaVentaDetalle" RENAME TO "FacturaVentaDetalle_backup_20261015";
ALTER TABLE "FacturaDetalle_backup_20261015" RENAME CONSTRAINT "FacturaDetalle_pkey" TO "FacturaDetalle_backup_20261015_pkey";
ALTER TABLE "FacturaVentaDetalle_backup_20261015" RENAME CONSTRAINT "FacturaVentaDetalle_pkey" TO "FacturaVentaDetalle_backup_20261015_pkey";

ALTER TABLE "FacturaDetalle_reordenada" RENAME TO "FacturaDetalle";
ALTER TABLE "FacturaVentaDetalle_reordenada" RENAME TO "FacturaVentaDetalle";

ALTER TABLE "FacturaDetalle" RENAME CONSTRAINT "FacturaDetalle_reordenada_pkey" TO "FacturaDetalle_pkey";
ALTER TABLE "FacturaDetalle" RENAME CONSTRAINT "FacturaDetalle_reordenada_FacturaId_fkey" TO "FacturaDetalle_FacturaId_fkey";
ALTER TABLE "FacturaDetalle" RENAME CONSTRAINT "FacturaDetalle_reordenada_CompaniaCodigo_fkey" TO "FacturaDetalle_CompaniaCodigo_fkey";
ALTER TABLE "FacturaDetalle" RENAME CONSTRAINT "FacturaDetalle_reordenada_CentroOperacionCodigo_fkey" TO "FacturaDetalle_CentroOperacionCodigo_fkey";
ALTER TABLE "FacturaDetalle" RENAME CONSTRAINT "FacturaDetalle_reordenada_ProductoId_fkey" TO "FacturaDetalle_ProductoId_fkey";

ALTER TABLE "FacturaVentaDetalle" RENAME CONSTRAINT "FacturaVentaDetalle_reordenada_pkey" TO "FacturaVentaDetalle_pkey";
ALTER TABLE "FacturaVentaDetalle" RENAME CONSTRAINT "FacturaVentaDetalle_reordenada_FacturaVentaId_fkey" TO "FacturaVentaDetalle_FacturaVentaId_fkey";
ALTER TABLE "FacturaVentaDetalle" RENAME CONSTRAINT "FacturaVentaDetalle_reordenada_CompaniaCodigo_fkey" TO "FacturaVentaDetalle_CompaniaCodigo_fkey";
ALTER TABLE "FacturaVentaDetalle" RENAME CONSTRAINT "FacturaVentaDetalle_reordenada_CentroOperacionCodigo_fkey" TO "FacturaVentaDetalle_CentroOperacionCodigo_fkey";
ALTER TABLE "FacturaVentaDetalle" RENAME CONSTRAINT "FacturaVentaDetalle_reordenada_ProductoId_fkey" TO "FacturaVentaDetalle_ProductoId_fkey";

COMMIT;
