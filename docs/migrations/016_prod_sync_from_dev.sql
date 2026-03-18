-- Migration 016: Production DB 동기화 — Dev 변경사항 반영
-- Dev DB(aayedfstvegiswgjwcuw) 기준으로 Production DB(ymvdjxzkjodasctktunh) 동기화
-- 관련: FEAT-021(공지사항), FEAT-022(체크리스트), BUG-024(RLS 수정)
-- 2026-03-18

-- =============================================
-- 1. 신규 테이블: announcements
-- =============================================
CREATE TABLE IF NOT EXISTS announcements (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL,
  content     text        NOT NULL,
  is_pinned   boolean     NOT NULL DEFAULT false,
  target_roles text[]     NOT NULL DEFAULT '{all}',
  created_by  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_pinned_created
  ON announcements(is_pinned DESC, created_at DESC);

CREATE TRIGGER trg_announcements_updated_at
  BEFORE UPDATE ON announcements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "어드민 공지 관리" ON announcements FOR ALL
  TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "직원 공지 조회" ON announcements FOR SELECT
  TO authenticated
  USING (
    'all' = ANY(target_roles)
    OR (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND employment_type = 'full_time') AND 'full_time' = ANY(target_roles))
    OR (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND employment_type = 'part_time') AND 'part_time' = ANY(target_roles))
    OR is_admin()
  );

-- =============================================
-- 2. 신규 테이블: announcement_reads
-- =============================================
CREATE TABLE IF NOT EXISTS announcement_reads (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid        NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  profile_id      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at         timestamptz DEFAULT now(),
  UNIQUE(announcement_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_reads_profile
  ON announcement_reads(profile_id);

ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "본인 읽음 등록" ON announcement_reads FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "본인 읽음 조회" ON announcement_reads FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid() OR is_admin());

-- =============================================
-- 3. 신규 테이블: checklist_templates
-- =============================================
CREATE TABLE IF NOT EXISTS checklist_templates (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title          text        NOT NULL,
  trigger        text        NOT NULL,
  work_location  text,
  cafe_position  text,
  order_index    integer     NOT NULL DEFAULT 0,
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checklist_templates_trigger_is_active_order_index_idx
  ON checklist_templates(trigger, is_active, order_index);

CREATE TRIGGER trg_checklist_templates_updated_at
  BEFORE UPDATE ON checklist_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "어드민 템플릿 관리" ON checklist_templates FOR ALL
  TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "직원 템플릿 조회" ON checklist_templates FOR SELECT
  TO authenticated
  USING (is_active = true OR is_admin());

-- =============================================
-- 4. 신규 테이블: checklist_submissions
-- =============================================
CREATE TABLE IF NOT EXISTS checklist_submissions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  trigger          text        NOT NULL,
  attendance_log_id uuid       REFERENCES attendance_logs(id) ON DELETE SET NULL,
  checked_item_ids uuid[]      NOT NULL DEFAULT '{}',
  all_checked      boolean     NOT NULL DEFAULT false,
  submitted_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checklist_submissions_profile_id_submitted_at_idx
  ON checklist_submissions(profile_id, submitted_at DESC);

ALTER TABLE checklist_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "어드민 제출 기록 조회" ON checklist_submissions FOR ALL
  TO authenticated
  USING (is_admin());

CREATE POLICY "직원 제출 기록 관리" ON checklist_submissions FOR ALL
  TO authenticated
  USING (profile_id = auth.uid());

-- =============================================
-- 5. RLS 수정: recipe_comments — DELETE 정책 추가
-- =============================================
CREATE POLICY "본인 댓글 삭제" ON recipe_comments FOR DELETE
  TO authenticated
  USING (profile_id = auth.uid());

-- =============================================
-- 6. RLS 수정: recipe_ingredients — employment_type 제한 해제
-- =============================================
DROP POLICY IF EXISTS "정규직 재료 수정" ON recipe_ingredients;

CREATE POLICY "레시피 작성자 재료 관리" ON recipe_ingredients FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM recipe_items WHERE id = recipe_ingredients.recipe_id AND created_by = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM recipe_items WHERE id = recipe_ingredients.recipe_id AND created_by = auth.uid())
  );

-- =============================================
-- 7. RLS 수정: recipe_steps — employment_type 제한 해제
-- =============================================
DROP POLICY IF EXISTS "정규직 레시피 단계 수정" ON recipe_steps;

CREATE POLICY "레시피 작성자 단계 관리" ON recipe_steps FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM recipe_items WHERE id = recipe_steps.recipe_id AND created_by = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM recipe_items WHERE id = recipe_steps.recipe_id AND created_by = auth.uid())
  );

-- =============================================
-- 8. RLS 수정: schedule_slots — 대타 대상 슬롯 조회 허용
-- =============================================
DROP POLICY IF EXISTS "ss_emp_own" ON schedule_slots;

CREATE POLICY "ss_emp_confirmed" ON schedule_slots FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM weekly_schedules ws
      WHERE ws.id = schedule_slots.weekly_schedule_id
        AND ws.status = 'confirmed'
    )
    OR EXISTS (
      SELECT 1 FROM substitute_requests sr
      WHERE sr.slot_id = schedule_slots.id
        AND auth.uid() = ANY(sr.eligible_profile_ids)
    )
  );

-- =============================================
-- 9. RLS 수정: weekly_schedules — chr() 인코딩 제거
-- =============================================
DROP POLICY IF EXISTS "ws_emp_confirmed" ON weekly_schedules;

CREATE POLICY "ws_emp_confirmed" ON weekly_schedules FOR SELECT
  TO authenticated
  USING (status = 'confirmed');

-- =============================================
-- 10. 인덱스 개선: recipe_ingredients — order_index 추가
-- =============================================
DROP INDEX IF EXISTS idx_recipe_ingredients_recipe_id;

CREATE INDEX idx_recipe_ingredients_recipe_id
  ON recipe_ingredients(recipe_id, order_index);

-- =============================================
-- 11. 인덱스 추가: recipe_comments — parent_id 개별 인덱스
-- =============================================
CREATE INDEX IF NOT EXISTS idx_recipe_comments_parent_id
  ON recipe_comments(parent_id);

-- =============================================
-- 12. 검증 쿼리 (실행 후 확인)
-- =============================================
-- SELECT tablename FROM pg_tables
-- WHERE schemaname='public'
--   AND tablename IN ('announcements','announcement_reads','checklist_templates','checklist_submissions');
-- → 4행 반환 확인

-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE schemaname='public'
--   AND tablename IN ('recipe_comments','recipe_ingredients','recipe_steps','schedule_slots','weekly_schedules')
-- ORDER BY tablename, policyname;
-- → recipe_comments: 본인 댓글 삭제(DELETE) 포함 확인
-- → recipe_ingredients: 레시피 작성자 재료 관리(ALL) 존재, 정규직 재료 수정 없음 확인
-- → recipe_steps: 레시피 작성자 단계 관리(ALL) 존재, 정규직 레시피 단계 수정 없음 확인
-- → schedule_slots: ss_emp_confirmed 존재, ss_emp_own 없음 확인
-- → weekly_schedules: ws_emp_confirmed 존재 확인
