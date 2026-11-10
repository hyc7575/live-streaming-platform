#!/bin/sh
# PostgreSQL 덤프 하나를 /backups에 만들고, 보관 기간이 지난 덤프를 지운다.
# deploy/compose.yaml의 db-backup 서비스가 매일 04:00(KST)에 부른다. 손으로 부를 때는 docs/OPERATIONS.md를 본다.
# 접속 정보는 PGHOST·PGUSER·PGPASSWORD·PGDATABASE 환경변수에서 읽는다.
set -eu -o pipefail

dir=/backups
name="lsp-$(date +%Y%m%d-%H%M%S).dump"
partial="$dir/.$name.partial"

# 덤프 도중 실패하면 반쯤 쓴 파일을 남기지 않고, 실패를 로그에 남긴다.
trap 'rc=$?; rm -f "$partial"; [ "$rc" -eq 0 ] || echo "db-backup: FAILED $name (exit $rc)" >&2' EXIT

pg_dump -Fc -f "$partial"
mv "$partial" "$dir/$name"
echo "db-backup: wrote $name ($(du -h "$dir/$name" | cut -f1))"

find "$dir" -maxdepth 1 -name 'lsp-*.dump' -mmin +"$((BACKUP_RETENTION_DAYS * 1440))" -print -delete |
  sed 's|^.*/|db-backup: deleted |'
