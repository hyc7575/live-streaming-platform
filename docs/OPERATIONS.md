# 운영 메모

운영 서버 한 대에 `deploy/compose.yaml`로 서비스 전체를 띄운다. 이 문서는 첫 배포, 재배포, 장애 뒤 복구, 로그, 다운 감시 절차다. 서버 정보(도메인 `lsp-live.duckdns.org`, 공인 IP, 방화벽)는 `docs/NEXT-STEPS.md` S2–S4에 있다.

## 구성

| 서비스 | 하는 일 | 밖으로 여는 포트 |
|---|---|---|
| `caddy` | TLS(Let's Encrypt), 웹 정적 파일, `/api/*` → `api`, `/app/*` → `ome` | 80/tcp, 443/tcp |
| `api` | NestJS API. 시작할 때 `prisma migrate deploy`를 먼저 돌린다 | 없음 |
| `ome` | OvenMediaEngine. WHIP 송출, LL-HLS | 10000-10003/udp, 10000/tcp, 3478/tcp |
| `postgres` | PostgreSQL 18 | 없음 |

- 모든 서비스가 `restart: unless-stopped`다. 컨테이너가 죽거나 서버가 재부팅되면 Docker가 다시 띄운다.
- OME 시그널링·LL-HLS(3333)와 관리 API(8081)는 compose 네트워크 안에서만 쓴다. OME는 송출 허가를 `http://api:3000/api/ome/admission`에 묻고, API는 `http://ome:8081`로 송출을 끊는다.
- 값은 `deploy/.env`에서 읽는다. 항목과 설명은 `deploy/.env.example`에 있다. 저장소 루트의 `.env`(로컬 개발용)와 다른 파일이다.
- 데이터는 named volume에 남는다: `lsp-prod_postgres-data`(DB), `lsp-prod_caddy-data`(인증서). `docker compose down -v`는 이 둘을 지우므로 운영에서는 쓰지 않는다.
- 컨테이너 로그는 서비스마다 10MB × 3개까지만 남는다.
- 공인 IP `129.225.169.22`는 Ephemeral이다. OCI 문서상 인스턴스를 Stop/Start하거나 재부팅해도 유지되지만, **Terminate하면 사라지고 같은 주소로 되돌릴 수 없다.** 콘솔에서 이 인스턴스를 Terminate하지 않는다. 다른 인스턴스(A1 등)로 옮길 때는 Reserved IP를 만들어 붙이고 DuckDNS와 `OME_HOST_IP`를 새 주소로 바꾼다.

아래 명령은 모두 서버의 저장소 폴더(예: `~/live-streaming-platform`)에서 실행한다.

## 첫 배포

1. Docker가 부팅 때 켜지는지 확인한다. 둘 다 `enabled`여야 한다.

   ```sh
   systemctl is-enabled docker containerd
   # enabled가 아니면
   sudo systemctl enable docker containerd
   ```

2. 임시 구성(`~/lsp`)이 80·443·10000·3478 포트를 쓰고 있으면 내린다.

   ```sh
   cd ~/lsp && docker compose -f compose.yaml -f compose.server.yaml down
   ```

3. 저장소를 받고 `deploy/.env`를 채운다.

   ```sh
   git clone https://github.com/hyc7575/live-streaming-platform.git ~/live-streaming-platform
   cd ~/live-streaming-platform
   cp deploy/.env.example deploy/.env
   chmod 600 deploy/.env
   # DOMAIN, OME_HOST_IP, POSTGRES_PASSWORD, SESSION_SECRET, OME_WEBHOOK_SECRET, OME_API_ACCESS_TOKEN을 채운다
   ```

4. 이미지를 서버에서 빌드하고 띄운다. `--wait`는 모든 서비스가 healthy가 될 때까지 기다린다.

   ```sh
   docker compose -f deploy/compose.yaml up -d --build --wait
   ```

5. 테스트 계정을 쓰면 `deploy/.env`에 `TEST_ACCOUNTS_ENABLED=true`와 `TEST_ACCOUNT_*`를 넣고 시드를 한 번 돌린다.

   ```sh
   docker compose -f deploy/compose.yaml exec api node dist/seed.js
   ```

6. 확인한다.

   ```sh
   curl -fsS https://lsp-live.duckdns.org/api/health   # {"status":"ok"}
   docker compose -f deploy/compose.yaml ps            # 4개 모두 Up
   ```

## 재배포

```sh
git pull
docker compose -f deploy/compose.yaml up -d --build --wait
```

바뀐 이미지의 서비스만 다시 만든다. 새 마이그레이션은 API가 시작할 때 적용한다. `deploy/.env`만 바꿨을 때도 같은 명령을 쓴다.

## 재부팅·장애 뒤 복구

다운 알림을 받으면 서버에 SSH로 들어가 아래 세 줄을 실행한다.

```sh
sudo systemctl start docker
cd ~/live-streaming-platform && docker compose -f deploy/compose.yaml up -d --wait
curl -fsS https://lsp-live.duckdns.org/api/health
```

- 세 번째 줄이 `{"status":"ok"}`를 돌려주면 복구된 것이다. 아니면 아래 "로그"로 원인을 본다.
- 재부팅 때 Docker는 compose의 `depends_on` 순서를 지키지 않고 컨테이너를 한꺼번에 띄운다. PostgreSQL이 준비되기 전에 API가 뜨면 마이그레이션이 실패해 API가 몇 번 재시작한다. 1분 안에 healthy가 되면 정상이다.
- 서버 공인 IP가 바뀌었으면 DuckDNS 레코드와 `deploy/.env`의 `OME_HOST_IP`를 함께 고치고 두 번째 줄을 다시 실행한다.

재부팅 복구를 직접 확인하려면 `sudo reboot` 뒤 2분쯤 기다렸다가 SSH 없이 브라우저나 `curl`로 `https://lsp-live.duckdns.org/api/health`와 방송 목록을 연다.

## 로그

```sh
docker compose -f deploy/compose.yaml ps
docker compose -f deploy/compose.yaml logs --tail=200 -f api
docker compose -f deploy/compose.yaml logs --tail=200 ome caddy postgres
```

- 송출 허가 결과는 API 로그의 `PublishController` 줄에 남는다.
- 인증서 발급·갱신 실패는 Caddy 로그에 남는다.

## 다운 감시 (UptimeRobot)

무료 플랜으로 운영자가 직접 설정한다.

1. https://uptimerobot.com 에 가입하고, 알림 받을 메일 주소를 Alert Contact로 확인한다.
2. **Add New Monitor**에서 둘을 만든다. 간격은 5분(무료 최소값)이다.
   - Keyword 모니터: URL `https://lsp-live.duckdns.org/api/health`, 키워드 `ok`가 있을 때 정상. Caddy와 API를 함께 본다.
   - HTTP(s) 모니터: URL `https://lsp-live.duckdns.org/api/broadcasts`. 공개 방송 목록이라 DB까지 본다.
3. 알림을 실제로 받아 본다. 서버에서 Caddy를 잠시 내리고, 메일이 오면 다시 올린다.

   ```sh
   docker compose -f deploy/compose.yaml stop caddy
   # Down 메일을 받은 뒤
   docker compose -f deploy/compose.yaml start caddy
   ```

4. Up 메일도 오는지 확인한다.
