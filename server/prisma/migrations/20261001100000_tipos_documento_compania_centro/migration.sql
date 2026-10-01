ALTER TABLE "TiposDocumento"
ADD COLUMN "CompaniaCodigo" VARCHAR(3),
ADD COLUMN "CentroOperacionCodigo" VARCHAR(10);

ALTER TABLE "TiposDocumento"
ADD CONSTRAINT "TiposDocumento_CompaniaCodigo_fkey"
FOREIGN KEY ("CompaniaCodigo") REFERENCES "Compania"("Codigo")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TiposDocumento"
ADD CONSTRAINT "TiposDocumento_CentroOperacionCodigo_fkey"
FOREIGN KEY ("CentroOperacionCodigo") REFERENCES "CentrosOperaciones"("Codigo")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TiposDocumento"
ADD CONSTRAINT "TiposDocumento_compania_centro_check"
CHECK (("CompaniaCodigo" IS NULL) = ("CentroOperacionCodigo" IS NULL));
