CREATE TABLE "PaisesSiesa" (
  "Codigo" VARCHAR(3) NOT NULL,
  "Nombre" VARCHAR(100) NOT NULL,
  CONSTRAINT "PaisesSiesa_pkey" PRIMARY KEY ("Codigo")
);

CREATE TABLE "DepartamentosSiesa" (
  "Codigo" VARCHAR(5) NOT NULL,
  "PaisCodigo" VARCHAR(3) NOT NULL,
  "Nombre" VARCHAR(100) NOT NULL,
  CONSTRAINT "DepartamentosSiesa_pkey" PRIMARY KEY ("Codigo"),
  CONSTRAINT "DepartamentosSiesa_PaisCodigo_fkey"
    FOREIGN KEY ("PaisCodigo") REFERENCES "PaisesSiesa"("Codigo") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "DepartamentosSiesa_PaisCodigo_idx" ON "DepartamentosSiesa" ("PaisCodigo");

CREATE TABLE "CiudadesSiesa" (
  "Codigo" VARCHAR(8) NOT NULL,
  "DepartamentoCodigo" VARCHAR(5) NOT NULL,
  "Nombre" VARCHAR(120) NOT NULL,
  CONSTRAINT "CiudadesSiesa_pkey" PRIMARY KEY ("Codigo"),
  CONSTRAINT "CiudadesSiesa_DepartamentoCodigo_fkey"
    FOREIGN KEY ("DepartamentoCodigo") REFERENCES "DepartamentosSiesa"("Codigo") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "CiudadesSiesa_DepartamentoCodigo_idx" ON "CiudadesSiesa" ("DepartamentoCodigo");

ALTER TABLE "Cliente" ADD COLUMN "MunicipioSiesaCodigo" VARCHAR(8);
ALTER TABLE "Cliente"
  ADD CONSTRAINT "Cliente_MunicipioSiesaCodigo_fkey"
    FOREIGN KEY ("MunicipioSiesaCodigo") REFERENCES "CiudadesSiesa"("Codigo") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Cliente_MunicipioSiesaCodigo_idx" ON "Cliente" ("MunicipioSiesaCodigo");
