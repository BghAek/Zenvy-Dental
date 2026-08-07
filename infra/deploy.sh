#!/usr/bin/env bash
# Deploy production. Run on the VPS:
#   ssh zenvy@<vps> /srv/zenvy/infra/deploy.sh          # latest main
#   ssh zenvy@<vps> /srv/zenvy/infra/deploy.sh <sha>    # roll back to a commit
# First-time setup: docs/14-deploy.md.
set -euo pipefail

cd "$(dirname "$0")/.."
compose=(docker compose -f docker-compose.prod.yml)

if [ -n "${1:-}" ]; then
  git fetch --all --tags
  git checkout --detach "$1"
else
  git pull --ff-only
fi

# Build before touching the running stack: a failing build leaves it serving.
"${compose[@]}" build

# Migrations first. Every migration so far is additive, so the running API keeps
# working against the new schema until it is replaced a few seconds later.
"${compose[@]}" --profile tools run --rm migrate

# --wait blocks on the API healthcheck (Postgres and Redis reachable), so a
# broken deploy exits non-zero here instead of looking like a success.
"${compose[@]}" up -d --wait

docker image prune -f
echo "Deployed $(git rev-parse --short HEAD)."
