# EASYPOS 🍔

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
EASYPOS/
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
3. Configura el dominio en Dokploy (ajusta `easypos.grupo-santacruz.com` en
   `docker-compose.yml`/`deploy.sh` si el dominio real es otro).
4. En instalaciones con datos, deja `RUN_DB_INIT=false` y `RUN_SEED=false`
   también en el panel de Dokploy. El sembrado borra y recrea productos, y
   aplicar sucesivamente ambos esquemas con `prisma db push --accept-data-loss`
   sobre la misma base puede eliminar tablas del otro esquema. La inicialización
   de una instalación nueva debe hacerse manualmente, antes de cargar datos.
5. Si Dokploy no conserva los labels de Traefik tras un redeploy, correr
   `./deploy.sh <nombre-real-del-servicio>` (ver el id real en el panel).

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

Antes de desplegar la división de cuenta, aplica en la base de cada restaurante
existente y con respaldo previo las migraciones
`server/prisma/migrations/20261008190000_facturas_divididas_pedido/migration.sql`
y `server/prisma/migrations/20261008193000_division_cuenta_facturas_pagadas/migration.sql`,
en ese orden. La primera permite varias facturas por pedido; la segunda crea el
registro de división y el detalle de formas de pago. Los restaurantes nuevos
reciben el esquema actualizado al crearse.

Para habilitar las reservas de mesas en restaurantes existentes, aplica con
respaldo previo `server/prisma/migrations/20261008200000_reservas_mesas/migration.sql`
en la base del restaurante. Añade los datos de la reserva a la tabla `Mesa`.
```
