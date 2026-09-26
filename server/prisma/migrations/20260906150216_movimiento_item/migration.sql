-- AlterTable
ALTER TABLE "MovimientoInventario" ADD COLUMN     "ItemId" INTEGER;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_ItemId_fkey" FOREIGN KEY ("ItemId") REFERENCES "InventarioItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
