-- AlterTable
ALTER TABLE "Bodega" ADD COLUMN     "SucursalId" UUID;

-- CreateTable
CREATE TABLE "Sucursales" (
    "Id" UUID NOT NULL,
    "Codigo" VARCHAR(20),
    "Nombre" VARCHAR(200) NOT NULL,
    "Direccion" TEXT,
    "Telefono" VARCHAR(50),
    "Ciudad" VARCHAR(100),
    "Activo" BOOLEAN NOT NULL DEFAULT true,
    "FechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sucursales_pkey" PRIMARY KEY ("Id")
);

-- CreateTable
CREATE TABLE "ListaPrecios" (
    "Id" UUID NOT NULL,
    "Nombre" VARCHAR(150) NOT NULL,
    "Descripcion" TEXT,
    "Activo" BOOLEAN NOT NULL DEFAULT true,
    "FechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListaPrecios_pkey" PRIMARY KEY ("Id")
);

-- CreateTable
CREATE TABLE "ProductoListaPrecio" (
    "Id" UUID NOT NULL,
    "ListaPrecioId" UUID NOT NULL,
    "ProductoId" UUID NOT NULL,
    "Precio" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ProductoListaPrecio_pkey" PRIMARY KEY ("Id")
);

-- CreateTable
CREATE TABLE "Promociones" (
    "Id" UUID NOT NULL,
    "Nombre" VARCHAR(200) NOT NULL,
    "Tipo" VARCHAR(30),
    "Valor" DOUBLE PRECISION,
    "FechaInicio" DATE,
    "FechaFin" DATE,
    "Activo" BOOLEAN NOT NULL DEFAULT true,
    "FechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Promociones_pkey" PRIMARY KEY ("Id")
);

-- CreateTable
CREATE TABLE "ComisionesVendedores" (
    "Id" UUID NOT NULL,
    "VendedorId" UUID,
    "FacturaId" UUID,
    "Base" DOUBLE PRECISION,
    "Porcentaje" DOUBLE PRECISION,
    "Valor" DOUBLE PRECISION,
    "Pagada" BOOLEAN NOT NULL DEFAULT false,
    "Fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComisionesVendedores_pkey" PRIMARY KEY ("Id")
);

-- CreateTable
CREATE TABLE "Cotizaciones" (
    "Id" UUID NOT NULL,
    "Numero" VARCHAR(50),
    "ClienteId" UUID,
    "Fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ValidezDias" INTEGER,
    "Subtotal" DOUBLE PRECISION,
    "IVA" DOUBLE PRECISION,
    "Total" DOUBLE PRECISION,
    "Estado" VARCHAR(20) NOT NULL DEFAULT 'BORRADOR',
    "Observaciones" TEXT,

    CONSTRAINT "Cotizaciones_pkey" PRIMARY KEY ("Id")
);

-- CreateTable
CREATE TABLE "Remisiones" (
    "Id" UUID NOT NULL,
    "Numero" VARCHAR(50),
    "ClienteId" UUID,
    "Fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "Estado" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    "Observaciones" TEXT,

    CONSTRAINT "Remisiones_pkey" PRIMARY KEY ("Id")
);

-- CreateTable
CREATE TABLE "MetodosPago" (
    "Id" UUID NOT NULL,
    "Nombre" VARCHAR(100) NOT NULL,
    "CodigoDIAN" VARCHAR(10),
    "Activo" BOOLEAN NOT NULL DEFAULT true,
    "FechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetodosPago_pkey" PRIMARY KEY ("Id")
);

-- CreateTable
CREATE TABLE "Pagos" (
    "Id" UUID NOT NULL,
    "FacturaId" UUID,
    "MetodoPagoId" UUID,
    "Monto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "Referencia" VARCHAR(100),
    "Fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pagos_pkey" PRIMARY KEY ("Id")
);

-- CreateTable
CREATE TABLE "Terceros" (
    "Id" UUID NOT NULL,
    "TipoDocumento" VARCHAR(10),
    "NumeroDocumento" VARCHAR(30),
    "Nombre" VARCHAR(250) NOT NULL,
    "Tipo" VARCHAR(20),
    "Telefono" VARCHAR(50),
    "Email" VARCHAR(150),
    "Direccion" TEXT,
    "Activo" BOOLEAN NOT NULL DEFAULT true,
    "FechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Terceros_pkey" PRIMARY KEY ("Id")
);

-- CreateTable
CREATE TABLE "CentrosCosto" (
    "Id" UUID NOT NULL,
    "Codigo" VARCHAR(20),
    "Nombre" VARCHAR(150) NOT NULL,
    "Activo" BOOLEAN NOT NULL DEFAULT true,
    "FechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CentrosCosto_pkey" PRIMARY KEY ("Id")
);

-- CreateTable
CREATE TABLE "Impuestos" (
    "Id" UUID NOT NULL,
    "Nombre" VARCHAR(100) NOT NULL,
    "Tipo" VARCHAR(30),
    "Porcentaje" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "CodigoDIAN" VARCHAR(10),
    "Activo" BOOLEAN NOT NULL DEFAULT true,
    "FechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Impuestos_pkey" PRIMARY KEY ("Id")
);

-- CreateTable
CREATE TABLE "EventosDIAN" (
    "Id" UUID NOT NULL,
    "FacturaId" UUID,
    "TipoEvento" VARCHAR(50),
    "Estado" VARCHAR(50),
    "CUFE" VARCHAR(200),
    "Mensaje" TEXT,
    "Fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventosDIAN_pkey" PRIMARY KEY ("Id")
);

-- CreateTable
CREATE TABLE "LogIntegraciones" (
    "Id" UUID NOT NULL,
    "Sistema" VARCHAR(50),
    "Tipo" VARCHAR(50),
    "Estado" VARCHAR(30),
    "Request" TEXT,
    "Response" TEXT,
    "Mensaje" TEXT,
    "Fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogIntegraciones_pkey" PRIMARY KEY ("Id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductoListaPrecio_ListaPrecioId_ProductoId_key" ON "ProductoListaPrecio"("ListaPrecioId", "ProductoId");

-- AddForeignKey
ALTER TABLE "Bodega" ADD CONSTRAINT "Bodega_SucursalId_fkey" FOREIGN KEY ("SucursalId") REFERENCES "Sucursales"("Id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoListaPrecio" ADD CONSTRAINT "ProductoListaPrecio_ListaPrecioId_fkey" FOREIGN KEY ("ListaPrecioId") REFERENCES "ListaPrecios"("Id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoListaPrecio" ADD CONSTRAINT "ProductoListaPrecio_ProductoId_fkey" FOREIGN KEY ("ProductoId") REFERENCES "Producto"("Id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComisionesVendedores" ADD CONSTRAINT "ComisionesVendedores_VendedorId_fkey" FOREIGN KEY ("VendedorId") REFERENCES "Usuarios"("Id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComisionesVendedores" ADD CONSTRAINT "ComisionesVendedores_FacturaId_fkey" FOREIGN KEY ("FacturaId") REFERENCES "Factura"("Id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cotizaciones" ADD CONSTRAINT "Cotizaciones_ClienteId_fkey" FOREIGN KEY ("ClienteId") REFERENCES "Cliente"("Id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remisiones" ADD CONSTRAINT "Remisiones_ClienteId_fkey" FOREIGN KEY ("ClienteId") REFERENCES "Cliente"("Id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagos" ADD CONSTRAINT "Pagos_FacturaId_fkey" FOREIGN KEY ("FacturaId") REFERENCES "Factura"("Id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagos" ADD CONSTRAINT "Pagos_MetodoPagoId_fkey" FOREIGN KEY ("MetodoPagoId") REFERENCES "MetodosPago"("Id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventosDIAN" ADD CONSTRAINT "EventosDIAN_FacturaId_fkey" FOREIGN KEY ("FacturaId") REFERENCES "Factura"("Id") ON DELETE SET NULL ON UPDATE CASCADE;
