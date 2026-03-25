# [FEAT-034] Auth 호출 최적화 — AuthProvider 전역 Context 도입

| 항목 | 내용 |
|------|------|
| 유형 | 성능 개선 |
| 상태 | ✅ 완료 |
| 파일 | `src/lib/auth-context.tsx` (신규), `src/app/providers.tsx`, `src/app/schedule/page.tsx`, `src/app/recipes/page.tsx`, `src/app/announcements/page.tsx`, `src/app/attendances/page.tsx`, `src/app/admin/schedules/substitutes/page.tsx`, `src/app/recipes/[id]/page.tsx`, `src/app/recipes/[id]/edit/page.tsx`, `src/app/recipes/new/page.tsx`, `src/components/AttendanceCard.tsx`, `src/components/recipe/RecipeForm.tsx`, `src/app/admin/layout.tsx` |
| 발견일 | 2026-03-21 |
| 완료일 | 2026-03-21 |

## 배경

앱 전체에서 `supabase.auth.getUser()`가 페이지 로드당 4~8회 중복 호출되는 것을 확인. 미들웨어에서 이미 auth를 검증하지만 그 결과가 공유되지 않아 각 페이지·컴포넌트가 독립적으로 재검증하는 구조였음.

## 원인 분석

1. **전역 auth 상태 없음**: auth 결과를 공유하는 Context가 없어서 각 레이어(SWR fetcher, useEffect, 이벤트 핸들러)가 각자 `getUser()`를 호출
2. **SWR fetcher 내 중복**: `"current-user-id"` SWR 또는 각 fetcher 내부에서 `createClient() + getUser()` 반복
3. **컴포넌트 내 다중 호출**: `AttendanceCard`는 동일 컴포넌트에서 `getUser()`를 3개 함수에서 각각 호출
4. **realtime 이벤트마다 DB 풀 쿼리**: `admin/layout.tsx`에서 알림 수신 시마다 `fetchNotis()` DB 조회 실행

## 수정 내용

### A. AuthProvider React Context 생성 (`src/lib/auth-context.tsx`)

앱 최상단에서 `getUser()` 1회 호출 후 `onAuthStateChange`로 실시간 추적. `useAuth()` 훅으로 `{ user, isLoading }` 반환.

```tsx
// 사용법
const { user } = useAuth();
const userId = user?.id ?? null;
```

### B. providers.tsx에 AuthProvider 추가

SWRConfig 내부에 AuthProvider를 래핑해 모든 클라이언트 컴포넌트에서 `useAuth()` 사용 가능.

### C. 각 페이지/컴포넌트 getUser() 제거

| 파일 | 변경 전 | 변경 후 |
|------|--------|--------|
| `schedule/page.tsx` | `useSWR("current-user-id", getUser)` | `useAuth()` |
| `recipes/page.tsx` | SWR fetcher 내 `getUser()` | `useAuth()`, SWR key에 userId 포함 |
| `announcements/page.tsx` | SWR fetcher 내 `getUser()` | `useAuth()` |
| `attendances/page.tsx` | SWR fetcher 내 `getUser()` | `useAuth()` |
| `admin/substitutes/page.tsx` | `useEffect + useState` | `const currentAdminId = user?.id ?? null` |
| `recipes/[id]/page.tsx` | `useEffect` 내 `getUser()` | `useAuth()`, `if (!user) return` |
| `recipes/[id]/edit/page.tsx` | `useEffect` 내 `getUser()` | `useAuth()` |
| `recipes/new/page.tsx` | `useEffect` 내 `getUser()` | `useAuth()` |
| `AttendanceCard.tsx` | `getUser()` × 3 (useEffect + 2개 핸들러) | `useAuth()` 1회, userId state 재사용 |
| `RecipeForm.tsx` | `handleSave` 내 `getUser()` | `useAuth()` |
| `admin/layout.tsx` | `useEffect` 내 `getUser()` | `useAuth()` |

### D. admin/layout.tsx realtime 최적화

알림 수신 시 `fetchNotis()` DB 풀 쿼리 대신 `payload.new`를 직접 state에 반영.

```tsx
// 변경 전: DB 쿼리 1회 발생
(payload) => { fetchNotis(); }

// 변경 후: DB 쿼리 없이 state 즉시 업데이트
(payload) => {
  const newNoti = payload.new as any;
  setNotis((prev) => [newNoti, ...prev].slice(0, 15));
  setUnreadCount((prev) => prev + 1);
}
```

## 결과

| 항목 | 개선 전 | 개선 후 |
|------|--------|--------|
| 페이지 로드당 `getUser()` 호출 수 | 4~8회 | **앱 전체 1회** |
| admin realtime 이벤트당 DB 쿼리 | 1회 (`fetchNotis`) | **0회** (payload 직접 반영) |
| `AttendanceCard` 내 중복 getUser() | 3회 | **0회** |
| 빌드 | — | ✅ 오류 없음 |

## 잔여 작업 (향후)

아직 `getUser()`를 직접 호출하는 클라이언트 컴포넌트:
- `components/recipe/RecipeComments.tsx` — 좋아요 핸들러
- `components/AnnouncementBanner.tsx` — 배너 마운트 시
- `components/OnboardingFunnel.tsx` — 온보딩 시작 시
- `components/announcement/AnnouncementForm.tsx` — 저장 핸들러
- `components/CatDodgeGame.tsx` — 게임 시작 시
- `app/announcements/[id]/page.tsx` — 페이지 마운트

> `app/page.tsx`는 서버 컴포넌트이므로 `useAuth()` 사용 불가 → 현 상태 유지

## 주의사항

- `RecipeForm.tsx`의 `getSession()`은 영상 업로드 시 `access_token` 추출 목적이므로 **의도적 유지**
- `admin/layout.tsx` useEffect 의존성을 `user?.id`로 좁히면 토큰 갱신 시 `checkAdmin()` 재실행 방지 가능 (향후 개선 대상)
