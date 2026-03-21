-- [DB-026] game_upgrades 테이블 생성 (상점 누적 강화 시스템)
-- 기존 game_purchases/game_runs/game_profiles 데이터 초기화 포함

-- 1. 기존 게임 데이터 초기화 (사용자 요청)
TRUNCATE game_purchases, game_runs, game_profiles RESTART IDENTITY CASCADE;

-- 2. game_upgrades 테이블 생성
CREATE TABLE IF NOT EXISTS game_upgrades (
  user_id    UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id    TEXT         NOT NULL,
  level      INT          NOT NULL DEFAULT 1 CHECK (level >= 1),
  updated_at TIMESTAMPTZ  DEFAULT NOW(),
  PRIMARY KEY (user_id, item_id)
);

-- 3. RLS
ALTER TABLE game_upgrades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "본인 업그레이드 관리" ON game_upgrades
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 검증
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'game_upgrades';
