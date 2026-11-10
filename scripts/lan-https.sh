#!/usr/bin/env bash
# Prepares the local stack for a phone on the same Wi-Fi: a mkcert certificate
# for the Mac's LAN IP, and the .env lines to add by hand. It never edits .env.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v mkcert >/dev/null; then
  echo "mkcert가 없습니다. brew install mkcert 로 설치한 뒤 다시 실행하세요." >&2
  exit 1
fi

ip="${1:-$(ipconfig getifaddr en0 || true)}"
if [[ -z "$ip" ]]; then
  echo "LAN IP를 찾지 못했습니다. Wi-Fi에 연결한 뒤 다시 실행하거나 IP를 인자로 주세요: $0 192.168.0.10" >&2
  exit 1
fi

mkcert -install
mkdir -p .certs
mkcert -cert-file .certs/lan.pem -key-file .certs/lan-key.pem "$ip" localhost 127.0.0.1

cat <<MSG

인증서를 만들었습니다: .certs/lan.pem, .certs/lan-key.pem (git에 올라가지 않습니다)

1) .env에 아래 세 줄을 넣거나 고칩니다.
   WEB_HTTPS_CERT=.certs/lan.pem
   WEB_HTTPS_KEY=.certs/lan-key.pem
   OME_HOST_IP=$ip

2) OME를 새 OME_HOST_IP로 다시 만들고, API와 웹을 띄웁니다.
   docker compose up -d --wait ome
   pnpm --filter @lsp/api dev
   pnpm --filter @lsp/web dev

3) 휴대폰이 이 인증서를 믿도록 mkcert 루트 인증서를 휴대폰에 설치합니다.
   파일: $(mkcert -CAROOT)/rootCA.pem
   Android: 파일을 휴대폰으로 옮긴 뒤 설정 → 보안 → 암호화 및 사용자 인증 정보 → 인증서 설치 → CA 인증서
   iPhone: 파일을 AirDrop으로 보내 프로필을 설치하고, 설정 → 일반 → 정보 → 인증서 신뢰 설정에서 켭니다

4) 휴대폰 브라우저에서 엽니다: https://$ip:<WEB_PORT, 기본 5173>
MSG
