INSERT INTO "Permiso" ("codigo", "nombre", "modulo") VALUES
  ('factura_venta.ver', 'factura_venta.ver', 'factura_venta'),
  ('factura_venta.crear', 'factura_venta.crear', 'factura_venta')
ON CONFLICT ("codigo") DO NOTHING;

INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r.id, p.id FROM "Rol" r CROSS JOIN "Permiso" p
WHERE r.nombre IN ('ADMIN', 'CAJERO') AND p.codigo IN ('factura_venta.ver', 'factura_venta.crear')
ON CONFLICT ("rolId", "permisoId") DO NOTHING;