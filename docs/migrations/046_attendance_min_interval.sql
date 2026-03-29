-- 046: 출퇴근 최소 간격 60초 제한
-- 배경: 빠른 연속 클릭으로 IN→OUT→IN 같은 불필요한 기록이 생기는 문제 방지

CREATE OR REPLACE FUNCTION prevent_duplicate_attendance()
RETURNS TRIGGER AS $$
DECLARE
  last_type text;
  last_created timestamptz;
BEGIN
  SELECT type, created_at INTO last_type, last_created
  FROM attendance_logs
  WHERE profile_id = NEW.profile_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- 1. 같은 타입 연속 차단 (IN→IN, OUT→OUT)
  IF last_type IS NOT NULL AND last_type = NEW.type THEN
    RAISE EXCEPTION 'DUPLICATE_ATTENDANCE_TYPE' USING ERRCODE = 'P0001';
  END IF;

  -- 2. 출근 기록 없이 퇴근 차단
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
