-- Migration 023: game_profiles 누적 스코어 컬럼 추가 + RPC 갱신
-- 대상: Dev DB (rddplpiwvmclreeblkmi)
-- 생성일: 2026-03-21
-- 변경: 시즌 기반 → 전체 누적 리더보드로 전환

ALTER TABLE game_profiles
  ADD COLUMN IF NOT EXISTS total_score    int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_run_score int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS play_count     int NOT NULL DEFAULT 0;

-- p_score 파라미터 추가 (DEFAULT 0으로 하위호환)
CREATE OR REPLACE FUNCTION upsert_game_profile_stats(
  p_user_id  uuid,
  p_wave     int,
  p_duration int,
  p_score    int DEFAULT 0
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO game_profiles (id, highest_wave, total_playtime, total_score, best_run_score, play_count)
  VALUES (p_user_id, p_wave, p_duration, p_score, p_score, 1)
  ON CONFLICT (id) DO UPDATE SET
    highest_wave   = GREATEST(game_profiles.highest_wave, p_wave),
    total_playtime = game_profiles.total_playtime + p_duration,
    total_score    = game_profiles.total_score + p_score,
    best_run_score = GREATEST(game_profiles.best_run_score, p_score),
    play_count     = game_profiles.play_count + 1;
END;
$$;
