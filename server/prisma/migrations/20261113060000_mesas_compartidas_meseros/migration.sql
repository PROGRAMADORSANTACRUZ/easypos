CREATE TABLE IF NOT EXISTS "UsuariosMesas" (
  "UsuarioId" UUID NOT NULL,
  "MesaId" INTEGER NOT NULL,
  CONSTRAINT "UsuariosMesas_pkey" PRIMARY KEY ("UsuarioId", "MesaId"),
  CONSTRAINT "UsuariosMesas_UsuarioId_fkey" FOREIGN KEY ("UsuarioId") REFERENCES "Usuarios"("Id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UsuariosMesas_MesaId_fkey" FOREIGN KEY ("MesaId") REFERENCES "Mesa"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "UsuariosMesas_MesaId_idx" ON "UsuariosMesas"("MesaId");

-- Conserva las asignaciones existentes (un mesero por mesa) en la nueva tabla.
INSERT INTO "UsuariosMesas" ("UsuarioId", "MesaId")
SELECT m."usuarioAsignadoId", m."id"
FROM "Mesa" m
WHERE m."usuarioAsignadoId" IS NOT NULL AND m."esFantasma" = false
ON CONFLICT DO NOTHING;