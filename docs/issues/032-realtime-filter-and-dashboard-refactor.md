# [PERF-032] Realtime 구독 필터 추가 + 대시보드 리팩토링

| 항목 | 내용 |
|------|------|
| 유형 | 성능 개선 + UI 개선 |
| 상태 | ✅ 완료 |
| 파일 | `src/app/page.tsx`, `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`, `src/app/admin/schedules/page.tsx`, `src/components/Clock.tsx` |
| 발견일 | 2026-03-21 |
| 완료일 | 2026-03-21 |

## 배경

Supabase `pg_stat_statements` 쿼리 통계에서 `realtime.list_changes`가 **432,167회 호출 = DB 전체 시간의 87.48%** 를 점유하고 있음을 발견. Supabase Pro로 업그레이드해도 속도가 개선되지 않아 구조적 원인 분석.

## 원인 분석

### 1. Realtime 구독 필터 누락 (주 원인)

`page.tsx`와 `admin/layout.tsx`에서 `notifications` 테이블을 **필터 없이 전체 구독**:

```js
// 수정 전 — 모든 직원의 알림이 생성될 때마다 모든 클라이언트가 WAL 스캔
{ event: "INSERT", schema: "public", table: "notifications" }
```

Supabase Realtime은 클라이언트가 서버사이드 필터를 지정하지 않으면 모든 행 변경을 WAL에서 읽어 클라이언트에 전달 여부를 판단함. 792번의 subscription INSERT × 지속적 폴링 = 432,167번 호출.

### 2. Admin Dashboard 30일 로그 무제한 로드 (부수 원인)

`dashboardData` SWR fetcher 안에서:
- `attendance_logs` 30일치 전체 조회 (LIMIT 없음)
- `profiles select("*")` 전 직원 전 컬럼 조회
- `revalidateOnFocus: true` + `dedupingInterval: 30s` 조합으로 탭 전환마다 재실행

### 3. SWR dedupingInterval 10초 (admin/schedules)

일간 슬롯·출근현황 쿼리 2개가 10초마다 re-fetch.

### 4. Clock 매초 리렌더

홈 최상단 컴포넌트가 1초마다 전체 리렌더 유발.

## 수정 내용

### Realtime 필터 추가

**`src/app/page.tsx`**
```js
// 수정 후 — 내 알림만 수신, 클라이언트 측 조건문도 제거
{ event: "INSERT", schema: "public", table: "notifications",
  filter: `profile_id=eq.${profile.id}` }
```

**`src/app/admin/layout.tsx`**
```js
// 수정 후 — target_role 필터를 DB 레벨에서 처리
.on("postgres_changes", { ..., filter: "target_role=eq.admin" }, ...)
.on("postgres_changes", { ..., filter: "target_role=eq.all" }, ...)
```

> 서버사이드 필터는 `notifications` 테이블에 `REPLICA IDENTITY FULL`이 설정되어 있어야 작동.
> 018 마이그레이션으로 Prod에 이미 적용되어 있음.

### Admin Dashboard 전면 리팩토링

**제거:**
- `dashboardData` SWR 전체 제거 (30일 로그 무제한 로드 + 4개 통계 카드)
- `profiles select("*")` 전 컬럼 조회
- 현재 근무 중 / 오늘 총 출근 / 서류 미비 / 기록 이상 4개 카드 아코디언 UI

**추가:**
- 오늘 출근 현황을 최상단으로 배치
- 보건증 만료 30일 이내 직원 섹션 신설 (`health_cert_expiry` SWR, dedupingInterval 300s)
  - 7일 이하: 빨간색 강조
  - 8~30일: 주황색
  - 전화 / 직원관리 바로가기 버튼 포함
- `todayAttendance` SWR: dedupingInterval 30s → 60s, revalidateOnFocus false

### admin/schedules dedupingInterval 완화

`10_000` → `30_000` (일간 슬롯, 일간 출근현황 2개 쿼리)

### Clock 1분 업데이트

```js
// 수정 전
setInterval(() => setTime(new Date()), 1000)
toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })

// 수정 후
setInterval(() => setTime(new Date()), 60_000)
toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
```

## 결과

- `realtime.list_changes` DB 점유율 87% → 대폭 감소 예상 (필터로 WAL 스캔 범위 축소)
- Admin Dashboard 페이지 로드 시 DB 쿼리 수: 3개 → 2개 (dashboardData 제거)
- 불필요한 30일치 로그 전송 완전 제거
- 홈 화면 매초 리렌더 제거
- 빌드: ✅ 통과
- 배포: dev → main 머지 완료 (커밋 `8565523`)
