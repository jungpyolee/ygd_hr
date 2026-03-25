-- 034_error_logs.sql
-- 클라이언트/서버 에러를 DB에 저장하고 이메일 알림 발송을 위한 테이블

CREATE TABLE IF NOT EXISTS error_logs (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  level       TEXT        NOT NULL DEFAULT 'error' CHECK (level IN ('error', 'warn', 'info')),
  message     TEXT        NOT NULL,
  stack       TEXT,
  source      TEXT,        -- 'client' | 'api' | 'react_boundary' | 'unhandled'
  context     JSONB,       -- { action, slotId, profileId, ... }
  profile_id  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  url         TEXT,
  resolved    BOOLEAN     NOT NULL DEFAULT false
);

-- 관리자만 조회/수정, 서비스 롤로만 INSERT
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_select_error_logs"
  ON error_logs FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "admin_update_error_logs"
  ON error_logs FOR UPDATE
  TO authenticated
  USING (is_admin());

-- 최근 에러 빠른 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON error_logs (resolved) WHERE resolved = false;
