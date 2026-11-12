# 운영 메모

운영 서버 한 대에 `deploy/compose.yaml`로 서비스 전체를 띄운다. 이 문서는 첫 배포, 재배포, 장애 뒤 복구, DB 덤프, 녹화 파일, 도네이션 키, 로그, 다운 감시 절차다. 서버 정보(공인 IP, 방화벽)는 `docs/NEXT-STEPS.md` S2–S4에 있다. 도메인은 `lime-live.duckdns.org`다. 2026-11-11에 `lsp-live.duckdns.org`에서 옮겼고, 옛 주소는 `LEGACY_DOMAIN`으로 새 주소에 301 리다이렉트한다.

## 구성

| 서비스 | 하는 일 | 밖으로 여는 포트 |
|---|---|---|
| `caddy` | TLS(Let's Encrypt), 웹 정적 파일, `/api/*` → `api`, `/app/*` → `ome`, `/recordings/*` → 녹화 파일 | 80/tcp, 443/tcp |
| `api` | NestJS API. 시작할 때 `prisma migrate deploy`를 먼저 돌린다. 녹화 시작·중지와 녹화 용량 정리 | 없음 |
| `ome` | OvenMediaEngine. WHIP 송출, LL-HLS, 녹화 | 10000-10003/udp, 10000/tcp, 3478/tcp |
| `postgres` | PostgreSQL 18 | 없음 |
| `db-backup` | 매일 04:00(KST) PostgreSQL 덤프, 오래된 덤프 삭제. 아래 "DB 덤프와 복원" | 없음 |

- 모든 서비스가 `restart: unless-stopped`다. 컨테이너가 죽거나 서버가 재부팅되면 Docker가 다시 띄운다.
- OME 시그널링·LL-HLS(3333)와 관리 API(8081)는 compose 네트워크 안에서만 쓴다. OME는 송출 허가를 `http://api:3000/api/ome/admission`에 묻고, API는 `http://ome:8081`로 송출을 끊는다.
- 값은 `deploy/.env`에서 읽는다. 항목과 설명은 `deploy/.env.example`에 있다. 저장소 루트의 `.env`(로컬 개발용)와 다른 파일이다.
- 데이터는 named volume에 남는다: `lsp-prod_postgres-data`(DB), `lsp-prod_caddy-data`(인증서). `docker compose down -v`는 이 둘을 지우므로 운영에서는 쓰지 않는다. DB 덤프와 녹화 파일은 volume이 아니라 호스트 폴더 `deploy/backups/`, `deploy/recordings/`에 있어 `down -v`로 지워지지 않는다.
- 컨테이너 로그는 서비스마다 10MB × 3개까지만 남는다.
- 공인 IP `129.225.169.22`는 Ephemeral이다. OCI 문서상 인스턴스를 Stop/Start하거나 재부팅해도 유지되지만, **Terminate하면 사라지고 같은 주소로 되돌릴 수 없다.** 콘솔에서 이 인스턴스를 Terminate하지 않는다. 다른 인스턴스(A1 등)로 옮길 때는 Reserved IP를 만들어 붙이고 DuckDNS 레코드 두 개(`lime-live`, `lsp-live`)와 `OME_HOST_IP`를 새 주소로 바꾼다.

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
   curl -fsS https://lime-live.duckdns.org/api/health   # {"status":"ok"}
   docker compose -f deploy/compose.yaml ps            # 5개 모두 Up
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
curl -fsS https://lime-live.duckdns.org/api/health
```

- 세 번째 줄이 `{"status":"ok"}`를 돌려주면 복구된 것이다. 아니면 아래 "로그"로 원인을 본다.
- 재부팅 때 Docker는 compose의 `depends_on` 순서를 지키지 않고 컨테이너를 한꺼번에 띄운다. PostgreSQL이 준비되기 전에 API가 뜨면 마이그레이션이 실패해 API가 몇 번 재시작한다. 1분 안에 healthy가 되면 정상이다.
- 서버 공인 IP가 바뀌었으면 DuckDNS 레코드 두 개와 `deploy/.env`의 `OME_HOST_IP`를 함께 고치고 두 번째 줄을 다시 실행한다.

재부팅 복구를 직접 확인하려면 `sudo reboot` 뒤 2분쯤 기다렸다가 SSH 없이 브라우저나 `curl`로 `https://lime-live.duckdns.org/api/health`와 방송 목록을 연다.

## DB 덤프와 복원

`db-backup` 서비스가 매일 04:00(KST)에 `pg_dump -Fc`로 덤프를 하나 만든다. 스크립트는 `deploy/db-backup.sh`다.

- 위치: `deploy/backups/lsp-YYYYmmdd-HHMMSS.dump`. `deploy/.env`의 `BACKUP_DIR`로 바꿀 수 있다(상대 경로는 `deploy/` 기준).
- 보관: 덤프를 만든 뒤 `BACKUP_RETENTION_DAYS`(기본 7)일보다 오래된 덤프를 지운다. 덤프가 실패하면 아무것도 지우지 않는다.
- 덤프는 임시 이름(`.lsp-….dump.partial`)으로 쓴 뒤 이름을 바꾼다. 실패하면 임시 파일을 지우고 로그에 `db-backup: FAILED`를 남긴다.
- **서버 밖 사본은 아직 없다.** 디스크나 인스턴스를 잃으면 덤프도 함께 잃는다.

최근 덤프와 결과를 확인한다.

```sh
ls -lt deploy/backups | head
docker compose -f deploy/compose.yaml logs --tail=20 db-backup   # db-backup: wrote lsp-….dump
```

지금 바로 덤프를 하나 만든다. 배포 전이나 위험한 작업 전에 쓴다.

```sh
docker compose -f deploy/compose.yaml exec db-backup sh /db-backup.sh
```

### 복원

덤프로 운영 DB를 되돌린다. 덤프 시각 이후의 데이터는 사라진다.

```sh
docker compose -f deploy/compose.yaml stop api caddy
docker compose -f deploy/compose.yaml up -d --wait postgres db-backup   # DB 볼륨을 잃었다면 빈 DB로 새로 뜬다
ls -lt deploy/backups | head                                             # 되돌릴 파일 이름을 고른다
docker compose -f deploy/compose.yaml exec db-backup \
  sh -c 'pg_restore --clean --if-exists --no-owner -d "$PGDATABASE" /backups/lsp-YYYYmmdd-HHMMSS.dump'
docker compose -f deploy/compose.yaml up -d --wait
curl -fsS https://lime-live.duckdns.org/api/broadcasts
```

- `--clean --if-exists`는 있는 테이블을 지우고 다시 만든다. 빈 DB에도, 데이터가 있는 DB에도 같은 명령을 쓴다.
- API는 시작할 때 `prisma migrate deploy`를 돌린다. 덤프에 마이그레이션 기록(`_prisma_migrations`)이 들어 있어서, 덤프 뒤에 추가된 마이그레이션만 적용한다.

운영 데이터를 건드리지 않고 덤프가 살아나는지만 보려면 별도 DB에 복원한다.

```sh
docker compose -f deploy/compose.yaml exec db-backup sh -c '
  createdb lsp_restore_check &&
  pg_restore --no-owner -d lsp_restore_check /backups/lsp-YYYYmmdd-HHMMSS.dump &&
  psql -d lsp_restore_check -tAc "select count(*) from \"User\"; select count(*) from \"Broadcast\""'
docker compose -f deploy/compose.yaml exec db-backup dropdb lsp_restore_check
```

## 녹화 파일

`LIVE`가 된 방송은 OME가 녹화한다(#19). 끝난 방송의 녹화는 다시보기로 `https://<도메인>/recordings/...`에서 재생된다.

- 위치: `deploy/recordings/<방송 id>/<녹화 id>_<순번>.mp4`. `deploy/.env`의 `RECORDINGS_DIR`로 바꿀 수 있다(상대 경로는 `deploy/` 기준). OME가 쓰고, API가 용량을 재고 지우고, Caddy가 읽기 전용으로 내준다.
- 녹화 중인 파일은 `tmp_…` 이름이고, 송출이 끊기거나 방송이 끝나면 `.mp4`로 바뀐다. 유예 시간 안에 다시 송출하면 순번이 하나 늘어난 새 파일이 생긴다.
- 상한: API가 30초마다 폴더 전체 크기를 잰다. `RECORDINGS_MAX_GB`(기본 10)를 넘으면 오래 전에 끝난 방송의 녹화부터 지운다. 지우기 전에 DB의 녹화 목록을 먼저 비우므로, 다시보기 목록에 지워진 파일이 남지 않는다. 송출 중인 방송의 녹화는 지우지 않는다. 송출 중인 녹화만으로 상한을 넘으면 API 로그에 경고만 남긴다.
- 방송을 삭제하면 다음 정리(최대 30초)에서 그 방송의 녹화 폴더도 지운다.
- DB 덤프와 달리 녹화는 백업하지 않는다. 서버를 잃으면 녹화도 잃는다.

상한은 서버 디스크 여유를 보고 정한다. 녹화는 송출 비트레이트 그대로 저장되므로, 1시간 방송이 대략 1~2GB다(추정, 브라우저 송출 비트레이트에 따라 다르다).

```sh
df -h /                                                       # 디스크 여유
du -sh deploy/recordings                                      # 녹화가 쓰는 용량
docker compose -f deploy/compose.yaml logs --tail=50 api | grep Recording
```

### 녹화 기능 처음 반영 (#19)

이 변경은 OME 설정(`ome/Server.xml`), Caddy 설정, compose의 볼륨, DB 스키마를 함께 바꾼다. **OME를 다시 만들면 송출 중인 방송이 끊기므로** 아무도 송출하지 않을 때 한다.

```sh
cd ~/live-streaming-platform
docker compose -f deploy/compose.yaml exec db-backup sh /db-backup.sh   # 반영 전 덤프
git pull
# deploy/.env에 RECORDINGS_MAX_GB를 정해 넣는다(비우면 10). df -h / 로 여유를 먼저 본다
docker compose -f deploy/compose.yaml up -d --build --wait
docker compose -f deploy/compose.yaml ps                                  # 5개 모두 Up
ls -ld deploy/recordings                                                   # 폴더가 생겼다
```

- `--build`가 API(마이그레이션 포함)와 Caddy(Caddyfile이 이미지에 들어 있다) 이미지를 다시 만든다. OME는 볼륨이 바뀌었으므로 다시 만들어진다.
- 반영 뒤 짧은 방송을 하나 송출하고 종료한다. 1분 안에 `deploy/recordings/<방송 id>/`에 `.mp4`가 생기고, 방송 목록의 "다시보기"에 나타나 재생되면 끝이다.

## 도네이션 (토스페이먼츠 테스트 모드)

후원은 토스페이먼츠 결제위젯의 **테스트 키**로만 동작한다(#20). 테스트 결제는 실제로 돈이 나가지 않는다. 웹훅은 쓰지 않으므로 개발자센터에 등록할 것이 없다.

- 키: `deploy/.env`의 `TOSS_CLIENT_KEY`(결제위젯 클라이언트 키 `test_gck_…`)와 `TOSS_SECRET_KEY`(시크릿 키 `test_gsk_…`). 시크릿 키는 API 컨테이너의 환경변수로만 들어간다. 웹 이미지에는 키가 없고, 클라이언트 키는 주문을 만들 때 API가 브라우저에 넘긴다.
- 가입 없이 쓰는 문서용 테스트 키는 [토스페이먼츠 공식 샘플 저장소](https://github.com/tosspayments/tosspayments-sample)의 `express-react/server.js`(`widgetSecretKey`)와 `express-react/src/pages/widget/WidgetCheckoutWindow.jsx`(`clientKey`)에 있다. 결제창용 키(`test_ck_…`)는 결제위젯에서 쓸 수 없다.
- 둘 중 하나라도 비어 있으면 `docker compose`가 시작하지 않는다. 라이브 키(`live_…`)는 넣지 않는다.
- 승인 결과는 DB의 `Donation` 테이블에만 남는다. 문서용 키는 우리 상점이 아니라서 토스 개발자센터의 테스트 결제내역에서는 볼 수 없다.

### 도네이션 처음 반영 (#20)

DB 스키마(`Donation` 테이블)와 API 환경변수가 바뀐다. 송출은 끊기지 않는다(API만 다시 만든다).

```sh
cd ~/live-streaming-platform
docker compose -f deploy/compose.yaml exec db-backup sh /db-backup.sh   # 반영 전 덤프
git pull
# deploy/.env에 TOSS_CLIENT_KEY, TOSS_SECRET_KEY를 넣는다(값은 위 샘플 저장소의 문서용 테스트 키)
grep -c '^TOSS_' deploy/.env                                               # 2
docker compose -f deploy/compose.yaml up -d --build --wait
docker compose -f deploy/compose.yaml ps                                  # 5개 모두 Up
docker compose -f deploy/compose.yaml exec api printenv TOSS_CLIENT_KEY | cut -c1-14   # test_gck_docs_
```

- `--build`가 API(마이그레이션 포함)와 웹(Caddy 이미지) 이미지를 다시 만든다. OME와 PostgreSQL은 그대로다.
- 확인: README "8. 도네이션"의 화면 확인 1~4번을 운영 도메인에서 한다. 스트리머 A로 방송을 송출하고, 다른 창에서 사용자 B로 "후원하기" → 테스트 결제를 하면 시청 화면의 후원 합계가 늘어난다. 카드 결제는 테스트 모드에서도 카드사 인증(앱카드 등)을 실제로 거친다.

## 로그

```sh
docker compose -f deploy/compose.yaml ps
docker compose -f deploy/compose.yaml logs --tail=200 -f api
docker compose -f deploy/compose.yaml logs --tail=200 ome caddy postgres
```

- 송출 허가 결과는 API 로그의 `PublishController` 줄에 남는다.
- 인증서 발급·갱신 실패는 Caddy 로그에 남는다.
- 오디오 소스가 없는 OBS 송출이면 OME 로그에 `dec_OPUS … Error parsing the packet header`가 초당 십여 건 찍힌다(#88 실측 약 17건). LL-HLS용 AAC로 바꾸려고 OBS가 보낸 무음 Opus 패킷을 디코딩하다 나는 로그다. 영상 재생에는 영향이 없고, 소리가 들어오면 사라진다. 장애로 보지 않는다.
- OBS가 갑자기 꺼지면 OME가 끊김을 알아차리기까지 약 50초가 걸린다(#88 실측 52초, ICE 타임아웃). 그 뒤 30초 유예가 지나야 방송이 `ENDED`가 된다. 그동안 시청 화면은 멈춘 채 LIVE로 보인다.

## 다운 감시 (UptimeRobot)

무료 플랜으로 운영자가 직접 설정한다.

1. https://uptimerobot.com 에 가입하고, 알림 받을 메일 주소를 Alert Contact로 확인한다.
2. **Add New Monitor**에서 둘을 만든다. 간격은 5분(무료 최소값)이다.
   - Keyword 모니터: URL `https://lime-live.duckdns.org/api/health`, 키워드 `ok`가 있을 때 정상. Caddy와 API를 함께 본다.
   - HTTP(s) 모니터: URL `https://lime-live.duckdns.org/api/broadcasts`. 공개 방송 목록이라 DB까지 본다.
3. 알림을 실제로 받아 본다. 서버에서 Caddy를 잠시 내리고, 메일이 오면 다시 올린다.

   ```sh
   docker compose -f deploy/compose.yaml stop caddy
   # Down 메일을 받은 뒤
   docker compose -f deploy/compose.yaml start caddy
   ```

4. Up 메일도 오는지 확인한다.
