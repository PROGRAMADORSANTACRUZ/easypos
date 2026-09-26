-- CreateTable
CREATE TABLE "Cortesias" (
    "Id" UUID NOT NULL,
    "Consecutivo" INTEGER NOT NULL,
    "Numero" VARCHAR(30) NOT NULL,
    "ClienteId" UUID,
    "Motivo" VARCHAR(200),
    "Observaciones" TEXT,
    "Subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "UsuarioId" UUID,
    "Fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cortesias_pkey" PRIMARY KEY ("Id")
);

-- CreateTable
CREATE TABLE "CortesiasDetalle" (
    "Id" UUID NOT NULL,
    "CortesiaId" UUID NOT NULL,
    "ProductoId" UUID NOT NULL,
    "Cantidad" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "PrecioUnitario" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "Total" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "CortesiasDetalle_pkey" PRIMARY KEY ("Id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cortesias_Consecutivo_key" ON "Cortesias"("Consecutivo");

-- CreateIndex
CREATE UNIQUE INDEX "Cortesias_Numero_key" ON "Cortesias"("Numero");

-- AddForeignKey
ALTER TABLE "Cortesias" ADD CONSTRAINT "Cortesias_ClienteId_fkey" FOREIGN KEY ("ClienteId") REFERENCES "Cliente"("Id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CortesiasDetalle" ADD CONSTRAINT "CortesiasDetalle_CortesiaId_fkey" FOREIGN KEY ("CortesiaId") REFERENCES "Cortesias"("Id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CortesiasDetalle" ADD CONSTRAINT "CortesiasDetalle_ProductoId_fkey" FOREIGN KEY ("ProductoId") REFERENCES "Producto"("Id") ON DELETE RESTRICT ON UPDATE CASCADE;
