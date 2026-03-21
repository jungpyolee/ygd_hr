"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getMyGameProfile,
  getMyPurchases,
  getMyUpgradeLevels,
  buyShopUpgrade,
  getUpgradeCost,
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
    svg: "/cats/persian.svg",
    desc: "균형형",
    detail: "기본 스탯 · 무난한 시작",
    unlockCondition: "always" as const,
    getStatBonuses: () => ({ hpBonus: 0, damageMulti: 1.0, moveSpeedMulti: 1.0 }),
  },
  {
    id: "scottish",
    name: "스코티시폴드",
    emoji: "😺",
    svg: "/cats/scottish.svg",
    desc: "탱커형",
    detail: "HP +40 · 이동속도 -10%",
    unlockCondition: "play5" as const,
    getStatBonuses: () => ({ hpBonus: 40, damageMulti: 1.0, moveSpeedMulti: 0.9 }),
  },
  {
    id: "abyssinian",
    name: "아비시니안",
    emoji: "😸",
    svg: "/cats/abyssinian.svg",
    desc: "스피드형",
    detail: "이동속도 +20% · HP -20",
    unlockCondition: "coins50" as const,
    getStatBonuses: () => ({ hpBonus: -20, damageMulti: 1.0, moveSpeedMulti: 1.2 }),
  },
  {
    id: "munchkin",
    name: "먼치킨",
    emoji: "🐈",
    svg: "/cats/munchkin.svg",
    desc: "서포터형",
    detail: "EXP +30% · 투사체 2개",
    unlockCondition: "wave30" as const,
    getStatBonuses: () => ({ hpBonus: 0, damageMulti: 1.0, moveSpeedMulti: 1.0 }),
  },
  {
    id: "doujeonku",
    name: "두쫀쿠",
    emoji: "🍘",
    svg: "/cats/doujeonku.svg",
    desc: "탱커반격형",
    detail: "HP +50 · 피해 누적 시 자동 반격",
    unlockCondition: "play15" as const,
    getStatBonuses: () => ({ hpBonus: 50, damageMulti: 1.1, moveSpeedMulti: 0.85 }),
  },
  {
    id: "bomdong",
    name: "봄동비빔밥",
    emoji: "🥗",
    svg: "/cats/bomdong.svg",
    desc: "시너지형",
    detail: "무기 슬롯 +1 · 2종 무기로 시작",
    unlockCondition: "weapons4" as const,
    getStatBonuses: () => ({ hpBonus: 0, damageMulti: 1.0, moveSpeedMulti: 1.0 }),
  },
  {
    id: "buttertteok",
    name: "버터떡",
    emoji: "🧈",
    svg: "/cats/buttertteok.svg",
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

// 캐릭터별 tint 색상 (WhiteCat 스프라이트 마스크 적용)
const CAT_TINT: Record<string, string> = {
  persian:     "#ffffff",
  scottish:    "#aabbcc",
  abyssinian:  "#d4884a",
  munchkin:    "#fff0dd",
  doujeonku:   "#3d2b1f",
  bomdong:     "#7db249",
  buttertteok: "#fff4a3",
};

// 고양이 스프라이트 (mask-image 기법으로 tint 적용)
function CatSprite({
  catId,
  sheet = "Idle",
  size = 64,
  frame = 0,
  animated = false,
  grayscale = false,
}: {
  catId: string;
  sheet?: "Idle" | "Run";
  size?: number;
  frame?: number;
  animated?: boolean;
  grayscale?: boolean;
}) {
  const frames = sheet === "Run" ? 6 : 6;
  const animStyle = animated
    ? { animation: `catFrames${frames} ${sheet === "Run" ? "0.6s" : "0.8s"} steps(${frames}) infinite` }
    : {};
  return (
    <div
      style={{
        width: size,
        height: size,
        maskImage: `url('/game/WhiteCat${sheet}.png')`,
        WebkitMaskImage: `url('/game/WhiteCat${sheet}.png')`,
        maskSize: `${size}px ${size * frames}px`,
        WebkitMaskSize: `${size}px ${size * frames}px`,
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: animated ? `0 0` : `0 ${-size * frame}px`,
        WebkitMaskPosition: animated ? `0 0` : `0 ${-size * frame}px`,
        backgroundColor: grayscale ? "#555" : (CAT_TINT[catId] ?? "#ffffff"),
        imageRendering: "pixelated",
        ...animStyle,
      }}
    />
  );
}

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

  const [screen, setScreen]               = useState<Screen>("title");
  const [profile, setProfile]             = useState<GameProfileData | null>(null);
  const [purchases, setPurchases]         = useState<string[]>([]);        // 캐릭터 해금
  const [upgradeLevels, setUpgradeLevels] = useState<Record<string, number>>({}); // 상점 강화
  const [selectedCat, setSelectedCat]     = useState<CatId>("persian");
  const [started, setStarted]             = useState(false);
  const [loading, setLoading]             = useState(true);
  const [buying, setBuying]               = useState<string | null>(null);
  const [gameConfig, setGameConfig]       = useState<GameConfig | null>(null);
  const [menuIdx, setMenuIdx]             = useState(0);
  const [blink, setBlink]                 = useState(true);
  const [detailOpen, setDetailOpen]       = useState(false);

  // 데이터 로드
  function refreshData() {
    return Promise.all([getMyGameProfile(), getMyPurchases(), getMyUpgradeLevels()])
      .then(([prof, purch, upgrades]) => {
        setProfile(prof);
        setPurchases(purch);
        setUpgradeLevels(upgrades);
      });
  }

  useEffect(() => {
    refreshData().finally(() => setLoading(false));
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
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (menuIdx === 0) setScreen("character");
        else if (menuIdx === 1) setScreen("shop");
        else router.back();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [started, screen, menuIdx, router]);

  // 캐릭터 선택 키보드 내비게이션
  useEffect(() => {
    if (started || screen !== "character") return;
    const catIds = CAT_TYPES.map(c => c.id) as CatId[];
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setDetailOpen(false); return; }
      const cur = catIds.indexOf(selectedCat);
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedCat(catIds[(cur + 1) % catIds.length]);
        setDetailOpen(true);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedCat(catIds[(cur - 1 + catIds.length) % catIds.length]);
        setDetailOpen(true);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (!detailOpen) { setDetailOpen(true); return; }
        if (isCatUnlocked(selectedCat)) handleStart();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, screen, selectedCat, detailOpen]);

  // ─── 캐릭터 해금 체크 ────────────────────
  function isCatUnlocked(catId: string): boolean {
    if (catId === "persian")     return true;
    if (catId === "scottish")    return (profile?.play_count ?? 0) >= 5;
    if (catId === "abyssinian")  return purchases.includes("cat_abyssinian");
    if (catId === "munchkin")    return (profile?.highest_wave ?? 0) >= 30;
    if (catId === "doujeonku")   return (profile?.play_count ?? 0) >= 15;
    if (catId === "bomdong")     return purchases.includes("cat_bomdong");
    if (catId === "buttertteok") return (profile?.best_run_score ?? 0) >= 200000;
    return false;
  }

  function getUnlockHint(catId: string): string {
    if (catId === "scottish")    return `플레이 ${profile?.play_count ?? 0}/5판`;
    if (catId === "abyssinian")  return "🪙 50코인";
    if (catId === "munchkin")    return `최고 웨이브 ${profile?.highest_wave ?? 0}/30`;
    if (catId === "doujeonku")   return `플레이 ${profile?.play_count ?? 0}/15판`;
    if (catId === "bomdong")     return "🪙 80코인";
    if (catId === "buttertteok") return `최고 점수 ${(profile?.best_run_score ?? 0).toLocaleString()}/200,000`;
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

  // ─── 상점 아이템 강화 ─────────────────────
  async function handleUpgradeItem(itemId: string) {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;
    const currentLevel = upgradeLevels[itemId] ?? 0;
    if (currentLevel >= item.maxLevel) return;
    const cost = getUpgradeCost(item, currentLevel);

    setBuying(itemId);
    const result = await buyShopUpgrade(itemId, currentLevel, cost);
    if (result.ok) {
      setUpgradeLevels(prev => ({ ...prev, [itemId]: currentLevel + 1 }));
      setProfile(prev => prev ? { ...prev, coins: prev.coins - cost } : prev);
      const nextLv = currentLevel + 1;
      toast.success(`${item.name} Lv.${nextLv} 강화 완료!`);
    } else if (result.reason === "코인 부족") {
      toast.error("코인이 부족해요.");
    } else {
      toast.error(`강화 실패: ${result.reason}`);
    }
    setBuying(null);
  }

  // ─── GameConfig 빌드 (레벨 기반 누적) ────────
  function buildGameConfig(): GameConfig {
    const catDef   = CAT_TYPES.find(c => c.id === selectedCat);
    const catBonus = catDef?.getStatBonuses() ?? { hpBonus: 0, damageMulti: 1.0, moveSpeedMulti: 1.0 };
    const lv = (id: string) => upgradeLevels[id] ?? 0;

    return {
      catType: selectedCat as GameConfig["catType"],
      buffs: {
        hpBonus:          catBonus.hpBonus + lv("hp_up") * 20,
        damageMulti:      catBonus.damageMulti * Math.pow(1.15, lv("atk_up")),
        attackSpeedMulti: Math.pow(1.12, lv("atkspd_up")),
        moveSpeedMulti:   catBonus.moveSpeedMulti * Math.pow(1.12, lv("move_up")),
        expMulti:         selectedCat === "munchkin" ? 1.3 : 1.0,
        coinPickupRange:  60 * (1 + lv("coin_magnet") * 0.4),
        coinDropBonus:    Math.min(lv("luck") * 0.10, 0.6),
        hasRevive:        lv("revive") >= 1,
        hasPiercing:      lv("pierce") >= 1,
        startProjectiles: selectedCat === "munchkin" ? 2 : 1,
        healMulti:        Math.pow(1.25, lv("heal_boost")),
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
    refreshData().catch(() => {});
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
          @keyframes catFrames6 {
            from { -webkit-mask-position: 0 0; mask-position: 0 0; }
            to   { -webkit-mask-position: 0 -${96*6}px; mask-position: 0 -${96*6}px; }
          }
          @keyframes catWalk {
            0%   { transform: translateX(-50px) scaleX(1); }
            48%  { transform: translateX(50px) scaleX(1); }
            50%  { transform: translateX(50px) scaleX(-1); }
            98%  { transform: translateX(-50px) scaleX(-1); }
            100% { transform: translateX(-50px) scaleX(1); }
          }
          .title-pulse { animation: titlePulse 2.4s ease-in-out infinite; }
          .bg-deco     { animation: floatY 4s ease-in-out infinite; }
          .cat-walk    { animation: catWalk 3s linear infinite; }
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
          {/* 걷는 고양이 */}
          <div className="mb-4 cat-walk" style={{ filter: "drop-shadow(0 0 12px rgba(245,158,11,0.5))" }}>
            <CatSprite catId={selectedCat} sheet="Run" size={96} animated />
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
    const selUnlocked = isCatUnlocked(selectedCat);
    const stats = selCat.getStatBonuses();

    return (
      <div className="h-screen flex flex-col overflow-hidden relative" style={{ background: "#07071a" }}>
        <style>{`
          @keyframes catFrames6 {
            from { -webkit-mask-position: 0 0; mask-position: 0 0; }
            to   { -webkit-mask-position: 0 -${96*6}px; mask-position: 0 -${96*6}px; }
          }
          @keyframes slideInRight {
            from { transform: translateX(32px); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
          }
          @keyframes fadeUp {
            from { transform: translateY(10px); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
          .detail-enter { animation: slideInRight 0.32s cubic-bezier(0.22,1,0.36,1) both; }
          .fadeup       { animation: fadeUp 0.28s cubic-bezier(0.22,1,0.36,1) both; }
        `}</style>

        {/* 배경 그리드 */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />

        {/* 헤더 */}
        <div className="relative z-10 flex items-center justify-between px-4 pt-12 pb-3 shrink-0">
          <button
            onClick={() => { if (detailOpen) { setDetailOpen(false); } else { setScreen("title"); } }}
            className="font-mono text-xs tracking-widest px-3 py-1.5 rounded"
            style={{ color: "#64748b", border: "1px solid #1e293b" }}
          >
            ← {detailOpen ? "목록" : "BACK"}
          </button>
          <p className="font-mono font-bold tracking-widest uppercase"
            style={{ color: "#f59e0b", fontSize: "13px", letterSpacing: "0.25em" }}>
            PLAYER  SELECT
          </p>
          <div className="flex items-center gap-1 px-3 py-1 rounded"
            style={{ border: "1px solid rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.06)" }}>
            <span className="text-xs">🪙</span>
            <span className="font-mono font-bold text-xs tabular-nums" style={{ color: "#f59e0b" }}>{profile?.coins ?? 0}</span>
          </div>
        </div>

        {/* 본문 — 슬라이딩 패널 */}
        <div className="relative z-10 flex flex-1 overflow-hidden">

          {/* ── 캐릭터 그리드 (좌측) ── */}
          <div
            className="overflow-y-auto shrink-0 transition-all duration-350 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ width: detailOpen ? "42%" : "100%", paddingLeft: 16, paddingRight: detailOpen ? 8 : 16, paddingTop: 4, paddingBottom: 24 }}
          >
            <div className={`grid gap-2 ${detailOpen ? "grid-cols-1" : "grid-cols-2"}`}>
              {CAT_TYPES.map(cat => {
                const unlocked = isCatUnlocked(cat.id);
                const selected = selectedCat === cat.id;
                return (
                  <div key={cat.id} className="flex flex-col gap-1">
                    <button
                      onClick={() => {
                        if (!unlocked && cat.id !== "abyssinian" && cat.id !== "bomdong") return;
                        setSelectedCat(cat.id as CatId);
                        setDetailOpen(true);
                      }}
                      className="rounded-xl transition-all duration-200 active:scale-95 flex items-center gap-2"
                      style={{
                        padding: detailOpen ? "8px 10px" : "12px",
                        flexDirection: detailOpen ? "row" : "column",
                        background: selected ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.04)",
                        border: selected ? "1px solid rgba(245,158,11,0.7)" : "1px solid rgba(255,255,255,0.07)",
                        opacity: !unlocked ? 0.45 : 1,
                        boxShadow: selected ? "0 0 12px rgba(245,158,11,0.25)" : "none",
                      }}
                    >
                      <CatSprite catId={cat.id} sheet="Idle" size={detailOpen ? 32 : 56} animated={selected} grayscale={!unlocked} />
                      {detailOpen ? (
                        <span className="font-mono text-[11px] font-bold truncate" style={{ color: selected ? "#f59e0b" : "#94a3b8" }}>
                          {cat.name}
                        </span>
                      ) : (
                        <div className="text-center">
                          <p className="font-mono font-bold text-xs" style={{ color: selected ? "#f59e0b" : "#94a3b8" }}>{cat.name}</p>
                          <p className="text-[10px] mt-0.5" style={{ color: "#475569" }}>{cat.desc}</p>
                        </div>
                      )}
                    </button>
                    {/* 해금 버튼 (그리드 모드에서만) */}
                    {!detailOpen && cat.id === "abyssinian" && !isCatUnlocked(cat.id) && (
                      <button onClick={handleUnlockAbyssinian} disabled={buying === "cat_abyssinian" || (profile?.coins ?? 0) < 50}
                        className="py-1.5 rounded-lg font-mono text-[10px] tracking-wider disabled:opacity-30 transition-all active:scale-95"
                        style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)", color: "#f59e0b" }}>
                        {buying === "cat_abyssinian" ? "..." : "🪙 50 UNLOCK"}
                      </button>
                    )}
                    {!detailOpen && cat.id === "bomdong" && !isCatUnlocked(cat.id) && (
                      <button onClick={handleUnlockBomdong} disabled={buying === "cat_bomdong" || (profile?.coins ?? 0) < 80}
                        className="py-1.5 rounded-lg font-mono text-[10px] tracking-wider disabled:opacity-30 transition-all active:scale-95"
                        style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)", color: "#22c55e" }}>
                        {buying === "cat_bomdong" ? "..." : "🪙 80 UNLOCK"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 디테일 패널 (우측) ── */}
          <div
            className="flex flex-col overflow-hidden transition-all duration-350 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ width: detailOpen ? "58%" : "0%", opacity: detailOpen ? 1 : 0, paddingRight: 16 }}
          >
            {detailOpen && (
              <div key={selectedCat} className="detail-enter flex flex-col h-full pt-2 pb-6">
                {/* 캐릭터 스프라이트 */}
                <div className="flex flex-col items-center pt-4 pb-3">
                  <div style={{ filter: "drop-shadow(0 0 16px rgba(245,158,11,0.5))" }}>
                    <CatSprite catId={selCat.id} sheet="Idle" size={96} animated grayscale={!selUnlocked} />
                  </div>
                  <p className="font-mono font-black text-sm tracking-wider mt-2" style={{ color: "#f59e0b" }}>
                    {selCat.name}
                  </p>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded mt-1"
                    style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>
                    {selCat.desc}
                  </span>
                </div>

                {/* 스탯 */}
                <div className="fadeup mx-1 rounded-xl p-3 mb-3"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", animationDelay: "0.05s" }}>
                  <p className="text-[9px] font-mono tracking-widest mb-2" style={{ color: "#475569" }}>STATS</p>
                  {[
                    { label: "HP", val: stats.hpBonus, base: 100, isBonus: true },
                    { label: "ATK", val: Math.round((stats.damageMulti - 1) * 100), base: 0, isBonus: true },
                    { label: "SPD", val: Math.round((stats.moveSpeedMulti - 1) * 100), base: 0, isBonus: true },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex items-center gap-2 mb-1.5">
                      <span className="font-mono text-[9px] w-6 shrink-0" style={{ color: "#64748b" }}>{label}</span>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                        <div className="h-full rounded-full" style={{
                          width: `${Math.min(100, 50 + val * 1.5)}%`,
                          background: val > 0 ? "#22c55e" : val < 0 ? "#ef4444" : "#f59e0b",
                          transition: "width 0.4s ease",
                        }} />
                      </div>
                      <span className="font-mono text-[9px] w-8 text-right shrink-0" style={{ color: val > 0 ? "#22c55e" : val < 0 ? "#ef4444" : "#94a3b8" }}>
                        {val > 0 ? `+${val}` : val === 0 ? "±0" : val}
                        {label !== "HP" ? "%" : ""}
                      </span>
                    </div>
                  ))}
                </div>

                {/* 설명 */}
                <p className="fadeup text-[11px] text-center mx-1 mb-3 leading-relaxed"
                  style={{ color: "#64748b", animationDelay: "0.1s" }}>
                  {selCat.detail}
                </p>

                {/* 해금 버튼 or START */}
                <div className="mt-auto mx-1 fadeup" style={{ animationDelay: "0.15s" }}>
                  {!selUnlocked ? (
                    <>
                      <p className="text-center text-[10px] font-mono mb-2" style={{ color: "#475569" }}>
                        🔒 {getUnlockHint(selCat.id)}
                      </p>
                      {selCat.id === "abyssinian" && (
                        <button onClick={handleUnlockAbyssinian} disabled={buying === "cat_abyssinian" || (profile?.coins ?? 0) < 50}
                          className="w-full py-3 rounded-xl font-mono text-sm font-bold tracking-wider disabled:opacity-30 active:scale-95 transition-all"
                          style={{ background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.5)", color: "#f59e0b" }}>
                          {buying === "cat_abyssinian" ? "처리 중..." : "🪙 50 UNLOCK"}
                        </button>
                      )}
                      {selCat.id === "bomdong" && (
                        <button onClick={handleUnlockBomdong} disabled={buying === "cat_bomdong" || (profile?.coins ?? 0) < 80}
                          className="w-full py-3 rounded-xl font-mono text-sm font-bold tracking-wider disabled:opacity-30 active:scale-95 transition-all"
                          style={{ background: "rgba(34,197,94,0.2)", border: "1px solid rgba(34,197,94,0.5)", color: "#22c55e" }}>
                          {buying === "cat_bomdong" ? "처리 중..." : "🪙 80 UNLOCK"}
                        </button>
                      )}
                    </>
                  ) : (
                    <button onClick={handleStart}
                      className="w-full py-3.5 rounded-xl font-mono font-black tracking-widest uppercase text-sm active:scale-95 transition-all"
                      style={{ background: "linear-gradient(135deg, #d97706, #f59e0b)", color: "#07071a", letterSpacing: "0.2em", boxShadow: "0 0 20px rgba(245,158,11,0.4)" }}>
                      ▶  START
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
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
          U P G R A D E
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
                    <p className="font-mono text-[10px] tracking-widest uppercase" style={{ color: "#475569" }}>
                      {CATEGORY_LABEL[cat]}
                    </p>
                    <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.06)" }} />
                  </div>

                  <div className="space-y-2">
                    {items.map(item => {
                      const currentLv = upgradeLevels[item.id] ?? 0;
                      const maxed     = currentLv >= item.maxLevel;
                      const cost      = getUpgradeCost(item, currentLv);
                      const noCoins   = (profile?.coins ?? 0) < cost;
                      const isLoading = buying === item.id;

                      // 레벨 바 (최대 5칸 표시, maxLevel=1은 1칸)
                      const barCells  = Math.min(item.maxLevel, 5);
                      const filledCells = Math.min(currentLv, barCells);

                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 px-3 py-3 rounded-xl"
                          style={{
                            background: maxed
                              ? "rgba(52,211,153,0.05)"
                              : currentLv > 0
                              ? "rgba(245,158,11,0.05)"
                              : "rgba(255,255,255,0.03)",
                            border: maxed
                              ? "1px solid rgba(52,211,153,0.25)"
                              : currentLv > 0
                              ? "1px solid rgba(245,158,11,0.2)"
                              : "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          {/* 이모지 */}
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0"
                            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                          >
                            {item.emoji}
                          </div>

                          {/* 이름 + 효과 + 레벨바 */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-mono font-bold text-xs tracking-wider" style={{ color: "#cbd5e1" }}>
                                {item.name}
                              </p>
                              {currentLv > 0 && (
                                <span
                                  className="font-mono text-[9px] px-1.5 py-0.5 rounded"
                                  style={{
                                    background: maxed ? "rgba(52,211,153,0.15)" : "rgba(245,158,11,0.15)",
                                    color: maxed ? "#34d399" : "#f59e0b",
                                  }}
                                >
                                  Lv.{currentLv}{maxed && item.maxLevel <= 5 ? " MAX" : ""}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] mt-0.5" style={{ color: "#475569" }}>
                              {item.effectPerLevel}
                              {item.maxLevel > 1 && currentLv > 0 && (
                                <span style={{ color: "#f59e0b" }}> (×{currentLv} 적용 중)</span>
                              )}
                            </p>
                            {/* 레벨 바 (maxLevel <= 5인 경우만 표시) */}
                            {item.maxLevel <= 5 && (
                              <div className="flex gap-1 mt-1.5">
                                {Array.from({ length: barCells }).map((_, i) => (
                                  <div
                                    key={i}
                                    className="h-1 rounded-full flex-1"
                                    style={{
                                      background: i < filledCells
                                        ? (maxed ? "#34d399" : "#f59e0b")
                                        : "rgba(255,255,255,0.1)",
                                    }}
                                  />
                                ))}
                              </div>
                            )}
                          </div>

                          {/* 강화 버튼 */}
                          <div className="shrink-0">
                            {maxed ? (
                              <span className="font-mono text-xs tracking-wider" style={{ color: "#34d399" }}>
                                ✓ MAX
                              </span>
                            ) : (
                              <button
                                onClick={() => handleUpgradeItem(item.id)}
                                disabled={isLoading || noCoins}
                                className="flex flex-col items-center px-3 py-1.5 rounded-lg font-mono font-bold tracking-wider disabled:opacity-30 transition-all active:scale-95"
                                style={{
                                  background: noCoins ? "rgba(255,255,255,0.05)" : "rgba(245,158,11,0.2)",
                                  border: noCoins ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(245,158,11,0.5)",
                                  color: noCoins ? "#374151" : "#f59e0b",
                                  minWidth: "52px",
                                }}
                              >
                                <span className="text-[9px] opacity-60">
                                  {currentLv === 0 ? "구매" : "강화"}
                                </span>
                                <span className="text-xs">
                                  {isLoading ? "..." : `🪙${cost}`}
                                </span>
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
