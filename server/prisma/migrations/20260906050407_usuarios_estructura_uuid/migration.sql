/*
  Warnings:

  - The `usuarioId` column on the `Auditoria` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `Usuario` table. If the table is not empty, all the data it contains will be lost.
  - Changed the type of `usuarioId` on the `UsuarioRol` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "Auditoria" DROP CONSTRAINT "Auditoria_usuarioId_fkey";

-- DropForeignKey
ALTER TABLE "UsuarioRol" DROP CONSTRAINT "UsuarioRol_usuarioId_fkey";

-- AlterTable
ALTER TABLE "Auditoria" DROP COLUMN "usuarioId",
ADD COLUMN     "usuarioId" UUID;

-- AlterTable
ALTER TABLE "UsuarioRol" DROP COLUMN "usuarioId",
ADD COLUMN     "usuarioId" UUID NOT NULL;

-- DropTable
DROP TABLE "Usuario";

-- CreateTable
CREATE TABLE "Usuarios" (
    "Id" UUID NOT NULL,
    "Usuario" VARCHAR(50) NOT NULL,
    "Nombre" VARCHAR(200) NOT NULL,
    "Correo" VARCHAR(150),
    "PasswordHash" TEXT NOT NULL,
    "Activo" BOOLEAN NOT NULL DEFAULT true,
    "FechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuarios_pkey" PRIMARY KEY ("Id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuarios_Usuario_key" ON "Usuarios"("Usuario");

-- CreateIndex
CREATE UNIQUE INDEX "UsuarioRol_usuarioId_rolId_key" ON "UsuarioRol"("usuarioId", "rolId");

-- AddForeignKey
ALTER TABLE "UsuarioRol" ADD CONSTRAINT "UsuarioRol_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuarios"("Id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuarios"("Id") ON DELETE SET NULL ON UPDATE CASCADE;
