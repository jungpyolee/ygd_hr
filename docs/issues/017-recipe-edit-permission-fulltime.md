# [FEAT-017] 레시피 수정 권한 — 정규직 직원 허용

| 항목 | 내용 |
|------|------|
| 유형 | 기능 수정 |
| 상태 | ✅ 완료 |
| 파일 | `src/app/recipes/[id]/page.tsx`, `src/app/recipes/[id]/edit/page.tsx` (신규), `src/components/recipe/RecipeForm.tsx` |
| 발견일 | 2026-03-18 |
| 완료일 | 2026-03-18 |

## 배경

대표 통화에서 "정규직 직원들도 레시피 수정 권한 주기"라고 확인.
현재 레시피 수정은 `/admin/recipes/[id]/edit` 어드민 전용 라우트에만 존재.
`profiles.employment_type = 'full_time'`인 직원에게 수정 권한 부여.

**삭제 권한은 어드민 전용 유지** (레시피 삭제는 신중해야 하므로).

## 현재 상태

- 레시피 수정: `/admin/recipes/[id]/edit` — 어드민만 접근 가능
- `recipe_items` RLS: 직원은 `is_published=true` SELECT만, 어드민 ALL
- `recipe_steps` RLS: 부모 published 시 직원 SELECT만, 어드민 ALL
- `recipe-media` Storage: 어드민 INSERT/UPDATE/DELETE

## 수정 계획

### 1. DB RLS 수정

```sql
-- recipe_items: full_time 직원 INSERT/UPDATE 허용 (DELETE는 어드민 전용 유지)
CREATE POLICY "정규직 직원 레시피 수정" ON recipe_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND employment_type = 'full_time'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND employment_type = 'full_time'
    )
  );

-- recipe_steps: 동일 조건
CREATE POLICY "정규직 직원 레시피 단계 수정" ON recipe_steps
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND employment_type = 'full_time'
    )
  );
```

### 2. Storage 정책 수정

```sql
-- recipe-media 버킷: full_time 직원 업로드 허용
CREATE POLICY "정규직 직원 미디어 업로드" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'recipe-media'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND employment_type = 'full_time'
    )
  );
```

### 3. 라우팅 구조

**방안**: `/recipes/[id]/edit` 신규 직원용 레시피 수정 라우트 추가
- `full_time` 직원 + 어드민 모두 접근 가능
- 기존 `/admin/recipes/[id]/edit`은 유지 (어드민은 양쪽 모두 가능)
- `RecipeForm.tsx` 재사용 (단, `is_published` 토글은 어드민만 노출)

### 4. 레시피 상세 페이지 수정 (`/recipes/[id]`)

- `full_time` 직원 또는 어드민이면 "수정하기" 버튼 표시
- 어드민이면 추가로 "삭제하기" 버튼 표시 (현재 없음, 신규 추가)

### 5. 레시피 목록 페이지 수정 (`/recipes`)

- `full_time` 직원에게 레시피 카드에 수정 진입 경로 추가 (선택 사항, 상세 페이지에서만 진입해도 충분)

## UI/UX 라이팅

| 요소 | 텍스트 |
|------|--------|
| 수정 버튼 | "수정하기" |
| 수정 완료 토스트 | "레시피를 수정했어요." |
| 권한 없음 접근 시 | 홈으로 리다이렉트 (토스트 없이) |

## 결과

- [ ] DB RLS 정책 추가 (recipe_items, recipe_steps, storage)
- [ ] `/recipes/[id]/edit` 라우트 생성
- [ ] `full_time` 권한 체크 미들웨어 적용
- [ ] 레시피 상세 페이지 수정/삭제 버튼 조건 분기
- [ ] `is_published` 토글 어드민 전용 처리
- [ ] 빌드 통과
