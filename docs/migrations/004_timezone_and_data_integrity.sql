-- Migration 004: 시간대 설정 + 데이터 무결성 강화
-- 작성일: 2026-03-16
-- 작업 내용:
--   1. DB 시간대 KST(Asia/Seoul) 통일
--   2. check_in/out_store_id 의미론적 오염 수정
--   3. 이정표 테스트 더미 데이터 삭제
--   4. 중복 출퇴근 방지 트리거 추가

-- ─────────────────────────────────────────────────
-- Step 1. DB 시간대 설정 (전체 롤에 KST 적용)
--         이유: timestamptz는 내부적으로 UTC 저장이지만
--         DATE_TRUNC, CURRENT_DATE 등 날짜 함수가 KST 기준으로 동작하도록
-- ─────────────────────────────────────────────────

ALTER DATABASE postgres SET timezone TO 'Asia/Seoul';
ALTER ROLE authenticator SET timezone TO 'Asia/Seoul';
ALTER ROLE authenticated SET timezone TO 'Asia/Seoul';
ALTER ROLE anon SET timezone TO 'Asia/Seoul';
ALTER ROLE service_role SET timezone TO 'Asia/Seoul';

-- ─────────────────────────────────────────────────
-- Step 2. check_in/out_store_id 의미론적 오염 수정
--         Migration 003에서 두 컬럼을 동일하게 복사했는데
--         IN 로그의 check_out_store_id, OUT 로그의 check_in_store_id는 null이어야 함
-- ─────────────────────────────────────────────────

UPDATE attendance_logs SET check_out_store_id = NULL WHERE type = 'IN';
UPDATE attendance_logs SET check_in_store_id = NULL WHERE type = 'OUT';

-- ─────────────────────────────────────────────────
-- Step 3. 이정표 테스트 더미 데이터 삭제
--         profile_id: 51eb939e-f230-4195-b6e7-10c11e5aaca3 (이정표, 개발자 계정)
--         3/14~15에 발생한 개발 테스트 로그 46건 삭제
-- ─────────────────────────────────────────────────

DELETE FROM attendance_logs
WHERE profile_id = '51eb939e-f230-4195-b6e7-10c11e5aaca3';

-- ─────────────────────────────────────────────────
-- Step 4. 중복 출퇴근 방지 트리거
--         IN → IN (출근 중 재출근 차단)
--         OUT → OUT (퇴근 후 재퇴근 차단)
--         첫 로그가 OUT인 경우 차단 (출근 없이 퇴근 차단)
-- ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION prevent_duplicate_attendance()
RETURNS TRIGGER AS $$
DECLARE
  last_type text;
BEGIN
  SELECT type INTO last_type
  FROM attendance_logs
  WHERE profile_id = NEW.profile_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- 같은 타입 연속 차단 (IN→IN, OUT→OUT)
  IF last_type IS NOT NULL AND last_type = NEW.type THEN
    RAISE EXCEPTION 'DUPLICATE_ATTENDANCE_TYPE' USING ERRCODE = 'P0001';
  END IF;

  -- 출근 기록 없이 퇴근 차단
  IF NEW.type = 'OUT' AND last_type IS NULL THEN
    RAISE EXCEPTION 'INVALID_CHECKOUT_NO_CHECKIN' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_attendance ON attendance_logs;
CREATE TRIGGER trg_prevent_duplicate_attendance
BEFORE INSERT ON attendance_logs
FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_attendance();

-- ─────────────────────────────────────────────────
-- 검증 쿼리
-- ─────────────────────────────────────────────────
-- SELECT now() AT TIME ZONE 'Asia/Seoul';  -- KST 시간 확인
-- SELECT type, check_in_store_id IS NOT NULL, check_out_store_id IS NOT NULL FROM attendance_logs;  -- 컬럼 정합성
-- SELECT COUNT(*) FROM attendance_logs;  -- 삭제 후 잔여 로그

-- ─────────────────────────────────────────────────
-- 롤백 (필요 시)
-- ─────────────────────────────────────────────────
-- ALTER DATABASE postgres SET timezone TO 'UTC';
-- ALTER ROLE authenticator RESET timezone;
-- ALTER ROLE authenticated RESET timezone;
-- ALTER ROLE anon RESET timezone;
-- ALTER ROLE service_role RESET timezone;
-- UPDATE attendance_logs SET check_out_store_id = store_id WHERE type = 'IN';
-- UPDATE attendance_logs SET check_in_store_id = store_id WHERE type = 'OUT';
-- DROP TRIGGER IF EXISTS trg_prevent_duplicate_attendance ON attendance_logs;
-- DROP FUNCTION IF EXISTS prevent_duplicate_attendance();
