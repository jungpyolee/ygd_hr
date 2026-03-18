-- Migration 015: Dev DB 동기화 — recipe_ingredients + recipe_comments + no_overlapping_slots
-- Production에만 있던 테이블/제약을 Dev에 추가
-- 2026-03-18

-- =============================================
-- 1. recipe_ingredients
-- =============================================
CREATE TABLE recipe_ingredients (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id   uuid        NOT NULL REFERENCES recipe_items(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  amount      text        NOT NULL,
  unit        text,
  order_index integer     NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id, order_index);

ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "어드민 재료 관리" ON recipe_ingredients FOR ALL
  TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "정규직 재료 수정" ON recipe_ingredients FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND employment_type = 'full_time')
    AND EXISTS (SELECT 1 FROM recipe_items WHERE id = recipe_ingredients.recipe_id AND created_by = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND employment_type = 'full_time')
    AND EXISTS (SELECT 1 FROM recipe_items WHERE id = recipe_ingredients.recipe_id AND created_by = auth.uid())
  );

CREATE POLICY "재료 조회" ON recipe_ingredients FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recipe_items
      WHERE id = recipe_ingredients.recipe_id
        AND (is_published = true OR is_admin() OR created_by = auth.uid())
    )
  );

-- =============================================
-- 2. recipe_comments
-- =============================================
CREATE TABLE recipe_comments (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id           uuid        NOT NULL REFERENCES recipe_items(id) ON DELETE CASCADE,
  profile_id          uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  parent_id           uuid        REFERENCES recipe_comments(id) ON DELETE CASCADE,
  content             text        NOT NULL,
  mentioned_profile_id uuid       REFERENCES profiles(id) ON DELETE SET NULL,
  is_deleted          boolean     NOT NULL DEFAULT false,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_recipe_comments_recipe_id ON recipe_comments(recipe_id, created_at);
CREATE INDEX idx_recipe_comments_parent_id ON recipe_comments(parent_id);

CREATE TRIGGER trg_recipe_comments_updated_at
  BEFORE UPDATE ON recipe_comments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE recipe_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "어드민 댓글 관리" ON recipe_comments FOR ALL
  TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "직원 댓글 조회" ON recipe_comments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recipe_items
      WHERE id = recipe_comments.recipe_id
        AND (is_published = true OR is_admin() OR created_by = auth.uid())
    )
  );

CREATE POLICY "직원 댓글 작성" ON recipe_comments FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "본인 댓글 수정" ON recipe_comments FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid());

-- =============================================
-- 3. schedule_slots 시간 겹침 EXCLUSION CONSTRAINT
-- =============================================
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE schedule_slots
ADD CONSTRAINT no_overlapping_slots
EXCLUDE USING gist (
  profile_id WITH =,
  tsrange(
    (slot_date + start_time)::timestamp,
    (slot_date + end_time)::timestamp
  ) WITH &&
) WHERE (status = 'active');
