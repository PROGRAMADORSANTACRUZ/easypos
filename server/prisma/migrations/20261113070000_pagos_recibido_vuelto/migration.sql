-- Guarda lo que entrego el cliente y el vuelto de cada pago (ingreso/egreso real de caja).
ALTER TABLE "Pagos" ADD COLUMN IF NOT EXISTS "Recibido" DOUBLE PRECISION;
ALTER TABLE "Pagos" ADD COLUMN IF NOT EXISTS "Vuelto" DOUBLE PRECISION NOT NULL DEFAULT 0;
