#!/bin/sh
set -e

# nginx.conf es una plantilla (proxy_pass usa ${BACKEND_PORT}) porque el
# puerto real del backend depende de la variable PORT configurada en
# Dokploy — sin esto, si PORT cambia, nginx queda apuntando a un puerto
# viejo y todo /api/* da 502 "Connection refused".
export BACKEND_PORT="${PORT:-4000}"
envsubst '${BACKEND_PORT}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# Aplica el esquema de la base de PLATAFORMA (directorio de restaurantes) —
# idempotente, pero solo hace falta correrlo una vez (después déjalo en false).
if [ "${RUN_DB_INIT:-false}" = "true" ]; then
  echo "[start] Aplicando esquema de la base de PLATAFORMA..."
  if (cd /app/server && npx prisma db push --schema=prisma/platform/schema.prisma --skip-generate --accept-data-loss); then
    echo "[start] Esquema de plataforma aplicado."
  else
    echo "[start] No se pudo aplicar el esquema de plataforma; la API sigue arriba."
  fi
fi

echo "[start] Iniciando backend en :${BACKEND_PORT}"
(cd /app/server && node src/index.js) &

echo "[start] Iniciando nginx en :80"
exec nginx -g 'daemon off;'
