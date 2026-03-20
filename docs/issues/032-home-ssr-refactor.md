# [PERF-032] 홈화면 SSR 전환 — 스켈레톤 제거 및 초기 로딩 개선

| 항목 | 내용 |
|------|------|
| 유형 | 성능 개선 |
| 상태 | ✅ 완료 |
| 파일 | `src/app/page.tsx`, `src/components/HomeClient.tsx`, `src/components/WeeklyScheduleCard.tsx`, `src/lib/supabase-server.ts`, `src/app/loading.tsx` |
| 발견일 | 2026-03-21 |
| 완료일 | 2026-03-21 |

## 배경

홈화면 진입 시 로딩이 체감상 느림. 030번 최적화(CSR 내 병렬 fetch)에도 불구하고
JS 다운로드 → Hydration → useEffect → 쿼리 → 렌더 순서의 폭포식 실행으로
스켈레톤이 1~3초 이상 노출되는 문제가 지속됨.

## 원인 분석

### 개선 전 구조

```
[브라우저] HTML/JS 다운로드
    ↓
[브라우저] JS 실행 (Hydration)
    ↓
[브라우저] useEffect 실행
    ↓
[브라우저] Supabase 8개 쿼리 병렬 fetch  ← 네트워크 왕복
    ↓
[브라우저] 스켈레톤 → 실제 UI 교체
```

- `page.tsx`가 `"use client"` — 모든 데이터 fetch가 브라우저에서 발생
- 서버는 빈 HTML만 전송, 데이터는 브라우저에서 처음 요청
- 네트워크 지연 시 사용자는 스켈레톤만 보게 됨

## 수정 내용

### 구조 변경

| 파일 | 변경 전 | 변경 후 |
|------|---------|---------|
| `page.tsx` | CSR (`"use client"`) | **async Server Component** |
| `HomeClient.tsx` | (없음) | CSR 전담 컴포넌트 (신규) |
| `supabase-server.ts` | (없음) | 서버용 Supabase 클라이언트 (신규) |
| `loading.tsx` | (없음) | `router.refresh()` 중 스켈레톤 (신규) |
| `WeeklyScheduleCard` | props/내부 fetch 혼용 | **props 전용** (내부 fetch 제거) |

### 새 렌더링 흐름

```
[서버] auth.getUser() + 8개 쿼리 병렬 fetch
    ↓
[서버] HTML에 데이터 포함하여 전송
    ↓
[브라우저] 이미 채워진 UI 즉시 표시 (스켈레톤 없음)
    ↓
[브라우저] Hydration 후 알림 Realtime subscription 활성화
```

### 역할 분리

**Server Component (`page.tsx`)**
- 8개 Supabase 쿼리 병렬 fetch (프로필, 매장, 로그, 스케줄 ×2, 알림, 공지, 읽음기록)
- 온보딩 필요 여부 판단
- `HomeClient`에 초기 데이터 props 전달

**Client Component (`HomeClient.tsx`)**
- 알림 상태 관리 (CSR fetch + Realtime subscription 유지)
- 모달/드롭다운 UI 상태
- 출퇴근·온보딩·프로필 갱신 후 `router.refresh()` 호출 → 서버 재실행

### 타임존 처리

`lastLog` 시간 포맷팅을 서버에서 하면 UTC 기준으로 표시될 위험이 있으므로
raw `created_at` 문자열을 props로 전달하고, `HomeClient`에서 `useMemo`로 포맷팅.

```typescript
// HomeClient.tsx
const lastLog = useMemo(() => {
  if (!logData) return null;
  const createdAt = new Date(logData.created_at); // 클라이언트 로컬(KST) 기준
  return {
    time: createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    ...
  };
}, [logData]);
```

### `router.refresh()` 활용

출퇴근 성공, 온보딩 완료, 프로필 수정 후 `fetchAllData()` 대신 `router.refresh()` 호출.
Next.js가 서버 컴포넌트를 다시 실행해 최신 데이터를 가져오며, `loading.tsx`가
그 사이 스켈레톤을 표시.

## 결과

| 항목 | 개선 전 | 개선 후 |
|------|---------|---------|
| 초기 스켈레톤 노출 | 1~3초 | **없음** (서버에서 데이터 포함) |
| CSR 쿼리 수 | 8개 (모두) | 1개 (알림만, 필요 시) |
| 번들 크기 | 전체 fetch 로직 포함 | fetch 로직 서버 처리 |
| Realtime | 유지 | 유지 |
| 타임존 안전성 | 클라이언트 기준 | 클라이언트 기준 유지 |

빌드 결과: `/` 라우트 `ƒ` (dynamic SSR) 확인.
