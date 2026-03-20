#!/usr/bin/env python3
"""
홈화면 데이터 페칭 패턴 벤치마크
main(개선전) vs dev(개선후) 쿼리 패턴 실측
"""
import subprocess, time, os, sys, statistics
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# .env.local 파싱
env = {}
env_path = Path(__file__).parent.parent / ".env.local"
for line in env_path.read_text().splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()

URL = env["NEXT_PUBLIC_SUPABASE_URL"]
KEY = env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
RUNS = 7

HEADERS = [
    f"apikey: {KEY}",
    f"Authorization: Bearer {KEY}",
]

def curl_time(path: str) -> float:
    """단일 HTTP 요청 시간(초) 반환"""
    cmd = ["curl", "-s", "-o", "/dev/null", "-w", "%{time_total}",
           "--max-time", "10"] + [h for item in HEADERS for h in ["-H", item]] + [f"{URL}{path}"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return float(result.stdout.strip())
    except ValueError:
        return 0.0

def parallel_requests(paths: list[str]) -> float:
    """여러 요청을 동시 실행 — 가장 느린 것의 응답시간 반환 (= 실제 블로킹 시간)"""
    start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=len(paths)) as ex:
        futures = [ex.submit(curl_time, p) for p in paths]
        for f in as_completed(futures):
            f.result()
    return time.perf_counter() - start

# ── 쿼리 경로 정의 ────────────────────────────────────────────────

AUTH = "/auth/v1/user"

# main 패턴
# RT1: auth.getUser()
# RT2: profiles, stores, attendance_logs, weekly_schedules, notifications (병렬)
# RT3: schedule_slots (순차)
# +WeeklyScheduleCard: auth → weekly_schedules → schedule_slots (독립 waterfall)
# +AnnouncementBanner: auth → announcements+reads (독립 waterfall)
# 크리티컬 패스 = max(page 3RT, WeeklyCard 3RT) = 3 RT
MAIN_RT2 = [
    "/rest/v1/profiles?select=*&limit=1",
    "/rest/v1/stores?select=*",
    "/rest/v1/attendance_logs?select=type,created_at&order=created_at.desc&limit=1",
    "/rest/v1/weekly_schedules?select=id&limit=10",
    "/rest/v1/notifications?select=*&order=created_at.desc&limit=15",
]
MAIN_RT3 = [
    "/rest/v1/schedule_slots?select=id,slot_date,start_time,end_time,work_location,cafe_positions,notes&limit=10",
]

# dev 패턴
# RT1: auth.getUser()
# RT2: 8개 쿼리 병렬 (WeeklyCard·AnnouncementBanner 포함, join 쿼리)
DEV_RT2 = [
    "/rest/v1/profiles?select=*&limit=1",
    "/rest/v1/stores?select=*",
    "/rest/v1/attendance_logs?select=type,created_at&order=created_at.desc&limit=1",
    "/rest/v1/schedule_slots?select=id,slot_date,start_time,end_time,work_location,cafe_positions,notes&limit=10",
    "/rest/v1/schedule_slots?select=slot_date,start_time,end_time,work_location&order=slot_date&limit=50",
    "/rest/v1/notifications?select=*&order=created_at.desc&limit=15",
    "/rest/v1/announcements?select=id,title,is_pinned,created_at,content&order=is_pinned.desc,created_at.desc&limit=3",
    "/rest/v1/announcement_reads?select=announcement_id&limit=100",
]

# ── 측정 ──────────────────────────────────────────────────────────

print("=" * 56)
print(f"  홈화면 페칭 패턴 벤치마크  (runs={RUNS})")
print(f"  {URL}")
print("=" * 56)

# 콜드스타트 제거용 워밍업
print("\n  워밍업 중...")
parallel_requests(MAIN_RT2)

# ── 개별 latency 측정 ────────────────────────────────────────────
print("\n  [개별 요청 latency]")
auth_ts = [curl_time(AUTH) for _ in range(5)]
rest_ts  = [curl_time(MAIN_RT2[1]) for _ in range(5)]  # stores (단순 쿼리)
print(f"  auth.getUser()  avg={statistics.mean(auth_ts)*1000:.0f}ms  "
      f"median={statistics.median(auth_ts)*1000:.0f}ms  "
      f"min={min(auth_ts)*1000:.0f}ms  max={max(auth_ts)*1000:.0f}ms")
print(f"  REST query      avg={statistics.mean(rest_ts)*1000:.0f}ms  "
      f"median={statistics.median(rest_ts)*1000:.0f}ms  "
      f"min={min(rest_ts)*1000:.0f}ms  max={max(rest_ts)*1000:.0f}ms")

# ── main 패턴 ────────────────────────────────────────────────────
print(f"\n  [main 패턴: 3 round trips 순차]")
main_results = []
for i in range(RUNS):
    t_start = time.perf_counter()
    # RT1
    t_rt1 = curl_time(AUTH)
    # RT2 (병렬)
    t_rt2 = parallel_requests(MAIN_RT2)
    # RT3 (순차)
    t_rt3 = parallel_requests(MAIN_RT3)
    total = time.perf_counter() - t_start
    main_results.append(total)
    print(f"    run {i+1}: RT1={t_rt1*1000:.0f}ms  RT2={t_rt2*1000:.0f}ms  RT3={t_rt3*1000:.0f}ms  → 합계={total*1000:.0f}ms")

# ── dev 패턴 ────────────────────────────────────────────────────
print(f"\n  [dev 패턴: 2 round trips (8개 병렬)]")
dev_results = []
for i in range(RUNS):
    t_start = time.perf_counter()
    # RT1
    t_rt1 = curl_time(AUTH)
    # RT2 (8개 병렬)
    t_rt2 = parallel_requests(DEV_RT2)
    total = time.perf_counter() - t_start
    dev_results.append(total)
    print(f"    run {i+1}: RT1={t_rt1*1000:.0f}ms  RT2={t_rt2*1000:.0f}ms  → 합계={total*1000:.0f}ms")

# ── 요약 ──────────────────────────────────────────────────────────
avg_main = statistics.mean(main_results)
avg_dev  = statistics.mean(dev_results)
med_main = statistics.median(main_results)
med_dev  = statistics.median(dev_results)
saved    = avg_main - avg_dev
pct      = saved / avg_main * 100

print()
print("  " + "─" * 52)
print(f"  {'':20s}  {'main':>10s}  {'dev':>10s}")
print("  " + "─" * 52)
print(f"  {'평균':20s}  {avg_main*1000:>8.0f}ms  {avg_dev*1000:>8.0f}ms")
print(f"  {'중앙값':20s}  {med_main*1000:>8.0f}ms  {med_dev*1000:>8.0f}ms")
print(f"  {'최솟값':20s}  {min(main_results)*1000:>8.0f}ms  {min(dev_results)*1000:>8.0f}ms")
print(f"  {'최댓값':20s}  {max(main_results)*1000:>8.0f}ms  {max(dev_results)*1000:>8.0f}ms")
print("  " + "─" * 52)
print(f"  절감: {saved*1000:.0f}ms ({pct:.1f}% 단축)")
print("  " + "─" * 52)
