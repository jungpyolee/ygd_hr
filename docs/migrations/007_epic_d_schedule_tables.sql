-- Epic D: 스케줄 관리 테이블 마이그레이션
-- 2026-03-17

-- 1a. profiles 컬럼 추가
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS employment_type text DEFAULT 'part_time_fixed'
    CHECK (employment_type IN ('full_time', 'part_time_fixed', 'part_time_daily')),
  ADD COLUMN IF NOT EXISTS work_locations text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cafe_positions text[] DEFAULT '{}';

-- 1b. work_defaults (직원 기본 근무 패턴)
CREATE TABLE IF NOT EXISTS work_defaults (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  work_location text NOT NULL CHECK (work_location IN ('cafe', 'factory', 'catering')),
  cafe_positions text[] DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (profile_id, day_of_week, work_location)
);

-- 1c. weekly_schedules (주차별 컨테이너)
CREATE TABLE IF NOT EXISTS weekly_schedules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  week_start date NOT NULL UNIQUE,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed')),
  published_at timestamptz,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 1d. schedule_slots (개별 근무 슬롯)
CREATE TABLE IF NOT EXISTS schedule_slots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  weekly_schedule_id uuid REFERENCES weekly_schedules(id) ON DELETE CASCADE NOT NULL,
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  slot_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  work_location text NOT NULL CHECK (work_location IN ('cafe', 'factory', 'catering')),
  cafe_positions text[] DEFAULT '{}',
  status text DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'substituted')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 1e. substitute_requests (대타 요청)
CREATE TABLE IF NOT EXISTS substitute_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slot_id uuid REFERENCES schedule_slots(id) ON DELETE CASCADE NOT NULL,
  requester_id uuid REFERENCES profiles(id) NOT NULL,
  reason text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'filled')),
  reject_reason text,
  rejected_by uuid REFERENCES profiles(id),
  rejected_at timestamptz,
  approved_by uuid REFERENCES profiles(id),
  approved_at timestamptz,
  eligible_profile_ids uuid[] DEFAULT '{}',
  accepted_by uuid REFERENCES profiles(id),
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 1f. substitute_responses (대타 지원 응답)
CREATE TABLE IF NOT EXISTS substitute_responses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id uuid REFERENCES substitute_requests(id) ON DELETE CASCADE NOT NULL,
  profile_id uuid REFERENCES profiles(id) NOT NULL,
  response text NOT NULL CHECK (response IN ('accepted', 'declined')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (request_id, profile_id)
);

-- 1g. updated_at 트리거
CREATE TRIGGER trg_weekly_schedules_updated_at
  BEFORE UPDATE ON weekly_schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_schedule_slots_updated_at
  BEFORE UPDATE ON schedule_slots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_substitute_requests_updated_at
  BEFORE UPDATE ON substitute_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 1h. 인덱스
CREATE INDEX IF NOT EXISTS idx_work_defaults_profile ON work_defaults(profile_id);
CREATE INDEX IF NOT EXISTS idx_schedule_slots_weekly ON schedule_slots(weekly_schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_slots_profile ON schedule_slots(profile_id);
CREATE INDEX IF NOT EXISTS idx_schedule_slots_date ON schedule_slots(slot_date);
CREATE INDEX IF NOT EXISTS idx_substitute_requests_slot ON substitute_requests(slot_id);
CREATE INDEX IF NOT EXISTS idx_substitute_requests_requester ON substitute_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_substitute_requests_status ON substitute_requests(status);

-- RLS: work_defaults
ALTER TABLE work_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin bypass" ON work_defaults FOR ALL USING (is_admin());
CREATE POLICY "View own defaults" ON work_defaults FOR SELECT TO authenticated USING (profile_id = auth.uid());

-- RLS: weekly_schedules
ALTER TABLE weekly_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin bypass" ON weekly_schedules FOR ALL USING (is_admin());
CREATE POLICY "Employees view confirmed" ON weekly_schedules FOR SELECT TO authenticated USING (status = 'confirmed');

-- RLS: schedule_slots
ALTER TABLE schedule_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin bypass" ON schedule_slots FOR ALL USING (is_admin());
CREATE POLICY "View own confirmed slots" ON schedule_slots FOR SELECT TO authenticated
  USING (profile_id = auth.uid() AND EXISTS (
    SELECT 1 FROM weekly_schedules ws WHERE ws.id = schedule_slots.weekly_schedule_id AND ws.status = 'confirmed'
  ));

-- RLS: substitute_requests
ALTER TABLE substitute_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin bypass" ON substitute_requests FOR ALL USING (is_admin());
CREATE POLICY "Requester can view own" ON substitute_requests FOR SELECT TO authenticated USING (requester_id = auth.uid());
CREATE POLICY "Requester can insert" ON substitute_requests FOR INSERT TO authenticated WITH CHECK (requester_id = auth.uid());
CREATE POLICY "Eligible can view approved" ON substitute_requests FOR SELECT TO authenticated
  USING (status = 'approved' AND auth.uid() = ANY(eligible_profile_ids));

-- RLS: substitute_responses
ALTER TABLE substitute_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin bypass" ON substitute_responses FOR ALL USING (is_admin());
CREATE POLICY "Users can manage own response" ON substitute_responses FOR ALL TO authenticated USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
CREATE POLICY "Request parties can view" ON substitute_responses FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM substitute_requests sr WHERE sr.id = substitute_responses.request_id AND (sr.requester_id = auth.uid() OR auth.uid() = ANY(sr.eligible_profile_ids))));
