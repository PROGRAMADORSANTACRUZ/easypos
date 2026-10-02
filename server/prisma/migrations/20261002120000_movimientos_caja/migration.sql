CREATE TABLE "MovimientosCaja" (
    "Id" UUID NOT NULL,
    "AperturaId" UUID NOT NULL,
    "UsuarioId" UUID,
    "Tipo" VARCHAR(10) NOT NULL,
    "Monto" DOUBLE PRECISION NOT NULL,
    "Motivo" VARCHAR(250) NOT NULL,
    "Fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientosCaja_pkey" PRIMARY KEY ("Id")
);

CREATE INDEX "MovimientosCaja_AperturaId_Fecha_idx" ON "MovimientosCaja"("AperturaId", "Fecha");

ALTER TABLE "MovimientosCaja" ADD CONSTRAINT "MovimientosCaja_AperturaId_fkey"
    FOREIGN KEY ("AperturaId") REFERENCES "AperturasCaja"("Id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MovimientosCaja" ADD CONSTRAINT "MovimientosCaja_UsuarioId_fkey"
    FOREIGN KEY ("UsuarioId") REFERENCES "Usuarios"("Id") ON DELETE SET NULL ON UPDATE CASCADE;