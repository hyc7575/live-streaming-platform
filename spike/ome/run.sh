#!/usr/bin/env bash
# Re-runs the whole OME spike (issue #2): OME up, ICE probe with OME_HOST_IP='*', full run with 127.0.0.1, summary, OME down.
# KEEP=1 leaves the OME container running. HEADED=1 shows the browser.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
project="${COMPOSE_PROJECT_NAME:-lsp-spike}"
compose=(docker compose -p "$project" -f "$root/compose.yaml" -f "$here/compose.spike.yaml")
export OME_CONTAINER="$project-ome-1"

if [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]]; then
  echo "Node 24+ required (try: export PATH=\"\$HOME/.nvm/versions/node/v24.22.0/bin:\$PATH\")" >&2
  exit 1
fi
[[ -d "$here/node_modules" ]] || (cd "$here" && npm ci --no-audit --no-fund)

mkdir -p "$here/out"
docker pull -q ovenmedialabs/ovenmediaengine:v0.21.0 >/dev/null
docker image inspect ovenmedialabs/ovenmediaengine:v0.21.0 \
  --format 'image={{index .RepoTags 0}} arch={{.Architecture}} os={{.Os}} id={{.Id}}' | tee "$here/out/image.txt"
echo "host: $(uname -sm), docker server arch: $(docker version --format '{{.Server.Arch}}')" | tee -a "$here/out/image.txt"

ome_up() {
  OME_HOST_IP="$1" "${compose[@]}" up -d --force-recreate ome
  for _ in $(seq 1 60); do
    [[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8081/v1/vhosts || true)" == "401" ]] && break
    sleep 1
  done
  docker exec "$OME_CONTAINER" uname -m | sed 's/^/container uname -m: /' | tee -a "$here/out/image.txt"
}

echo "== ICE probe with OME_HOST_IP='*'"
ome_up '*'
node "$here/run.mjs" ice-probe || true

echo "== Full run with OME_HOST_IP=127.0.0.1"
ome_up 127.0.0.1
node "$here/run.mjs" full

node "$here/summary.mjs"

if [[ -z "${KEEP:-}" ]]; then
  "${compose[@]}" down -v
fi
