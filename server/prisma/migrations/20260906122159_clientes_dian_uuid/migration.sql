/*
  Warnings:

  - The primary key for the `Cliente` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `createdAt` on the `Cliente` table. All the data in the column will be lost.
  - You are about to drop the column `direccion` on the `Cliente` table. All the data in the column will be lost.
  - You are about to drop the column `email` on the `Cliente` table. All the data in the column will be lost.
  - You are about to drop the column `id` on the `Cliente` table. All the data in the column will be lost.
  - You are about to drop the column `telefono` on the `Cliente` table. All the data in the column will be lost.
  - The `clienteId` column on the `Pedido` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The required column `Id` was added to the `Cliente` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- DropForeignKey
ALTER TABLE "Pedido" DROP CONSTRAINT "Pedido_clienteId_fkey";

-- AlterTable
ALTER TABLE "Cliente" DROP CONSTRAINT "Cliente_pkey",
DROP COLUMN "createdAt",
DROP COLUMN "direccion",
DROP COLUMN "email",
DROP COLUMN "id",
DROP COLUMN "telefono",
ADD COLUMN     "Direccion" TEXT,
ADD COLUMN     "Email" VARCHAR(150),
ADD COLUMN     "FechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "Id" UUID NOT NULL,
ADD COLUMN     "MunicipioCodigo" VARCHAR(10),
ADD COLUMN     "NumeroDocumento" VARCHAR(20),
ADD COLUMN     "RazonSocial" VARCHAR(200),
ADD COLUMN     "ResponsableIVA" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "Telefono" VARCHAR(50),
ADD COLUMN     "TipoDocumento" VARCHAR(10),
ADD CONSTRAINT "Cliente_pkey" PRIMARY KEY ("Id");

-- AlterTable
ALTER TABLE "Pedido" DROP COLUMN "clienteId",
ADD COLUMN     "clienteId" UUID;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("Id") ON DELETE SET NULL ON UPDATE CASCADE;
