import { createClient } from "@/lib/supabase";

export interface GameRunPayload {
  score: number;
  wave_reached: number;
  duration_sec: number;
  weapons_used: string[];
  killed_count: number;
}

/** 런 기록 저장 + 시즌 점수 업데이트 */
export async function saveGameRun(payload: GameRunPayload) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인 필요");

  // 런 저장
  const { error: runError } = await supabase.from("game_runs").insert({
    user_id: user.id,
    ...payload,
    weapons_used: payload.weapons_used,
  });
  if (runError) throw runError;

  // game_profiles 최고 웨이브, 총 플레이타임 갱신
  await supabase.rpc("upsert_game_profile_stats", {
    p_user_id: user.id,
    p_wave: payload.wave_reached,
    p_duration: payload.duration_sec,
  });

  // 활성 시즌 점수 upsert
  const { data: season } = await supabase
    .from("game_seasons")
    .select("id")
    .eq("is_active", true)
    .single();

  if (season) {
    await supabase.rpc("upsert_season_score", {
      p_season_id: season.id,
      p_user_id: user.id,
      p_score: payload.score,
    });
  }
}

/** 내 게임 프로필 조회 */
export async function getMyGameProfile() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("game_profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  return data;
}

/** 리더보드 (활성 시즌 TOP 10) */
export async function getLeaderboard() {
  const supabase = createClient();

  const { data: season } = await supabase
    .from("game_seasons")
    .select("id, name")
    .eq("is_active", true)
    .single();

  if (!season) return { season: null, scores: [] };

  const { data: scores } = await supabase
    .from("game_season_scores")
    .select(
      `
      user_id,
      total_score,
      best_run_score,
      play_count,
      profiles!inner(name, color_hex)
    `
    )
    .eq("season_id", season.id)
    .order("total_score", { ascending: false })
    .limit(10);

  return { season, scores: scores ?? [] };
}
