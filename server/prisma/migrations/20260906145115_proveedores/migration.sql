-- CreateTable
CREATE TABLE "Proveedores" (
    "Id" UUID NOT NULL,
    "Nombre" VARCHAR(200) NOT NULL,
    "Nit" VARCHAR(30),
    "Telefono" VARCHAR(50),
    "Email" VARCHAR(150),
    "Direccion" TEXT,
    "Activo" BOOLEAN NOT NULL DEFAULT true,
    "FechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proveedores_pkey" PRIMARY KEY ("Id")
);

-- AddForeignKey
ALTER TABLE "Compras" ADD CONSTRAINT "Compras_ProveedorId_fkey" FOREIGN KEY ("ProveedorId") REFERENCES "Proveedores"("Id") ON DELETE SET NULL ON UPDATE CASCADE;
