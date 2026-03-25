-- 보건증 만료 주의 기준일 설정 컬럼 추가 (기본 30일)
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS health_cert_warning_days INTEGER NOT NULL DEFAULT 30;
