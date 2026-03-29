-- 044: 크레딧/티어 시스템 완전 제거
-- 배경: 크레딧 시스템(041_attendance_credits.sql)은 구현 후 제거됨.
--       DB 테이블/트리거/컬럼만 잔류하여 정리.

-- 1. 트리거 제거
DROP TRIGGER IF EXISTS trg_sync_credit_score ON attendance_credits;

-- 2. 함수 제거
DROP FUNCTION IF EXISTS sync_credit_score();

-- 3. 인덱스 제거 (테이블 DROP 전에)
DROP INDEX IF EXISTS idx_credits_profile_id;
DROP INDEX IF EXISTS idx_credits_profile_date;
DROP INDEX IF EXISTS idx_credits_event_type;
DROP INDEX IF EXISTS idx_profiles_credit_score;

-- 4. 테이블 제거
DROP TABLE IF EXISTS attendance_credits;

-- 5. profiles 크레딧 관련 컬럼 제거
ALTER TABLE profiles
  DROP COLUMN IF EXISTS credit_score,
  DROP COLUMN IF EXISTS current_streak,
  DROP COLUMN IF EXISTS longest_streak,
  DROP COLUMN IF EXISTS streak_milestones_claimed;
