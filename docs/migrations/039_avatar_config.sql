-- 039: profiles 테이블에 avatar_config 컬럼 추가
-- react-nice-avatar 설정을 jsonb로 저장
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_config jsonb;
