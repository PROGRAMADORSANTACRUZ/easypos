#!/bin/bash
# Aplica labels de Traefik por SSH/Swarm para POS (por si Dokploy no
# conserva los labels del docker-compose.yml sobre el servicio real).
# Dominio: pos.grupo-santacruz.com (ajústalo si el dominio real es otro).
#
# Uso:
#   ./deploy.sh [SERVICE_NAME]
# Si no se pasa SERVICE_NAME, usa el nombre que asignó Dokploy al crear
# la aplicación (ver el id real en el panel de Dokploy y reemplázalo abajo).

set -euo pipefail

SERVICE_NAME="posgruposantacruz-5wzjke"

docker service update \
  --label-add 'traefik.enable=true' \
  --label-add 'traefik.docker.network=dokploy-network' \
  --label-add 'traefik.http.routers.pos.rule=Host(`pos.grupo-santacruz.com`)' \
  --label-add 'traefik.http.routers.pos.entrypoints=websecure' \
  --label-add 'traefik.http.routers.pos.tls=true' \
  --label-add 'traefik.http.routers.pos.tls.certresolver=letsencrypt' \
  --label-add 'traefik.http.routers.pos.service=pos' \
  --label-add 'traefik.http.services.pos.loadbalancer.server.port=80' \
  --label-add 'traefik.http.routers.pos-web.rule=Host(`pos.grupo-santacruz.com`)' \
  --label-add 'traefik.http.routers.pos-web.entrypoints=web' \
  --label-add 'traefik.http.routers.pos-web.middlewares=pos-redirect-https' \
  --label-add 'traefik.http.routers.pos-web.service=pos' \
  --label-add 'traefik.http.middlewares.pos-redirect-https.redirectscheme.scheme=https' \
  --label-add 'traefik.http.middlewares.pos-redirect-https.redirectscheme.permanent=true' \
  "$SERVICE_NAME"

echo "Labels aplicados correctamente a $SERVICE_NAME"
