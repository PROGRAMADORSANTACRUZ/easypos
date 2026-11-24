INSERT INTO "Rol" ("nombre", "descripcion")
VALUES ('COCINA', 'Preparación de comandas en cocina')
ON CONFLICT ("nombre") DO NOTHING;

INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r.id, p.id
FROM "Rol" r CROSS JOIN "Permiso" p
WHERE r.nombre = 'COCINA'
  AND p.codigo IN ('cocina.ver', 'pedidos.ver')
ON CONFLICT ("rolId", "permisoId") DO NOTHING;
