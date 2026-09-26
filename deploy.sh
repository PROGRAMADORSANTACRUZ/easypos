#!/bin/bash
# Aplica labels de Traefik por SSH/Swarm para EASYPOS (por si Dokploy no
# conserva los labels del docker-compose.yml sobre el servicio real).
# Dominio: easypos.grupo-santacruz.com (ajústalo si el dominio real es otro).
#
# Uso:
#   ./deploy.sh [SERVICE_NAME]
# Si no se pasa SERVICE_NAME, usa el nombre que asignó Dokploy al crear
# la aplicación (ver el id real en el panel de Dokploy y reemplázalo abajo).

set -euo pipefail

SERVICE_NAME="${1:-easypos-easyposapp}"

docker service update \
  --label-add 'traefik.enable=true' \
  --label-add 'traefik.docker.network=dokploy-network' \
  --label-add 'traefik.http.routers.easypos.rule=Host(`easypos.grupo-santacruz.com`)' \
  --label-add 'traefik.http.routers.easypos.entrypoints=websecure' \
  --label-add 'traefik.http.routers.easypos.tls=true' \
  --label-add 'traefik.http.routers.easypos.tls.certresolver=letsencrypt' \
  --label-add 'traefik.http.routers.easypos.service=easypos' \
  --label-add 'traefik.http.services.easypos.loadbalancer.server.port=80' \
  --label-add 'traefik.http.routers.easypos-web.rule=Host(`easypos.grupo-santacruz.com`)' \
  --label-add 'traefik.http.routers.easypos-web.entrypoints=web' \
  --label-add 'traefik.http.routers.easypos-web.middlewares=easypos-redirect-https' \
  --label-add 'traefik.http.middlewares.easypos-redirect-https.redirectscheme.scheme=https' \
  --label-add 'traefik.http.middlewares.easypos-redirect-https.redirectscheme.permanent=true' \
  "$SERVICE_NAME"

echo "Labels aplicados correctamente a $SERVICE_NAME"
