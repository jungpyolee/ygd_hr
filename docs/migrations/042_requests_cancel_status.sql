-- 042_requests_cancel_status.sql
-- requests.status에 cancelled, cancel_requested 추가
-- 배경: 직원이 대기중 요청 취소 + 대타 승인됨 상태에서 취소 요청 기능

ALTER TABLE requests
  DROP CONSTRAINT IF EXISTS requests_status_check;

ALTER TABLE requests
  ADD CONSTRAINT requests_status_check
  CHECK (status IN (
    'pending', 'approved', 'rejected', 'filled',
    'cancelled', 'cancel_requested'
  ));

-- 검증
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'requests_status_check';
