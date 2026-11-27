-- Impresora predeterminada de prefacturas y facturas para todos los celulares.
ALTER TABLE "Impresoras" ADD COLUMN IF NOT EXISTS "Tirillas" BOOLEAN NOT NULL DEFAULT false;
