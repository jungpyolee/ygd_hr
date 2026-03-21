# [FEAT-035] 홈 화면 첫 로딩 성능 개선 — SSR Critical Path 분리

| 항목 | 내용 |
|------|------|
| 유형 | 성능 개선 |
| 상태 | ✅ 완료 |
| 파일 | `src/app/page.tsx`, `src/components/HomeClient.tsx` |
| 발견일 | 2026-03-21 |
| 완료일 | 2026-03-21 |

## 배경

홈 화면 SSR에서 8개의 DB 쿼리를 `Promise.all`로 병렬 실행했는데, 모든 쿼리가 완료될 때까지 `HomeClient`가 렌더링되지 않는 구조였음. 출퇴근 버튼(AttendanceCard) 표시에 필요하지 않은 데이터(공지, 알림, 주간 스케줄)가 critical path를 막고 있었음.

## 원인 분석

```
[이전 흐름]
loading.tsx skeleton 즉시 표시
  ↓ SSR 대기 (8개 쿼리 모두 완료될 때까지)
  ├── profiles
  ├── attendance_logs (출퇴근 버튼용 — 필수)
  ├── schedule_slots 오늘 (출퇴근 버튼용 — 필수)
  ├── schedule_slots 주간 ← 출퇴근 버튼엔 불필요
  ├── notifications 15건 ← 출퇴근 버튼엔 불필요
  ├── announcements 3건 ← 출퇴근 버튼엔 불필요
  └── announcement_reads ← 출퇴근 버튼엔 불필요
  ↓ 전체 완료 후 한 번에 표시
```

## 수정 내용

### B안: notifications · announcements → 클라이언트 SWR 이전

`page.tsx`에서 3개 쿼리 제거 (SSR 쿼리 8개 → 4개):
- `notifications` → `HomeClient`에서 `useSWR(["home-notis", profile.id], ...)` 로드
- `announcements` + `announcement_reads` → `useSWR(["home-announcements", profile.id], ...)` 통합 로드

SSR에서 받던 `initialNotis`, `announcements`, `announcementReadIds` props 제거.
공지사항 뱃지/목록은 SWR 로드 완료 후 채워짐 (체감 딜레이 없음 — 화면 하단 2열 그리드).

### A안: weeklySlots → Streaming SSR (use() + Suspense)

SSR critical path를 4개 → 3개로 단축. 주간 스케줄은 Promise로 전달, 클라이언트에서 점진적 렌더링.

**page.tsx:**
```tsx
// Critical path (await)
const [...] = await Promise.all([
  getStores(), profiles, attendance_logs, schedule_slots(오늘)
]);

// Deferred — await 없이 Promise로 전달
const weeklySlotPromise: Promise<ScheduleSlot[]> = Promise.resolve(
  supabase.from("schedule_slots")...then(가공)
);
```

**HomeClient.tsx:**
```tsx
// Suspense boundary 내부에서 use()로 resolve
function WeeklyScheduleSection({ promise }: { promise: Promise<ScheduleSlot[]> }) {
  const slots = use(promise);
  return <WeeklyScheduleCard slots={slots} />;
}

// JSX
<Suspense fallback={<div className="... animate-pulse" />}>
  <WeeklyScheduleSection promise={weeklySlotPromise} />
</Suspense>
```

## 결과

```
[개선 후 흐름]
loading.tsx skeleton 즉시 표시
  ↓ SSR 대기 (3개 쿼리만)
  ├── profiles
  ├── attendance_logs
  └── schedule_slots 오늘
  ↓ 출퇴근 버튼 즉시 표시 ★

  (이후 스트리밍)
  ├── weeklySlots Promise resolve → 주간 스케줄 카드 채워짐
  └── SWR 로드 완료 → 알림·공지사항 채워짐
```

| 항목 | 개선 전 | 개선 후 |
|------|--------|--------|
| SSR await 쿼리 수 | 8개 | **3개** |
| 출퇴근 버튼 표시 시점 | 8개 완료 후 | **3개 완료 후** |
| 주간 스케줄 | SSR 블로킹 | **Streaming (skeleton → 채워짐)** |
| 알림·공지 | SSR 블로킹 | **SWR 비동기 (dedupe 캐시 300s)** |

## 주의사항

- 알림 초기값은 SWR 로드 전 빈 배열 → 실시간 구독(realtime)이 즉시 이후 업데이트
- `weeklySlotPromise`는 `PromiseLike` 타입이므로 `Promise.resolve()`로 래핑하여 타입 통일
- `notifications` SWR `dedupingInterval: 30_000` — 알림은 realtime이 주 업데이트 수단이므로 짧게 설정
