-- 040_add_sub_request_template_key.sql
-- chat_messages.template_key 허용 값에 sub_request 추가
-- 배경: 직원이 채팅에서 대타 요청을 사장에게 보낼 수 있도록

ALTER TABLE chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_template_key_check;

ALTER TABLE chat_messages
  ADD CONSTRAINT chat_messages_template_key_check
  CHECK (template_key IN (
    'late', 'early_leave', 'absent',
    'confirmed', 'early_out_allowed', 'schedule_change',
    'time_change', 'schedule_offer', 'sub_request'
  ));

-- 검증
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'chat_messages_template_key_check';
