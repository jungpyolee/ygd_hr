-- Migration 021: 로그라이크 게임 테이블
-- 대상: Dev DB (rddplpiwvmclreeblkmi)
-- 생성일: 2026-03-21
-- 참조: auth.users(id) 사용 (profiles PK 미존재)

-- 1. 플레이어 게임 프로필
CREATE TABLE IF NOT EXISTS game_profiles (
  id             uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cat_type       text NOT NULL DEFAULT 'persian',
  total_coins    int  NOT NULL DEFAULT 0,
  highest_wave   int  NOT NULL DEFAULT 0,
  total_playtime int  NOT NULL DEFAULT 0,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE game_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "본인 조회" ON game_profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "본인 수정" ON game_profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());

CREATE POLICY "어드민 전체" ON game_profiles FOR ALL TO public
  USING (is_admin());

-- 2. 런(플레이 1회) 기록
CREATE TABLE IF NOT EXISTS game_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score         int  NOT NULL DEFAULT 0,
  wave_reached  int  NOT NULL DEFAULT 0,
  duration_sec  int  NOT NULL DEFAULT 0,
  weapons_used  jsonb,
  killed_count  int  NOT NULL DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE game_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "본인 조회" ON game_runs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "본인 삽입" ON game_runs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "어드민 전체" ON game_runs FOR ALL TO public
  USING (is_admin());

-- 3. 시즌
CREATE TABLE IF NOT EXISTS game_seasons (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  starts_at  timestamptz NOT NULL,
  ends_at    timestamptz NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE game_seasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "전체 조회" ON game_seasons FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "어드민 전체" ON game_seasons FOR ALL TO public
  USING (is_admin());

-- 4. 시즌별 누적 점수
CREATE TABLE IF NOT EXISTS game_season_scores (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id      uuid NOT NULL REFERENCES game_seasons(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_score    int  NOT NULL DEFAULT 0,
  best_run_score int  NOT NULL DEFAULT 0,
  play_count     int  NOT NULL DEFAULT 0,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE(season_id, user_id)
);

ALTER TABLE game_season_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "전체 조회" ON game_season_scores FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "본인 수정" ON game_season_scores FOR ALL TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "어드민 전체" ON game_season_scores FOR ALL TO public
  USING (is_admin());

-- 5. HR 연동 보상 이력
CREATE TABLE IF NOT EXISTS game_hr_rewards (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_type   text NOT NULL,
  coins_granted int  NOT NULL DEFAULT 0,
  granted_at    timestamptz DEFAULT now()
);

ALTER TABLE game_hr_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "본인 조회" ON game_hr_rewards FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "어드민 전체" ON game_hr_rewards FOR ALL TO public
  USING (is_admin());

-- 6. 인덱스
CREATE INDEX idx_game_runs_user_id      ON game_runs(user_id);
CREATE INDEX idx_game_runs_created_at   ON game_runs(created_at DESC);
CREATE INDEX idx_game_season_scores_season ON game_season_scores(season_id, total_score DESC);
CREATE INDEX idx_game_hr_rewards_user   ON game_hr_rewards(user_id, granted_at DESC);

-- 7. 기본 시즌 생성 (2026년 1분기)
INSERT INTO game_seasons (name, starts_at, ends_at, is_active)
VALUES ('2026년 1분기', '2026-01-01 00:00:00+09', '2026-03-31 23:59:59+09', true);

-- 8. game_profiles 자동 생성 트리거
-- SET search_path = public 필수: auth.users 트리거 컨텍스트에서 search_path가 auth만 포함되어
-- 스키마 미지정 시 public.game_profiles를 못 찾아 회원가입 500 에러 발생
CREATE OR REPLACE FUNCTION handle_new_game_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.game_profiles (id) VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_game
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_game_profile();

-- 기존 유저에 game_profiles 일괄 생성
INSERT INTO game_profiles (id)
SELECT id FROM auth.users
ON CONFLICT (id) DO NOTHING;
