import { createClient } from "@/lib/supabase";

export interface GameRunPayload {
  score: number;
  wave_reached: number;
  duration_sec: number;
  weapons_used: string[];
  killed_count: number;
  coins_earned: number;
}

export interface GameProfileData {
  id: string;
  coins: number;
  play_count: number;
  highest_wave: number;
  total_score: number;
  best_run_score: number;
  total_playtime: number;
}

// 상점 아이템 정의 (DB 저장 없이 코드에서 관리)
export interface ShopItem {
  id: string;
  name: string;
  description: string;
  emoji: string;
  cost: number;
  category: "hp" | "attack" | "util" | "special";
  requires?: string; // 선행 구매 필요 아이템 ID
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: "hp_up_1",      name: "체력 강화 I",     description: "시작 HP +20",            emoji: "❤️",  cost: 15, category: "hp" },
  { id: "hp_up_2",      name: "체력 강화 II",    description: "시작 HP +40",             emoji: "💗",  cost: 30, category: "hp", requires: "hp_up_1" },
  { id: "heal_boost",   name: "회복력",           description: "레벨업 HP 회복 +50%",     emoji: "🩹",  cost: 25, category: "hp" },
  { id: "atk_up",       name: "날카로운 발톱",    description: "공격력 +15%",             emoji: "🗡️",  cost: 20, category: "attack" },
  { id: "atkspd_up",    name: "빠른 발",           description: "공격속도 +20%",           emoji: "⚡",  cost: 20, category: "attack" },
  { id: "pierce",       name: "관통력",            description: "투사체 1회 추가 관통",    emoji: "🎯",  cost: 35, category: "attack" },
  { id: "move_up",      name: "이동 강화",         description: "이동속도 +15%",           emoji: "👟",  cost: 15, category: "util" },
  { id: "coin_magnet",  name: "코인 자석",         description: "픽업 반경 2배",           emoji: "🧲",  cost: 20, category: "util" },
  { id: "luck",         name: "행운",              description: "코인 드랍률 +15%p",       emoji: "🍀",  cost: 30, category: "util" },
  { id: "revive",       name: "부활의 목걸이",     description: "런당 1회 부활 (HP 30%)", emoji: "📿",  cost: 40, category: "special" },
];

/** 런 기록 저장 + game_profiles 누적 통계 갱신 */
export async function saveGameRun(payload: GameRunPayload) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인 필요");

  const { error: runError } = await supabase.from("game_runs").insert({
    user_id: user.id,
    score: payload.score,
    wave_reached: payload.wave_reached,
    duration_sec: payload.duration_sec,
    weapons_used: payload.weapons_used,
    killed_count: payload.killed_count,
  });
  if (runError) throw runError;

  await supabase.rpc("upsert_game_profile_stats", {
    p_user_id: user.id,
    p_wave: payload.wave_reached,
    p_duration: payload.duration_sec,
    p_score: payload.score,
    p_coins: payload.coins_earned,
  });
}

/** 내 게임 프로필 조회 */
export async function getMyGameProfile(): Promise<GameProfileData | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("game_profiles")
    .select("id, coins, play_count, highest_wave, total_score, best_run_score, total_playtime")
    .eq("id", user.id)
    .single();
  return data;
}

/** 내 구매 목록 */
export async function getMyPurchases(): Promise<string[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("game_purchases")
    .select("item_id")
    .eq("user_id", user.id);
  return (data ?? []).map((r: { item_id: string }) => r.item_id);
}

/** 상점 아이템 구매 */
export async function buyShopItem(itemId: string, cost: number): Promise<{ ok: boolean; reason?: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "로그인 필요" };

  // 코인 차감
  const { data: profile } = await supabase
    .from("game_profiles")
    .select("coins")
    .eq("id", user.id)
    .single();

  if (!profile || profile.coins < cost) return { ok: false, reason: "코인 부족" };

  await supabase.from("game_purchases").insert({ user_id: user.id, item_id: itemId });
  await supabase.from("game_profiles").update({ coins: profile.coins - cost }).eq("id", user.id);
  return { ok: true };
}

/** 아비시니안 코인 해금 */
export async function unlockCatWithCoins(cost: number): Promise<{ ok: boolean; reason?: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "로그인 필요" };

  const { data: profile } = await supabase
    .from("game_profiles")
    .select("coins")
    .eq("id", user.id)
    .single();

  if (!profile || profile.coins < cost) return { ok: false, reason: "코인 부족" };

  await supabase.from("game_profiles").update({ coins: profile.coins - cost }).eq("id", user.id);
  return { ok: true };
}

/** 전체 누적 리더보드 TOP 10 */
export async function getLeaderboard() {
  const supabase = createClient();
  const { data: scores } = await supabase
    .from("game_profiles")
    .select("id, total_score, best_run_score, play_count")
    .order("total_score", { ascending: false })
    .limit(10);

  if (!scores || scores.length === 0) return { scores: [] };

  const ids = scores.map((s: { id: string }) => s.id);
  const { data: profilesData } = await supabase
    .from("profiles")
    .select("id, name, color_hex")
    .in("id", ids);

  const profileMap = new Map(
    (profilesData ?? []).map((p: { id: string; name: string; color_hex: string | null }) => [p.id, p])
  );

  return {
    scores: scores.map((s: { id: string; total_score: number; best_run_score: number; play_count: number }) => ({
      user_id: s.id,
      total_score: s.total_score,
      best_run_score: s.best_run_score,
      play_count: s.play_count,
      profiles: profileMap.get(s.id) ?? { name: "알 수 없음", color_hex: null },
    })),
  };
}
