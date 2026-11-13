-- La propina usa la referencia Siesa 10600 (antes 0000) en todas las lineas de detalle.
UPDATE "FacturaDetalle" SET "CodigoProducto" = '10600'
WHERE "ProductoId" IS NULL AND "CodigoProducto" = '0000' AND upper("NombreProducto") = 'PROPINA';

UPDATE "FacturaVentaDetalle" SET "CodigoProducto" = '10600'
WHERE "ProductoId" IS NULL AND "CodigoProducto" = '0000' AND upper("NombreProducto") = 'PROPINA';