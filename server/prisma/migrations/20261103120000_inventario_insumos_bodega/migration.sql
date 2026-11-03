ALTER TABLE "Pedido"
ADD COLUMN "InventarioDescontado" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Pedido"
SET "InventarioDescontado" = true
WHERE "estado" = 'ABIERTO';

CREATE TABLE "InventarioItemsBodegas" (
    "ItemId" INTEGER NOT NULL,
    "BodegaId" UUID NOT NULL,
    "Stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "InventarioItemsBodegas_pkey" PRIMARY KEY ("ItemId", "BodegaId"),
    CONSTRAINT "InventarioItemsBodegas_ItemId_fkey" FOREIGN KEY ("ItemId") REFERENCES "InventarioItem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventarioItemsBodegas_BodegaId_fkey" FOREIGN KEY ("BodegaId") REFERENCES "Bodega"("Id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "InventarioItemsBodegas_BodegaId_idx" ON "InventarioItemsBodegas"("BodegaId");

DO $$
DECLARE
    compras_bodega_id UUID;
BEGIN
    SELECT "Id" INTO compras_bodega_id
    FROM "Bodega"
    WHERE UPPER(BTRIM("Nombre")) = 'COMPRAS'
    ORDER BY "Id"
    LIMIT 1;

    IF compras_bodega_id IS NULL THEN
        compras_bodega_id := gen_random_uuid();
        INSERT INTO "Bodega" ("Id", "Nombre") VALUES (compras_bodega_id, 'Compras');
    END IF;

    INSERT INTO "InventarioItemsBodegas" ("ItemId", "BodegaId", "Stock")
    SELECT "id", compras_bodega_id, "stock"
    FROM "InventarioItem";
END $$;
