BEGIN;

CREATE TABLE "CentrosOperaciones" (
    "Codigo" VARCHAR(10) NOT NULL,
    "Descripcion" VARCHAR(250) NOT NULL,
    "Estado" VARCHAR(10) NOT NULL DEFAULT 'Activo',
    "Regional" VARCHAR(10) NOT NULL,
    "Nombre" VARCHAR(100) NOT NULL,
    CONSTRAINT "CentrosOperaciones_pkey" PRIMARY KEY ("Codigo"),
    CONSTRAINT "CentrosOperaciones_Estado_check" CHECK ("Estado" IN ('Activo', 'Inactivo'))
);

INSERT INTO "CentrosOperaciones" ("Codigo", "Descripcion", "Estado", "Regional", "Nombre") VALUES
  ('401', 'OFICINA', 'Activo', '01', 'Sucursal principal'),
  ('402', 'PDV MALAMBO', 'Activo', '01', 'Sucursal principal'),
  ('403', 'PDV LA GRANJA', 'Activo', '01', 'Sucursal principal'),
  ('405', 'PDV LA 43', 'Activo', '01', 'Sucursal principal'),
  ('406', 'PDV SIMON', 'Activo', '01', 'Sucursal principal'),
  ('407', 'PDV LA 70', 'Activo', '01', 'Sucursal principal'),
  ('409', 'PDV PEREIRA', 'Activo', '01', 'Sucursal principal'),
  ('410', 'RS CRISTIAN SERRANO PDV CARTAGENA', 'Activo', '01', 'Sucursal principal'),
  ('412', 'PDV BUCARAMANGA', 'Activo', '01', 'Sucursal principal'),
  ('413', 'PDV LA 93', 'Activo', '01', 'Sucursal principal'),
  ('414', 'PDV CENTRO', 'Activo', '01', 'Sucursal principal'),
  ('415', 'PDV CARTAGENA', 'Activo', '01', 'Sucursal principal'),
  ('420', 'ASADOS SANTACRUZ MALAMBO', 'Activo', '01', 'Sucursal principal'),
  ('421', 'ASADOS SANTACRUZ LA 43', 'Activo', '01', 'Sucursal principal'),
  ('422', 'ASADOS SANTACRUZ LA 70', 'Activo', '01', 'Sucursal principal'),
  ('430', 'EVENTOS BARRANQUILLA', 'Activo', '01', 'Sucursal principal'),
  ('431', 'EVENTOS PEREIRA', 'Activo', '01', 'Sucursal principal'),
  ('432', 'EVENTOS BUCARAMANGA', 'Activo', '01', 'Sucursal principal'),
  ('433', 'EVENTOS CARTAGENA', 'Activo', '01', 'Sucursal principal'),
  ('440', 'APP PDV VIRTUAL', 'Activo', '01', 'Sucursal principal'),
  ('480', 'RS KAROLL SERRANO C.O LA 93', 'Activo', '01', 'Sucursal principal'),
  ('481', 'RS CRISTIAN SERRANO C.O ALAMEDA 1', 'Activo', '01', 'Sucursal principal'),
  ('482', 'RS KAROLL SERRANO C.O CENTRO', 'Activo', '01', 'Sucursal principal'),
  ('483', 'C.O SAN FELIPE', 'Activo', '01', 'Sucursal principal'),
  ('484', 'C.O OLAYA', 'Activo', '01', 'Sucursal principal'),
  ('485', 'C.O CONCORDE', 'Activo', '01', 'Sucursal principal'),
  ('486', 'C.O ALAMEDA II', 'Activo', '01', 'Sucursal principal'),
  ('487', 'C.O AGROPECUARIA', 'Activo', '01', 'Sucursal principal'),
  ('488', 'C.O INVERSIONES SERRANO', 'Activo', '01', 'Sucursal principal'),
  ('489', 'C.O AGROPORCICOLA', 'Activo', '01', 'Sucursal principal'),
  ('490', 'C.O TRANSANTACRUZ', 'Activo', '01', 'Sucursal principal'),
  ('491', 'FRUVER LA 70', 'Activo', '01', 'Sucursal principal'),
  ('492', 'FRUVER CONCORD', 'Activo', '01', 'Sucursal principal'),
  ('493', 'MANGONIZATE', 'Activo', '01', 'Sucursal principal'),
  ('494', 'MURILLO', 'Activo', '01', 'Sucursal principal'),
  ('495', 'OFICINA CENTRO GILBERTO SERRANO', 'Activo', '01', 'Sucursal principal'),
  ('496', 'PIEDECUESTA', 'Activo', '01', 'Sucursal principal'),
  ('497', 'COMPRAS Y GASTOS INVENTARIO', 'Activo', '01', 'Sucursal principal');

INSERT INTO "Permiso" ("codigo", "nombre", "modulo") VALUES
  ('centros_operaciones.ver', 'centros_operaciones.ver', 'centros_operaciones'),
  ('centros_operaciones.editar', 'centros_operaciones.editar', 'centros_operaciones')
ON CONFLICT ("codigo") DO UPDATE SET "nombre" = EXCLUDED."nombre", "modulo" = EXCLUDED."modulo";

INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r."id", p."id"
FROM "Rol" r
CROSS JOIN "Permiso" p
WHERE r."nombre" = 'ADMIN'
  AND p."codigo" IN ('centros_operaciones.ver', 'centros_operaciones.editar')
ON CONFLICT ("rolId", "permisoId") DO NOTHING;

COMMIT;