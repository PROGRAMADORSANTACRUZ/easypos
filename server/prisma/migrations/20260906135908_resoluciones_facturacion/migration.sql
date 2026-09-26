-- CreateTable
CREATE TABLE "ResolucionesFacturacion" (
    "Id" UUID NOT NULL,
    "Prefijo" VARCHAR(20),
    "NumeroResolucion" VARCHAR(50),
    "RangoInicial" BIGINT,
    "RangoFinal" BIGINT,
    "SiguienteNumero" BIGINT,
    "FechaInicio" DATE,
    "FechaFin" DATE,

    CONSTRAINT "ResolucionesFacturacion_pkey" PRIMARY KEY ("Id")
);
