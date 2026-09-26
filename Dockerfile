# ============================================================
# EASYPOS — Dockerfile de producción para Dokploy.
# Un solo contenedor: Nginx en :80 sirve el build de client/ (React/Vite) y
# hace proxy de /api → backend Express en :4000 (mismo contenedor).
# La base de datos es externa (DATABASE_URL / PLATFORM_DATABASE_URL).
#
# OJO: a diferencia de un backend típico, este SÍ necesita el CLI de Prisma
# disponible en tiempo de ejecución (no solo @prisma/client): server/src/
# routes/restaurantes.js corre "npx prisma db push" como proceso hijo cada
# vez que se registra un restaurante nuevo (crea su base de datos y aplica el
# esquema al vuelo) — por eso NO se hace "npm ci --omit=dev" en el backend.
# ============================================================

# ---- Etapa 1: build del frontend (Vite) ----
FROM node:20-alpine AS frontend-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---- Etapa 2: backend (deps completas + Prisma Client de ambos esquemas) ----
FROM node:20-alpine AS backend-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npx prisma generate --schema=prisma/schema.prisma \
 && npx prisma generate --schema=prisma/platform/schema.prisma

# ---- Etapa 3: runtime (Nginx + Node, para poder correr el backend y `npx prisma`) ----
FROM nginx:1.27-alpine AS runtime
RUN apk add --no-cache nodejs npm

WORKDIR /app

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY start.sh /start.sh
RUN chmod +x /start.sh

COPY --from=frontend-build /app/client/dist /usr/share/nginx/html
COPY --from=backend-build /app/server /app/server

EXPOSE 80
CMD ["/start.sh"]
