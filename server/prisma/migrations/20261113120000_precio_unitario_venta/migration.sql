-- PrecioUnitario guarda el precio real de venta (impuesto incluido), no la base sin impuesto.
UPDATE "FacturaDetalle" SET "PrecioUnitario" = ROUND(("Total" / "Cantidad")::numeric, 2)
WHERE "Cantidad" > 0 AND "PrecioUnitario" <> ROUND(("Total" / "Cantidad")::numeric, 2);
UPDATE "FacturaVentaDetalle" SET "PrecioUnitario" = ROUND(("Total" / "Cantidad")::numeric, 2)
WHERE "Cantidad" > 0 AND "PrecioUnitario" <> ROUND(("Total" / "Cantidad")::numeric, 2);