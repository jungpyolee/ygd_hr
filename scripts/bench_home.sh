#!/usr/bin/env bash
# 홈화면 데이터 페칭 패턴 벤치마크
# main(개선전) vs dev(개선후) 쿼리 패턴 실측

set -euo pipefail
source "$(dirname "$0")/../.env.local"

DEV_URL="$NEXT_PUBLIC_SUPABASE_URL"
DEV_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY"
PROD_URL="$SUPABASE_PROD_URL"
PROD_KEY="$SUPABASE_PROD_SERVICE_KEY"

RUNS=5

# ── 유틸 ─────────────────────────────────────────────────────────
measure() {
  local label="$1"; shift
  curl -s -o /dev/null -w "%{time_total}" "$@" 2>/dev/null
}

avg() {
  # 인자로 받은 숫자 목록 평균 (bc 사용)
  local sum=0; local count=$#
  for v in "$@"; do sum=$(echo "$sum + $v" | bc); done
  echo "scale=3; $sum / $count" | bc
}

echo "========================================"
echo " 홈화면 페칭 패턴 벤치마크"
echo " DEV  : $DEV_URL"
echo " PROD : $PROD_URL"
echo " runs : $RUNS"
echo "========================================"
echo ""

# ── 헬퍼: 단일 HTTP 요청 시간 측정 ────────────────────────────────
req_time() {
  local url="$1"
  local key="$2"
  local path="$3"
  curl -s -o /dev/null -w "%{time_total}" \
    -H "apikey: $key" \
    -H "Authorization: Bearer $key" \
    "${url}${path}" 2>/dev/null
}

bench() {
  local label="$1"
  local url="$2"
  local key="$3"

  echo "▶ $label"
  echo ""

  # ── 개별 요청 latency 측정 (평균) ──────────────────────────────
  echo "  [개별 요청 latency 평균 (${RUNS}회)]"

  auth_times=()
  rest1_times=()
  rest2_times=()
  rest3_times=()

  for i in $(seq 1 $RUNS); do
    t_auth=$(req_time "$url" "$key" "/auth/v1/user")
    t_r1=$(req_time "$url" "$key" "/rest/v1/stores?select=*")
    t_r2=$(req_time "$url" "$key" "/rest/v1/announcements?select=id,title,is_pinned,created_at,content&order=is_pinned.desc,created_at.desc&limit=3")
    t_r3=$(req_time "$url" "$key" "/rest/v1/schedule_slots?select=id,slot_date,start_time,end_time,work_location,cafe_positions,notes&limit=1")
    auth_times+=("$t_auth")
    rest1_times+=("$t_r1")
    rest2_times+=("$t_r2")
    rest3_times+=("$t_r3")
    printf "    run %d: auth=%.3fs rest=%.3fs/%.3fs/%.3fs\n" $i "$t_auth" "$t_r1" "$t_r2" "$t_r3"
  done

  AVG_AUTH=$(avg "${auth_times[@]}")
  AVG_REST=$(avg "${rest1_times[@]}" "${rest2_times[@]}" "${rest3_times[@]}")

  echo ""
  printf "  avg auth.getUser()  : %.3fs\n" "$AVG_AUTH"
  printf "  avg REST query      : %.3fs\n" "$AVG_REST"
  echo ""

  # ── main 패턴 (개선 전): 3 round trips 순차 ─────────────────────
  # RT1: getUser
  # RT2: profiles + stores + attendance_logs + weekly_schedules + notifications (병렬)
  # RT3: schedule_slots (순차 — weekly_schedules 결과 받은 후)
  # + WeeklyScheduleCard: getUser → weekly_schedules → schedule_slots (독립)
  # + AnnouncementBanner: getUser → announcements (독립)
  # 크리티컬 패스 = max(page 3RT, WeeklyScheduleCard 3RT) = 3RT

  echo "  [main 패턴 실측 — 3 round trips 순차]"
  main_times=()
  for i in $(seq 1 $RUNS); do
    t0=$(date +%s%3N)

    # RT1: getUser
    curl -s -o /dev/null -H "apikey: $key" -H "Authorization: Bearer $key" "${url}/auth/v1/user" &
    wait

    # RT2: 5개 병렬 쿼리 (weekly_schedules 포함)
    curl -s -o /dev/null -H "apikey: $key" -H "Authorization: Bearer $key" "${url}/rest/v1/profiles?select=*&limit=1" &
    curl -s -o /dev/null -H "apikey: $key" -H "Authorization: Bearer $key" "${url}/rest/v1/stores?select=*" &
    curl -s -o /dev/null -H "apikey: $key" -H "Authorization: Bearer $key" "${url}/rest/v1/attendance_logs?select=type,created_at&order=created_at.desc&limit=1" &
    curl -s -o /dev/null -H "apikey: $key" -H "Authorization: Bearer $key" "${url}/rest/v1/weekly_schedules?select=id&eq.status=confirmed&limit=10" &
    curl -s -o /dev/null -H "apikey: $key" -H "Authorization: Bearer $key" "${url}/rest/v1/notifications?select=*&order=created_at.desc&limit=15" &
    wait

    # RT3: schedule_slots (순차)
    curl -s -o /dev/null -H "apikey: $key" -H "Authorization: Bearer $key" "${url}/rest/v1/schedule_slots?select=*&eq.status=active&limit=10" &
    wait

    t1=$(date +%s%3N)
    elapsed=$(echo "scale=3; ($t1 - $t0) / 1000" | bc)
    main_times+=("$elapsed")
    printf "    run %d: %.3fs\n" $i "$elapsed"
  done
  AVG_MAIN=$(avg "${main_times[@]}")

  echo ""

  # ── dev 패턴 (개선 후): 2 round trips ──────────────────────────
  # RT1: getUser
  # RT2: 8개 병렬 (join 쿼리 포함, WeeklyScheduleCard·AnnouncementBanner 데이터 포함)
  echo "  [dev 패턴 실측 — 2 round trips (8개 병렬)]"
  dev_times=()
  for i in $(seq 1 $RUNS); do
    t0=$(date +%s%3N)

    # RT1: getUser
    curl -s -o /dev/null -H "apikey: $key" -H "Authorization: Bearer $key" "${url}/auth/v1/user" &
    wait

    # RT2: 8개 병렬 (join 쿼리, WeeklyScheduleCard + AnnouncementBanner 포함)
    curl -s -o /dev/null -H "apikey: $key" -H "Authorization: Bearer $key" "${url}/rest/v1/profiles?select=*&limit=1" &
    curl -s -o /dev/null -H "apikey: $key" -H "Authorization: Bearer $key" "${url}/rest/v1/stores?select=*" &
    curl -s -o /dev/null -H "apikey: $key" -H "Authorization: Bearer $key" "${url}/rest/v1/attendance_logs?select=type,created_at&order=created_at.desc&limit=1" &
    # join 쿼리 (schedule_slots + weekly_schedules inner join)
    curl -s -o /dev/null -H "apikey: $key" -H "Authorization: Bearer $key" "${url}/rest/v1/schedule_slots?select=id,slot_date,start_time,end_time,work_location,cafe_positions,notes,weekly_schedules!inner(status)&status=eq.active&weekly_schedules.status=eq.confirmed&limit=10" &
    # WeeklyScheduleCard용 주간 슬롯 (join)
    curl -s -o /dev/null -H "apikey: $key" -H "Authorization: Bearer $key" "${url}/rest/v1/schedule_slots?select=slot_date,start_time,end_time,work_location,weekly_schedules!inner(status)&status=eq.active&weekly_schedules.status=eq.confirmed&order=slot_date&limit=50" &
    curl -s -o /dev/null -H "apikey: $key" -H "Authorization: Bearer $key" "${url}/rest/v1/notifications?select=*&order=created_at.desc&limit=15" &
    curl -s -o /dev/null -H "apikey: $key" -H "Authorization: Bearer $key" "${url}/rest/v1/announcements?select=id,title,is_pinned,created_at,content&order=is_pinned.desc,created_at.desc&limit=3" &
    curl -s -o /dev/null -H "apikey: $key" -H "Authorization: Bearer $key" "${url}/rest/v1/announcement_reads?select=announcement_id&limit=100" &
    wait

    t1=$(date +%s%3N)
    elapsed=$(echo "scale=3; ($t1 - $t0) / 1000" | bc)
    dev_times+=("$elapsed")
    printf "    run %d: %.3fs\n" $i "$elapsed"
  done
  AVG_DEV=$(avg "${dev_times[@]}")

  # ── 결과 ────────────────────────────────────────────────────────
  DIFF=$(echo "scale=3; $AVG_MAIN - $AVG_DEV" | bc)
  PCT=$(echo "scale=1; ($AVG_MAIN - $AVG_DEV) / $AVG_MAIN * 100" | bc)

  echo ""
  echo "  ┌────────────────────────────────────┐"
  printf "  │ main 패턴 평균  : %.3fs            │\n" "$AVG_MAIN"
  printf "  │ dev 패턴 평균   : %.3fs            │\n" "$AVG_DEV"
  printf "  │ 절감            : %.3fs (%.1f%% 단축) │\n" "$DIFF" "$PCT"
  echo "  └────────────────────────────────────┘"
  echo ""
}

bench "DEV DB 기준 측정" "$DEV_URL" "$DEV_KEY"
