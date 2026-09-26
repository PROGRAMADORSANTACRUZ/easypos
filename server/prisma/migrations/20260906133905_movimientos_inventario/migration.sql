-- CreateTable
CREATE TABLE "MovimientoInventario" (
    "Id" UUID NOT NULL,
    "ProductoId" UUID,
    "BodegaId" UUID,
    "TipoMovimiento" VARCHAR(20),
    "Cantidad" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "CostoUnitario" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "DocumentoReferencia" VARCHAR(50),
    "Fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoInventario_pkey" PRIMARY KEY ("Id")
);

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_ProductoId_fkey" FOREIGN KEY ("ProductoId") REFERENCES "Producto"("Id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_BodegaId_fkey" FOREIGN KEY ("BodegaId") REFERENCES "Bodega"("Id") ON DELETE SET NULL ON UPDATE CASCADE;
