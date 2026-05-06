-- Migration 057: profiles.terminated_at — 퇴사자 관리
--
-- 배경: 퇴사자 표현 컬럼이 없어 모든 메뉴/알림에서 계속 노출됨.
-- 어드민 메뉴에서 안 보이게 + 알림 미발송이 목표.
--
-- - terminated_at: NULL = 재직중, 값 = 퇴사일시
-- - termination_reason: 자율 입력 (이직/계약만료 등)
-- - terminated_by: 처리한 관리자 (감사 추적)
-- - 활성 직원 조회 partial index (대부분 쿼리가 활성만 봄)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS terminated_at timestamptz,
  ADD COLUMN IF NOT EXISTS termination_reason text,
  ADD COLUMN IF NOT EXISTS terminated_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_active
  ON profiles(id)
  WHERE terminated_at IS NULL;

COMMENT ON COLUMN profiles.terminated_at IS '퇴사 일시 (NULL = 재직중)';
COMMENT ON COLUMN profiles.termination_reason IS '퇴사 사유 (이직/계약만료/자발/권고 등)';
COMMENT ON COLUMN profiles.terminated_by IS '퇴사 처리한 관리자';
