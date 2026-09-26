-- CreateTable
CREATE TABLE "ComprasDetalle" (
    "Id" UUID NOT NULL,
    "CompraId" UUID NOT NULL,
    "ItemId" INTEGER,
    "Cantidad" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "CostoUnitario" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ComprasDetalle_pkey" PRIMARY KEY ("Id")
);

-- AddForeignKey
ALTER TABLE "ComprasDetalle" ADD CONSTRAINT "ComprasDetalle_CompraId_fkey" FOREIGN KEY ("CompraId") REFERENCES "Compras"("Id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComprasDetalle" ADD CONSTRAINT "ComprasDetalle_ItemId_fkey" FOREIGN KEY ("ItemId") REFERENCES "InventarioItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
