ALTER TABLE "Productos"
  ADD COLUMN "SiesaIdCia" VARCHAR(20),
  ADD COLUMN "SiesaId" VARCHAR(50),
  ADD COLUMN "SiesaRowid" VARCHAR(50),
  ADD COLUMN "SiesaDescripcion" TEXT,
  ADD COLUMN "SiesaDescripcionCorta" TEXT,
  ADD COLUMN "SiesaIdGrupoImpositivo" VARCHAR(50),
  ADD COLUMN "SiesaIdTipoInv" VARCHAR(50),
  ADD COLUMN "SiesaIndTipoItem" INTEGER,
  ADD COLUMN "SiesaIndCompra" INTEGER,
  ADD COLUMN "SiesaIndVenta" INTEGER,
  ADD COLUMN "SiesaIndManufactura" INTEGER;