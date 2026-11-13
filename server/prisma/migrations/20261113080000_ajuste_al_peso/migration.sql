-- Medio de pago interno para el ajuste al peso (redondeo del cobro en efectivo).
INSERT INTO "FormasPago" ("ClaseCpto", "CptoCaja", "DescCptoCaja", "MedioPago", "Moneda", "Activo")
VALUES ('RECOGIDA', 'AJP', 'AJUSTE AL PESO', 'AJP', 'COP', true)
ON CONFLICT ("CptoCaja") DO NOTHING;