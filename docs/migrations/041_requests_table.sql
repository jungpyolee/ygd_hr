-- 041_requests_table.sql
-- 근태요청 + 대타요청을 통합하는 requests 테이블
-- chat_messages/chat_conversations 대체, substitute_requests 통합

CREATE TABLE requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('early_leave', 'absent', 'time_change', 'substitute')),
  slot_id uuid NOT NULL REFERENCES schedule_slots(id) ON DELETE CASCADE,
  reason text,
  requested_start_time time,
  requested_end_time time,
  -- 대타 전용
  eligible_profile_ids uuid[] DEFAULT '{}',
  accepted_by uuid REFERENCES profiles(id),
  accepted_at timestamptz,
  -- 공통
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'filled')),
  reject_reason text,
  admin_id uuid REFERENCES profiles(id),
  processed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;

-- 직원: 자기 요청만 조회
CREATE POLICY "req_emp_select" ON requests
  FOR SELECT USING (requester_id = auth.uid() OR is_admin());

-- 직원: 본인 요청만 INSERT
CREATE POLICY "req_emp_insert" ON requests
  FOR INSERT WITH CHECK (requester_id = auth.uid());

-- 어드민: 전체 UPDATE (승인/거절/filled 처리)
CREATE POLICY "req_admin_update" ON requests
  FOR UPDATE USING (is_admin());

-- Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE requests;

-- 인덱스
CREATE INDEX ON requests (requester_id, created_at DESC);
CREATE INDEX ON requests (status, created_at DESC);

-- 검증
SELECT table_name, row_security
FROM information_schema.tables
WHERE table_name = 'requests';
