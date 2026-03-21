# [FEAT-033] 메인화면 로드 시간 최적화

| 항목 | 내용 |
|------|------|
| 유형 | 성능 개선 |
| 상태 | ✅ 완료 |
| 파일 | `src/app/page.tsx`, `src/components/HomeClient.tsx` |
| 발견일 | 2026-03-21 |
| 완료일 | 2026-03-21 |

## 배경
메인화면(/) 로드 시 사용자 체감 속도 저하 발생.
SSR + 클라이언트 번들 양측에서 개선 가능한 병목 다수 확인.

## 원인 분석

### 1. SSR 직렬 실행 (TTFB 증가)
`auth.getUser()` 완료 이후에야 8개 DB 쿼리 시작.
쿼리 자체는 `Promise.all`로 병렬이지만 auth 레이턴시가 선행 비용.

### 2. stores 클라이언트 필터링 (불필요한 데이터 전송)
`stores` 전체 로드 후 클라이언트에서 `filter((s) => s.name !== "목동")`.
DB 쿼리에서 `.neq("name", "목동")`으로 처리하면 전송 데이터 감소.

### 3. AttendanceCard 즉시 로딩 (초기 JS 번들 비대)
910줄짜리 복잡한 컴포넌트가 초기 번들에 포함.
이 컴포넌트는 페이지 진입 직후 즉시 상호작용 필요 (출퇴근 버튼) → lazy는 LCP에 영향.

### 4. MyInfoModal 항상 마운트 (불필요한 초기 렌더링)
`isEditModalOpen`이 false여도 항상 `<MyInfoModal>`이 DOM에 존재.
조건부 마운트로 전환 가능.

### 5. Realtime INSERT → 전체 알림 재페칭 (불필요한 네트워크)
알림 1건 INSERT 이벤트 발생 시 `fetchNotis()` 호출 → 15개 전체 재요청.
INSERT 페이로드에서 새 알림만 상태에 prepend하면 DB 왕복 제거.

## 수정 계획

### Phase 1: 즉시 적용 가능
- [x] `stores` `unstable_cache` 캐싱 (빌드 시 1회 fetch, revalidate: false)
- [x] `MyInfoModal` 조건부 마운트 (`isEditModalOpen && <MyInfoModal>`)
- [x] Realtime INSERT 이벤트 증분 업데이트 (prepend, fetchNotis 제거)

### Phase 2: 쿼리 최적화
- [x] notifications select 필드 최소화 (`*` → 7개 필드만)
- [x] 알림 읽음 처리 로컬 상태 직접 업데이트 (fetchNotis 재호출 제거)

## 수정 내용
- `src/app/page.tsx`
  - `unstable_cache`로 stores 캐싱 (revalidate: false, anon key)
  - notifications `select("*")` → `select("id, title, content, type, source_id, is_read, created_at")`
- `src/components/HomeClient.tsx`
  - `MyInfoModal` 조건부 마운트
  - Realtime INSERT 핸들러: `fetchNotis` 대신 payload.new prepend
  - `markAllRead`: `fetchNotis` 대신 로컬 상태 직접 갱신
  - `handleNotiClick`: `fetchNotis` 대신 해당 항목 즉시 `is_read: true` + `unreadCount` 차감
  - `fetchNotis` 함수 완전 제거
- `docs/migrations/021_stores_anon_select_policy.sql`: stores anon SELECT 정책

## 결과
- stores DB 왕복 제거 (빌드 캐시)
- 알림 INSERT 시 네트워크 왕복 제거
- 읽음 처리 즉시 UI 반영 (기존 버그 수정)
- 빌드 통과 확인
