-- 039_fix_draft_confirmed_dates.sql
-- 일간 확정 됐으나 status='draft'로 남아있는 weekly_schedules를 'confirmed'로 업데이트
-- 원인: handleConfirmDay가 confirmed_dates만 업데이트하고 status는 변경하지 않아서
-- 직원이 RLS를 통과 못해 스케줄을 볼 수 없었음

UPDATE weekly_schedules
SET
  status = 'confirmed',
  published_at = COALESCE(published_at, now())
WHERE
  status = 'draft'
  AND confirmed_dates IS NOT NULL
  AND array_length(confirmed_dates, 1) > 0;

-- 검증
SELECT id, week_start, status, confirmed_dates, published_at
FROM weekly_schedules
WHERE confirmed_dates IS NOT NULL
ORDER BY week_start DESC;
