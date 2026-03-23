-- 035: company_events + schedule_slots 팀뷰 RLS
-- 2026-03-23

-- =============================================
-- 1. company_events 테이블
-- =============================================
CREATE TABLE IF NOT EXISTS company_events (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  title       text        NOT NULL,
  description text,
  start_date  date        NOT NULL,
  end_date    date        NOT NULL,
  event_type  text        NOT NULL DEFAULT 'event'
                CHECK (event_type IN ('holiday', 'meeting', 'event', 'announcement')),
  color       text        NOT NULL DEFAULT '#3182F6',
  store_id    uuid        REFERENCES stores(id) ON DELETE SET NULL,
  created_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_company_events_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_company_events_updated_at
  BEFORE UPDATE ON company_events
  FOR EACH ROW EXECUTE FUNCTION update_company_events_updated_at();

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_company_events_dates
  ON company_events (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_company_events_store
  ON company_events (store_id);

-- =============================================
-- 2. RLS
-- =============================================
ALTER TABLE company_events ENABLE ROW LEVEL SECURITY;

-- 어드민: 전체 CRUD
CREATE POLICY "admin_all_company_events"
  ON company_events FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- 직원: 본인 배정 근무지 or 전체 공지(store_id IS NULL) 조회
CREATE POLICY "employee_select_company_events"
  ON company_events FOR SELECT
  TO authenticated
  USING (
    store_id IS NULL
    OR EXISTS (
      SELECT 1 FROM employee_store_assignments esa
      WHERE esa.profile_id = auth.uid()
        AND esa.store_id = company_events.store_id
    )
  );

-- =============================================
-- 3. schedule_slots — 직원 팀뷰 SELECT 추가
--    (기존: 본인 슬롯만. 신규: 확정된 주의 모든 슬롯 조회 가능)
-- =============================================
CREATE POLICY "employee_view_confirmed_team_slots"
  ON schedule_slots FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM weekly_schedules ws
      WHERE ws.id = schedule_slots.weekly_schedule_id
        AND ws.status = 'confirmed'
    )
  );

-- =============================================
-- 4. Realtime publication 등록
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE company_events;
