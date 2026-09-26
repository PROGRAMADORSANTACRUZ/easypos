#!/bin/sh
set -e

# nginx.conf es una plantilla (proxy_pass usa ${BACKEND_PORT}) porque el
# puerto real del backend depende de la variable PORT configurada en
# Dokploy — sin esto, si PORT cambia, nginx queda apuntando a un puerto
# viejo y todo /api/* da 502 "Connection refused".
export BACKEND_PORT="${PORT:-4000}"
envsubst '${BACKEND_PORT}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

if [ "${RUN_DB_INIT:-false}" = "true" ] || [ "${RUN_SEED:-false}" = "true" ]; then
  echo "[start] Inicializacion y seed automaticos deshabilitados; ejecutarlos manualmente en instalaciones nuevas." >&2
fi

echo "[start] Iniciando backend en :${BACKEND_PORT}"
(cd /app/server && node src/index.js) &

echo "[start] Iniciando nginx en :80"
exec nginx -g 'daemon off;'
