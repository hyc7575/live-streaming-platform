#!/usr/bin/env bash
# S6 수동 페이지를 서버 ~/lsp/spike 에 올리고 Caddy가 /spike/* 로 제공하게 한다. 여러 번 돌려도 같은 상태가 된다.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
host="${S6_HOST:-ubuntu@129.225.169.22}"
key="${S6_KEY:-$HOME/.ssh/oci_lsp}"
ssh_() { ssh -i "$key" "$host" "$@"; }

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/vendor"
cp "$here"/*.html "$stage/"
cp "$here/../node_modules/ovenlivekit/dist/OvenLiveKit.min.js" "$stage/vendor/"
cp "$here/../node_modules/hls.js/dist/hls.min.js" "$stage/vendor/"

ssh_ 'mkdir -p ~/lsp/spike'
scp -i "$key" -r "$stage"/. "$host:lsp/spike/"
scp -i "$key" "$here/cpu.sh" "$host:lsp/spike-cpu.sh"

ssh_ bash -s <<'REMOTE'
set -euo pipefail
cd ~/lsp
if ! grep -q 'handle_path /spike/\*' Caddyfile; then
  python3 - <<'PY'
p = 'Caddyfile'
s = open(p).read()
block = "\thandle_path /spike/* {\n\t\troot * /srv/spike\n\t\tfile_server\n\t}\n\thandle {"
s = s.replace("\thandle {", block, 1)
open(p, 'w').write(s)
PY
fi
if ! grep -q '/srv/spike' compose.server.yaml; then
  sed -i 's|      - ./Caddyfile:/etc/caddy/Caddyfile:ro|      - ./Caddyfile:/etc/caddy/Caddyfile:ro\n      - ./spike:/srv/spike:ro|' compose.server.yaml
fi
sudo docker compose -f compose.yaml -f compose.server.yaml up -d ome caddy
sudo docker compose -f compose.yaml -f compose.server.yaml exec -T caddy caddy reload --config /etc/caddy/Caddyfile
REMOTE

for p in mobile-publish.html watch.html vendor/OvenLiveKit.min.js vendor/hls.min.js; do
  printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "https://lsp-live.duckdns.org/spike/$p")" "$p"
done
