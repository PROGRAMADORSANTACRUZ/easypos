-- CreateTable
CREATE TABLE "RetencionesFactura" (
    "Id" UUID NOT NULL,
    "FacturaId" UUID,
    "Tipo" VARCHAR(20),
    "Base" DOUBLE PRECISION,
    "Porcentaje" DOUBLE PRECISION,
    "Valor" DOUBLE PRECISION,
    "Fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetencionesFactura_pkey" PRIMARY KEY ("Id")
);

-- AddForeignKey
ALTER TABLE "RetencionesFactura" ADD CONSTRAINT "RetencionesFactura_FacturaId_fkey" FOREIGN KEY ("FacturaId") REFERENCES "Factura"("Id") ON DELETE CASCADE ON UPDATE CASCADE;
