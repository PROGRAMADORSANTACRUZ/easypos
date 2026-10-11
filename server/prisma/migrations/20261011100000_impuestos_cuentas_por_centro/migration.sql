CREATE TABLE "ImpuestosCuentasCentro" (
  "Id" UUID NOT NULL,
  "ImpuestoId" UUID NOT NULL,
  "CompaniaCodigo" VARCHAR(3) NOT NULL,
  "CentroOperacionCodigo" VARCHAR(10) NOT NULL,
  "CtaCreditoVentas" VARCHAR(30),
  "CuentasBase" VARCHAR(30),
  "CuentasBaseDevoluciones" VARCHAR(30),
  "CtaDebitoVentas" VARCHAR(30),
  "CtaDebitoCompras" VARCHAR(30),
  "CtaCreditoCompras" VARCHAR(30),
  "FechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImpuestosCuentasCentro_pkey" PRIMARY KEY ("Id"),
  CONSTRAINT "ImpuestosCuentasCentro_ImpuestoId_fkey"
    FOREIGN KEY ("ImpuestoId") REFERENCES "Impuestos"("Id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ImpuestosCuentasCentro_CompaniaCodigo_fkey"
    FOREIGN KEY ("CompaniaCodigo") REFERENCES "Compania"("Codigo") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ImpuestosCuentasCentro_CentroOperacionCodigo_fkey"
    FOREIGN KEY ("CentroOperacionCodigo") REFERENCES "CentrosOperaciones"("Codigo") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ImpuestosCuentasCentro_ImpuestoId_CentroOperacionCodigo_key"
  ON "ImpuestosCuentasCentro" ("ImpuestoId", "CentroOperacionCodigo");

CREATE INDEX "ImpuestosCuentasCentro_CompaniaCodigo_CentroOperacionCodigo_idx"
  ON "ImpuestosCuentasCentro" ("CompaniaCodigo", "CentroOperacionCodigo");
