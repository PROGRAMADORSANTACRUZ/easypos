-- CreateTable
CREATE TABLE "AperturasCaja" (
    "Id" UUID NOT NULL,
    "CajaId" UUID,
    "UsuarioId" UUID,
    "ValorInicial" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "FechaApertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "FechaCierre" TIMESTAMP(3),
    "Estado" VARCHAR(20),

    CONSTRAINT "AperturasCaja_pkey" PRIMARY KEY ("Id")
);

-- AddForeignKey
ALTER TABLE "AperturasCaja" ADD CONSTRAINT "AperturasCaja_CajaId_fkey" FOREIGN KEY ("CajaId") REFERENCES "Cajas"("Id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AperturasCaja" ADD CONSTRAINT "AperturasCaja_UsuarioId_fkey" FOREIGN KEY ("UsuarioId") REFERENCES "Usuarios"("Id") ON DELETE SET NULL ON UPDATE CASCADE;
