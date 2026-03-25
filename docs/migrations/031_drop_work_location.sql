-- Migration 031: store_id NOT NULL 확정 + work_location 컬럼 제거
-- schedule_slots, work_defaults 에서 work_location text 컬럼을 삭제하고
-- store_id uuid FK 를 NOT NULL 로 변경한다.
--
-- 전제: 마이그레이션 030이 적용되어 store_id 가 모든 행에 채워져 있어야 함.

-- 1. schedule_slots
ALTER TABLE schedule_slots
  ALTER COLUMN store_id SET NOT NULL;

ALTER TABLE schedule_slots
  DROP COLUMN IF EXISTS work_location;

-- 2. work_defaults
ALTER TABLE work_defaults
  ALTER COLUMN store_id SET NOT NULL;

ALTER TABLE work_defaults
  DROP COLUMN IF EXISTS work_location;
