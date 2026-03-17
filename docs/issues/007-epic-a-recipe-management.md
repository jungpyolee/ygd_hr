# [FEAT-007] Epic A — 레시피 관리

| 항목 | 내용 |
|------|------|
| 유형 | 기능 추가 |
| 상태 | ✅ 완료 |
| 파일 | `src/app/recipes/`, `src/app/admin/recipes/`, `src/components/recipe/` |
| 발견일 | 2026-03-17 |
| 완료일 | 2026-03-17 |

## 배경

2026-03-16 기획 확정. 음료 레시피 관리 기능 MVP.
- 직원: 레시피 조회 (published 항목만)
- 어드민: 레시피 CRUD + 카테고리 관리

## 구현 내용

### DB (migration 005)
- `recipe_categories` — 카테고리 (음료 등)
- `recipe_items` — 레시피 항목 (썸네일, 영상, 공개여부)
- `recipe_steps` — 단계별 설명
- Storage 버킷: `recipe-media` (Public)
- RLS: 직원은 published만 조회, 어드민 전체 CRUD

### 라우팅
- `/recipes` — 카테고리 + 레시피 목록 (전 직원)
- `/recipes/[id]` — 레시피 상세 (전 직원)
- `/admin/recipes` — 레시피 관리 목록 (어드민)
- `/admin/recipes/new` — 레시피 추가 (어드민)
- `/admin/recipes/[id]/edit` — 레시피 수정 (어드민)

## 수정 내용

### DB (migration 005)
- `recipe_categories`, `recipe_items`, `recipe_steps` 테이블 생성
- RLS 6개: 직원 SELECT(published 조건), 어드민 ALL
- `recipe-media` Storage 버킷 (Public, 100MB 제한)
- `set_updated_at()` 트리거 재사용 (recipe_items)
- 인덱스 3개: category_id, published+order, recipe_id+step_number

### 코드
- `src/types/recipe.ts` — 공용 타입 정의
- `src/app/recipes/page.tsx` — 직원 레시피 목록 (카테고리 탭)
- `src/app/recipes/[id]/page.tsx` — 직원 레시피 상세 (영상/단계)
- `src/app/admin/recipes/page.tsx` — 어드민 목록 (공개토글/삭제)
- `src/app/admin/recipes/new/page.tsx` — 레시피 추가
- `src/app/admin/recipes/[id]/edit/page.tsx` — 레시피 수정
- `src/components/recipe/RecipeForm.tsx` — 추가/수정 공용 폼
- `src/app/admin/layout.tsx` — 레시피 관리 메뉴 추가
- `src/app/page.tsx` — 레시피 바로가기 버튼 추가

## 결과
- 빌드 성공 (타입 오류 0건)
- 모든 라우트 정상 생성 (13개)
- feat/recipe 브랜치 push 완료
