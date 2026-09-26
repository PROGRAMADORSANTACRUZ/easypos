-- CreateTable
CREATE TABLE "FacturaDetalle" (
    "Id" UUID NOT NULL,
    "FacturaId" UUID,
    "ProductoId" UUID,
    "Cantidad" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "PrecioUnitario" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "IVA" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "Total" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "FacturaDetalle_pkey" PRIMARY KEY ("Id")
);

-- AddForeignKey
ALTER TABLE "FacturaDetalle" ADD CONSTRAINT "FacturaDetalle_FacturaId_fkey" FOREIGN KEY ("FacturaId") REFERENCES "Factura"("Id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaDetalle" ADD CONSTRAINT "FacturaDetalle_ProductoId_fkey" FOREIGN KEY ("ProductoId") REFERENCES "Producto"("Id") ON DELETE SET NULL ON UPDATE CASCADE;
