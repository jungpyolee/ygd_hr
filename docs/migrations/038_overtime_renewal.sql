-- 038_overtime_renewal.sql
-- 추가근무 관리 전면 리뉴얼
-- 기획 문서: docs/issues/038-overtime-renewal.md

-- ============================================================
-- 1. overtime_requests 테이블 개편
-- ============================================================

-- 1-1. minutes 컬럼 추가 (인정된 추가근무 분)
ALTER TABLE overtime_requests
  ADD COLUMN minutes integer;

-- 1-2. start_time / end_time 제거
ALTER TABLE overtime_requests
  DROP COLUMN start_time,
  DROP COLUMN end_time;

-- 1-3. status enum에 'dismissed' 추가
ALTER TYPE overtime_status ADD VALUE IF NOT EXISTS 'dismissed';

-- 1-4. minutes NOT NULL 제약 (기존 데이터 없으므로 바로 적용)
ALTER TABLE overtime_requests
  ALTER COLUMN minutes SET NOT NULL;

-- ============================================================
-- 2. stores 테이블 — 추가근무 설정 컬럼 추가
-- ============================================================

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS overtime_unit          integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS overtime_include_early boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS overtime_min_minutes   integer NOT NULL DEFAULT 10;

-- ============================================================
-- 3. (profile_id, date) UNIQUE 제약 추가
--    점검 중 중복 레코드 가능성 발견 → 데이터 무결성 보장
-- ============================================================

ALTER TABLE overtime_requests
  ADD CONSTRAINT overtime_requests_profile_date_unique UNIQUE (profile_id, date);

-- ============================================================
-- 검증 쿼리
-- ============================================================
-- SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'overtime_requests'
--   ORDER BY ordinal_position;
--
-- SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'stores' AND column_name LIKE 'overtime%';
--
-- SELECT enumlabel FROM pg_enum
--   JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
--   WHERE pg_type.typname = 'overtime_status';
