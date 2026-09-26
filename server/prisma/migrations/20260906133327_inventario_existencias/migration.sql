-- CreateTable
CREATE TABLE "Inventario" (
    "Id" UUID NOT NULL,
    "ProductoId" UUID,
    "BodegaId" UUID,
    "Cantidad" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "Inventario_pkey" PRIMARY KEY ("Id")
);

-- AddForeignKey
ALTER TABLE "Inventario" ADD CONSTRAINT "Inventario_ProductoId_fkey" FOREIGN KEY ("ProductoId") REFERENCES "Producto"("Id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventario" ADD CONSTRAINT "Inventario_BodegaId_fkey" FOREIGN KEY ("BodegaId") REFERENCES "Bodega"("Id") ON DELETE SET NULL ON UPDATE CASCADE;
