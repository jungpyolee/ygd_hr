-- Migration 008: Add hourly_wage and insurance_type to profiles
-- Epic B — 급여 계산 기반 데이터

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS hourly_wage integer,
  ADD COLUMN IF NOT EXISTS insurance_type text CHECK (insurance_type IN ('national', '3.3'));

-- Verify
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name IN ('hourly_wage', 'insurance_type');
