-- Migration: 002_profiles_updated_at_trigger
-- Date: 2026-03-16
-- Description: profiles.updated_at 자동 갱신 트리거 추가

-- 범용 updated_at 갱신 함수 (다른 테이블에도 재사용 가능)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- profiles 테이블에 트리거 연결
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
