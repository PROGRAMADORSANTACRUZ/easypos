/*
  Warnings:

  - The primary key for the `Factura` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `createdAt` on the `Factura` table. All the data in the column will be lost.
  - You are about to drop the column `id` on the `Factura` table. All the data in the column will be lost.
  - You are about to drop the column `impuesto` on the `Factura` table. All the data in the column will be lost.
  - You are about to drop the column `subtotal` on the `Factura` table. All the data in the column will be lost.
  - You are about to drop the column `total` on the `Factura` table. All the data in the column will be lost.
  - Changed the type of `facturaId` on the `Abono` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `IVA` to the `Factura` table without a default value. This is not possible if the table is not empty.
  - The required column `Id` was added to the `Factura` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Added the required column `Subtotal` to the `Factura` table without a default value. This is not possible if the table is not empty.
  - Added the required column `Total` to the `Factura` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Abono" DROP CONSTRAINT "Abono_facturaId_fkey";

-- AlterTable
ALTER TABLE "Abono" DROP COLUMN "facturaId",
ADD COLUMN     "facturaId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "Factura" DROP CONSTRAINT "Factura_pkey",
DROP COLUMN "createdAt",
DROP COLUMN "id",
DROP COLUMN "impuesto",
DROP COLUMN "subtotal",
DROP COLUMN "total",
ADD COLUMN     "CUFE" VARCHAR(200),
ADD COLUMN     "ClienteId" UUID,
ADD COLUMN     "EstadoDIAN" VARCHAR(50),
ADD COLUMN     "Fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "IVA" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "Id" UUID NOT NULL,
ADD COLUMN     "NumeroFactura" VARCHAR(50),
ADD COLUMN     "PdfPath" TEXT,
ADD COLUMN     "Prefijo" VARCHAR(20),
ADD COLUMN     "Subtotal" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "Total" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "UsuarioId" UUID,
ADD COLUMN     "XmlPath" TEXT,
ADD CONSTRAINT "Factura_pkey" PRIMARY KEY ("Id");

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_ClienteId_fkey" FOREIGN KEY ("ClienteId") REFERENCES "Cliente"("Id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_UsuarioId_fkey" FOREIGN KEY ("UsuarioId") REFERENCES "Usuarios"("Id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Abono" ADD CONSTRAINT "Abono_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("Id") ON DELETE CASCADE ON UPDATE CASCADE;
