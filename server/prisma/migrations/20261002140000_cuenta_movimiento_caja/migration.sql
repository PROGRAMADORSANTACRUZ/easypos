ALTER TABLE "MovimientosCaja" ADD COLUMN "CuentaContableId" UUID;

ALTER TABLE "MovimientosCaja" ADD CONSTRAINT "MovimientosCaja_CuentaContableId_fkey"
    FOREIGN KEY ("CuentaContableId") REFERENCES "CuentasContables"("Id") ON DELETE SET NULL ON UPDATE CASCADE;
