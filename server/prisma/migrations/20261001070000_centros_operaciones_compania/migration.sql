ALTER TABLE "CentrosOperaciones"
ADD COLUMN "CompaniaCodigo" VARCHAR(3) NOT NULL DEFAULT '004';

ALTER TABLE "CentrosOperaciones"
ADD CONSTRAINT "CentrosOperaciones_CompaniaCodigo_fkey"
FOREIGN KEY ("CompaniaCodigo") REFERENCES "Compania"("Codigo")
ON DELETE RESTRICT ON UPDATE CASCADE;