BEGIN;

INSERT INTO "Compania" ("Codigo", "Nit", "RazonSocial") VALUES
  ('002', '901407945', 'AGROPORCICOLA SANTACRUZ SAS'),
  ('003', '830505537', 'AGROPECUARIA SANTACRUZ LIMITADA'),
  ('004', '900326452', 'CARNES SANTACRUZ S.A.S'),
  ('005', '1045734114', 'KAROLL TATIANA SERRANO MILLAN'),
  ('006', '1045679622', 'CRISTIAN FABIAN SERRANO MILLAN'),
  ('007', '900898713', 'INVERSIONES SERUEDA S.A.S'),
  ('008', '900391505', 'INVERSIONES SERRANO MILLAN S.A.S')
ON CONFLICT ("Codigo") DO UPDATE SET
  "Nit" = EXCLUDED."Nit",
  "RazonSocial" = EXCLUDED."RazonSocial";

INSERT INTO "Permiso" ("codigo", "nombre", "modulo") VALUES
  ('companias.ver', 'companias.ver', 'companias'),
  ('companias.crear', 'companias.crear', 'companias'),
  ('companias.editar', 'companias.editar', 'companias'),
  ('companias.eliminar', 'companias.eliminar', 'companias')
ON CONFLICT ("codigo") DO UPDATE SET
  "nombre" = EXCLUDED."nombre",
  "modulo" = EXCLUDED."modulo";

INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r."id", p."id"
FROM "Rol" r
CROSS JOIN "Permiso" p
WHERE r."nombre" = 'ADMIN'
  AND p."codigo" IN ('companias.ver', 'companias.crear', 'companias.editar', 'companias.eliminar')
ON CONFLICT ("rolId", "permisoId") DO NOTHING;

COMMIT;
