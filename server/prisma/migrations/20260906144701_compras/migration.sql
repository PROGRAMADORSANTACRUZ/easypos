-- CreateTable
CREATE TABLE "Compras" (
    "Id" UUID NOT NULL,
    "ProveedorId" UUID,
    "Fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "Subtotal" DOUBLE PRECISION,
    "IVA" DOUBLE PRECISION,
    "Total" DOUBLE PRECISION,

    CONSTRAINT "Compras_pkey" PRIMARY KEY ("Id")
);
