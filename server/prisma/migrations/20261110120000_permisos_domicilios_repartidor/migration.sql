INSERT INTO "Permiso" ("codigo", "nombre", "modulo") VALUES
  ('domicilios.ver', 'domicilios.ver', 'domicilios'),
  ('domicilios.crear', 'domicilios.crear', 'domicilios'),
  ('domicilios.editar', 'domicilios.editar', 'domicilios'),
  ('domicilios.eliminar', 'domicilios.eliminar', 'domicilios'),
  ('domicilios.prefactura', 'domicilios.prefactura', 'domicilios'),
  ('domicilios.observaciones', 'domicilios.observaciones', 'domicilios'),
  ('repartidor.ver', 'repartidor.ver', 'repartidor'),
  ('repartidor.editar', 'repartidor.editar', 'repartidor')
ON CONFLICT ("codigo") DO NOTHING;

INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r.id, nuevo.id
FROM "Rol" r CROSS JOIN "Permiso" nuevo
WHERE nuevo.modulo IN ('domicilios', 'repartidor')
  AND (
    UPPER(r.nombre) = 'ADMIN'
    OR (UPPER(r.nombre) <> 'MESERO' AND EXISTS (
      SELECT 1 FROM "RolPermiso" asignacion
      JOIN "Permiso" anterior ON anterior.id = asignacion."permisoId"
      WHERE asignacion."rolId" = r.id
        AND anterior.codigo = 'pedidos.' || split_part(nuevo.codigo, '.', 2)
    ))
  )
ON CONFLICT ("rolId", "permisoId") DO NOTHING;