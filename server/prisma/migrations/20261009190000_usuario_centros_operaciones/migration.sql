CREATE TABLE "UsuarioCentrosOperaciones" (
  "UsuarioId" UUID NOT NULL,
  "CentroOperacionCodigo" VARCHAR(10) NOT NULL,
  CONSTRAINT "UsuarioCentrosOperaciones_pkey" PRIMARY KEY ("UsuarioId", "CentroOperacionCodigo"),
  CONSTRAINT "UsuarioCentrosOperaciones_UsuarioId_fkey"
    FOREIGN KEY ("UsuarioId") REFERENCES "Usuarios"("Id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UsuarioCentrosOperaciones_CentroOperacionCodigo_fkey"
    FOREIGN KEY ("CentroOperacionCodigo") REFERENCES "CentrosOperaciones"("Codigo") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "UsuarioCentrosOperaciones_CentroOperacionCodigo_idx"
  ON "UsuarioCentrosOperaciones" ("CentroOperacionCodigo");
