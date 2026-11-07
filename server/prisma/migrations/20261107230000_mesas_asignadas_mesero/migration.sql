BEGIN;

ALTER TABLE "Mesa" ADD COLUMN "usuarioAsignadoId" UUID;
ALTER TABLE "Mesa" ADD CONSTRAINT "Mesa_usuarioAsignadoId_fkey"
  FOREIGN KEY ("usuarioAsignadoId") REFERENCES "Usuarios"("Id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Mesa_usuarioAsignadoId_idx" ON "Mesa"("usuarioAsignadoId");

COMMIT;