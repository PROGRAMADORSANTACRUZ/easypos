ALTER TABLE "Mesa"
ADD COLUMN IF NOT EXISTS "reservaClienteId" UUID;

CREATE INDEX IF NOT EXISTS "Mesa_reservaClienteId_idx"
ON "Mesa"("reservaClienteId");

DO $$ BEGIN
  ALTER TABLE "Mesa" ADD CONSTRAINT "Mesa_reservaClienteId_fkey"
    FOREIGN KEY ("reservaClienteId") REFERENCES "Cliente"("Id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
