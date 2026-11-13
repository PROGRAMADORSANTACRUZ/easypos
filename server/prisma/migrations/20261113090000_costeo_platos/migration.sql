-- Permisos del modulo Costeo de platos.
INSERT INTO "Permiso" ("codigo", "nombre", "modulo") VALUES
  ('costeo.ver', 'costeo.ver', 'costeo'),
  ('costeo.editar', 'costeo.editar', 'costeo')
ON CONFLICT ("codigo") DO NOTHING;

INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r.id, p.id
FROM "Rol" r CROSS JOIN "Permiso" p
WHERE UPPER(r.nombre) = 'ADMIN' AND p.modulo = 'costeo'
ON CONFLICT ("rolId", "permisoId") DO NOTHING;