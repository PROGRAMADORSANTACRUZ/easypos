INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT DISTINCT rol_empresa."rolId", permiso_centro."id"
FROM "RolPermiso" rol_empresa
JOIN "Permiso" permiso_empresa ON permiso_empresa."id" = rol_empresa."permisoId"
CROSS JOIN "Permiso" permiso_centro
WHERE permiso_empresa."codigo" = 'empresa.editar'
  AND permiso_centro."codigo" = 'centros_operaciones.editar'
ON CONFLICT ("rolId", "permisoId") DO NOTHING;
