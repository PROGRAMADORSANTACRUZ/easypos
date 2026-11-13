# POS 🍔

Punto de venta (POS) para restaurantes: toma pedidos por **mesa** y **mesera**, pasa
de inmediato a **facturación**, maneja **inventario** y permite **armar kits** (recetas).
Ejemplo de kit: una hamburguesa = 1 bollo + 1 carne.

## ¿Qué hace?

- **Mesas**: tablero visual con estado (libre / ocupada).
- **Tomar pedido**: seleccionas la mesa, la mesera y agregas productos del menú.
- **Facturación inmediata**: al enviar el pedido queda listo para facturar; la factura
  aplica el impuesto configurado y genera un recibo imprimible.
- **Inventario**: insumos con stock, stock mínimo y costo. El stock **baja
  automáticamente al facturar**, según la receta de cada producto.
- **Kits (recetas)**: cada producto puede componerse de varios insumos con cantidades.
  El sistema calcula cuántas unidades se pueden armar según el inventario disponible.

## Tecnología

- **Backend**: Node.js + Express + Prisma + PostgreSQL
- **Frontend**: React + Vite
- **Base de datos**: PostgreSQL (incluye `docker-compose.yml`)

## Estructura

```
POS/
├─ docker-compose.yml      # PostgreSQL listo para usar
├─ server/                 # API REST (Express + Prisma)
│  ├─ prisma/schema.prisma # Modelo de datos
│  ├─ prisma/seed.js       # Datos de ejemplo (incluye kit de hamburguesa)
│  └─ src/                 # Servidor y rutas
└─ client/                 # Interfaz React (Vite)
```

## Puesta en marcha

Requisitos: Node.js 18+ y (opcional) Docker para la base de datos.

### 1. Base de datos PostgreSQL

Con Docker (recomendado):

```powershell
docker compose -f docker-compose.dev.yml up -d
```

O usa tu propio PostgreSQL y ajusta `DATABASE_URL` en `server/.env`.

### 2. Backend

Para bases existentes, revisar primero el [procedimiento de migracion de facturas](docs/migracion-facturas-20261104.md); no ejecutar el seed ni `prisma db push` para este cambio.

```powershell
cd server
npm install
npm run prisma:generate     # genera el cliente Prisma
npm run prisma:migrate      # crea las tablas
npm run seed                # carga datos de ejemplo
npm run dev                 # API en http://localhost:4000
```

### 3. Frontend

En otra terminal:

```powershell
cd client
npm install
npm run dev                 # app en http://localhost:5173
```

Abre <http://localhost:5173> y empieza a tomar pedidos.

### Datos temporales para pruebas

Desde `server/`, con `DATABASE_URL` apuntando a la base elegida, simula primero:

```powershell
node scripts/preparar-productos-prueba.mjs
```

Para aplicar, guarda primero un respaldo completo de PostgreSQL y utiliza una
ruta nueva para el respaldo JSON de los valores originales:

```powershell
node scripts/preparar-productos-prueba.mjs --aplicar --respaldo=C:/POS-Backups/productos-originales.json
```

Asigna precios variados entre 10000 y 150000 COP a todos los productos y sus
precios de lista existentes. Completa al menos 100 unidades por producto en
Compras y abastece los insumos para probar 100 unidades de cada receta, sin
reducir existencias. Registra las entradas como movimientos `PRUEBAS-*`.
No modifica costos, impuestos, pedidos ni facturas existentes. Solo actua sobre
la base indicada, no sobre otros restaurantes. Sin `--aplicar` no cambia datos;
no se ejecuta al arrancar ni desplegar. La aplicacion es transaccional y exige
un archivo de respaldo nuevo. Conserva los respaldos fuera del repositorio.
Las ventas nuevas siguen siendo reales: esto no desactiva la emision fiscal.

## App de escritorio para Windows

La app de escritorio empaqueta el frontend con Electron y se conecta a la API
de produccion en `https://pos.grupo-santacruz.com`. La conexion se hace por un
proxy local para conservar la sesion segura por cookies. Requiere internet y
una cuenta de POS; no instala una base de datos local.

Para generar el instalador NSIS x64, instala las dependencias del cliente y del
empaquetador y ejecuta:

```powershell
cd client
npm install
cd ../desktop
npm install
npm run dist
```

El instalador sin firma digital queda en `desktop/release/POS-Setup-1.0.0.exe`;
Windows puede mostrar una advertencia de SmartScreen al instalarlo.
El asistente esta en espanol e incluye el logo del login, colores de marca,
progreso real de instalacion y acceso para abrir el POS al finalizar.
Se instala para todos los usuarios del equipo: al aceptar el permiso de Windows
comienza directamente la instalacion, sin bienvenida ni seleccion de cuenta o
carpeta. En la pantalla final, la opcion de abrir el POS tiene texto blanco.
No descarga el programa: el instalador ya contiene todos sus archivos.
`npm run build:branding` regenera el icono multirresolucion y las imagenes del
asistente desde `client/public/logo-claro.png` (requiere Windows).
El asistente declara compatibilidad DPI y usa ilustraciones a 4x (panel de
656 x 1256 y cabecera de 600 x 228 pixeles) para conservar nitidez en pantallas
con escalado de Windows. Los textos y controles se dibujan al DPI del sistema.
La app oculta el menu y el titulo de Electron, conserva los controles nativos
de minimizar, maximizar/restaurar y cerrar, y permite arrastrar la franja superior.
Para apuntar la app a otra API, define `POS_API_URL` con el origen HTTP(S)
de la API antes de iniciar la app (por defecto, `https://pos.grupo-santacruz.com`).

## Configuración

En `server/.env`:

- `DATABASE_URL`: cadena de conexión a PostgreSQL.
- `PORT`: puerto de la API (por defecto `4000`).
- `IVA_PCT`: porcentaje de impuesto aplicado en la factura (por defecto `19`).

## Flujo de uso

1. **Mesas** → toca una mesa libre.
2. Elige la **mesera**, agrega productos del **menú** y pulsa **Enviar pedido**.
3. El pedido queda **abierto y listo para facturar** → pulsa **Facturar**.
4. Se descuenta el **inventario** de cada insumo y se genera la **factura** (imprimible en Facturas).

Los meseros comparten las mesas: pueden consultar y continuar pedidos creados
por sus companeros segun los permisos de su rol, sin restricciones por mesero
asignado. La asignacion de mesas en Usuarios es opcional y no limita el acceso;
varios meseros pueden tener marcadas las mismas mesas (botones Marcar todas /
Desmarcar todas). Antes de desplegar, respalda y aplica
`server/prisma/migrations/20261113060000_mesas_compartidas_meseros/migration.sql`,
que copia las asignaciones anteriores a la nueva tabla UsuariosMesas.
El pedido conserva su creador y el historial registra quien realiza cada cambio.
Domicilios y Repartidor / Entregas mantienen sus permisos independientes.

## API principal

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/mesas` | Mesas con su pedido abierto |
| GET/POST | `/api/meseras` | Meseras |
| GET/POST | `/api/productos` | Productos y kits (con receta) |
| GET/POST | `/api/inventario` | Insumos de inventario |
| POST | `/api/inventario/:id/ajuste` | Ajustar stock (+/-) |
| POST | `/api/pedidos` | Crear pedido (ocupa la mesa) |
| POST | `/api/facturas` | Facturar pedido (descuenta inventario) |
| GET | `/api/facturas` | Historial de facturas |

## Despliegue en Dokploy (producción)

`docker-compose.yml` (raíz) es el stack de producción — un solo contenedor
(Nginx + backend Express) construido desde `Dockerfile`. La base de datos es
EXTERNA: crea primero un servidor Postgres aparte en Dokploy (app tipo
"Database") y usa sus credenciales en las variables de entorno.

1. En Dokploy: nueva app tipo "Docker Compose" apuntando a este repo, rama y
   `docker-compose.yml` (el de la raíz, no `docker-compose.dev.yml`).
2. Configura las variables de entorno del panel de Dokploy — ver `.env.example`
   (`DATABASE_URL`, `JWT_SECRET`, etc. — `PLATFORM_DATABASE_URL` se rellena
   solo con el mismo valor de `DATABASE_URL`, una sola base para todo).
3. Configura el dominio principal `pos.grupo-santacruz.com`.
4. En instalaciones con datos, deja `RUN_DB_INIT=false` y `RUN_SEED=false`
   también en el panel de Dokploy. El sembrado borra y recrea productos, y
   aplicar sucesivamente ambos esquemas con `prisma db push --accept-data-loss`
   sobre la misma base puede eliminar tablas del otro esquema. La inicialización
   de una instalación nueva debe hacerse manualmente, antes de cargar datos.
5. Si Dokploy no conserva los labels de Traefik tras un redeploy, correr
   `./deploy.sh <nombre-real-del-servicio>` (ver el id real en el panel).

Antes de desplegar el inventario de insumos por bodega, haz un respaldo y aplica
en cada base existente `server/prisma/migrations/20261103120000_inventario_insumos_bodega/migration.sql`.
Esta migración copia el stock actual a Compras y marca pedidos abiertos que ya
habían descontado inventario. Aplica la migración antes de desplegar la aplicación.

Para que `Total` en la base incluya la propina sin duplicar cobros, seguir el
[procedimiento en dos fases](docs/migracion-total-propina-20261110.md).
No aplicar la conversion final mientras siga activa una version antigua.

Para fijar las columnas de medios de pago, respaldar cada base y aplicar
`20261110170000_posiciones_fijas_medios_pago`. EFE/EFECTIVO ocupa
`metodopago1/valor1`; DAT, DTF o TARJETA ocupa `metodopago2/valor2`; QR ocupa
`metodopago3/valor3`. Otros medios usan primero la cuarta posicion y luego las
libres, con orden estable por codigo. Si coinciden varios codigos de una misma
familia, se suman en su columna y se conserva la lista de codigos separada por
`/`; los registros individuales de pago no se modifican. La migracion reordena
las cabeceras existentes y un trigger mantiene la regla en nuevas escrituras,
sin alterar sumas, totales, propinas, estados fiscales ni el catalogo de medios.

Antes de desplegar la separacion de permisos de Domicilios y Repartidor / Entregas,
respalda cada base y aplica `20261110120000_permisos_domicilios_repartidor`.
Registra los permisos `domicilios.*` y `repartidor.*` y conserva `pedidos.*`
para Mesas. ADMIN recibe ambos modulos; otros roles conservan sus acciones
anteriores, excepto MESERO, que no recibe los nuevos accesos automaticamente.
En Roles, las dos casillas son independientes de Mesas. Actualiza la sesion
despues de guardar cambios para renovar el menu; la API consulta los permisos
vigentes en cada solicitud. La migracion no modifica pedidos ni ventas.

Antes de desplegar la asignación de submódulos de facturación, aplica la migración
`20260926180000_modulos_facturacion_usuario` a la base activa. En Usuarios, ADMIN
puede marcar excepciones individuales; en Roles administra módulos, submódulos
y acciones para todos los usuarios de cada rol. Aplica también la migración
`20260926220000_factura_venta_permisos_roles` para registrar el permiso de
Factura de venta. Cada usuario debe volver a iniciar sesión para actualizar su
menú. Cada submódulo exige su tipo de documento activo, con prefijo y rango
propio, antes de registrar comprobantes.

Antes de desplegar la persistencia en nube de ventas congeladas y seguimiento de
domicilios, aplica una sola vez `server/prisma/migrations/20261008180000_ventas_congeladas_seguimiento_usuario/migration.sql`
en cada base de restaurante ya existente. Haz una copia de seguridad antes de
aplicar cambios al esquema. Los restaurantes nuevos reciben estos campos y la
tabla al crear su base de datos.

El cierre de caja permite contar opcionalmente cada medio activo y conserva el
resultado en el historial. La base y los ingresos/egresos se cuentan por
separado de las ventas en efectivo; el contado total de efectivo solo se calcula
cuando esos conteos estan completos. Los medios inactivos usados durante el turno
tambien aparecen. Si un pago historico no permite identificar su medio, se muestra
sin asignar y no se calcula una diferencia para los medios afectados.
El desglose incluye las facturas asociadas a la apertura, incluso si la caja es
compartida o el turno abarca mas de un dia. Usa los importes de pagos registrados
en cada factura y, para facturas anteriores sin esos registros, su metodo historico.
Si los pagos registrados no coinciden con el total y la propina, se solicita revisar
la factura antes de cerrar para evitar un cuadre incorrecto.

El reporte **Resumen de facturas y notas** agrupa facturas POS y
electronicas y notas credito/debito por cajero, fecha, caja y tipo de documento.
Las columnas siguen el orden: Cajero / fecha, T.P.V., Valor bruto, Valor descuentos,
Valor impuestos, Valor neto y Tipo docto.
Filtra cada documento por su fecha en Colombia; las notas usan el cajero y la caja
de su factura vinculada, o muestran que no estan disponibles. Incluye las notas de
todos los estados. El bruto de las facturas es el subtotal registrado y el neto no
incluye la propina (que no se muestra en este reporte). Los descuentos no se registran
y aparecen como no disponibles. Las notas solo guardan un total: se suma para debito
y se resta para credito, sin inventar su desglose de bruto o impuestos.
Actualmente las notas solo pueden vincularse a facturas electronicas.
Por ello, un total por cajero que incluye notas muestra esos desgloses como no
disponibles; el total de la nota podria incluir propina.

El reporte **Revision diaria PDV** agrupa pagos de facturas POS y electronicas
por cajero y medio, con detalle por documento y filtros de fecha, centro y caja.
El ingreso es lo que entrego el cliente con cada medio, el egreso es el vuelto
(solo efectivo) y el neto es el importe cobrado, incluida la propina. Cada pago
guarda `Recibido` y `Vuelto` (migracion `20261113070000_pagos_recibido_vuelto`);
en pagos anteriores sin valor recibido el ingreso es igual al neto y el egreso es 0.
El servidor rechaza un recibido menor al aplicado y el vuelto en medios que no son
efectivo. Los pagos historicos sin desglose se identifican sin repartirlos,
y las facturas a credito no incluyen el saldo pendiente como pago recibido.

El reporte **Movimientos de caja** muestra cada ingreso o egreso registrado, su
fecha, cajero, caja, monto, motivo y referencia interna. Permite filtrar por
fecha, cajero, caja y tipo y exportar a Excel o PDF. El centro de operacion,
numero de documento, estado, tercero, medios de pago y clasificaciones como
adiciones y recogidas no se registran en el movimiento y aparecen como no
disponibles; no se infieren a partir del tipo de ingreso o egreso. Las recogidas
parciales si se identifican en su columna.

El reporte **Movimiento de documentos de caja** lista un documento por cada
recogida parcial (`E`, por ejemplo `E04-405-00000001`) y por cada cierre de caja
(`G`, con todos los medios de pago agrupados). El consecutivo se asigna en orden
cronologico por letra, compania y centro (tomado de las facturas de la apertura).
Las columnas reparten los saldos asi: Efectivo = EFE, Tarjeta credito = DAT/DTF,
Tarjeta debito = DBO, Cheque = medio con codigo DIAN 20 y Otros = el resto (AJP,
QR, transferencias). Con doble clic (o Enter) se abre el detalle con tres
pestanas: **Conceptos de caja** (saldo de cada medio como debito; los faltantes
como credito del medio mas un debito `FAL`, y los sobrantes como debito del medio
mas un credito `SOB`), **Medios de pago** (efectivo en una linea y cada pago de
otros medios con su referencia y documento) y **Cuadre fisico** (saldo, fisico
contado y diferencia por medio, guardados al cerrar caja; en cierres antiguos el
fisico no esta registrado).

**Costeo de platos** (Inventario y Compras > Costeo de platos, permisos `costeo.ver`
y `costeo.editar`, migracion `20261113090000_costeo_platos`). Muestra cada plato con
receta: costo (suma de cantidad x costo unitario de sus insumos), precio de venta,
precio neto sin impuesto, margen y % de costo sobre el neto (en rojo si supera el
objetivo, 33 % por defecto o `OBJETIVO_COSTO_PLATO`). Al abrir un plato se ve su
receta con el costo y la participacion de cada insumo. En la pestana **Costos de
insumos** se edita el costo unitario de cada insumo; tambien se puede descargar una
plantilla y **importar costos desde Excel** (columnas `Referencia` -codigo o nombre
del insumo- y `Costo`). Cada cambio de costo de un insumo (aqui, en Inventario o por
importacion) y cada cambio de receta recalcula y guarda el costo (`Producto.Costo`)
de los platos afectados; el boton **Recalcular** los actualiza todos. El boton **Reporte de costos** descarga un Excel con tres hojas: costeo de platos (costo, precios, margen, % de costo y estado frente al objetivo), recetas (insumo por insumo) e insumos.
**Ajuste al peso (AJP).** Cuando un cobro incluye efectivo, la parte en efectivo
se redondea hacia abajo al multiplo de $50 y la diferencia (menor a $50) se
registra como un pago `AJP - AJUSTE AL PESO` (referencia "Redondeo documento").
El total de la factura no cambia. El medio se crea con la migracion
`20261113080000_ajuste_al_peso`, no aparece como boton de cobro y en el cierre se
cuenta como cualquier otro medio. El servidor rechaza un AJP de $50 o mas o sin
pago en efectivo.

**Recogida parcial.** El efectivo en caja sin la base (ventas en efectivo +
ingresos - egresos - recogidas) se compara con un tope de $1.000.000
(configurable con `TOPE_RECOGIDA_CAJA`); con base de $300.000 se activa al haber $1.300.000 en caja. Al alcanzarlo, una moneda parpadeante lo indica y se abre un recuadro al entrar a
Facturacion, Factura de venta o Caja y despues de cada factura
aparece un aviso: los dos primeros se pueden cancelar y el tercero obliga a
registrar la recogida; el servidor rechaza nuevas facturas hasta hacerlo. La recogida se lleva todo el efectivo fuera de la base, sin importar cuanto sea;
el sistema calcula el valor y en caja queda solo la base. Los avisos solo indican
que hay que recoger, sin mostrar valores. La recogida se descuenta del
efectivo esperado al cerrar. En Caja y en Facturacion hay un boton para hacerla
en cualquier momento. Antes de desplegar, respalda y aplica
`server/prisma/migrations/20261112200000_recogida_parcial/migration.sql` en
cada base de restaurante.

El reporte **Recogidas de caja (parciales y cierre)** lista cada recogida parcial
y cada cierre de caja (recogida final) con consecutivo RC-000001, fecha, hora,
cajero que la hizo, caja y turno. Muestra el efectivo antes, lo recogido y el
saldo que queda, con base incluida, calculado al momento de cada recogida. En el
cierre se recoge el efectivo contado (o el esperado si no se conto) y la caja
queda en $0; el responsable del cierre se toma de la auditoria. El consecutivo
sigue el orden cronologico de todas las recogidas y cierres. Si una factura del
turno tiene pagos inconsistentes, el saldo de ese turno aparece como no disponible.

**Dashboard.** Pantalla de inicio para quien tenga el permiso `dashboard.ver`
(Roles y permisos > Dashboard). Muestra lo facturado hoy, en los ultimos 7 y 30
dias y en el ano, sin propina y en hora de Colombia, con su avance frente a un
objetivo; pedidos por hora (12 o 24 horas, sin cancelados); facturado por dia de
la ultima semana e ingresos (ventas) frente a egresos (compras + egresos de caja)
de los ultimos 12 meses; el top 5 de productos del mes por valor facturado (sin
la propina), los ultimos 10 productos pedidos y el ranking de vendedores del mes
(mesero del pedido o, en ventas directas, quien facturo). Los objetivos los edita quien tenga `dashboard.editar`;
un objetivo vacio deja el indicador sin porcentaje. Antes de desplegar, respalda
y aplica `server/prisma/migrations/20261113010000_dashboard/migration.sql` en cada
base de restaurante: crea la tabla de objetivos y asigna los permisos al rol ADMIN.
Los demas roles los reciben desde Roles y permisos; cada usuario debe volver a
iniciar sesion para ver el cambio.

Para usar este cuadre en una base existente, respalda primero y aplica
`server/prisma/migrations/20261112120000_cuadre_medios_pago/migration.sql` a cada
base de restaurante correspondiente, antes de iniciar la version actualizada.
Regenera el cliente Prisma. La migracion agrega un campo opcional y conserva los
cierres anteriores; no debe aplicarse a otras bases sin revisar su destino.

Antes de desplegar la división de cuenta, aplica en la base de cada restaurante
existente y con respaldo previo las migraciones
`server/prisma/migrations/20261008190000_facturas_divididas_pedido/migration.sql`
y `server/prisma/migrations/20261008193000_division_cuenta_facturas_pagadas/migration.sql`,
en ese orden. La primera permite varias facturas por pedido; la segunda crea el
registro de división y el detalle de formas de pago. Los restaurantes nuevos
reciben el esquema actualizado al crearse.

Para habilitar las reservas de mesas en restaurantes existentes, aplica con
respaldo previo `server/prisma/migrations/20261008200000_reservas_mesas/migration.sql`
en la base del restaurante y después
`server/prisma/migrations/20261008203000_reserva_prepedido/migration.sql` para
guardar el prepedido asociado a la reserva, y
`server/prisma/migrations/20261008210000_reserva_cliente/migration.sql` para
asociar la ficha completa del cliente. Añaden campos a `Mesa`; no modifican las
reservas ya existentes.
```
