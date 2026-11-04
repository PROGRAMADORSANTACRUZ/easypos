# Tipo documental y prefijo separados

`TipoDocumento` es el codigo del maestro `TiposDocumento.Codigo`, por ejemplo `FEV` o `DVP`.
`Prefijo` es el prefijo de numeracion del documento, por ejemplo `RM1C` o `FAV`.
No son el mismo dato y no se debe usar el prefijo para completar el codigo.

Las tablas fisicas `Factura` y `FacturaVenta` tienen 36 columnas y comienzan exactamente asi:

```text
CompaniaCodigo, CentroOperacionCodigo, TipoDocumento, Prefijo, fecha, numero
```

La clave primaria sigue siendo compania, centro, tipo documental y consecutivo.
En Prisma el codigo se llama `tipoDocumentoCodigo`, mientras `tipoDocumento` sigue siendo
la relacion con el maestro y `prefijo` conserva su significado para recibos y Factus.

## Historial

La version anterior habia guardado el prefijo en `TipoDocumento`. La migracion lo conserva
en `Prefijo` y obtiene el codigo del tipo documental asociado, sin cambiar numero, importes,
pagos, usuario, CUFE, NumeroFactus ni fechas. El prefijo historico no se sustituye por un
prefijo que se haya editado posteriormente en el maestro.

Un documento previamente desvinculado solo se resuelve si existe una unica coincidencia
de su valor historico con el codigo del maestro de la misma compania, centro y clase
electronica. No se restablece automaticamente su vinculo. Si no es univoco se cancela todo.
La migracion tambien cancela ante claves duplicadas, cabeceras sin operacion, referencias
adicionales o vistas que requieran revision. No se borran dependencias con CASCADE.

## Aplicacion

1. Respaldar la base completa, restaurarla y ensayar ambas fases sobre la copia. Comprobar todos los documentos y sus vinculos.
2. Activar la pausa de facturacion y configurar `pos.migracion_facturas=20261104` en la sesion que ejecuta los cambios.
3. Aplicar `20261104170000_facturas_columna_prefijo`: conserva tablas originales y asignaciones en `respaldo_tipo_prefijo_20261104`, reorganiza fisicamente la cabecera y agrega `Prefijo` manteniendo temporalmente los valores anteriores de `TipoDocumento`.
4. Registrar solo esa fase, desplegar el codigo nuevo y comprobar `tipoDocumentoYPrefijoSeparados: true` en `/api/health` y las lecturas del contenedor. Verificar los labels de Traefik solo del servicio POS.
5. Aplicar `20261104180000_facturas_codigo_documental`: completa el codigo real, propagandolo a las operaciones por la clave foranea. Verificar orden, unicidad, prefijos, importes y datos fiscales antes de confirmar.
6. Registrar la segunda fase y retirar la pausa. No ejecutar seeds, `db push`, `migrate reset` ni otras migraciones pendientes.

No restaurar un respaldo anterior sobre nuevas ventas sin conciliarlas previamente.