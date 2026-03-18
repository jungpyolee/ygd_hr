# [DB-016] Production DB 동기화 — Dev 변경사항 반영

| 항목 | 내용 |
|------|------|
| 유형 | 스키마 변경 + RLS 동기화 |
| 상태 | ✅ 완료 |
| 마이그레이션 | migrations/016_prod_sync_from_dev.sql |
| 발견일 | 2026-03-18 |
| 완료일 | 2026-03-18 |

---

## 배경

`dev` 브랜치에서 기능 개발(FEAT-020~022: 레시피 댓글, 공지사항, 체크리스트) 및 BUG-024 수정이 완료됨.
Dev DB에만 반영된 스키마/RLS 변경사항을 Production DB에 동기화하여 배포 준비 완료.

---

## 원인 분석

Dev DB와 Production DB 간 직접 비교 결과 아래 4가지 카테고리에서 차이 발견.

### 1. Production에 누락된 테이블 (4개)

| 테이블 | 기능 | 관련 Epic |
|--------|------|----------|
| `announcements` | 공지사항 본문 | FEAT-021 |
| `announcement_reads` | 공지 읽음 여부 | FEAT-021 |
| `checklist_templates` | 체크리스트 항목 정의 | FEAT-022 |
| `checklist_submissions` | 체크리스트 제출 기록 | FEAT-022 |

### 2. RLS 정책 차이 (5건)

| 테이블 | Dev (올바른 상태) | Production (수정 필요) | 조치 |
|--------|------------------|----------------------|------|
| `recipe_comments` | `본인 댓글 삭제` DELETE 정책 있음 | **누락** | ADD |
| `recipe_ingredients` | `레시피 작성자 재료 관리` (employment_type 무관) | `정규직 재료 수정` (full_time 전용) | REPLACE |
| `recipe_steps` | `레시피 작성자 단계 관리` (created_by 기준) | `정규직 레시피 단계 수정` (full_time 전용) | REPLACE |
| `schedule_slots` | `ss_emp_confirmed` (확정 스케줄 + 대타 대상) | `ss_emp_own` (본인 스케줄만) | REPLACE |
| `weekly_schedules` | `ws_emp_confirmed` (plain string) | `ws_emp_confirmed` (chr() 인코딩) | UPDATE |

> **schedule_slots 차이가 가장 중요**: Production의 `ss_emp_own`은 직원이 자신의 슬롯만 볼 수 있어 대타 수락 기능 동작 불가.

### 3. 인덱스 차이 (2건)

| 테이블 | 차이 | 조치 |
|--------|------|------|
| `recipe_ingredients` | Production: `(recipe_id)` 단일 / Dev: `(recipe_id, order_index)` | RECREATE |
| `recipe_comments` | Production: `idx_recipe_comments_parent_id` 누락 | ADD |

### 4. 트리거 (신규 테이블과 함께 생성)

- `trg_announcements_updated_at` — announcements 테이블 생성 시 함께 추가
- `trg_checklist_templates_updated_at` — checklist_templates 테이블 생성 시 함께 추가

---

## 마이그레이션

파일: `docs/migrations/016_prod_sync_from_dev.sql`

실행 순서:
1. 신규 테이블 4개 생성 (DDL + RLS + 트리거 + 인덱스)
2. 기존 테이블 RLS 정책 교체 (recipe_comments, recipe_ingredients, recipe_steps, schedule_slots, weekly_schedules)
3. 인덱스 개선 (recipe_ingredients, recipe_comments)

---

## 테스트 계획

Production 반영 후 검증 SQL:
```sql
-- 신규 테이블 존재 확인
SELECT tablename FROM pg_tables
WHERE schemaname='public'
  AND tablename IN ('announcements','announcement_reads','checklist_templates','checklist_submissions');

-- RLS 정책 확인
SELECT tablename, policyname, cmd FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('recipe_comments','recipe_ingredients','recipe_steps','schedule_slots')
ORDER BY tablename, policyname;
```

---

## 진행 상황

- [x] Dev/Production DB 차이 분석 완료
- [x] 마이그레이션 SQL 작성 완료
- [x] dev → main PR 생성 (#1)
- [x] PR 머지 (2026-03-18T08:41:27Z)
- [x] Production 마이그레이션 실행
- [x] 검증 완료

---

## 결과

Production DB에 모든 변경사항 정상 반영 확인.

### 신규 테이블 (4개 생성 확인)
- `announcements` ✅
- `announcement_reads` ✅
- `checklist_templates` ✅
- `checklist_submissions` ✅

### RLS 정책 (검증 완료)
- `recipe_comments`: `본인 댓글 삭제` DELETE 정책 추가 ✅
- `recipe_ingredients`: `정규직 재료 수정` 제거 → `레시피 작성자 재료 관리` 추가 ✅
- `recipe_steps`: `정규직 레시피 단계 수정` 제거 → `레시피 작성자 단계 관리` 추가 ✅
- `schedule_slots`: `ss_emp_own` 제거 → `ss_emp_confirmed` 추가 ✅
- `weekly_schedules`: `ws_emp_confirmed` chr() 인코딩 → 평문 'confirmed' ✅

### 인덱스
- `recipe_ingredients`: `(recipe_id, order_index)` 재생성 ✅
- `recipe_comments`: `idx_recipe_comments_parent_id` 추가 ✅
