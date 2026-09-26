/*
  Warnings:

  - The primary key for the `Categoria` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `Categoria` table. All the data in the column will be lost.
  - You are about to drop the column `nombre` on the `Categoria` table. All the data in the column will be lost.
  - The `categoriaId` column on the `Producto` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[Nombre]` on the table `Categoria` will be added. If there are existing duplicate values, this will fail.
  - The required column `Id` was added to the `Categoria` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Added the required column `Nombre` to the `Categoria` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Producto" DROP CONSTRAINT "Producto_categoriaId_fkey";

-- DropIndex
DROP INDEX "Categoria_nombre_key";

-- AlterTable
ALTER TABLE "Categoria" DROP CONSTRAINT "Categoria_pkey",
DROP COLUMN "id",
DROP COLUMN "nombre",
ADD COLUMN     "Id" UUID NOT NULL,
ADD COLUMN     "Nombre" VARCHAR(100) NOT NULL,
ADD CONSTRAINT "Categoria_pkey" PRIMARY KEY ("Id");

-- AlterTable
ALTER TABLE "Producto" DROP COLUMN "categoriaId",
ADD COLUMN     "categoriaId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "Categoria_Nombre_key" ON "Categoria"("Nombre");

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("Id") ON DELETE SET NULL ON UPDATE CASCADE;
