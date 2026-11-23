-- Reservas en linea hechas por los clientes desde /reservar/<restaurante>.
CREATE TABLE IF NOT EXISTS "ReservasMesa" (
    "Id" UUID NOT NULL,
    "MesaId" INTEGER NOT NULL,
    "FechaHora" TIMESTAMP(3) NOT NULL,
    "DuracionMin" INTEGER NOT NULL DEFAULT 60,
    "Personas" INTEGER NOT NULL,
    "Zona" VARCHAR(50) NOT NULL DEFAULT 'RESTAURANTE',
    "Nombre" VARCHAR(150) NOT NULL,
    "Celular" VARCHAR(20) NOT NULL,
    "Email" VARCHAR(150) NOT NULL,
    "Comentarios" TEXT,
    "Estado" VARCHAR(20) NOT NULL DEFAULT 'CONFIRMADA',
    "AceptaMarketing" BOOLEAN NOT NULL DEFAULT false,
    "Origen" VARCHAR(20) NOT NULL DEFAULT 'WEB',
    "FechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "FechaActualizacion" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReservasMesa_pkey" PRIMARY KEY ("Id"),
    CONSTRAINT "ReservasMesa_MesaId_fkey" FOREIGN KEY ("MesaId") REFERENCES "Mesa"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ReservasMesa_MesaId_FechaHora_idx" ON "ReservasMesa"("MesaId", "FechaHora");
CREATE INDEX IF NOT EXISTS "ReservasMesa_FechaHora_idx" ON "ReservasMesa"("FechaHora");
