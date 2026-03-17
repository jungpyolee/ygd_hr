-- Migration 005: 레시피 관리 테이블 생성
-- Epic A — 음료 레시피 MVP
-- 2026-03-17

-- =============================================
-- 1. recipe_categories
-- =============================================
CREATE TABLE recipe_categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  department  text        NOT NULL DEFAULT 'all', -- 'all' / '매장' / '공장'
  order_index integer     NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- =============================================
-- 2. recipe_items
-- =============================================
CREATE TABLE recipe_items (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   uuid        NOT NULL REFERENCES recipe_categories(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  description   text,
  thumbnail_url text,
  video_url     text,
  is_published  boolean     NOT NULL DEFAULT false,
  order_index   integer     NOT NULL DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- =============================================
-- 3. recipe_steps
-- =============================================
CREATE TABLE recipe_steps (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id   uuid        NOT NULL REFERENCES recipe_items(id) ON DELETE CASCADE,
  step_number integer     NOT NULL,
  title       text,
  content     text        NOT NULL,
  image_url   text,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (recipe_id, step_number)
);

-- =============================================
-- 4. 인덱스
-- =============================================
CREATE INDEX idx_recipe_items_category_id    ON recipe_items(category_id);
CREATE INDEX idx_recipe_items_published      ON recipe_items(is_published, order_index);
CREATE INDEX idx_recipe_steps_recipe_id      ON recipe_steps(recipe_id, step_number);

-- =============================================
-- 5. updated_at 트리거 (recipe_items)
-- =============================================
CREATE TRIGGER trg_recipe_items_updated_at
  BEFORE UPDATE ON recipe_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================
-- 6. RLS 활성화
-- =============================================
ALTER TABLE recipe_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_steps      ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 7. RLS 정책 — recipe_categories
-- =============================================
-- 전 직원 조회
CREATE POLICY "레시피 카테고리 조회"
  ON recipe_categories FOR SELECT
  TO authenticated
  USING (true);

-- 어드민 전체 조작
CREATE POLICY "어드민 레시피 카테고리 관리"
  ON recipe_categories FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- =============================================
-- 8. RLS 정책 — recipe_items
-- =============================================
-- 직원: published만 / 어드민: 전체
CREATE POLICY "레시피 조회"
  ON recipe_items FOR SELECT
  TO authenticated
  USING (is_published = true OR is_admin());

-- 어드민 전체 조작
CREATE POLICY "어드민 레시피 관리"
  ON recipe_items FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- =============================================
-- 9. RLS 정책 — recipe_steps
-- =============================================
-- 직원: 부모 recipe가 published인 경우만 / 어드민: 전체
CREATE POLICY "레시피 단계 조회"
  ON recipe_steps FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recipe_items
      WHERE id = recipe_steps.recipe_id
        AND (is_published = true OR is_admin())
    )
  );

-- 어드민 전체 조작
CREATE POLICY "어드민 레시피 단계 관리"
  ON recipe_steps FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
