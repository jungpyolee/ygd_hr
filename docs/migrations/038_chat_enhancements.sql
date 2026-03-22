-- 038_chat_enhancements.sql
-- chat_messages.template_key 허용 값에 time_change, schedule_offer 추가
-- 배경: 시간 변경 요청(time_change) 및 어드민 스케줄 제안(schedule_offer) 기능 추가

ALTER TABLE chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_template_key_check;

ALTER TABLE chat_messages
  ADD CONSTRAINT chat_messages_template_key_check
  CHECK (template_key IN (
    'late', 'early_leave', 'absent',
    'confirmed', 'early_out_allowed', 'schedule_change',
    'time_change', 'schedule_offer'
  ));

-- 검증
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'chat_messages_template_key_check';
