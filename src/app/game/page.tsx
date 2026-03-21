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
    desc: "균형형",
    detail: "기본 스탯 · 무난한 시작",
    unlockCondition: "always" as const,
    getStatBonuses: () => ({ hpBonus: 0, damageMulti: 1.0, moveSpeedMulti: 1.0 }),
  },
  {
    id: "scottish",
    name: "스코티시폴드",
    emoji: "😺",
    desc: "탱커형",
    detail: "HP +40 · 이동속도 -10%",
    unlockCondition: "play5" as const,
    getStatBonuses: () => ({ hpBonus: 40, damageMulti: 1.0, moveSpeedMulti: 0.9 }),
  },
  {
    id: "abyssinian",
    name: "아비시니안",
    emoji: "😸",
    desc: "스피드형",
    detail: "이동속도 +20% · HP -20",
    unlockCondition: "coins50" as const,
    getStatBonuses: () => ({ hpBonus: -20, damageMulti: 1.0, moveSpeedMulti: 1.2 }),
  },
  {
    id: "munchkin",
    name: "먼치킨",
    emoji: "🐈",
    desc: "서포터형",
    detail: "EXP +30% · 투사체 2개",
    unlockCondition: "wave30" as const,
    getStatBonuses: () => ({ hpBonus: 0, damageMulti: 1.0, moveSpeedMulti: 1.0 }),
  },
  {
    id: "doujeonku",
    name: "두쫀쿠",
    emoji: "🍘",
    desc: "탱커반격형",
    detail: "HP +50 · 피해 누적 시 자동 반격",
    unlockCondition: "play15" as const,
    getStatBonuses: () => ({ hpBonus: 50, damageMulti: 1.1, moveSpeedMulti: 0.85 }),
  },
  {
    id: "bomdong",
    name: "봄동비빔밥",
    emoji: "🥗",
    desc: "시너지형",
    detail: "무기 슬롯 +1 · 2종 무기로 시작",
    unlockCondition: "weapons4" as const,
    getStatBonuses: () => ({ hpBonus: 0, damageMulti: 1.0, moveSpeedMulti: 1.0 }),
  },
  {
    id: "buttertteok",
    name: "버터떡",
    emoji: "🧈",
    desc: "글래스캐논형",
    detail: "속도 +25% · 공격력 +25% · HP -30",
    unlockCondition: "score50k" as const,
    getStatBonuses: () => ({ hpBonus: -30, damageMulti: 1.25, moveSpeedMulti: 1.25 }),
  },
] as const;

type CatId = (typeof CAT_TYPES)[number]["id"];
type Screen = "title" | "character" | "shop";

const CATEGORY_LABEL: Record<string, string> = {
  hp: "체력", attack: "공격", util: "유틸", special: "특수",
};

// 타이틀 화면 배경 장식 (결정적 위치 — SSR 안전)
const BG_DECOS = [
  { emoji: "🍊", x: 7,  y: 8,  size: 28, rot: -20, op: 0.09 },
  { emoji: "🍡", x: 85, y: 5,  size: 22, rot: 15,  op: 0.07 },
  { emoji: "🥜", x: 92, y: 32, size: 26, rot: 30,  op: 0.08 },
  { emoji: "🧁", x: 4,  y: 55, size: 20, rot: -10, op: 0.06 },
  { emoji: "🍬", x: 88, y: 70, size: 24, rot: 25,  op: 0.08 },
  { emoji: "🍮", x: 12, y: 82, size: 22, rot: -30, op: 0.07 },
  { emoji: "🎂", x: 75, y: 88, size: 18, rot: 10,  op: 0.06 },
  { emoji: "🍯", x: 50, y: 3,  size: 20, rot: 5,   op: 0.05 },
  { emoji: "🍊", x: 40, y: 92, size: 26, rot: -15, op: 0.07 },
  { emoji: "🍡", x: 60, y: 78, size: 18, rot: 20,  op: 0.05 },
];

export default function GamePage() {
  const router = useRouter();

  const [screen, setScreen]           = useState<Screen>("title");
  const [profile, setProfile]         = useState<GameProfileData | null>(null);
  const [purchases, setPurchases]     = useState<string[]>([]);
  const [selectedCat, setSelectedCat] = useState<CatId>("persian");
  const [started, setStarted]         = useState(false);
  const [loading, setLoading]         = useState(true);
  const [buying, setBuying]           = useState<string | null>(null);
  const [gameConfig, setGameConfig]   = useState<GameConfig | null>(null);
  const [menuIdx, setMenuIdx]         = useState(0);
  const [blink, setBlink]             = useState(true);

  // 데이터 로드
  useEffect(() => {
    Promise.all([getMyGameProfile(), getMyPurchases()])
      .then(([prof, purch]) => { setProfile(prof); setPurchases(purch); })
      .finally(() => setLoading(false));
  }, []);

  // 블링크 애니메이션
  useEffect(() => {
    const t = setInterval(() => setBlink(b => !b), 550);
    return () => clearInterval(t);
  }, []);

  // 타이틀 키보드 내비게이션
  useEffect(() => {
    if (started || screen !== "title") return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp")   setMenuIdx(i => Math.max(0, i - 1));
      if (e.key === "ArrowDown") setMenuIdx(i => Math.min(2, i + 1));
      if (e.key === "Enter") {
        if (menuIdx === 0) setScreen("character");
        else if (menuIdx === 1) setScreen("shop");
        else router.back();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [started, screen, menuIdx, router]);

  // ─── 캐릭터 해금 체크 ────────────────────
  function isCatUnlocked(catId: string): boolean {
    if (catId === "persian")     return true;
    if (catId === "scottish")    return (profile?.play_count ?? 0) >= 5;
    if (catId === "abyssinian")  return purchases.includes("cat_abyssinian");
    if (catId === "munchkin")    return (profile?.highest_wave ?? 0) >= 30;
    if (catId === "doujeonku")   return (profile?.play_count ?? 0) >= 15;
    if (catId === "bomdong")     return purchases.includes("cat_bomdong");
    if (catId === "buttertteok") return (profile?.best_run_score ?? 0) >= 50000;
    return false;
  }

  function getUnlockHint(catId: string): string {
    if (catId === "scottish")    return `플레이 ${profile?.play_count ?? 0}/5판`;
    if (catId === "abyssinian")  return "🪙 50코인";
    if (catId === "munchkin")    return `최고 웨이브 ${profile?.highest_wave ?? 0}/30`;
    if (catId === "doujeonku")   return `플레이 ${profile?.play_count ?? 0}/15판`;
    if (catId === "bomdong")     return "🪙 80코인";
    if (catId === "buttertteok") return `최고 점수 ${(profile?.best_run_score ?? 0).toLocaleString()}/50,000`;
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
      toast.success("아비시니안이 해금됐어요! 🎉");
    } else if (result.reason === "코인 부족") {
      toast.error("코인이 부족해요.");
    } else {
      toast.error(`해금 실패: ${result.reason}`);
    }
    setBuying(null);
  }

  // ─── 봄동비빔밥 해금 ─────────────────────
  async function handleUnlockBomdong() {
    if (!profile) return;
    setBuying("cat_bomdong");
    const result = await unlockCatWithCoins(80, "cat_bomdong");
    if (result.ok) {
      setPurchases(p => [...p, "cat_bomdong"]);
      setProfile(prev => prev ? { ...prev, coins: prev.coins - 80 } : prev);
      toast.success("봄동비빔밥이 해금됐어요! 🥗");
    } else if (result.reason === "코인 부족") {
      toast.error("코인이 부족해요.");
    } else {
      toast.error(`해금 실패: ${result.reason}`);
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
      toast.success(`${item?.name ?? "아이템"} 구매 완료!`);
    } else if (result.reason === "코인 부족") {
      toast.error("코인이 부족해요.");
    } else {
      toast.error(`구매 실패: ${result.reason}`);
    }
    setBuying(null);
  }

  // ─── GameConfig 빌드 ─────────────────────
  function buildGameConfig(): GameConfig {
    const catDef  = CAT_TYPES.find(c => c.id === selectedCat);
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
        extraWeaponSlot:  selectedCat === "bomdong",
        counterShockwave: selectedCat === "doujeonku",
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

  // ─── 게임 종료 ────────────────────────────
  const handleGameClose = async () => {
    setStarted(false);
    setGameConfig(null);
    setScreen("title");
    Promise.all([getMyGameProfile(), getMyPurchases()])
      .then(([prof, purch]) => { setProfile(prof); setPurchases(purch); })
      .catch(() => {});
  };

  // ─── 게임 중 ──────────────────────────────
  if (started && gameConfig) {
    return <RoguelikeGame onClose={handleGameClose} gameConfig={gameConfig} />;
  }

  // ══════════════════════════════════════════
  //  타이틀 화면
  // ══════════════════════════════════════════
  if (screen === "title") {
    const MENU = [
      { label: "GAME  START", sub: "게임 시작" },
      { label: "SHOP",        sub: "상점" },
      { label: "EXIT",        sub: "나가기" },
    ];

    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden select-none"
        style={{ background: "#07071a" }}
      >
        <style>{`
          @keyframes titlePulse {
            0%,100% { text-shadow: 0 0 16px #f59e0b, 0 0 32px #f59e0b88; }
            50%      { text-shadow: 0 0 28px #f59e0b, 0 0 56px #f59e0bcc, 0 0 80px #ff6b3566; }
          }
          @keyframes floatY {
            0%,100% { transform: translateY(0px) rotate(var(--rot)); }
            50%      { transform: translateY(-8px) rotate(var(--rot)); }
          }
          .title-pulse { animation: titlePulse 2.4s ease-in-out infinite; }
          .bg-deco     { animation: floatY 4s ease-in-out infinite; }
        `}</style>

        {/* 배경 도트 그리드 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        {/* 배경 장식 이모지 */}
        {BG_DECOS.map((d, i) => (
          <span
            key={i}
            className="absolute pointer-events-none bg-deco"
            style={{
              left: `${d.x}%`, top: `${d.y}%`,
              fontSize: `${d.size}px`,
              opacity: d.op,
              ["--rot" as string]: `${d.rot}deg`,
              animationDelay: `${i * 0.4}s`,
            }}
          >{d.emoji}</span>
        ))}

        {/* 코인 + 최고점 (우상단) */}
        <div className="absolute top-12 right-4 flex flex-col items-end gap-1.5">
          <div
            className="flex items-center gap-1.5 px-3 py-1 rounded"
            style={{ border: "1px solid rgba(245,158,11,0.4)", background: "rgba(245,158,11,0.08)" }}
          >
            <span className="text-sm">🪙</span>
            <span className="font-mono font-bold text-sm tabular-nums" style={{ color: "#f59e0b" }}>
              {loading ? "..." : String(profile?.coins ?? 0).padStart(4, " ")}
            </span>
          </div>
          {(profile?.best_run_score ?? 0) > 0 && (
            <p className="font-mono text-[10px] tracking-widest" style={{ color: "#4a5568" }}>
              BEST {profile!.best_run_score.toLocaleString()}
            </p>
          )}
        </div>

        {/* 메인 타이틀 영역 */}
        <div className="flex flex-col items-center mb-10">
          {/* 고양이 */}
          <div className="text-6xl mb-4" style={{ filter: "drop-shadow(0 0 16px rgba(245,158,11,0.5))" }}>
            🐱
          </div>

          {/* 게임 타이틀 */}
          <h1
            className="title-pulse font-black tracking-widest uppercase mb-1"
            style={{
              fontSize: "clamp(22px, 7vw, 32px)",
              color: "#f59e0b",
              letterSpacing: "0.15em",
            }}
          >
            냥냥 서바이벌
          </h1>
          <p
            className="font-mono tracking-widest"
            style={{ color: "#4a5568", fontSize: "10px", letterSpacing: "0.3em" }}
          >
            NYANGNYANG  SURVIVAL
          </p>

          {/* 구분선 */}
          <div className="flex items-center gap-3 mt-6 mb-6 w-64">
            <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, transparent, #f59e0b44)" }} />
            <span style={{ color: "#f59e0b66", fontSize: "10px" }}>✦</span>
            <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, #f59e0b44, transparent)" }} />
          </div>

          {/* 메뉴 */}
          <nav className="flex flex-col items-center gap-1 w-64">
            {MENU.map((item, i) => {
              const isSelected = menuIdx === i;
              return (
                <button
                  key={i}
                  onClick={() => {
                    setMenuIdx(i);
                    if (i === 0) setScreen("character");
                    else if (i === 1) setScreen("shop");
                    else router.back();
                  }}
                  onMouseEnter={() => setMenuIdx(i)}
                  className="w-full flex items-center gap-3 px-5 py-3 rounded transition-all duration-100 active:scale-95"
                  style={{
                    background: isSelected ? "rgba(245,158,11,0.12)" : "transparent",
                    border: isSelected ? "1px solid rgba(245,158,11,0.3)" : "1px solid transparent",
                  }}
                >
                  <span
                    className="font-mono text-sm w-4 text-center transition-opacity duration-100"
                    style={{ color: "#f59e0b", opacity: isSelected ? 1 : 0 }}
                  >▶</span>
                  <div className="flex-1 text-left">
                    <p
                      className="font-mono font-bold tracking-widest"
                      style={{
                        fontSize: "15px",
                        color: isSelected ? "#f59e0b" : "#94a3b8",
                        letterSpacing: "0.2em",
                      }}
                    >
                      {item.label}
                    </p>
                  </div>
                  <span className="text-xs" style={{ color: isSelected ? "#f59e0b88" : "#374151" }}>
                    {item.sub}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* 하단 — PRESS START */}
        <div className="absolute bottom-10 flex flex-col items-center gap-2">
          <p
            className="font-mono tracking-widest text-xs uppercase"
            style={{
              color: "#34d399",
              opacity: blink ? 1 : 0,
              letterSpacing: "0.3em",
              transition: "opacity 0.1s",
            }}
          >
            ── PRESS  START ──
          </p>
          <p className="font-mono text-[10px]" style={{ color: "#1e293b", letterSpacing: "0.15em" }}>
            © 연경당  2026
          </p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════
  //  캐릭터 선택 화면
  // ══════════════════════════════════════════
  if (screen === "character") {
    const selCat = CAT_TYPES.find(c => c.id === selectedCat)!;

    return (
      <div
        className="min-h-screen flex flex-col relative overflow-hidden"
        style={{ background: "#07071a" }}
      >
        <style>{`
          @keyframes selectGlow {
            0%,100% { box-shadow: 0 0 0 2px #f59e0b, 0 0 16px #f59e0b44; }
            50%      { box-shadow: 0 0 0 2px #f59e0b, 0 0 28px #f59e0baa; }
          }
          .selected-card { animation: selectGlow 1.8s ease-in-out infinite; }
        `}</style>

        {/* 배경 그리드 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        {/* 헤더 */}
        <div className="relative z-10 flex items-center justify-between px-4 pt-12 pb-4">
          <button
            onClick={() => setScreen("title")}
            className="font-mono text-xs tracking-widest px-3 py-1.5 rounded"
            style={{ color: "#64748b", border: "1px solid #1e293b" }}
          >
            ← BACK
          </button>
          <p
            className="font-mono font-bold tracking-widest uppercase"
            style={{ color: "#f59e0b", fontSize: "13px", letterSpacing: "0.25em" }}
          >
            PLAYER  SELECT
          </p>
          <div
            className="flex items-center gap-1 px-3 py-1 rounded"
            style={{ border: "1px solid rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.06)" }}
          >
            <span className="text-xs">🪙</span>
            <span className="font-mono font-bold text-xs tabular-nums" style={{ color: "#f59e0b" }}>
              {profile?.coins ?? 0}
            </span>
          </div>
        </div>

        {/* 캐릭터 그리드 */}
        <div className="relative z-10 grid grid-cols-2 gap-3 px-4 mb-4">
          {CAT_TYPES.map(cat => {
            const unlocked = isCatUnlocked(cat.id);
            const selected = selectedCat === cat.id;
            return (
              <div key={cat.id} className="flex flex-col">
                <button
                  onClick={() => unlocked && setSelectedCat(cat.id as CatId)}
                  disabled={!unlocked}
                  className={`rounded-xl p-4 flex flex-col items-center gap-2 transition-all duration-150 ${selected ? "selected-card" : ""}`}
                  style={{
                    background: selected
                      ? "rgba(245,158,11,0.1)"
                      : unlocked
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(255,255,255,0.02)",
                    border: selected
                      ? "1px solid #f59e0b"
                      : "1px solid rgba(255,255,255,0.08)",
                    opacity: !unlocked ? 0.45 : 1,
                  }}
                >
                  <span className={`text-4xl ${!unlocked ? "grayscale" : ""}`}>{cat.emoji}</span>
                  <div className="text-center">
                    <p
                      className="font-mono font-bold text-xs tracking-wider"
                      style={{ color: selected ? "#f59e0b" : "#94a3b8" }}
                    >
                      {cat.name}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: "#475569" }}>
                      {cat.desc}
                    </p>
                  </div>
                  {!unlocked && (
                    <span
                      className="font-mono text-[9px] tracking-wider px-2 py-0.5 rounded"
                      style={{ background: "rgba(255,255,255,0.06)", color: "#475569" }}
                    >
                      🔒 {getUnlockHint(cat.id)}
                    </span>
                  )}
                  {selected && (
                    <span
                      className="font-mono text-[9px] tracking-widest"
                      style={{ color: "#f59e0b" }}
                    >
                      ── SELECTED ──
                    </span>
                  )}
                </button>

                {/* 아비시니안 해금 버튼 */}
                {cat.id === "abyssinian" && !isCatUnlocked(cat.id) && (
                  <button
                    onClick={handleUnlockAbyssinian}
                    disabled={buying === "cat_abyssinian" || (profile?.coins ?? 0) < 50}
                    className="mt-1.5 py-2 rounded-lg font-mono text-xs tracking-wider disabled:opacity-30 transition-all active:scale-95"
                    style={{
                      background: "rgba(245,158,11,0.15)",
                      border: "1px solid rgba(245,158,11,0.4)",
                      color: "#f59e0b",
                    }}
                  >
                    {buying === "cat_abyssinian" ? "처리 중..." : "🪙 50 UNLOCK"}
                  </button>
                )}
                {/* 봄동비빔밥 해금 버튼 */}
                {cat.id === "bomdong" && !isCatUnlocked(cat.id) && (
                  <button
                    onClick={handleUnlockBomdong}
                    disabled={buying === "cat_bomdong" || (profile?.coins ?? 0) < 80}
                    className="mt-1.5 py-2 rounded-lg font-mono text-xs tracking-wider disabled:opacity-30 transition-all active:scale-95"
                    style={{
                      background: "rgba(34,197,94,0.15)",
                      border: "1px solid rgba(34,197,94,0.4)",
                      color: "#22c55e",
                    }}
                  >
                    {buying === "cat_bomdong" ? "처리 중..." : "🪙 80 UNLOCK"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* 선택 캐릭터 정보 패널 */}
        <div
          className="relative z-10 mx-4 mb-4 p-4 rounded-xl"
          style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl">{selCat.emoji}</span>
            <div className="flex-1">
              <p className="font-mono font-bold text-sm tracking-wider" style={{ color: "#f59e0b" }}>
                {selCat.name.toUpperCase()}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "#94a3b8" }}>{selCat.detail}</p>
            </div>
            <div
              className="font-mono text-xs px-2 py-1 rounded"
              style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b", letterSpacing: "0.1em" }}
            >
              {selCat.desc}
            </div>
          </div>
          {/* 조작법 */}
          <div className="mt-3 pt-3 grid grid-cols-2 gap-x-4 gap-y-1" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            {[
              ["📱 드래그", "이동"],
              ["💨 스페이스 / 버튼", "대시"],
              ["⚔️ 자동", "공격"],
              ["🔥 5웨이브", "보스 등장"],
            ].map(([k, v]) => (
              <p key={k} className="text-[10px] font-mono" style={{ color: "#475569" }}>
                <span style={{ color: "#64748b" }}>{k} </span>{v}
              </p>
            ))}
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="relative z-10 px-4 pb-10 mt-auto">
          <button
            onClick={handleStart}
            disabled={!isCatUnlocked(selectedCat)}
            className="w-full py-4 rounded-xl font-mono font-black tracking-widest uppercase text-base disabled:opacity-30 transition-all active:scale-95"
            style={{
              background: "linear-gradient(135deg, #d97706, #f59e0b)",
              color: "#07071a",
              letterSpacing: "0.25em",
              boxShadow: "0 0 24px rgba(245,158,11,0.35)",
            }}
          >
            ▶  GAME  START
          </button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════
  //  상점 화면
  // ══════════════════════════════════════════
  const shopByCategory = SHOP_ITEMS.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, typeof SHOP_ITEMS[number][]>);

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{ background: "#07071a" }}
    >
      {/* 배경 그리드 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* 헤더 */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-12 pb-5">
        <button
          onClick={() => setScreen("title")}
          className="font-mono text-xs tracking-widest px-3 py-1.5 rounded"
          style={{ color: "#64748b", border: "1px solid #1e293b" }}
        >
          ← BACK
        </button>
        <p
          className="font-mono font-bold tracking-widest"
          style={{ color: "#f59e0b", fontSize: "15px", letterSpacing: "0.3em" }}
        >
          S H O P
        </p>
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded"
          style={{ border: "1px solid rgba(245,158,11,0.4)", background: "rgba(245,158,11,0.08)" }}
        >
          <span className="text-sm">🪙</span>
          <span className="font-mono font-bold text-sm tabular-nums" style={{ color: "#f59e0b" }}>
            {profile?.coins ?? 0}
          </span>
        </div>
      </div>

      {/* 아이템 목록 */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 pb-10">
        {loading ? (
          <div className="py-12 text-center font-mono text-xs tracking-widest" style={{ color: "#1e293b" }}>
            LOADING...
          </div>
        ) : (
          <div className="space-y-5">
            {(["hp", "attack", "util", "special"] as const).map(cat => {
              const items = shopByCategory[cat] ?? [];
              if (!items.length) return null;
              return (
                <div key={cat}>
                  {/* 카테고리 구분선 */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.06)" }} />
                    <p
                      className="font-mono text-[10px] tracking-widest uppercase"
                      style={{ color: "#475569" }}
                    >
                      {CATEGORY_LABEL[cat]}
                    </p>
                    <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.06)" }} />
                  </div>

                  <div className="space-y-2">
                    {items.map(item => {
                      const bought   = purchases.includes(item.id);
                      const locked   = !!item.requires && !purchases.includes(item.requires);
                      const noCoins  = (profile?.coins ?? 0) < item.cost;
                      const disabled = bought || locked || buying === item.id;

                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 px-3 py-3 rounded-xl"
                          style={{
                            background: bought
                              ? "rgba(52,211,153,0.05)"
                              : "rgba(255,255,255,0.03)",
                            border: bought
                              ? "1px solid rgba(52,211,153,0.2)"
                              : "1px solid rgba(255,255,255,0.06)",
                            opacity: locked ? 0.45 : 1,
                          }}
                        >
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0"
                            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                          >
                            {item.emoji}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-mono font-bold text-xs tracking-wider" style={{ color: "#cbd5e1" }}>
                              {item.name}
                            </p>
                            <p className="text-[10px] mt-0.5" style={{ color: "#475569" }}>
                              {item.description}
                            </p>
                            {locked && (
                              <p className="font-mono text-[9px] mt-0.5" style={{ color: "#92400e" }}>
                                선행 구매 필요: {SHOP_ITEMS.find(i => i.id === item.requires)?.name}
                              </p>
                            )}
                          </div>
                          <div className="shrink-0">
                            {bought ? (
                              <span className="font-mono text-xs tracking-wider" style={{ color: "#34d399" }}>
                                ✓ OK
                              </span>
                            ) : (
                              <button
                                onClick={() => handleBuyItem(item.id, item.cost)}
                                disabled={disabled || noCoins}
                                className="px-3 py-1.5 rounded-lg font-mono text-xs font-bold tracking-wider disabled:opacity-30 transition-all active:scale-95"
                                style={{
                                  background: locked || noCoins
                                    ? "rgba(255,255,255,0.05)"
                                    : "rgba(245,158,11,0.2)",
                                  border: locked || noCoins
                                    ? "1px solid rgba(255,255,255,0.08)"
                                    : "1px solid rgba(245,158,11,0.5)",
                                  color: locked || noCoins ? "#374151" : "#f59e0b",
                                }}
                              >
                                {buying === item.id ? "..." : `🪙${item.cost}`}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
