-- Migration 014: schedule_slots 시간 겹침 방지 EXCLUSION CONSTRAINT
-- 같은 직원이 동일 날짜에 status=active 슬롯을 중복으로 갖지 못하도록 DB 수준에서 차단

-- btree_gist 확장 설치 (uuid, date를 gist 인덱스에서 사용하기 위해 필요)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- EXCLUSION CONSTRAINT: 같은 profile_id에서 tsrange가 겹치면 INSERT/UPDATE 차단
ALTER TABLE schedule_slots
ADD CONSTRAINT no_overlapping_slots
EXCLUDE USING gist (
  profile_id WITH =,
  tsrange(
    (slot_date + start_time)::timestamp,
    (slot_date + end_time)::timestamp
  ) WITH &&
) WHERE (status = 'active');

-- 검증
-- SELECT conname, contype FROM pg_constraint c
-- JOIN pg_class t ON t.oid = c.conrelid
-- WHERE t.relname = 'schedule_slots' AND conname = 'no_overlapping_slots';
-- → contype = 'x' (exclusion) 확인
