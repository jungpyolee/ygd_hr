-- 056_tax_category_rename_values.sql
-- tax_category 값을 공제 방식 기준("3.3%", "2대보험", "4대보험")으로 재명명.
-- business → '3.3%', daily → '2대보험', regular → '4대보험'.

-- 1) 기존 CHECK 제약 제거
ALTER TABLE profiles        DROP CONSTRAINT IF EXISTS profiles_tax_category_check;
ALTER TABLE payroll_entries DROP CONSTRAINT IF EXISTS payroll_entries_tax_category_check;

-- 2) 값 UPDATE
UPDATE profiles        SET tax_category = '3.3%'    WHERE tax_category = 'business';
UPDATE profiles        SET tax_category = '2대보험' WHERE tax_category = 'daily';
UPDATE profiles        SET tax_category = '4대보험' WHERE tax_category = 'regular';

UPDATE payroll_entries SET tax_category = '3.3%'    WHERE tax_category = 'business';
UPDATE payroll_entries SET tax_category = '2대보험' WHERE tax_category = 'daily';
UPDATE payroll_entries SET tax_category = '4대보험' WHERE tax_category = 'regular';

-- 3) CHECK 제약 재생성
ALTER TABLE profiles ADD CONSTRAINT profiles_tax_category_check
  CHECK (tax_category IS NULL OR tax_category IN ('3.3%', '2대보험', '4대보험'));
ALTER TABLE payroll_entries ADD CONSTRAINT payroll_entries_tax_category_check
  CHECK (tax_category IS NULL OR tax_category IN ('3.3%', '2대보험', '4대보험'));

COMMENT ON COLUMN profiles.tax_category IS
  '공제 유형: ''3.3%''(사업소득) | ''2대보험''(일용 — 고용보험) | ''4대보험''(근로).';
COMMENT ON COLUMN payroll_entries.tax_category IS
  '정산 시점의 공제 유형 스냅샷. ''3.3%'' / ''2대보험'' / ''4대보험''.';
