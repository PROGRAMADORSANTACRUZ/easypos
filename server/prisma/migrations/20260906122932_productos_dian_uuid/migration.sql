/*
  Warnings:

  - The primary key for the `Producto` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `activo` on the `Producto` table. All the data in the column will be lost.
  - You are about to drop the column `id` on the `Producto` table. All the data in the column will be lost.
  - You are about to drop the column `nombre` on the `Producto` table. All the data in the column will be lost.
  - You are about to drop the column `precio` on the `Producto` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[Codigo]` on the table `Producto` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `productoId` on the `KitComponente` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `productoId` on the `PedidoItem` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - The required column `Id` was added to the `Producto` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Added the required column `Nombre` to the `Producto` table without a default value. This is not possible if the table is not empty.
  - Added the required column `PrecioVenta` to the `Producto` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "KitComponente" DROP CONSTRAINT "KitComponente_productoId_fkey";

-- DropForeignKey
ALTER TABLE "PedidoItem" DROP CONSTRAINT "PedidoItem_productoId_fkey";

-- AlterTable
ALTER TABLE "KitComponente" DROP COLUMN "productoId",
ADD COLUMN     "productoId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "PedidoItem" DROP COLUMN "productoId",
ADD COLUMN     "productoId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "Producto" DROP CONSTRAINT "Producto_pkey",
DROP COLUMN "activo",
DROP COLUMN "id",
DROP COLUMN "nombre",
DROP COLUMN "precio",
ADD COLUMN     "Activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "Codigo" VARCHAR(50),
ADD COLUMN     "CodigoBarras" VARCHAR(50),
ADD COLUMN     "Costo" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "Descripcion" TEXT,
ADD COLUMN     "IVA" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "Id" UUID NOT NULL,
ADD COLUMN     "Nombre" VARCHAR(250) NOT NULL,
ADD COLUMN     "PrecioVenta" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "StockMinimo" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD CONSTRAINT "Producto_pkey" PRIMARY KEY ("Id");

-- CreateIndex
CREATE UNIQUE INDEX "KitComponente_productoId_itemId_key" ON "KitComponente"("productoId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "Producto_Codigo_key" ON "Producto"("Codigo");

-- AddForeignKey
ALTER TABLE "KitComponente" ADD CONSTRAINT "KitComponente_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("Id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoItem" ADD CONSTRAINT "PedidoItem_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("Id") ON DELETE RESTRICT ON UPDATE CASCADE;
