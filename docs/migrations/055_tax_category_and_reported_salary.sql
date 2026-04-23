-- 055_tax_category_and_reported_salary.sql
-- 세무사 신고 포맷(사업/일용/근로) 3분류 도입 + 근로소득 신고월액 + 요양보험 요율.

-- 1) 세금 유형 컬럼
ALTER TABLE profiles         ADD COLUMN IF NOT EXISTS tax_category text;
ALTER TABLE payroll_entries  ADD COLUMN IF NOT EXISTS tax_category text;

-- 2) 근로소득 신고월액 (business/daily는 NULL)
ALTER TABLE payroll_entries  ADD COLUMN IF NOT EXISTS reported_salary integer;

-- 3) 요양보험 요율 + 공제 컬럼
ALTER TABLE payroll_settings ADD COLUMN IF NOT EXISTS long_term_care_rate numeric(6,4) NOT NULL DEFAULT 0.1295;
ALTER TABLE payroll_entries  ADD COLUMN IF NOT EXISTS deduction_long_term_care integer NOT NULL DEFAULT 0;

-- 4) 기존 값 매핑 (일용은 차후 관리자가 수동 재분류)
UPDATE profiles        SET tax_category = 'business' WHERE insurance_type = '3.3'      AND tax_category IS NULL;
UPDATE profiles        SET tax_category = 'regular'  WHERE insurance_type = 'national' AND tax_category IS NULL;
UPDATE payroll_entries SET tax_category = 'business' WHERE insurance_type = '3.3'      AND tax_category IS NULL;
UPDATE payroll_entries SET tax_category = 'regular'  WHERE insurance_type = 'national' AND tax_category IS NULL;

-- 5) CHECK 제약 (IF NOT EXISTS 대용 — 제약은 재실행 시 drop/add 패턴)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_tax_category_check') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_tax_category_check
      CHECK (tax_category IS NULL OR tax_category IN ('business','daily','regular'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_entries_tax_category_check') THEN
    ALTER TABLE payroll_entries ADD CONSTRAINT payroll_entries_tax_category_check
      CHECK (tax_category IS NULL OR tax_category IN ('business','daily','regular'));
  END IF;
END $$;

COMMENT ON COLUMN profiles.tax_category IS
  '세금 유형: business(3.3% 사업소득) | daily(일용, 고용보험만) | regular(근로, 4대보험).';
COMMENT ON COLUMN payroll_entries.tax_category IS
  '정산 시점의 세금 유형 스냅샷.';
COMMENT ON COLUMN payroll_entries.reported_salary IS
  '근로소득 신고월액. 4대보험 공제 계산 기준. business/daily는 NULL.';
COMMENT ON COLUMN payroll_settings.long_term_care_rate IS
  '요양보험 요율 — 건강보험 공제액에 곱해 산정 (2026 기준 약 0.1295).';
