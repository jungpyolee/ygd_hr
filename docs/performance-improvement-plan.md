# 성능 개선 계획

> 작성일: 2026-03-18
> 분석 기반: 실제 코드 리뷰 (app/**, src/**)

---

## 현황 요약

모든 페이지가 `"use client"` + `useEffect` 기반 데이터 페칭으로 구현되어 있어,
서버 렌더링의 이점을 전혀 활용하지 못하고 있다.
사용자 입장에서 초기 로딩 시 JS 번들 다운로드 → Supabase 쿼리 → 렌더링 순서로 진행되어
체감 로딩이 느리다.

---

## 약점 분석

### 🔴 HIGH — 즉시 개선 필요

#### 1. N+1 쿼리 패턴
연쇄 쿼리로 DB 왕복이 3~4회 발생.

| 파일 | 행 | 문제 |
|------|-----|------|
| `src/app/schedule/page.tsx` | 121~197 | weekly_schedules → slots → requests → responses 순차 조회 (4회) |
| `src/app/admin/attendance/page.tsx` | 83~157 | slots → logs → profiles 순차 조회 (3회) |

**해결 방향**: JOIN 쿼리 또는 Supabase `select("..., relation(...)")` 중첩 사용으로 단일 쿼리로 통합.

#### 2. 전 페이지 Client Component
모든 페이지(`page.tsx`)가 `"use client"` 선언. 초기 번들 ~900KB.

| 포함 라이브러리 | 예상 크기 |
|------|------|
| @supabase/supabase-js | ~400KB |
| date-fns | ~100KB |
| lucide-react | ~50KB |
| shadcn/ui + radix | ~150KB |

**해결 방향**: 정적 콘텐츠는 Server Component로 분리, 인터랙션 필요한 부분만 Client Component 유지.

---

### 🟠 MEDIUM — 단기 개선

#### 3. `select("*")` 남발
불필요한 컬럼까지 전송.

| 파일 | 행 | 내용 |
|------|-----|------|
| `src/app/page.tsx` | 91 | `stores.select("*")` |
| `src/app/attendances/page.tsx` | 56 | `attendance_logs.select("*")` |
| `src/app/admin/recipes/page.tsx` | 26~27 | 다중 `select("*")` |

**해결 방향**: 실제 사용하는 컬럼만 명시 (`select("id, name, created_at")`).

#### 4. `<img>` 직접 사용
`src/app/recipes/page.tsx:172~178` — 최근 본 레시피 섹션에서 `next/image` 대신 `<img>` 사용.
이미지 압축/최적화 없음, CLS(레이아웃 시프트) 발생.

**해결 방향**: `next/image`로 교체, `width`/`height` 또는 `fill` 지정.

---

### 🟡 LOW — 안정성/장기 개선

#### 5. Realtime 구독 cleanup 누락
`src/app/page.tsx:82~87` — 알림 구독이 컴포넌트 unmount 시 해제되지 않음.
불필요한 WebSocket 연결 유지 + 메모리 누수.

```ts
// 현재
useEffect(() => {
  supabase.channel(...).on(...).subscribe();
}, []);

// 개선
useEffect(() => {
  const channel = supabase.channel(...).on(...).subscribe();
  return () => { supabase.removeChannel(channel); };
}, []);
```

#### 6. 캐싱 전략 부재
동일 데이터를 페이지 진입마다 재조회. React Query 또는 SWR 도입 검토.

#### 7. Suspense 미적용
스케줄 페이지 외 대부분의 페이지에 Suspense 미사용. 부분 로딩 최적화 기회 손실.

---

## 개선 우선순위

| 순위 | 항목 | 예상 효과 | 난이도 |
|------|------|------|------|
| 1 | N+1 쿼리 통합 (스케줄, 출근) | DB 응답 50~70% 단축 | 중 |
| 2 | 홈페이지 Server Component 전환 | 초기 로딩 1~2초 단축 | 고 |
| 3 | `<img>` → `next/image` 교체 | 이미지 로딩 최적화 | 하 |
| 4 | `select("*")` → 필드 명시 | 전송량 감소 | 하 |
| 5 | Realtime subscription cleanup | 안정성 개선 | 하 |
| 6 | React Query / SWR 도입 | 반복 조회 제거 | 고 |

---

## 작업 상태

- [ ] PERF-001: N+1 쿼리 통합 (스케줄 페이지)
- [ ] PERF-002: N+1 쿼리 통합 (관리자 출근 페이지)
- [ ] PERF-003: 홈페이지 Server Component 전환
- [ ] PERF-004: `<img>` → `next/image` 교체
- [ ] PERF-005: `select("*")` 컬럼 명시
- [ ] PERF-006: Realtime subscription cleanup 추가
