-- 024_game_meta_progression.sql
-- 게임 메타 진행 시스템: 코인, 상점 구매, 캐릭터 해금

-- game_profiles에 coins 컬럼 추가
ALTER TABLE game_profiles
  ADD COLUMN IF NOT EXISTS coins int NOT NULL DEFAULT 0;

-- 상점 구매 기록 테이블
CREATE TABLE IF NOT EXISTS game_purchases (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id    text NOT NULL,
  bought_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, item_id)
);
ALTER TABLE game_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "본인 조회" ON game_purchases FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "본인 삽입" ON game_purchases FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "어드민 전체" ON game_purchases FOR ALL TO public USING (is_admin());

-- upsert_game_profile_stats: p_coins 파라미터 추가
CREATE OR REPLACE FUNCTION upsert_game_profile_stats(
  p_user_id  uuid,
  p_wave     int,
  p_duration int,
  p_score    int DEFAULT 0,
  p_coins    int DEFAULT 0
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO game_profiles (id, highest_wave, total_playtime, total_score, best_run_score, play_count, coins)
  VALUES (p_user_id, p_wave, p_duration, p_score, p_score, 1, p_coins)
  ON CONFLICT (id) DO UPDATE SET
    highest_wave   = GREATEST(game_profiles.highest_wave, p_wave),
    total_playtime = game_profiles.total_playtime + p_duration,
    total_score    = game_profiles.total_score + p_score,
    best_run_score = GREATEST(game_profiles.best_run_score, p_score),
    play_count     = game_profiles.play_count + 1,
    coins          = game_profiles.coins + p_coins;
END;
$$;

-- 상점 아이템 구매 함수 (코인 차감 + purchases insert)
CREATE OR REPLACE FUNCTION buy_shop_item(
  p_user_id uuid,
  p_item_id text,
  p_cost    int
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_coins int;
BEGIN
  SELECT coins INTO v_coins FROM game_profiles WHERE id = p_user_id;
  IF v_coins IS NULL OR v_coins < p_cost THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_coins');
  END IF;
  INSERT INTO game_purchases (user_id, item_id) VALUES (p_user_id, p_item_id)
  ON CONFLICT (user_id, item_id) DO NOTHING;
  UPDATE game_profiles SET coins = GREATEST(0, coins - p_cost) WHERE id = p_user_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 캐릭터 코인 해금 함수
CREATE OR REPLACE FUNCTION unlock_cat_with_coins(
  p_user_id uuid,
  p_cost    int
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_coins int;
BEGIN
  SELECT coins INTO v_coins FROM game_profiles WHERE id = p_user_id;
  IF v_coins IS NULL OR v_coins < p_cost THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_coins');
  END IF;
  UPDATE game_profiles SET coins = coins - p_cost WHERE id = p_user_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
