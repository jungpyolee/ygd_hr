# [FEAT-007] Epic A — 레시피 관리

| 항목 | 내용 |
|------|------|
| 유형 | 기능 추가 |
| 상태 | 🔄 진행 중 |
| 파일 | `src/app/recipes/`, `src/app/admin/recipes/`, `src/components/recipe/` |
| 발견일 | 2026-03-17 |
| 완료일 | - |

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
(작업 완료 후 기록)

## 결과
(작업 완료 후 기록)
