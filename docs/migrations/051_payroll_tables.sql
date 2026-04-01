-- 051: 급여 정산 테이블
-- Epic B: 급여 자동 계산

-- ============================================================
-- 1. profiles 테이블에 주민등록번호 컬럼 추가
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS resident_registration_number text;

-- ============================================================
-- 2. payroll_settings — 공제 요율 설정 (관리자가 직접 조정 가능)
-- ============================================================
CREATE TABLE IF NOT EXISTS payroll_settings (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  national_pension_rate       numeric(6,4) NOT NULL DEFAULT 0.0450,   -- 국민연금 4.5%
  health_insurance_rate       numeric(6,4) NOT NULL DEFAULT 0.03545,  -- 건강보험 3.545% (장기요양 포함)
  employment_insurance_rate   numeric(6,4) NOT NULL DEFAULT 0.0090,   -- 고용보험 0.9%
  income_tax_rate             numeric(6,4) NOT NULL DEFAULT 0.0300,   -- 소득세 3.0%
  local_income_tax_multiplier numeric(6,4) NOT NULL DEFAULT 0.1000,   -- 지방소득세 (소득세의 10%)
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- 기본값 1행 삽입
INSERT INTO payroll_settings DEFAULT VALUES;

-- ============================================================
-- 3. payroll_periods — 급여 정산 기간
-- ============================================================
CREATE TABLE IF NOT EXISTS payroll_periods (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year          integer NOT NULL,
  month         integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  status        text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'confirmed', 'paid')),
  confirmed_at  timestamptz,
  confirmed_by  uuid REFERENCES profiles(id),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(year, month)
);

-- ============================================================
-- 4. payroll_entries — 직원별 급여 내역
-- ============================================================
CREATE TABLE IF NOT EXISTS payroll_entries (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_period_id               uuid NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  profile_id                      uuid NOT NULL REFERENCES profiles(id),

  -- 근무 시간
  scheduled_minutes               integer NOT NULL DEFAULT 0,
  overtime_minutes                integer NOT NULL DEFAULT 0,
  total_minutes                   integer NOT NULL DEFAULT 0,

  -- 스냅샷 (정산 시점 값 보존)
  hourly_wage                     integer NOT NULL,
  insurance_type                  text NOT NULL,

  -- 금액
  gross_salary                    integer NOT NULL DEFAULT 0,
  deduction_national_pension      integer NOT NULL DEFAULT 0,
  deduction_health_insurance      integer NOT NULL DEFAULT 0,
  deduction_employment_insurance  integer NOT NULL DEFAULT 0,
  deduction_income_tax            integer NOT NULL DEFAULT 0,
  deduction_local_income_tax      integer NOT NULL DEFAULT 0,
  deduction_amount                integer NOT NULL DEFAULT 0,
  net_salary                      integer NOT NULL DEFAULT 0,

  -- 이체 상태
  payment_status                  text NOT NULL DEFAULT 'pending'
                                    CHECK (payment_status IN ('pending', 'paid')),
  paid_at                         timestamptz,

  -- 수동 조정
  manual_adjustment               integer NOT NULL DEFAULT 0,
  adjustment_reason               text,

  created_at                      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(payroll_period_id, profile_id)
);

-- ============================================================
-- 5. 트리거
-- ============================================================
CREATE TRIGGER trg_payroll_periods_updated_at
  BEFORE UPDATE ON payroll_periods
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_payroll_settings_updated_at
  BEFORE UPDATE ON payroll_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 6. 인덱스
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_payroll_periods_year_month
  ON payroll_periods(year, month);

CREATE INDEX IF NOT EXISTS idx_payroll_entries_period
  ON payroll_entries(payroll_period_id);

CREATE INDEX IF NOT EXISTS idx_payroll_entries_profile
  ON payroll_entries(profile_id, created_at DESC);

-- ============================================================
-- 7. RLS
-- ============================================================
ALTER TABLE payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_settings ENABLE ROW LEVEL SECURITY;

-- Admin: 전체 접근
CREATE POLICY admin_all ON payroll_periods FOR ALL USING (is_admin());
CREATE POLICY admin_all ON payroll_entries FOR ALL USING (is_admin());
CREATE POLICY admin_all ON payroll_settings FOR ALL USING (is_admin());

-- Employee: 확정/이체완료된 본인 급여만 조회
CREATE POLICY employee_own_select ON payroll_entries
  FOR SELECT USING (
    auth.uid() = profile_id
    AND EXISTS (
      SELECT 1 FROM payroll_periods pp
      WHERE pp.id = payroll_period_id
      AND pp.status IN ('confirmed', 'paid')
    )
  );

-- 롤백 (필요 시)
-- DROP TABLE IF EXISTS payroll_entries;
-- DROP TABLE IF EXISTS payroll_periods;
-- DROP TABLE IF EXISTS payroll_settings;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS resident_registration_number;
