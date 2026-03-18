# Phase 1 & 2 개발 로드맵

> 2026-03-18 대표 통화 메모 기반 기획 확정
> 현재 브랜치: `dev` | 배포 대상: Vercel

---

## 상태 요약

| FEAT | 제목 | DB 준비 | 코드 준비 | 상태 |
|------|------|---------|-----------|------|
| 014 | 온보딩 입사일 → 보건증만료일 교체 | ✅ `health_cert_date` 컬럼 있음 | ❌ | 🔄 미시작 |
| 015 | 직원 홈 — 주간통계 → 스케줄 시간표 | ✅ schedule_slots 있음 | ❌ | 🔄 미시작 |
| 016 | 레시피 수정 권한 정규직 직원 허용 | ✅ `employment_type` 있음 | ❌ | 🔄 미시작 |
| 017 | 보건증 만료 1달 전 어드민 알림 | ✅ `health_cert_date` 있음 | ❌ | 🔄 미시작 |
| 018 | 레시피 재료 + 작성자명 | ❌ `recipe_ingredients` 없음 | ❌ | 🔄 미시작 |
| 019 | 레시피 댓글/대댓글 + 알림 | ❌ `recipe_comments` 없음 | ❌ | 🔄 미시작 |
| 020 | 공지사항 게시판 | ❌ `announcements` 없음 | ❌ | 🔄 미시작 |
| 021 | 출퇴근 체크리스트 시스템 | ❌ 테이블 없음 | ❌ | 🔄 미시작 |

---

## Phase 1 — 기존 기능 개선 (4개)

DB 신규 테이블 없이 기존 컴포넌트/RLS 수정 수준. 병렬 개발 가능.

### FEAT-014 | 온보딩 입사일 → 보건증만료일 교체
- **변경 범위**: `OnboardingFunnel.tsx` Step 3만 교체
- `joinDate` → `healthCertDate` (DatePicker 재활용)
- DB UPDATE: `join_date` 저장 제거 → `health_cert_date` 저장
- `alert()` → toast 교체 (라인 102 버그 수정 포함)

### FEAT-015 | 직원 홈 — 주간통계 → 스케줄 시간표
- **변경 범위**: `page.tsx`에서 `WeeklyWorkStats` 제거 → 새 `WeeklyScheduleCard` 컴포넌트 추가
- 이번 주 `schedule_slots` 데이터로 요일별 근무 시간 표시
- `confirmed` 스케줄이 없으면 빈 상태 안내
- `WeeklyWorkStats.tsx` 파일 삭제

### FEAT-016 | 레시피 수정 권한 정규직 직원 허용
- **변경 범위**: RLS 정책 수정 + 라우트 권한 조건 완화
- `employment_type = 'full_time'`인 직원에게 레시피 CRUD(삭제 제외) 허용
- `/admin/recipes` 어드민 전용 유지, `/recipes/[id]/edit` 신규 직원용 라우트 또는 권한 분기

### FEAT-017 | 보건증 만료 1달 전 어드민 알림
- **변경 범위**: `admin/page.tsx` 또는 `admin/layout.tsx` 로드 시 체크 로직 추가
- `health_cert_date` ≤ 오늘 + 30일인 직원 조회 → notifications INSERT
- 중복 알림 방지: 당일 같은 `source_id`로 이미 발송된 알림 체크

---

## Phase 2 — 신규 기능 (4개)

DB 마이그레이션 필요. 018 → 019 순서 의존성 있음.

### FEAT-018 | 레시피 재료 + 작성자명
- **DB**: `recipe_items`에 `created_by uuid FK profiles.id` 컬럼 추가
- **DB**: `recipe_ingredients` 테이블 신규 (id, recipe_id, name, amount, unit, order_index)
- **코드**: `RecipeForm.tsx` 재료 추가/삭제/정렬 UI
- **코드**: `/recipes/[id]` 상세 페이지에 재료 목록 + 작성자명 표시
- **RLS**: recipe_items과 동일 정책 적용

### FEAT-019 | 레시피 댓글/대댓글 + 알림
- **DB**: `recipe_comments` 테이블 (id, recipe_id, profile_id, parent_id nullable, content, mentioned_profile_id nullable, created_at)
- **코드**: `/recipes/[id]` 하단 댓글 섹션 (댓글 + 대댓글 트리)
- **대댓글**: 부모 댓글 작성자 @태그 자동 삽입 (예: `@홍길동 `)
- **알림 3종**:
  - 내 레시피에 댓글 → 레시피 작성자에게
  - 내 댓글에 대댓글 → 부모 댓글 작성자에게
  - @멘션 → 태그된 사람에게
- **RLS**: 모든 인증 직원 SELECT, 본인 댓글 INSERT/UPDATE/DELETE, 어드민 ALL

### FEAT-020 | 공지사항 게시판
- **DB**: `announcements` 테이블 (id, title, content, created_by, is_pinned, created_at, updated_at)
- **코드**: 직원 홈 상단 공지 배너 (최신 1개 + 목록 링크)
- **코드**: `/announcements` 목록 페이지
- **코드**: `/admin/announcements` CRUD 페이지
- **알림**: 새 공지 등록 시 `target_role = 'all'` 알림 발송

### FEAT-021 | 출퇴근 체크리스트 시스템
- **DB**: `checklist_templates` (id, title, position nullable, trigger `'check_in'/'check_out'`, order_index, is_active)
- **DB**: `checklist_submissions` (id, profile_id, slot_id nullable, trigger, submitted_at, items jsonb)
- **코드**: 출근 기록 후 오픈 체크리스트 바텀시트 표시
- **코드**: 퇴근 버튼 클릭 시 마감 체크리스트 — 미완료 항목 있으면 퇴근 차단
- **코드**: `/admin/checklists` 포지션별 항목 설정 페이지

---

## 공통 UI/UX 적용 기준 (`docs/toss-ui-ux-guidelines.md` 전체 준수)

| 규칙 | 기준 |
|------|------|
| 말투 | `~해요` 체 통일, `~합니다/했습니다` 금지 |
| 다이얼로그 | `alert()/confirm()` 0개 → 바텀시트/모달 |
| 로딩 | "로딩 중..." 금지 → Skeleton UI |
| 토스트 | 이유 + 해결방법 포함 |
| 버튼 | 동사형 (`"저장하기"`, `"댓글 달기"`, `"완료하기"`) |
| 빈 상태 | 구체적 안내 + 행동 유도 문구 |

---

## 개발 순서 권장

```
Phase 1 (병렬 가능):
  014 → 015 → 016 → 017

Phase 2 (018 먼저):
  018 (재료+작성자) → 019 (댓글, recipe_items 의존)
  020 (공지) → 독립
  021 (체크리스트) → 독립
```

---

## 제외 확정

- **네이버 예약 연동**: 대표 확인 — 불필요
- **WeeklyWorkStats**: 015 완료 시 파일 삭제
