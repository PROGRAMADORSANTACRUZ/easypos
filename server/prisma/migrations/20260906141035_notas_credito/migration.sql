-- CreateTable
CREATE TABLE "NotasCredito" (
    "Id" UUID NOT NULL,
    "FacturaId" UUID,
    "NumeroNota" VARCHAR(50),
    "Motivo" TEXT,
    "Total" DOUBLE PRECISION,
    "EstadoDIAN" VARCHAR(50),
    "Fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotasCredito_pkey" PRIMARY KEY ("Id")
);

-- AddForeignKey
ALTER TABLE "NotasCredito" ADD CONSTRAINT "NotasCredito_FacturaId_fkey" FOREIGN KEY ("FacturaId") REFERENCES "Factura"("Id") ON DELETE CASCADE ON UPDATE CASCADE;
