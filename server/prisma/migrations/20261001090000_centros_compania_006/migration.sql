INSERT INTO "CentrosOperaciones" ("Codigo", "Descripcion", "Estado", "Regional", "Nombre", "CompaniaCodigo") VALUES
  ('001', 'PRINCIPAL', 'Inactivo', '01', 'Sucursal principal', '006'),
  ('601', 'CARTAGENA', 'Activo', '01', 'Sucursal principal', '006'),
  ('602', 'GANADO - CRISTIAN SERRANO', 'Activo', '01', 'Sucursal principal', '006'),
  ('603', 'CONCORD', 'Activo', '01', 'Sucursal principal', '006'),
  ('604', 'FRUVER - TODO ZUYO LA70', 'Activo', '01', 'Sucursal principal', '006'),
  ('605', 'ALAMEDA 1', 'Activo', '01', 'Sucursal principal', '006'),
  ('606', 'ALAMEDA 2', 'Activo', '01', 'Sucursal principal', '006'),
  ('607', 'EVENTOS CRISTIAN SERRANO', 'Activo', '01', 'Sucursal principal', '006'),
  ('608', 'MANGONIZATE', 'Activo', '01', 'Sucursal principal', '006')
ON CONFLICT ("Codigo") DO UPDATE SET
  "Descripcion" = EXCLUDED."Descripcion",
  "Estado" = EXCLUDED."Estado",
  "Regional" = EXCLUDED."Regional",
  "Nombre" = EXCLUDED."Nombre",
  "CompaniaCodigo" = EXCLUDED."CompaniaCodigo";
