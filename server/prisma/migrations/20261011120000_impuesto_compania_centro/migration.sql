ALTER TABLE "Impuestos"
  ADD COLUMN "CompaniaCodigo" VARCHAR(3),
  ADD COLUMN "CentroOperacionCodigo" VARCHAR(10);

ALTER TABLE "Impuestos"
  ADD CONSTRAINT "Impuestos_CompaniaCodigo_fkey"
    FOREIGN KEY ("CompaniaCodigo") REFERENCES "Compania"("Codigo") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Impuestos_CentroOperacionCodigo_fkey"
    FOREIGN KEY ("CentroOperacionCodigo") REFERENCES "CentrosOperaciones"("Codigo") ON DELETE SET NULL ON UPDATE CASCADE;
