# [PERF-030] 홈화면 데이터 페칭 성능 최적화

| 항목 | 내용 |
|------|------|
| 유형 | 성능 개선 |
| 상태 | ✅ 완료 |
| 파일 | `src/app/page.tsx`, `src/components/WeeklyScheduleCard.tsx`, `src/components/AnnouncementBanner.tsx` |
| 발견일 | 2026-03-20 |
| 완료일 | 2026-03-20 |

## 배경

홈화면 진입 시 렌더링이 체감상 느림. 분석 결과 마운트 시점에 3개의 독립적인
데이터 fetching waterfall이 동시 실행되는 구조가 원인으로 확인됨.

## 원인 분석

### 개선 전 구조

```
page.tsx
  RT1: auth.getUser()
  RT2: profiles, stores, attendance_logs, weekly_schedules, notifications (병렬)
  RT3: schedule_slots (RT2 완료 후 순차) ← waterfall

WeeklyScheduleCard (독립 실행)
  RT1: auth.getUser()
  RT2: weekly_schedules
  RT3: schedule_slots (순차) ← waterfall

AnnouncementBanner (독립 실행)
  RT1: auth.getUser()
  RT2: announcements + announcement_reads (병렬)

크리티컬 패스: 3 round trips
auth.getUser() 중복 호출: 3회
총 Supabase 쿼리: ~10개 (분산)
```

### 병목 포인트
- `WeeklyScheduleCard`가 `page.tsx`와 완전히 독립된 waterfall을 가짐
- `schedule_slots` 조회를 위해 먼저 `weekly_schedules` ID를 가져오는 2단계 구조
- `auth.getUser()`가 마운트마다 3번 호출됨

## 수정 내용

### 1. `page.tsx` — fetchAllData 통합

`weekly_schedules` → `schedule_slots` 2단계 waterfall을 `schedule_slots`에
`weekly_schedules!inner(status)` join 쿼리로 단일화.

`WeeklyScheduleCard` · `AnnouncementBanner` 데이터까지 포함해 8개 쿼리를
단일 `Promise.all`로 병렬 실행.

```typescript
// 개선 전: weekly_schedules로 ID 조회 후 schedule_slots 순차 조회
const { data: wsData } = await supabase.from("weekly_schedules").select("id")...
const wsIds = wsData.map(ws => ws.id);
const { data: slotsData } = await supabase.from("schedule_slots")...in("weekly_schedule_id", wsIds);

// 개선 후: inner join으로 단일 쿼리
supabase
  .from("schedule_slots")
  .select("..., weekly_schedules!inner(status)")
  .eq("weekly_schedules.status", "confirmed")
```

### 2. `WeeklyScheduleCard` — 외부 데이터 수신

`props.slots` / `props.loading`을 받으면 내부 fetch를 스킵.
page.tsx에서 이미 가져온 데이터를 그대로 내려보냄.

### 3. `AnnouncementBanner` — 외부 데이터 수신

`props.items` / `props.readIds` / `props.loading`을 받으면 내부 fetch 스킵.

### 개선 후 구조

```
page.tsx
  RT1: auth.getUser()
  RT2: 8개 쿼리 병렬 (profiles, stores, attendance_logs,
       todaySlots(join), weeklySlots(join), notifications,
       announcements, announcement_reads)

크리티컬 패스: 2 round trips
auth.getUser() 호출: 1회
총 Supabase 쿼리: 8개 (병렬)
```

## 실측 결과

`scripts/bench_home.py`로 실측 (Supabase Dev DB 기준, 7회 반복).

|  | main (개선 전) | dev (개선 후) |
|--|--|--|
| 평균 | 613ms | 218ms |
| 중앙값 | 385ms | 210ms |
| 최솟값 | 339ms | 199ms |
| 최댓값 | 1,195ms | 243ms |

**→ 평균 395ms 단축, 64.5% 개선**

main 최댓값 1,195ms는 Supabase cold connection 타이밍에 순차 RT3가 겹쳐
1초 이상 대기하던 케이스. dev는 RT2 병렬 완료로 최댓값도 243ms로 수렴.

---

## 벤치마크 방법론 (재활용 가이드)

### 스크립트 위치

```
scripts/bench_home.py
```

### 실행 방법

```bash
cd /path/to/ygd_hr
python3 scripts/bench_home.py
```

### 측정 원리

curl의 `-w "%{time_total}"` 옵션으로 실제 HTTP 왕복 시간을 측정.
`concurrent.futures.ThreadPoolExecutor`로 병렬 요청을 시뮬레이션.

```python
# 단일 요청 시간 측정
curl -s -o /dev/null -w "%{time_total}" -H "apikey: KEY" URL/rest/v1/table

# 병렬 요청 (가장 느린 것이 실제 블로킹 시간)
with ThreadPoolExecutor(max_workers=N) as ex:
    futures = [ex.submit(curl_time, path) for path in paths]
```

### 다른 화면에 적용할 때

1. `MAIN_RT2`, `MAIN_RT3`, `DEV_RT2` 경로 목록을 해당 화면의 쿼리로 교체
2. waterfall 단계 수에 맞게 round trip 구조 조정
3. `RUNS` 값은 7~10이 적당 (첫 1~2개는 cold start 포함됨)

### 주의사항

- anon key로 측정 시 RLS로 인해 실제보다 응답이 가볍게 나올 수 있음
  (실제 앱은 데이터가 있어 조금 더 걸리지만 waterfall 구조 비교는 유효)
- 네트워크 상태에 따라 편차가 큼 → 중앙값을 기준으로 비교
- 워밍업 1회를 먼저 실행해 cold connection 영향 제거 (스크립트에 포함됨)
