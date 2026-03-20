-- Migration 017: confirmed weekly_schedules의 confirmed_dates 무결성 복구
--
-- 배경:
--   weekly_schedules.status = 'confirmed'인 row 중 confirmed_dates가 비어있거나
--   7일 미만인 경우, week_start 기준 7일(월~일) 전체로 채워준다.
--
--   원인: 기존 handleConfirmSchedule 로직이 status만 'confirmed'로 변경하고
--         confirmed_dates를 갱신하지 않았음. (FEAT-028에서 수정됨)
--
-- 대상:
--   status = 'confirmed' AND array_length(confirmed_dates, 1) < 7 (또는 NULL)
--
-- 안전성:
--   - WHERE 조건으로 이미 7개 있는 row는 건드리지 않음
--   - week_start + 0~6일 생성 → 'YYYY-MM-DD' 문자열 배열로 저장
--   - 멱등(idempotent): 여러 번 실행해도 결과 동일

-- 주의: confirmed_dates는 date[] 타입.
-- 빈 배열({})의 array_length는 NULL을 반환하므로 coalesce 처리 필수.
UPDATE weekly_schedules
SET confirmed_dates = ARRAY(
  SELECT (week_start::date + i)::date
  FROM generate_series(0, 6) AS i
)
WHERE status = 'confirmed'
  AND (confirmed_dates IS NULL OR coalesce(array_length(confirmed_dates, 1), 0) < 7);

-- 검증 쿼리
SELECT id, week_start, status, array_length(confirmed_dates, 1) AS dates_count, confirmed_dates
FROM weekly_schedules
WHERE status = 'confirmed'
ORDER BY week_start;
