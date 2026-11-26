-- Impresoras termicas del local. Solo agrega una tabla nueva: no modifica Categoria ni nada existente.
CREATE TABLE IF NOT EXISTS "Impresoras" (
  "Id" UUID NOT NULL,
  "Nombre" VARCHAR(60) NOT NULL,
  "Ip" VARCHAR(15) NOT NULL,
  "Puerto" INTEGER NOT NULL DEFAULT 9100,
  "Papel" INTEGER NOT NULL DEFAULT 80,
  "Orden" INTEGER NOT NULL DEFAULT 0,
  "CategoriaIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "FechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Impresoras_pkey" PRIMARY KEY ("Id")
);