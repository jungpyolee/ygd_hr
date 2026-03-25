-- Migration 022: 게임 RPC 함수
-- 대상: Dev DB (rddplpiwvmclreeblkmi)
-- 생성일: 2026-03-21

-- game_profiles 통계 갱신 (최고 웨이브, 누적 플레이타임)
CREATE OR REPLACE FUNCTION upsert_game_profile_stats(
  p_user_id  uuid,
  p_wave     int,
  p_duration int
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO game_profiles (id, highest_wave, total_playtime)
  VALUES (p_user_id, p_wave, p_duration)
  ON CONFLICT (id) DO UPDATE SET
    highest_wave   = GREATEST(game_profiles.highest_wave, p_wave),
    total_playtime = game_profiles.total_playtime + p_duration;
END;
$$;

-- 시즌 누적 점수 upsert (총합 + 최고 단일 + 플레이 횟수)
CREATE OR REPLACE FUNCTION upsert_season_score(
  p_season_id uuid,
  p_user_id   uuid,
  p_score     int
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO game_season_scores (season_id, user_id, total_score, best_run_score, play_count)
  VALUES (p_season_id, p_user_id, p_score, p_score, 1)
  ON CONFLICT (season_id, user_id) DO UPDATE SET
    total_score    = game_season_scores.total_score + p_score,
    best_run_score = GREATEST(game_season_scores.best_run_score, p_score),
    play_count     = game_season_scores.play_count + 1,
    updated_at     = now();
END;
$$;
