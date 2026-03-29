-- 049: 출퇴근 중복 체크를 당일(KST) 범위로 제한
-- 문제: 전날 OUT 없이 다음 날 IN 시도 시 DUPLICATE_ATTENDANCE_TYPE 발생
-- 해결: 같은 타입 연속/60초 간격 체크를 당일 기록 기준으로 변경

CREATE OR REPLACE FUNCTION prevent_duplicate_attendance()
RETURNS TRIGGER AS $$
DECLARE
  last_type text;
  last_created timestamptz;
  today_start timestamptz;
BEGIN
  -- 오늘 KST 00:00:00 기준
  today_start := date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul';

  SELECT type, created_at INTO last_type, last_created
  FROM attendance_logs
  WHERE profile_id = NEW.profile_id
    AND created_at >= today_start
  ORDER BY created_at DESC
  LIMIT 1;

  -- 1. 같은 타입 연속 차단 (오늘 기준 IN→IN, OUT→OUT)
  IF last_type IS NOT NULL AND last_type = NEW.type THEN
    RAISE EXCEPTION 'DUPLICATE_ATTENDANCE_TYPE' USING ERRCODE = 'P0001';
  END IF;

  -- 2. 오늘 출근 기록 없이 퇴근 차단
  IF NEW.type = 'OUT' AND last_type IS NULL THEN
    RAISE EXCEPTION 'INVALID_CHECKOUT_NO_CHECKIN' USING ERRCODE = 'P0001';
  END IF;

  -- 3. 최소 60초 간격 (관리자 수동 처리는 면제: reason이 있는 경우)
  IF last_created IS NOT NULL
     AND NEW.reason IS NULL
     AND EXTRACT(EPOCH FROM (now() - last_created)) < 60 THEN
    RAISE EXCEPTION 'TOO_FREQUENT_ATTENDANCE' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
