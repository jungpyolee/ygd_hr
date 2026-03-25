-- 041_attendance_credits.sql
-- 근태 크레딧(티어) 시스템 — 이벤트 소싱 테이블 + profiles 비정규화 컬럼

-- 1. attendance_credits 테이블
CREATE TABLE attendance_credits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type      text NOT NULL,
  points          integer NOT NULL,
  description     text,
  reference_id    uuid,
  reference_date  date,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE attendance_credits IS '근태 크레딧 이벤트 로그 (이벤트 소싱)';
COMMENT ON COLUMN attendance_credits.event_type IS 'normal_attendance|late_minor|late_major|no_show|early_leave|missing_checkout|same_day_cancel|advance_cancel|substitute_bonus|substitute_regular|streak_bonus_10|streak_bonus_30|streak_bonus_60|streak_bonus_100|admin_cancel_compensation|admin_adjustment';
COMMENT ON COLUMN attendance_credits.points IS '양수(가점) 또는 음수(감점)';
COMMENT ON COLUMN attendance_credits.reference_id IS '관련 schedule_slot.id 또는 attendance_log.id';

-- 2. profiles 컬럼 추가
ALTER TABLE profiles ADD COLUMN credit_score integer NOT NULL DEFAULT 500;
ALTER TABLE profiles ADD COLUMN current_streak integer NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN longest_streak integer NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN streak_milestones_claimed integer[] NOT NULL DEFAULT '{}';

-- 3. 트리거: attendance_credits 변경 시 profiles.credit_score 동기화
CREATE OR REPLACE FUNCTION sync_credit_score()
RETURNS TRIGGER AS $$
DECLARE
  target_profile uuid;
  new_score integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_profile := OLD.profile_id;
  ELSE
    target_profile := NEW.profile_id;
  END IF;

  SELECT 500 + COALESCE(SUM(points), 0)
  INTO new_score
  FROM attendance_credits
  WHERE profile_id = target_profile;

  UPDATE profiles
  SET credit_score = new_score
  WHERE id = target_profile;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_sync_credit_score
  AFTER INSERT OR DELETE ON attendance_credits
  FOR EACH ROW EXECUTE FUNCTION sync_credit_score();

-- 4. 인덱스
CREATE INDEX idx_credits_profile_id ON attendance_credits(profile_id);
CREATE INDEX idx_credits_profile_date ON attendance_credits(profile_id, reference_date DESC);
CREATE INDEX idx_credits_event_type ON attendance_credits(event_type);
CREATE INDEX idx_profiles_credit_score ON profiles(credit_score DESC);

-- 5. RLS
ALTER TABLE attendance_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credits_select_own_or_admin"
  ON attendance_credits FOR SELECT
  USING (profile_id = auth.uid() OR is_admin());

CREATE POLICY "credits_insert_admin"
  ON attendance_credits FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "credits_update_admin"
  ON attendance_credits FOR UPDATE
  USING (is_admin());

CREATE POLICY "credits_delete_admin"
  ON attendance_credits FOR DELETE
  USING (is_admin());

-- 6. Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE attendance_credits;

-- 7. 예외 처리용 invalidated_by 컬럼 (보호권 제거 후 추가)
ALTER TABLE attendance_credits ADD COLUMN invalidated_by uuid REFERENCES attendance_credits(id);

-- 검증 쿼리
-- SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'attendance_credits' ORDER BY ordinal_position;
-- SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'profiles' AND column_name IN ('credit_score', 'current_streak', 'longest_streak', 'streak_milestones_claimed');
