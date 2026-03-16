-- Migration 003: attendance_logs store_id 무결성 수정 + 원격퇴근/출장 지원
-- 작성일: 2026-03-16
-- 관련 이슈: Bug F (store_id integrity), Epic F (원격퇴근), Epic G (출장출근/출장퇴근)

-- ─────────────────────────────────────────────────
-- Step 1. 신규 컬럼 추가
-- ─────────────────────────────────────────────────

ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS check_in_store_id  uuid REFERENCES stores(id),
  ADD COLUMN IF NOT EXISTS check_out_store_id uuid REFERENCES stores(id),
  ADD COLUMN IF NOT EXISTS attendance_type    text DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS reason             text;

-- ─────────────────────────────────────────────────
-- Step 2. store_id NOT NULL 제약 제거
--         (원격퇴근/출장 시 store_id가 null이 될 수 있음)
-- ─────────────────────────────────────────────────

ALTER TABLE attendance_logs ALTER COLUMN store_id DROP NOT NULL;

-- ─────────────────────────────────────────────────
-- Step 3. 기존 데이터 마이그레이션
--         기존 데이터는 check_in/out_store_id를 store_id와 동일하게 설정
--         (출근/퇴근 매장이 실제로 달랐는지 알 수 없으므로 안전하게 동일 값 복사)
-- ─────────────────────────────────────────────────

UPDATE attendance_logs
SET
  check_in_store_id  = store_id,
  check_out_store_id = store_id,
  attendance_type    = 'regular'
WHERE attendance_type IS NULL OR attendance_type = 'regular';

-- ─────────────────────────────────────────────────
-- Step 4. 인덱스 추가 (attendance_type 조회 최적화)
-- ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_attendance_logs_attendance_type
  ON attendance_logs (attendance_type);

-- ─────────────────────────────────────────────────
-- 롤백 (필요 시)
-- ─────────────────────────────────────────────────
-- ALTER TABLE attendance_logs ALTER COLUMN store_id SET NOT NULL;
-- ALTER TABLE attendance_logs DROP COLUMN IF EXISTS check_in_store_id;
-- ALTER TABLE attendance_logs DROP COLUMN IF EXISTS check_out_store_id;
-- ALTER TABLE attendance_logs DROP COLUMN IF EXISTS attendance_type;
-- ALTER TABLE attendance_logs DROP COLUMN IF EXISTS reason;
-- DROP INDEX IF EXISTS idx_attendance_logs_attendance_type;
