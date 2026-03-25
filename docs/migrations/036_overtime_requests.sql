-- 036_overtime_requests.sql
-- 추가근무 요청/승인 테이블
-- 직원이 요청하거나 어드민이 직접 할당하는 추가근무 관리

CREATE TYPE overtime_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE overtime_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date          date NOT NULL,
  start_time    time NOT NULL,
  end_time      time NOT NULL,
  reason        text,
  status        overtime_status NOT NULL DEFAULT 'pending',
  approved_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 업데이트 시 updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_overtime_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_overtime_updated_at
  BEFORE UPDATE ON overtime_requests
  FOR EACH ROW EXECUTE FUNCTION update_overtime_updated_at();

-- 인덱스
CREATE INDEX idx_overtime_profile_id ON overtime_requests(profile_id);
CREATE INDEX idx_overtime_date ON overtime_requests(date);
CREATE INDEX idx_overtime_status ON overtime_requests(status);

-- RLS 활성화
ALTER TABLE overtime_requests ENABLE ROW LEVEL SECURITY;

-- 직원: 자신의 요청만 조회
CREATE POLICY "overtime_select_own"
  ON overtime_requests FOR SELECT
  USING (profile_id = auth.uid() OR is_admin());

-- 직원: 자신의 요청 생성 (pending 상태만)
CREATE POLICY "overtime_insert_own"
  ON overtime_requests FOR INSERT
  WITH CHECK (profile_id = auth.uid() OR is_admin());

-- 어드민: 상태 변경 (승인/거절/할당)
CREATE POLICY "overtime_update_admin"
  ON overtime_requests FOR UPDATE
  USING (is_admin());

-- 어드민: 삭제
CREATE POLICY "overtime_delete_admin"
  ON overtime_requests FOR DELETE
  USING (is_admin());

-- 검증 쿼리
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'overtime_requests' ORDER BY ordinal_position;
