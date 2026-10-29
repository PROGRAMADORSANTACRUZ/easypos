#!/bin/bash
# Aplica labels de Traefik por SSH/Swarm para EASYPOS (por si Dokploy no
# conserva los labels del docker-compose.yml sobre el servicio real).
# Dominios: pos.grupo-santacruz.com (principal) y easypos.grupo-santacruz.com (alias).
#
# Uso:
#   ./deploy.sh [SERVICE_NAME]
# Si no se pasa SERVICE_NAME, usa el servicio de EASYPOS en Dokploy.
# Obtén el nombre real con: docker service ls --format '{{.Name}}'

set -euo pipefail

SERVICE_NAME="${1-posgruposantacruz-5wzjke}"
if [ -z "$SERVICE_NAME" ]; then
  echo "Uso: ./deploy.sh NOMBRE_REAL_DEL_SERVICIO" >&2
  echo "Lista de servicios disponibles:" >&2
  docker service ls --format '{{.Name}}' >&2
  exit 1
fi

if ! docker service inspect "$SERVICE_NAME" >/dev/null 2>&1; then
  echo "No existe el servicio: $SERVICE_NAME" >&2
  docker service ls --format '{{.Name}}' >&2
  exit 1
fi

docker service update \
  --label-add 'traefik.enable=true' \
  --label-add 'traefik.docker.network=dokploy-network' \
  --label-add 'traefik.http.routers.easypos.rule=Host(`pos.grupo-santacruz.com`) || Host(`easypos.grupo-santacruz.com`)' \
  --label-add 'traefik.http.routers.easypos.entrypoints=websecure' \
  --label-add 'traefik.http.routers.easypos.tls=true' \
  --label-add 'traefik.http.routers.easypos.tls.certresolver=letsencrypt' \
  --label-add 'traefik.http.routers.easypos.service=easypos' \
  --label-add 'traefik.http.services.easypos.loadbalancer.server.port=80' \
  --label-add 'traefik.http.routers.easypos-web.rule=Host(`pos.grupo-santacruz.com`) || Host(`easypos.grupo-santacruz.com`)' \
  --label-add 'traefik.http.routers.easypos-web.entrypoints=web' \
  --label-add 'traefik.http.routers.easypos-web.middlewares=easypos-redirect-https' \
  --label-add 'traefik.http.middlewares.easypos-redirect-https.redirectscheme.scheme=https' \
  --label-add 'traefik.http.middlewares.easypos-redirect-https.redirectscheme.permanent=true' \
  "$SERVICE_NAME"

echo "Labels aplicados correctamente a $SERVICE_NAME"
docker service ps "$SERVICE_NAME"
