-- CreateTable
CREATE TABLE "Empresa" (
    "Id" UUID NOT NULL,
    "Nit" VARCHAR(20),
    "RazonSocial" VARCHAR(250),
    "NombreComercial" VARCHAR(250),
    "Direccion" TEXT,
    "Telefono" VARCHAR(50),
    "Correo" VARCHAR(150),
    "CertificadoDigital" BYTEA,
    "PasswordCertificado" VARCHAR(200),
    "SoftwareId" VARCHAR(100),
    "SoftwarePin" VARCHAR(100),
    "AmbienteDIAN" VARCHAR(20),
    "FechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("Id")
);
