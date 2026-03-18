# [FEAT-018] 레시피 재료 + 작성자명

| 항목 | 내용 |
|------|------|
| 유형 | 기능 추가 |
| 상태 | 🔄 미시작 |
| 파일 | `src/app/recipes/[id]/page.tsx`, `src/components/recipe/RecipeForm.tsx`, `src/types/recipe.ts` |
| 발견일 | 2026-03-18 |
| 완료일 | - |

## 배경

대표 통화에서 "재료 추가됐으면 좋겠다 레시피에", "레시피 작성자명이 나오도록" 확인.
레시피를 볼 때 어떤 재료가 얼마나 들어가는지 파악하고, 누가 등록한 레시피인지 확인 가능해야 함.
재고 관리(Phase 3 예정)와 연동 기반이 될 수도 있음.

## 현재 상태

- `recipe_items`에 `created_by` 컬럼 없음
- `recipe_ingredients` 테이블 없음
- 레시피 상세/폼 모두 재료 관련 UI 없음

## 수정 계획

### 1. DB 마이그레이션

```sql
-- recipe_items에 작성자 컬럼 추가
ALTER TABLE recipe_items
  ADD COLUMN created_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- 기존 레시피: admin 계정 id로 backfill (별도 확인 후 실행)

-- 재료 테이블 신규 생성
CREATE TABLE recipe_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES recipe_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  amount text NOT NULL,       -- "200", "1/2" 등 문자열 (분수 표현 가능)
  unit text,                  -- "g", "ml", "개", "T" 등
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 인덱스
CREATE INDEX ON recipe_ingredients(recipe_id);

-- RLS (recipe_items와 동일)
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;

-- 직원: published 레시피 재료만 SELECT
CREATE POLICY "직원 재료 조회" ON recipe_ingredients FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recipe_items ri
      WHERE ri.id = recipe_id AND ri.is_published = true
    )
  );

-- 어드민: ALL
CREATE POLICY "어드민 재료 관리" ON recipe_ingredients FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- full_time 직원: INSERT/UPDATE (FEAT-016과 동일 기준)
CREATE POLICY "정규직 직원 재료 수정" ON recipe_ingredients FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND employment_type = 'full_time')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND employment_type = 'full_time')
  );
```

### 2. 타입 수정 (`src/types/recipe.ts`)

```typescript
// 추가
export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  name: string;
  amount: string;
  unit: string | null;
  order_index: number;
}

// RecipeItem에 추가
export interface RecipeItem {
  // ... 기존
  created_by: string | null;
  author?: { name: string | null }; // JOIN 결과
}
```

### 3. RecipeForm.tsx 수정

재료 섹션 추가 (단계 드래그와 유사한 방식):
- "재료 추가하기" 버튼 → 재료명, 양, 단위 인라인 입력
- 재료 삭제 버튼 (휴지통 아이콘)
- 순서 변경 (드래그 또는 상하 버튼)
- 폼 제출 시 `recipe_ingredients` upsert/delete

**재료 입력 UI**:
```
[재료명         ] [양  ] [단위]  [🗑]
예: 우유          200   ml
    설탕          2     T
```

### 4. 레시피 상세 페이지 수정 (`/recipes/[id]`)

데이터 fetch 쿼리 수정:
```typescript
supabase
  .from("recipe_items")
  .select("*, recipe_categories(name), profiles(name)")  // 작성자 JOIN
  .eq("id", id)
  .single()

supabase
  .from("recipe_ingredients")
  .select("*")
  .eq("recipe_id", id)
  .order("order_index")
```

**표시 위치**:
- 레시피 헤더 아래: `작성자: 홍길동` (텍스트, secondary 색상)
- 단계 위: "재료" 섹션 카드
  ```
  재료
  ─────────────
  우유    200ml
  설탕    2T
  연유    1T
  ```

## UI/UX 라이팅

| 요소 | 텍스트 |
|------|--------|
| 작성자 레이블 | "작성자" |
| 재료 섹션 제목 | "재료" |
| 재료 없음 | "등록된 재료가 없어요." |
| 재료 추가 버튼 | "재료 추가하기" |
| 재료 단위 placeholder | "g, ml, 개, T ..." |

## 결과

- [ ] DB 마이그레이션 실행 (`recipe_items.created_by`, `recipe_ingredients`)
- [ ] RLS 3종 생성 (직원 SELECT, 어드민 ALL, full_time UPDATE)
- [ ] `RecipeIngredient` 타입 추가
- [ ] `RecipeForm.tsx` 재료 섹션 추가
- [ ] 레시피 상세 재료 표시 + 작성자명 표시
- [ ] 어드민 레시피 생성 시 `created_by` 저장
- [ ] schema.md 갱신
- [ ] 빌드 통과
