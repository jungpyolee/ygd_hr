"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getMyGameProfile,
  getMyPurchases,
  buyShopItem,
  unlockCatWithCoins,
  SHOP_ITEMS,
  type GameProfileData,
} from "@/lib/game/api";
import type { GameConfig } from "@/lib/game/scenes/GameScene";
import { toast } from "sonner";

const RoguelikeGame = dynamic(
  () => import("@/components/game/RoguelikeGame"),
  { ssr: false, loading: () => null }
);

// ─── 캐릭터 정의 ─────────────────────────────
const CAT_TYPES = [
  {
    id: "persian",
    name: "페르시안",
    emoji: "🐱",
    desc: "균형형 · 기본 스탯",
    unlockCondition: "always" as const,
    getStatBonuses: () => ({ hpBonus: 0, damageMulti: 1.0, moveSpeedMulti: 1.0 }),
  },
  {
    id: "scottish",
    name: "스코티시폴드",
    emoji: "😺",
    desc: "탱커형 · HP +40, 이동 -10%",
    unlockCondition: "play5" as const,
    getStatBonuses: () => ({ hpBonus: 40, damageMulti: 1.0, moveSpeedMulti: 0.9 }),
  },
  {
    id: "abyssinian",
    name: "아비시니안",
    emoji: "😸",
    desc: "스피드형 · 이동 +20%, HP -20",
    unlockCondition: "coins50" as const,
    getStatBonuses: () => ({ hpBonus: -20, damageMulti: 1.0, moveSpeedMulti: 1.2 }),
  },
  {
    id: "munchkin",
    name: "먼치킨",
    emoji: "🐈",
    desc: "서포터형 · EXP +30%, 투사체 2개",
    unlockCondition: "wave30" as const,
    getStatBonuses: () => ({ hpBonus: 0, damageMulti: 1.0, moveSpeedMulti: 1.0 }),
  },
] as const;

type CatId = (typeof CAT_TYPES)[number]["id"];

// 카테고리 레이블
const CATEGORY_LABEL: Record<string, string> = {
  hp:      "체력",
  attack:  "공격",
  util:    "유틸",
  special: "특수",
};

export default function GamePage() {
  const router = useRouter();

  const [tab, setTab]             = useState<"character" | "shop">("character");
  const [profile, setProfile]     = useState<GameProfileData | null>(null);
  const [purchases, setPurchases] = useState<string[]>([]);
  const [selectedCat, setSelectedCat] = useState<CatId>("persian");
  const [started, setStarted]     = useState(false);
  const [loading, setLoading]     = useState(true);
  const [buying, setBuying]       = useState<string | null>(null);
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);

  // 데이터 로드
  useEffect(() => {
    Promise.all([getMyGameProfile(), getMyPurchases()])
      .then(([prof, purch]) => {
        setProfile(prof);
        setPurchases(purch);
      })
      .finally(() => setLoading(false));
  }, []);

  // ─── 캐릭터 해금 체크 ────────────────────
  function isCatUnlocked(catId: string): boolean {
    if (catId === "persian") return true;
    if (catId === "scottish") return (profile?.play_count ?? 0) >= 5;
    if (catId === "abyssinian") return purchases.includes("cat_abyssinian");
    if (catId === "munchkin") return (profile?.highest_wave ?? 0) >= 30;
    return false;
  }

  function getUnlockLabel(catId: string): string {
    if (catId === "scottish")   return "5판 플레이하면 해금돼요";
    if (catId === "abyssinian") return "50코인으로 해금할 수 있어요";
    if (catId === "munchkin")   return "30웨이브 도달하면 해금돼요";
    return "";
  }

  // ─── 아비시니안 해금 ─────────────────────
  async function handleUnlockAbyssinian() {
    if (!profile) return;
    setBuying("cat_abyssinian");
    const result = await unlockCatWithCoins(50);
    if (result.ok) {
      setPurchases(p => [...p, "cat_abyssinian"]);
      setProfile(prev => prev ? { ...prev, coins: prev.coins - 50 } : prev);
      toast.success("아비시니안이 해금됐어요! 🎉 이제 플레이할 수 있어요.");
    } else {
      toast.error("코인이 부족해요. 게임을 더 플레이해서 코인을 모아봐요.");
    }
    setBuying(null);
  }

  // ─── 상점 아이템 구매 ─────────────────────
  async function handleBuyItem(itemId: string, cost: number) {
    setBuying(itemId);
    const result = await buyShopItem(itemId, cost);
    if (result.ok) {
      setPurchases(p => [...p, itemId]);
      setProfile(prev => prev ? { ...prev, coins: prev.coins - cost } : prev);
      const item = SHOP_ITEMS.find(i => i.id === itemId);
      toast.success(`${item?.name ?? "아이템"}을 구매했어요! 다음 게임부터 적용돼요.`);
    } else {
      toast.error("코인이 부족해요. 게임을 더 플레이해서 코인을 모아봐요.");
    }
    setBuying(null);
  }

  // ─── GameConfig 빌드 ─────────────────────
  function buildGameConfig(): GameConfig {
    const catDef = CAT_TYPES.find(c => c.id === selectedCat);
    const catBonus = catDef?.getStatBonuses() ?? { hpBonus: 0, damageMulti: 1.0, moveSpeedMulti: 1.0 };

    return {
      catType: selectedCat as GameConfig["catType"],
      buffs: {
        hpBonus:          (catBonus.hpBonus ?? 0)
                          + (purchases.includes("hp_up_1") ? 20 : 0)
                          + (purchases.includes("hp_up_2") ? 40 : 0),
        damageMulti:      (catBonus.damageMulti ?? 1.0)
                          * (purchases.includes("atk_up") ? 1.15 : 1.0),
        attackSpeedMulti: purchases.includes("atkspd_up") ? 1.2 : 1.0,
        moveSpeedMulti:   (catBonus.moveSpeedMulti ?? 1.0)
                          * (purchases.includes("move_up") ? 1.15 : 1.0),
        expMulti:         selectedCat === "munchkin" ? 1.3 : 1.0,
        coinPickupRange:  purchases.includes("coin_magnet") ? 120 : 60,
        coinDropBonus:    purchases.includes("luck") ? 0.15 : 0.0,
        hasRevive:        purchases.includes("revive"),
        hasPiercing:      purchases.includes("pierce"),
        startProjectiles: selectedCat === "munchkin" ? 2 : 1,
        healMulti:        purchases.includes("heal_boost") ? 1.5 : 1.0,
      },
    };
  }

  // ─── 게임 시작 ────────────────────────────
  const handleStart = () => {
    if (!isCatUnlocked(selectedCat)) {
      toast.error("이 캐릭터는 아직 잠겨 있어요.");
      return;
    }
    setGameConfig(buildGameConfig());
    setStarted(true);
  };

  // ─── 게임 화면 렌더링 ─────────────────────
  if (started && gameConfig) {
    return (
      <RoguelikeGame
        onClose={() => { setStarted(false); setGameConfig(null); }}
        gameConfig={gameConfig}
      />
    );
  }

  // ─── 상점 탭 렌더링 ──────────────────────
  const shopByCategory = SHOP_ITEMS.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, typeof SHOP_ITEMS[number][]>);

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-4 pt-12 pb-4">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10"
        >
          <span className="text-white text-lg">←</span>
        </button>
        <h1 className="text-white text-lg font-bold flex-1">냥냥 서바이벌</h1>
        {/* 코인 표시 */}
        {!loading && (
          <div className="flex items-center gap-1 bg-[#f59e0b]/20 rounded-full px-3 py-1">
            <span className="text-sm">🪙</span>
            <span className="text-[#f59e0b] font-bold text-sm tabular-nums">
              {profile?.coins ?? 0}
            </span>
          </div>
        )}
      </div>

      {/* 타이틀 */}
      <div className="text-center pt-2 pb-4 px-4">
        <p className="text-4xl mb-2">🐱</p>
        <p className="text-gray-400 text-sm">쥐떼를 막아내고 끝까지 살아남으세요</p>
      </div>

      {/* 탭 */}
      <div className="flex px-4 mb-4 gap-2">
        <button
          onClick={() => setTab("character")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${
            tab === "character"
              ? "bg-[#3182F6] text-white"
              : "bg-white/10 text-white/60"
          }`}
        >
          캐릭터
        </button>
        <button
          onClick={() => setTab("shop")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${
            tab === "shop"
              ? "bg-[#3182F6] text-white"
              : "bg-white/10 text-white/60"
          }`}
        >
          상점
        </button>
      </div>

      {/* 탭 내용 */}
      <div className="px-4 flex-1 overflow-y-auto">
        {/* ── 캐릭터 탭 ── */}
        {tab === "character" && (
          <div className="space-y-3 pb-4">
            {CAT_TYPES.map(cat => {
              const unlocked = isCatUnlocked(cat.id);
              const selected = selectedCat === cat.id;
              return (
                <div
                  key={cat.id}
                  className={`w-full rounded-2xl p-4 text-left border-2 transition-colors relative ${
                    selected
                      ? "border-[#3182F6] bg-[#3182F6]/10"
                      : unlocked
                      ? "border-gray-700 bg-[#16213e]"
                      : "border-gray-700/50 bg-[#16213e]/50 opacity-60"
                  }`}
                >
                  {/* 캐릭터 선택 영역 */}
                  <div
                    role="button"
                    tabIndex={unlocked ? 0 : -1}
                    onClick={() => unlocked && setSelectedCat(cat.id)}
                    onKeyDown={e => e.key === "Enter" && unlocked && setSelectedCat(cat.id)}
                    className={`flex items-center gap-3 ${unlocked ? "cursor-pointer active:opacity-70" : "cursor-default"}`}
                  >
                    <span className={`text-4xl ${!unlocked ? "grayscale" : ""}`}>{cat.emoji}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-white font-bold text-sm">{cat.name}</p>
                        {selected && unlocked && (
                          <span className="text-[10px] bg-[#3182F6] text-white rounded-full px-2 py-0.5">선택됨</span>
                        )}
                        {!unlocked && (
                          <span className="text-[10px] bg-white/10 text-white/50 rounded-full px-2 py-0.5">🔒 잠금</span>
                        )}
                      </div>
                      <p className="text-gray-400 text-xs mt-0.5">{cat.desc}</p>
                      {!unlocked && (
                        <p className="text-white/30 text-xs mt-1">{getUnlockLabel(cat.id)}</p>
                      )}
                    </div>
                  </div>

                  {/* 아비시니안 해금 버튼 */}
                  {cat.id === "abyssinian" && !unlocked && (
                    <button
                      onClick={handleUnlockAbyssinian}
                      disabled={buying === "cat_abyssinian" || (profile?.coins ?? 0) < 50}
                      className="mt-3 w-full py-2 rounded-xl text-sm font-bold disabled:opacity-40 transition-colors"
                      style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "white" }}
                    >
                      {buying === "cat_abyssinian" ? "처리 중..." : "🪙 50코인으로 해금하기"}
                    </button>
                  )}
                </div>
              );
            })}

            {/* 조작법 안내 */}
            <div className="bg-[#16213e] rounded-2xl p-4 mt-2">
              <p className="text-gray-300 text-sm font-bold mb-2">조작법</p>
              <div className="space-y-1.5">
                <p className="text-gray-400 text-xs">📱 화면 터치 후 드래그 → 이동</p>
                <p className="text-gray-400 text-xs">⌨️ WASD / 방향키 → 이동</p>
                <p className="text-gray-400 text-xs">⚔️ 공격은 자동 (가장 가까운 적 조준)</p>
                <p className="text-gray-400 text-xs">🪙 코인 수집 → 게임 후 상점에서 사용</p>
                <p className="text-gray-400 text-xs">🔥 5웨이브마다 보스 등장</p>
              </div>
            </div>
          </div>
        )}

        {/* ── 상점 탭 ── */}
        {tab === "shop" && (
          <div className="space-y-5 pb-4">
            {loading ? (
              <div className="py-8 text-center text-white/30 text-sm">불러오는 중...</div>
            ) : (
              (["hp", "attack", "util", "special"] as const).map(cat => {
                const items = shopByCategory[cat] ?? [];
                if (!items.length) return null;
                return (
                  <div key={cat}>
                    <p className="text-white/50 text-xs font-bold uppercase tracking-widest mb-2">
                      {CATEGORY_LABEL[cat]}
                    </p>
                    <div className="space-y-2">
                      {items.map(item => {
                        const bought    = purchases.includes(item.id);
                        const locked    = !!item.requires && !purchases.includes(item.requires);
                        const noCoins   = (profile?.coins ?? 0) < item.cost;
                        const disabled  = bought || locked || buying === item.id;

                        return (
                          <div
                            key={item.id}
                            className={`rounded-2xl p-3 flex items-center gap-3 ${
                              bought ? "bg-[#16213e]/40 opacity-60" : "bg-[#16213e]"
                            }`}
                          >
                            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-xl shrink-0">
                              {item.emoji}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm font-bold">{item.name}</p>
                              <p className="text-white/40 text-xs">{item.description}</p>
                              {locked && (
                                <p className="text-yellow-500/60 text-[10px] mt-0.5">
                                  선행: {SHOP_ITEMS.find(i => i.id === item.requires)?.name} 필요
                                </p>
                              )}
                            </div>
                            <div className="shrink-0">
                              {bought ? (
                                <span className="text-[#22c55e] text-xs font-bold">✓ 보유</span>
                              ) : (
                                <button
                                  onClick={() => handleBuyItem(item.id, item.cost)}
                                  disabled={disabled || noCoins}
                                  className="px-3 py-1.5 rounded-xl text-xs font-bold disabled:opacity-40 transition-colors"
                                  style={{
                                    background: locked || noCoins
                                      ? "rgba(255,255,255,0.1)"
                                      : "linear-gradient(135deg, #f59e0b, #d97706)",
                                    color: locked || noCoins ? "rgba(255,255,255,0.4)" : "white",
                                  }}
                                >
                                  {buying === item.id ? "..." : `🪙 ${item.cost}`}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* 시작 버튼 */}
      <div className="px-4 pb-10 pt-4">
        <button
          onClick={handleStart}
          disabled={!isCatUnlocked(selectedCat)}
          className="w-full py-4 rounded-2xl text-white text-lg font-bold disabled:opacity-40 transition-opacity"
          style={{ background: "linear-gradient(135deg, #3182F6, #2563eb)" }}
        >
          게임 시작하기
        </button>
      </div>
    </div>
  );
}
