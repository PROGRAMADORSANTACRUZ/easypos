# Cabeceras de facturacion con clave compuesta

El estado de cada ejecucion debe comprobarse en la base y en el manifiesto del respaldo; este procedimiento no implica que una base ya este migrada.

La actualizacion posterior de [cuatro medios de pago](migracion-pagos-20261104.md) reemplaza `metodoPago` por `metodopago1` a `metodopago4`; el esquema vigente pasa de 28 a 31 columnas.

## Estructura Inicial

La migracion inicial dejo las tablas fisicas `Factura` y `FacturaVenta` con estas 28 columnas, antes de la actualizacion de pagos:

```text
CompaniaCodigo, CentroOperacionCodigo, TipoDocumento, fecha, numero,
NumeroDocumentoCliente, NombreCliente, SucursalCliente, TelefonoCliente,
DireccionCliente, BarrioCliente, CiudadCliente, EmailCliente,
Subtotal, impuestoPct, IVA, Total, Propina, metodoPago, credito, creditoDias,
vence, CUFE, NumeroFactus, XmlPath, PdfPath, EstadoDIAN, Usuario
```

La clave primaria es `(CompaniaCodigo, CentroOperacionCodigo, TipoDocumento, numero)`.
`TipoDocumento` conserva el codigo configurado en el campo prefijo del tipo documental, por ejemplo `DVP`.
`numero` es un entero positivo, no un texto ni un numero con prefijo. `Usuario` conserva el nombre de acceso al facturar.
`EstadoDIAN` aparece una sola vez. No hay `Id` ni otros campos fisicos en las cabeceras.

`FacturaOperacion` y `FacturaVentaOperacion` conservan UUID, pedido, cliente, apertura, tipo documental y division de cuenta.
Los detalles, pagos, abonos y notas mantienen sus referencias UUID a esas tablas auxiliares; cada operacion referencia la clave compuesta de su cabecera.
La API conserva sus identificadores y formato de respuestas para no romper los consumidores.
En Prisma, los modelos `Factura` y `FacturaVenta` representan las operaciones; `FacturaCabecera` y `FacturaVentaCabecera` representan las cabeceras fisicas.
El adaptador de persistencia realiza las escrituras de cabecera y operacion dentro de la misma transaccion y no permite modificar la clave de un documento emitido.

## Condiciones Previas

1. Detener las escrituras de la aplicacion, incluidos procesos externos. Aplicar por separado a cada base de restaurante.
2. Obtener un respaldo completo con `pg_dump --format=custom` y comprobar que se restaura en una base desechable.
3. Ensayar esta migracion en esa copia con las mismas versiones de PostgreSQL, Prisma y codigo que se usaran en produccion.
4. Verificar documentos con tipo documental y usuario existentes, numeros enteros positivos dentro del rango de PostgreSQL y claves sin duplicados. Numeros como `DVP184` se rechazan; no se recortan automaticamente.
5. Si faltan compania, centro o prefijo, solo se recuperan del tipo documental asociado. Si existe un valor contradictorio, falta usuario/tipo o difieren Numero y Consecutivo, la migracion cancela todo. Resolver esos casos con datos verificados, sin inventarlos.

Excepciones historicas: solo con autorizacion explicita, la sesion puede configurar `pos.facturas_desvincular_tipo` con un array JSON de objetos `tabla`, `id`, `compania`, `centro`, `tipo`, `numero` y `tipo_id` original. Cada campo debe coincidir exactamente con el documento actual; de lo contrario se cancela la migracion. Para esos documentos se deja nulo solamente `TipoDocumentoId` en la tabla operativa; no se cambia ningun valor de la cabecera fiscal. El respaldo conserva el enlace original.

No usar `prisma db push`, `migrate reset` ni el seed sobre una base existente para aplicar este cambio.
El historial del repositorio no constituye una inicializacion completa de una base vacia: comprobar primero el estado de migraciones de cada base y sus diferencias pendientes.

## Aplicacion Coordinada

Si no se puede verificar la detencion de la API anterior, `server/scripts/pausar-facturacion.sql` bloquea temporalmente INSERT/UPDATE/DELETE sobre ambas tablas. Requiere respaldo verificado y ventana de mantenimiento; no reinicia ni detiene PostgreSQL. La sesion de migracion debe configurar `pos.migracion_facturas=20261104` para permitir sus propias escrituras. Tras el cambio, eliminar los triggers `_pos_facturas_mantenimiento_20261104` de ambas tablas operativas y la funcion `public._pos_facturas_mantenimiento_20261104()`. Si se cancela antes de migrar, retirar los mismos triggers de las tablas originales y la funcion. No dejar una pausa abandonada.

La API nueva anuncia `estructuraFacturas: "20261104"` en `/api/health`. Verificar esa respuesta sin cache antes de aplicar la migracion original y retirar la pausa. Durante la ventana, no reabrir facturacion hasta validar esquema y lecturas con el cliente nuevo.

Con la aplicacion detenida y el respaldo verificado, ejecutar desde `server` el archivo
`prisma/migrations/20261104120000_facturas_cabeceras_clave_compuesta/migration.sql` con `psql -v ON_ERROR_STOP=1` sobre la base seleccionada.
Si se usa Prisma Migrate, comprobar primero `prisma migrate status`; no ejecutar otras migraciones pendientes sin revisarlas.
Si se aplica el SQL manualmente, registrar solo esta migracion como aplicada mediante `prisma migrate resolve --applied 20261104120000_facturas_cabeceras_clave_compuesta` tras su exito.
Generar el cliente con `npm run prisma:generate` y activar la version de API de este cambio antes de reabrir el servicio.
No desplegar el cliente Prisma nuevo sobre la estructura anterior ni ejecutar el codigo anterior sobre las tablas nuevas.

Comprobar columnas, cantidades, sumas de Subtotal/IVA/Total/Propina y consultas de detalles, pagos, creditos, caja y DIAN.
La migracion compara cada cabecera nueva contra su proyeccion del documento original y conserva las tablas originales completas en el esquema `respaldo_facturas_20261104`.
Ese esquema es una copia de datos, no sustituye al respaldo completo externo con restricciones, indices y metadatos.
No eliminarlo hasta cerrar la validacion y el periodo de retencion acordado.

## Reversion

Un error durante la migracion revierte sus cambios mediante la transaccion; cerrar la conexion o ejecutar `ROLLBACK` si el cliente deja la transaccion abortada abierta.
Tras una migracion exitosa, mantener las escrituras detenidas y restaurar el respaldo completo en otra base; verificarlo y volver a la version anterior de API apuntando a esa base.
No renombrar simplemente las tablas auxiliares: ya no contienen los campos de cabecera.
Si hubo nuevas ventas despues del cambio, detener el servicio y conciliarlas antes de restaurar; restaurar un respaldo anterior sin conciliacion perderia esas ventas.

## Pruebas

`node --test tests/facturasMigracion.test.mjs tests/facturasPersistencia.test.mjs tests/numeracionDocumentos.test.mjs`

Las pruebas usan PostgreSQL embebido en memoria. No leen `DATABASE_URL` para conectarse a una base real.