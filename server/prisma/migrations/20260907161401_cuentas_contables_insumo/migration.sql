-- AlterTable
ALTER TABLE "InventarioItem" ADD COLUMN     "cuentaContableId" UUID;

-- CreateTable
CREATE TABLE "CuentasContables" (
    "Id" UUID NOT NULL,
    "Codigo" VARCHAR(20) NOT NULL,
    "Nombre" VARCHAR(200) NOT NULL,
    "Tipo" VARCHAR(20),
    "Activo" BOOLEAN NOT NULL DEFAULT true,
    "FechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CuentasContables_pkey" PRIMARY KEY ("Id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CuentasContables_Codigo_key" ON "CuentasContables"("Codigo");

-- AddForeignKey
ALTER TABLE "InventarioItem" ADD CONSTRAINT "InventarioItem_cuentaContableId_fkey" FOREIGN KEY ("cuentaContableId") REFERENCES "CuentasContables"("Id") ON DELETE SET NULL ON UPDATE CASCADE;
