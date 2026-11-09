#!/usr/bin/env bash
# 서버에서 실행. Usage: ./spike-cpu.sh <label> [seconds]
# OME 컨테이너 CPU%(100% = 코어 1개)와 호스트 전체 CPU 사용률을 2초 간격으로 기록하고 평균·최대를 낸다.
set -euo pipefail
label="${1:?label}"
secs="${2:-60}"
out="$HOME/lsp/cpu-$label.tsv"
cores="$(nproc)"
: >"$out"
read_cpu() { awk '/^cpu /{print $2+$3+$4+$6+$7+$8, $5}' /proc/stat; }
end=$((SECONDS + secs))
while [ "$SECONDS" -lt "$end" ]; do
  read -r b1 i1 < <(read_cpu)
  ome="$(sudo docker stats --no-stream --format '{{.CPUPerc}}' lsp-ome-1 | tr -d '%')"
  read -r b2 i2 < <(read_cpu)
  host="$(awk -v b=$((b2 - b1)) -v i=$((i2 - i1)) 'BEGIN{printf "%.1f", (b+i)?100*b/(b+i):0}')"
  printf '%s\t%s\t%s\n' "$(date +%T)" "$ome" "$host" | tee -a "$out"
done
awk -F'\t' -v c="$cores" -v l="$label" '
  {o+=$2; h+=$3; n++; if($2>om)om=$2; if($3>hm)hm=$3}
  END{printf "%s: n=%d, OME avg %.1f%% max %.1f%% (of %d cores = 100%% each), host avg %.1f%% max %.1f%%\n", l, n, o/n, om, c, h/n, hm}' "$out"
