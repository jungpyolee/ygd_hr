-- 048: 근태 조정 'dismissed' 상태 추가
-- 지각/조퇴가 실제 맞는 경우 직원이 "문제 없어요"로 확인 처리

ALTER TABLE attendance_adjustments
  DROP CONSTRAINT IF EXISTS attendance_adjustments_status_check;

ALTER TABLE attendance_adjustments
  ADD CONSTRAINT attendance_adjustments_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'dismissed'));
