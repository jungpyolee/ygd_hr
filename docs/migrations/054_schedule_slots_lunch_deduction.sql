-- 054_schedule_slots_lunch_deduction.sql
-- schedule_slots에 점심시간 차감 토글 추가.
-- 공장 근무처럼 점심을 제공받는 슬롯은 급여 계산 시 60분을 차감한다.
-- 기본값 false: 기존 슬롯은 영향 없음.

ALTER TABLE schedule_slots
  ADD COLUMN IF NOT EXISTS lunch_deduction boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN schedule_slots.lunch_deduction IS
  '공장 등에서 점심을 제공받아 1시간을 급여에서 차감할지 여부. true이면 급여 계산 시 해당 슬롯에서 60분을 뺀다.';
