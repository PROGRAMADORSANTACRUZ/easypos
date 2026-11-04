# Cuatro medios de pago por factura

## Metodos y Valores Separados

La actualizacion posterior separa cada campo combinado en un nombre y un valor numerico:

| Metodo | Valor |
| --- | ---: |
| `metodopago1 = EFECTIVO` | `valor1 = 10000` |
| `metodopago2 = TARJETA` | `valor2 = 10000` |
| `metodopago3 = TRANSFERENCIA` | `valor3 = 17400` |
| `metodopago4 = 0` | `valor4 = 0` |

Los cuatro `valor` son `NUMERIC(18,2) NOT NULL DEFAULT 0`; la API los devuelve como numeros.
Los nombres no incluyen moneda ni importe. Las dos cabeceras finales tienen 35 columnas.
La conversion extrae el importe ya registrado: no recalcula totales, propinas ni diferencias historicas.
Las etiquetas combinadas compatibles con caja y recibos permanecen en las tablas operativas auxiliares.

Con respaldo completo verificado y pausa de facturacion activa, aplicar primero
`20261104150000_facturas_valores_pago`, que agrega los valores sin cambiar los textos aun consumidos
por la version anterior. Desplegar el codigo nuevo y comprobar `valoresPagoSeparados: true` en
`/api/health`. Luego aplicar `20261104160000_facturas_nombres_pago`, que deja solo nombres y agrega
restricciones de coherencia de cada par. Registrar ambas fases en Prisma y retirar la pausa.
El respaldo adicional de cabeceras queda en `respaldo_valores_pago_20261104`; no sustituye al respaldo completo.

## Estructura Anterior Combinada

Las tablas fisicas `Factura` y `FacturaVenta` sustituyen `metodoPago` por cuatro columnas de texto no nulas:

- `metodopago1`
- `metodopago2`
- `metodopago3`
- `metodopago4`

Cada columna contiene el medio y su importe aplicado, por ejemplo `EFECTIVO $10.000`.
Una columna no utilizada contiene `0`. Se conserva el orden del primer registro de cada medio;
los importes de registros repetidos del mismo medio se suman sin ocupar otra columna.
El limite es de cuatro medios distintos, no cuatro abonos sucesivos al mismo medio.
Las cabeceras finales tienen 31 columnas; no se cambia su clave compuesta ni sus datos fiscales.

En credito sin cobro inicial los cuatro valores son `0`: la cartera no es dinero recibido.
Si una venta a credito tiene propina cobrada, se conserva su tratamiento actual de efectivo.
En pagos mixtos, la propina ya incluida en los importes no se suma de nuevo.
Los pagos divididos guardan el importe recibido real, incluida la propina; el cambio en efectivo ya se descuenta en el cliente.

La etiqueta original `metodoPago` queda en las tablas operativas auxiliares para compatibilidad
con caja, recibos, consultas de API y auditoria. No permanece como columna de las cabeceras finales.
La API mantiene `metodoPago` y agrega `metodoPago1` a `metodoPago4`.

## Aplicacion en Dos Fases

1. Respaldar la base completa con PostgreSQL 18, restaurarla en una copia y ensayar ambas migraciones. Verificar conteos, importes, claves, CUFE y cierre de caja antes y despues.
2. Establecer mantenimiento de facturacion con el mecanismo ya documentado. La sesion de migracion configura `pos.migracion_facturas=20261104`.
3. Aplicar `20261104130000_facturas_cuatro_metodos_pago`: crea un respaldo adicional en `respaldo_pagos_20261104`, agrega y completa los cuatro campos y conserva temporalmente la columna anterior para la API aun desplegada.
4. Registrar solo esa migracion como aplicada. Publicar y desplegar el cliente Prisma y el codigo compatibles. Verificar `/api/health` con `metodosPago: 4` y lecturas reales desde el contenedor. Reaplicar y verificar los labels de Traefik solo al servicio POS si Dokploy los pierde.
5. Aplicar `20261104140000_facturas_retirar_metodo_pago_anterior` para retirar `metodoPago` de las dos cabeceras. Registrar esa migracion y verificar las 31 columnas, los pagos y la API.
6. Retirar el mantenimiento. No ejecutar seeds, `db push`, `migrate reset` ni otras migraciones pendientes para este cambio.

La conversion cancela todo ante formatos mixtos sin importes verificables, mas de cuatro medios
o sumas que no coincidan con el total y la propina. No inventa importes.
Una discrepancia historica solo puede conservarse con autorizacion explicita en la variable de sesion
`pos.pagos_conservar_diferencia`: un array JSON con `tabla`, `compania`, `centro`, `tipo`, `numero`,
`total`, `propina` y `metodo` originales. Todos los valores deben coincidir exactamente.
Se separan los importes registrados sin cambiar total, propina, CUFE ni otros datos fiscales;
esta excepcion no se habilita en la creacion normal de facturas nuevas.
La restauracion de emergencia debe hacerse sobre otra base desde el respaldo completo y con
escrituras detenidas; conservar y conciliar cualquier venta posterior antes de restaurar.

## Verificacion

`node --test server/tests/*.test.mjs client/tests/*.test.mjs`

Las pruebas incluyen PostgreSQL embebido y Prisma real; las pruebas automaticas no conectan a produccion.