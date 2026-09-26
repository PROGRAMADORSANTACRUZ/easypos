-- AlterTable
ALTER TABLE "Factura" ADD COLUMN     "AperturaId" UUID;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_AperturaId_fkey" FOREIGN KEY ("AperturaId") REFERENCES "AperturasCaja"("Id") ON DELETE SET NULL ON UPDATE CASCADE;
