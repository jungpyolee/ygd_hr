-- Migration 035: insurance_type에 4대보험('4_major') 추가
-- profiles.insurance_type CHECK 제약 재생성

-- 기존 제약 삭제 (존재할 경우)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_insurance_type_check;

-- 3가지 값 허용하는 새 CHECK 제약 추가
ALTER TABLE profiles
  ADD CONSTRAINT profiles_insurance_type_check
  CHECK (insurance_type IN ('national', '3.3', '4_major'));

-- Verify
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'profiles'::regclass AND contype = 'c' AND conname = 'profiles_insurance_type_check';
