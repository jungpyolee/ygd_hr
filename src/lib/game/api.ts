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

// ─── 상점 아이템 (누적 강화 시스템) ──────────────
export interface ShopItem {
  id: string;
  name: string;
  emoji: string;
  effectPerLevel: string;  // 레벨당 효과 설명
  baseCost: number;        // 첫 구매 비용
  costPerLevel: number;    // 레벨당 추가 비용
  maxLevel: number;        // 최대 레벨 (1 = 1회용, 99 = 무제한)
  category: "hp" | "attack" | "util" | "special";
}

export const SHOP_ITEMS: ShopItem[] = [
  // HP
  { id: "hp_up",      name: "체력 강화",       emoji: "❤️",  effectPerLevel: "시작 HP +20",          baseCost: 10, costPerLevel: 5,  maxLevel: 99, category: "hp" },
  { id: "heal_boost", name: "회복력",           emoji: "🩹",  effectPerLevel: "레벨업 회복량 +25%",   baseCost: 12, costPerLevel: 6,  maxLevel: 99, category: "hp" },
  // 공격
  { id: "atk_up",     name: "날카로운 발톱",    emoji: "🗡️",  effectPerLevel: "공격력 +15%",          baseCost: 15, costPerLevel: 8,  maxLevel: 99, category: "attack" },
  { id: "atkspd_up",  name: "빠른 발",          emoji: "⚡",  effectPerLevel: "공격속도 +12%",        baseCost: 15, costPerLevel: 8,  maxLevel: 99, category: "attack" },
  { id: "pierce",     name: "관통력",           emoji: "🎯",  effectPerLevel: "투사체 관통 해금",      baseCost: 35, costPerLevel: 0,  maxLevel: 1,  category: "attack" },
  // 유틸
  { id: "move_up",    name: "이동 강화",         emoji: "👟",  effectPerLevel: "이동속도 +12%",        baseCost: 12, costPerLevel: 6,  maxLevel: 99, category: "util" },
  { id: "coin_magnet",name: "코인 자석",         emoji: "🧲",  effectPerLevel: "픽업 반경 +40%",       baseCost: 15, costPerLevel: 8,  maxLevel: 99, category: "util" },
  { id: "luck",       name: "행운",              emoji: "🍀",  effectPerLevel: "코인 드랍률 +10%p",    baseCost: 20, costPerLevel: 10, maxLevel: 99, category: "util" },
  // 특수
  { id: "revive",     name: "부활의 목걸이",     emoji: "📿",  effectPerLevel: "런당 1회 부활 (HP 30%)", baseCost: 40, costPerLevel: 0, maxLevel: 1, category: "special" },
];

/** 아이템 다음 강화 비용 계산 */
export function getUpgradeCost(item: ShopItem, currentLevel: number): number {
  return item.baseCost + currentLevel * item.costPerLevel;
}

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

/** 캐릭터 해금 목록 (game_purchases) */
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

/** 상점 강화 레벨 조회 — { item_id: level } */
export async function getMyUpgradeLevels(): Promise<Record<string, number>> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};
  const { data } = await supabase
    .from("game_upgrades")
    .select("item_id, level")
    .eq("user_id", user.id);
  const result: Record<string, number> = {};
  (data ?? []).forEach((r: { item_id: string; level: number }) => {
    result[r.item_id] = r.level;
  });
  return result;
}

/** 상점 아이템 강화 (누적) */
export async function buyShopUpgrade(
  itemId: string,
  currentLevel: number,
  cost: number,
): Promise<{ ok: boolean; reason?: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "로그인 필요" };

  const { data: profile } = await supabase
    .from("game_profiles")
    .select("coins")
    .eq("id", user.id)
    .single();

  if (!profile || profile.coins < cost) return { ok: false, reason: "코인 부족" };

  const newLevel = currentLevel + 1;

  if (currentLevel === 0) {
    const { error } = await supabase
      .from("game_upgrades")
      .insert({ user_id: user.id, item_id: itemId, level: newLevel });
    if (error) return { ok: false, reason: "강화 저장 실패" };
  } else {
    const { error } = await supabase
      .from("game_upgrades")
      .update({ level: newLevel, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("item_id", itemId);
    if (error) return { ok: false, reason: "강화 저장 실패" };
  }

  const { error: updateError } = await supabase
    .from("game_profiles")
    .update({ coins: profile.coins - cost })
    .eq("id", user.id);
  if (updateError) return { ok: false, reason: "코인 차감 실패" };

  return { ok: true };
}

/** 코인으로 캐릭터 해금 (game_purchases 기록) */
export async function unlockCatWithCoins(cost: number, itemId = "cat_abyssinian"): Promise<{ ok: boolean; reason?: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "로그인 필요" };

  const { data: profile } = await supabase
    .from("game_profiles")
    .select("coins")
    .eq("id", user.id)
    .single();

  if (!profile || profile.coins < cost) return { ok: false, reason: "코인 부족" };

  const { error: insertError } = await supabase
    .from("game_purchases")
    .insert({ user_id: user.id, item_id: itemId });
  if (insertError && !insertError.message.includes("duplicate")) {
    return { ok: false, reason: "해금 저장 실패" };
  }

  const { error: updateError } = await supabase
    .from("game_profiles")
    .update({ coins: profile.coins - cost })
    .eq("id", user.id);
  if (updateError) return { ok: false, reason: "코인 차감 실패" };

  return { ok: true };
}

/** 전체 누적 리더보드 TOP 10 */
export async function getLeaderboard() {
  const supabase = createClient();
  const { data: scores } = await supabase
    .from("game_profiles")
    .select("id, total_score, best_run_score, highest_wave")
    .gt("play_count", 0)
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
    scores: scores.map((s: { id: string; total_score: number; best_run_score: number; highest_wave: number }) => ({
      user_id: s.id,
      total_score: s.total_score,
      best_run_score: s.best_run_score,
      highest_wave: s.highest_wave,
      profiles: profileMap.get(s.id) ?? { name: "알 수 없음", color_hex: null },
    })),
  };
}
