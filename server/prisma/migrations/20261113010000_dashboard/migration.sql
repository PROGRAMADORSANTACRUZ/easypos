CREATE TABLE IF NOT EXISTS "ObjetivosDashboard" (
  "Id" INTEGER NOT NULL DEFAULT 1,
  "ObjetivoHoy" DOUBLE PRECISION,
  "Objetivo7Dias" DOUBLE PRECISION,
  "Objetivo30Dias" DOUBLE PRECISION,
  "ObjetivoAnio" DOUBLE PRECISION,
  "FechaActualizacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ObjetivosDashboard_pkey" PRIMARY KEY ("Id")
);

INSERT INTO "Permiso" ("codigo", "nombre", "modulo") VALUES
  ('dashboard.ver', 'dashboard.ver', 'dashboard'),
  ('dashboard.editar', 'dashboard.editar', 'dashboard')
ON CONFLICT ("codigo") DO NOTHING;

INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r.id, p.id
FROM "Rol" r CROSS JOIN "Permiso" p
WHERE UPPER(r.nombre) = 'ADMIN' AND p.modulo = 'dashboard'
ON CONFLICT ("rolId", "permisoId") DO NOTHING;