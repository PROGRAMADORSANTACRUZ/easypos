#!/bin/sh
set -e

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

echo "[start] Iniciando backend en :${PORT:-4000}"
(cd /app/server && node src/index.js) &

echo "[start] Iniciando nginx en :80"
exec nginx -g 'daemon off;'
