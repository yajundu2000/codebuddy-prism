#!/usr/bin/env bash
# codebuddy-prism deployment: build locally, ship images to the server, compose up.
# The server (2 cores / 1.9G) never builds — images are `docker save | ssh load`ed.
# Usage: ./deploy.sh build | push | up | logs | down
set -euo pipefail

SERVER_IP="${PRISM_SERVER:-1.12.226.86}"
SERVER_USER="${PRISM_USER:-ubuntu}"
SSH_KEY="${PRISM_SSH_KEY:-/home/david/ClaudeCode/.ssh/tex_paper_cjk.pem}"
SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new $SERVER_USER@$SERVER_IP"
REMOTE_DIR="~/codebuddy-prism"
VERSION="$(node -p "require('./package.json').version")"
APP_IMAGE="codebuddy-prism-app:$VERSION"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"
# docker.io is unreachable from CN without a mirror; DaoCloud's is the usual
# working one. Override with NODE_IMAGE= when it changes.
NODE_IMAGE="${NODE_IMAGE:-docker.m.daocloud.io/library/node:22-alpine}"

case "${1:-}" in
  build)
    # AGPL §13 source offer: the exact tree this image is built from. Kept in
    # source form (no node_modules/dist); a few MB.
    tar czf deploy/source-code.tar.gz \
      --exclude='.git' --exclude='node_modules' --exclude='**/node_modules' \
      --exclude='**/dist' --exclude='.data*' --exclude='.secrets*' \
      --exclude='.cache' --exclude='e2e' --exclude='test-results' \
      --exclude='*.log' --exclude='deploy/.env' --exclude='deploy/source-code.tar.gz' \
      --transform 's,^,codebuddy-prism/,' .
    docker build -f apps/server/Dockerfile \
      --build-arg NPM_REGISTRY="$NPM_REGISTRY" \
      --build-arg NODE_IMAGE="$NODE_IMAGE" \
      -t "$APP_IMAGE" .
    docker tag "$APP_IMAGE" codebuddy-prism-app:latest
    echo "built $APP_IMAGE"
    ;;
  push)
    [[ -d deploy ]] || { echo "run from the repo root"; exit 1; }
    echo "shipping image (this streams ~300MB, a minute or two)…"
    docker save "codebuddy-prism-app:$VERSION" codebuddy-prism-app:latest | gzip | $SSH "gunzip | docker load"
    $SSH "mkdir -p $REMOTE_DIR/deploy"
    scp -i "$SSH_KEY" deploy/docker-compose.prism.yml "$SERVER_USER@$SERVER_IP:$REMOTE_DIR/docker-compose.prism.yml"
    # .env ships only if present locally; the key never touches the repo
    if [[ -f deploy/.env ]]; then
      scp -i "$SSH_KEY" deploy/.env "$SERVER_USER@$SERVER_IP:$REMOTE_DIR/.env"
      $SSH "chmod 600 $REMOTE_DIR/.env"
    fi
    echo "pushed."
    ;;
  up)
    # The bind is per machine, never in the shared deploy/.env (a push ships
    # that file to BOTH machines and would silently flip the other one):
    # the prod box sits behind weixin-caddy and must not expose 8080 publicly;
    # the test box has no caddy and lives on its public 8080.
    BIND="${PRISM_BIND:-$([ "$SERVER_IP" = "129.204.147.164" ] && echo 172.18.0.1 || echo 0.0.0.0)}"
    # Public origin is per machine too (the shared deploy/.env ships to both).
    URL="${ALDINE_PUBLIC_URL:-$([ "$SERVER_IP" = "129.204.147.164" ] && echo https://wenzao.site || echo "http://$SERVER_IP:${PRISM_PORT:-8080}")}"
    $SSH "cd $REMOTE_DIR && PRISM_BIND=$BIND ALDINE_PUBLIC_URL=$URL docker compose -f docker-compose.prism.yml --env-file .env up -d --wait && sleep 2 && curl -sf http://$BIND:${PRISM_PORT:-8080}/api/version || curl -sf http://$BIND:${PRISM_PORT:-8080}/api/health || true"
    echo; echo "deployed: http://$SERVER_IP:${PRISM_PORT:-8080} (bind $BIND)"
    ;;
  logs)
    $SSH "cd $REMOTE_DIR && docker compose -f docker-compose.prism.yml logs --tail=80 ${2:-}"
    ;;
  down)
    $SSH "cd $REMOTE_DIR && docker compose -f docker-compose.prism.yml down"
    ;;
  *)
    echo "usage: $0 build|push|up|logs [service]|down"
    echo "env: PRISM_SERVER PRISM_USER PRISM_SSH_KEY PRISM_PORT NPM_REGISTRY"
    exit 1
    ;;
esac
