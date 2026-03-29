-- 045: 근태 조정 신청 테이블
-- 직원이 출퇴근 기록의 조정을 신청하고 관리자가 승인/반려하는 구조

CREATE TABLE attendance_adjustments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_date date NOT NULL,
  adjustment_type text NOT NULL CHECK (adjustment_type IN (
    'late_checkin',
    'early_checkout',
    'missed_checkin',
    'missed_checkout',
    'wrong_store',
    'other'
  )),
  requested_time time,
  reason text NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  reject_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(profile_id, target_date, adjustment_type)
);

-- RLS
ALTER TABLE attendance_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all ON attendance_adjustments FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY own_select ON attendance_adjustments FOR SELECT
  USING (auth.uid() = profile_id);

CREATE POLICY own_insert ON attendance_adjustments FOR INSERT
  WITH CHECK (auth.uid() = profile_id);

-- updated_at 자동 갱신
CREATE TRIGGER trg_attendance_adjustments_updated_at
  BEFORE UPDATE ON attendance_adjustments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 인덱스
CREATE INDEX idx_adjustments_profile_id ON attendance_adjustments(profile_id);
CREATE INDEX idx_adjustments_status ON attendance_adjustments(status);
CREATE INDEX idx_adjustments_target_date ON attendance_adjustments(target_date DESC);
