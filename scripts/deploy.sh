#!/usr/bin/env bash
# Updates the running game to the latest commit on master, and puts the previous version back if the new one doesn't come up healthy.
#
# This is the ONLY thing the GitHub Actions deploy key may run (it is installed with a forced command, see DEPLOY.md), and
# you can run it by hand on the server too:   ./scripts/deploy.sh
#
# Players are disconnected for a few seconds while the container restarts; their clients reconnect on their own and the
# room and accounts come back from the last save.
set -euo pipefail

cd "${CYBERSTATION_DIR:-/opt/cyberstation}"
SERVICE=cyberstation
HEALTH_TIMEOUT_SECONDS=${HEALTH_TIMEOUT_SECONDS:-120}

before=$(git rev-parse HEAD)
git pull --ff-only
after=$(git rev-parse HEAD)
echo "Deploying ${after:0:7} (was ${before:0:7})"

docker compose up -d --build "$SERVICE"

# Caddy mounts its config as a file, so a changed Caddyfile only takes effect on a reload.
if [ "$before" != "$after" ] && ! git diff --quiet "$before" "$after" -- deploy/Caddyfile; then
  echo "Caddyfile changed: reloading Caddy"
  docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile
fi

wait_until_healthy() {
  local container status
  container=$(docker compose ps -q "$SERVICE")
  for _ in $(seq 1 $((HEALTH_TIMEOUT_SECONDS / 3))); do
    status=$(docker inspect --format '{{.State.Health.Status}}' "$container" 2>/dev/null || echo missing)
    [ "$status" = healthy ] && return 0
    sleep 3
  done
  return 1
}

if wait_until_healthy; then
  docker image prune -f >/dev/null
  echo "Healthy: now running ${after:0:7}"
  exit 0
fi

echo "The new version did not become healthy within ${HEALTH_TIMEOUT_SECONDS}s: rolling back to ${before:0:7}" >&2
docker compose logs --tail 40 "$SERVICE" >&2 || true
git reset --hard "$before"
docker compose up -d --build "$SERVICE"
wait_until_healthy && echo "Rolled back to ${before:0:7}, which is healthy" >&2 || echo "The rollback is not healthy either: check the server" >&2
exit 1
