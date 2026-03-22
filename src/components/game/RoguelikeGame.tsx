"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { GameRunPayload } from "@/lib/game/api";
import { saveGameRun, getLeaderboard } from "@/lib/game/api";
import { createClient } from "@/lib/supabase";
import type { UpgradeOption, GameStats, GameConfig } from "@/lib/game/scenes/GameScene";
import { GAME_EVENTS } from "@/lib/game/scenes/GameScene";

interface Props {
  onClose: () => void;
  gameConfig?: GameConfig;
}

type Phase = "countdown" | "playing" | "levelup" | "gameover" | "gameclear";

interface LeaderboardEntry {
  user_id: string;
  total_score: number;
  best_run_score: number;
  highest_wave: number;
  profiles: { name: string; color_hex: string | null };
}

function fmtScore(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}
interface LeaderboardData {
  scores: LeaderboardEntry[];
}

export default function RoguelikeGame({ onClose, gameConfig }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gameRef  = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sceneRef = useRef<any>(null);

  const [phase, setPhase]         = useState<Phase>("countdown");
  const [countdown, setCountdown] = useState(3);
  const [stats, setStats]         = useState<GameStats | null>(null);
  const [upgradeOptions, setUpgradeOptions] = useState<UpgradeOption[]>([]);
  const [upgradeIdx, setUpgradeIdx]         = useState(0);
  const [runResult, setRunResult] = useState<GameRunPayload | null>(null);
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState(false);

  const [leaderboard, setLeaderboard]           = useState<LeaderboardData | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [myUserId, setMyUserId]                 = useState<string | null>(null);

  const [gameStarted, setGameStarted] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setMyUserId(data.user?.id ?? null));
  }, []);

  const [levelUpTimer, setLevelUpTimer] = useState(5);
  const levelUpTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── 카운트다운 ────────────────────────────
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown <= 0) {
      setGameStarted(true);
      setPhase("playing");
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // ─── Phaser 초기화 ───────────────────────
  useEffect(() => {
    if (!gameStarted || !containerRef.current) return;

    let game: import("phaser").Game;

    (async () => {
      const Phaser = await import("phaser");
      const { default: GameScene } = await import("@/lib/game/scenes/GameScene");

      const scene = new GameScene(gameConfig);

      game = new Phaser.Game({
        type: Phaser.AUTO,
        backgroundColor: "#1a1205",
        parent: containerRef.current!,
        scene: scene,
        scale: {
          mode: Phaser.Scale.RESIZE,
          width: "100%",
          height: "100%",
        },
        audio: { disableWebAudio: true },
      });
      gameRef.current = game;

      game.events.once("ready", () => {
        const s = game.scene.getScene("GameScene") as InstanceType<typeof GameScene>;
        sceneRef.current = s;

        s.events.on(GAME_EVENTS.STATS_UPDATE, (st: GameStats) => {
          setStats(st);
        });

        s.events.on(GAME_EVENTS.LEVEL_UP, (opts: UpgradeOption[]) => {
          setUpgradeOptions(opts);
          setUpgradeIdx(0);
          setLevelUpTimer(5);
          setPhase("levelup");
        });

        s.events.on(GAME_EVENTS.GAME_OVER, (result: GameRunPayload) => {
          setRunResult(result);
          setPhase("gameover");
          setSaving(true);
          setSaveError(false);
          setLeaderboard(null);
          setLeaderboardLoading(true);
          saveGameRun(result)
            .catch(() => setSaveError(true))
            .finally(() => {
              setSaving(false);
              getLeaderboard()
                .then(data => setLeaderboard(data as LeaderboardData))
                .catch(() => {})
                .finally(() => setLeaderboardLoading(false));
            });
        });

        s.events.on(GAME_EVENTS.GAME_CLEAR, (result: GameRunPayload) => {
          setRunResult(result);
          setPhase("gameclear");
          setSaving(true);
          setSaveError(false);
          setLeaderboard(null);
          setLeaderboardLoading(true);
          saveGameRun(result)
            .catch(() => setSaveError(true))
            .finally(() => {
              setSaving(false);
              getLeaderboard()
                .then(data => setLeaderboard(data as LeaderboardData))
                .catch(() => {})
                .finally(() => setLeaderboardLoading(false));
            });
        });
      });
    })();

    return () => {
      game?.destroy(true);
      gameRef.current  = null;
      sceneRef.current = null;
    };
  }, [gameStarted]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 레벨업 5초 카운트다운 ──────────────────
  useEffect(() => {
    if (phase !== "levelup") {
      if (levelUpTimerRef.current) {
        clearInterval(levelUpTimerRef.current);
        levelUpTimerRef.current = null;
      }
      return;
    }

    levelUpTimerRef.current = setInterval(() => {
      setLevelUpTimer(t => {
        if (t <= 1) {
          if (upgradeOptions.length > 0) {
            const random = upgradeOptions[Math.floor(Math.random() * upgradeOptions.length)];
            handleUpgrade(random);
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => {
      if (levelUpTimerRef.current) clearInterval(levelUpTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, upgradeOptions]);

  // ─── 레벨업 키보드 선택 ──────────────────────
  useEffect(() => {
    if (phase !== "levelup") return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setUpgradeIdx(i => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setUpgradeIdx(i => Math.min(upgradeOptions.length - 1, i + 1));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (upgradeOptions[upgradeIdx]) handleUpgrade(upgradeOptions[upgradeIdx]);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, upgradeOptions, upgradeIdx]);

  // ─── 뒤로가기 인터셉트 (게임 중) ────────────
  useEffect(() => {
    if (phase !== "playing" && phase !== "levelup") return;
    history.pushState(null, "", window.location.href);
    const handlePopState = () => {
      history.pushState(null, "", window.location.href);
      sceneRef.current?.scene?.pause?.();
      setShowExitConfirm(true);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [phase]);

  // ─── 레벨업 선택 ───────────────────────────
  const handleUpgrade = useCallback((option: UpgradeOption) => {
    if (levelUpTimerRef.current) {
      clearInterval(levelUpTimerRef.current);
      levelUpTimerRef.current = null;
    }
    sceneRef.current?.applyUpgrade(option);
    setPhase("playing");
  }, []);

  // ─── 저장 재시도 ──────────────────────────
  const handleRetrySave = useCallback(async () => {
    if (!runResult) return;
    setSaving(true);
    setSaveError(false);
    try {
      await saveGameRun(runResult);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }, [runResult]);

  // ─── UI ────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[9999] bg-[#1a1205] flex flex-col">

      {/* 카운트다운 */}
      {phase === "countdown" && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center">
            <p className="text-white/50 text-sm mb-3 tracking-widest uppercase">Get Ready</p>
            <p className="text-[#f59e0b] font-black" style={{ fontSize: "7rem", lineHeight: 1 }}>
              {countdown === 0 ? "GO!" : countdown}
            </p>
          </div>
        </div>
      )}

      {/* HUD */}
      {(phase === "playing" || phase === "levelup") && stats && (
        <div className="absolute top-2 left-2 z-10 pointer-events-none space-y-1">
          {/* HP 바 */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs leading-none">❤️</span>
            <div className="w-32 h-2 bg-black/40 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${(stats.hp / stats.maxHp) * 100}%`,
                  background: stats.hp / stats.maxHp > 0.5
                    ? "#22c55e"
                    : stats.hp / stats.maxHp > 0.25
                    ? "#f59e0b"
                    : "#ef4444",
                }}
              />
            </div>
            <span className="text-white/60 text-[10px] tabular-nums">{stats.hp}/{stats.maxHp}</span>
          </div>
          {/* EXP 바 */}
          <div className="flex items-center gap-1.5">
            <span className="text-[#f59e0b] text-[10px] font-bold w-7 shrink-0">Lv.{stats.level}</span>
            <div className="w-32 h-1.5 bg-black/40 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#f59e0b] rounded-full transition-all duration-300"
                style={{ width: `${(stats.exp / stats.expNext) * 100}%` }}
              />
            </div>
          </div>
          {/* 다음 보스까지 */}
          {!stats.boss && stats.nextBossIn > 0 && (
            <div className="text-red-400/80 text-[9px] tabular-nums font-medium">
              🔥 {stats.nextBossIn}웨이브 후 보스
            </div>
          )}
          {/* 스탯 */}
          <div className="grid grid-cols-2 gap-0.5 pt-0.5">
            {[
              { icon: "🌊", label: `웨이브 ${stats.wave}` },
              { icon: "💀", label: `${stats.kills}킬` },
              { icon: "⏱", label: `${Math.floor(stats.elapsed / 60)}:${String(stats.elapsed % 60).padStart(2, "0")}` },
              { icon: "🏆", label: stats.score.toLocaleString() },
              { icon: "🪙", label: `${stats.coins}` },
            ].map(({ icon, label }) => (
              <div key={icon} className="flex items-center gap-0.5 bg-black/50 rounded px-1.5 py-0.5">
                <span className="text-[10px] leading-none">{icon}</span>
                <span className="text-white text-[10px] font-medium tabular-nums">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 콤보 카운터 */}
      {(phase === "playing" || phase === "levelup") && stats && stats.combo >= 3 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none text-center">
          <p
            className="font-black tabular-nums tracking-tight"
            style={{
              fontSize: stats.combo >= 15 ? "28px" : stats.combo >= 8 ? "22px" : "18px",
              color: stats.combo >= 15 ? "#ff4500" : stats.combo >= 8 ? "#f59e0b" : "#facc15",
              textShadow: "0 0 12px rgba(255,150,0,0.7)",
            }}
          >
            {stats.combo >= 15 ? "🔥 FEVER!" : `${stats.combo} COMBO!`}
          </p>
        </div>
      )}

      {/* 대시 버튼 (모바일) */}
      {(phase === "playing") && (
        <button
          className="absolute right-8 z-20 w-14 h-14 rounded-full flex flex-col items-center justify-center select-none"
          style={{
            bottom: "110px",
            background: (stats?.dashCooldown ?? 0) > 0
              ? "rgba(255,255,255,0.08)"
              : "rgba(59,130,246,0.55)",
            border: "2px solid rgba(255,255,255,0.2)",
            boxShadow: (stats?.dashCooldown ?? 0) > 0 ? "none" : "0 0 12px rgba(59,130,246,0.4)",
          }}
          onTouchStart={e => { e.preventDefault(); sceneRef.current?.triggerDash(); }}
          onClick={() => sceneRef.current?.triggerDash()}
        >
          <span className="text-xl leading-none">💨</span>
          {(stats?.dashCooldown ?? 0) > 0 && (
            <span className="text-[10px] text-white/60 font-bold tabular-nums mt-0.5">
              {Math.ceil(stats!.dashCooldown)}s
            </span>
          )}
        </button>
      )}

      {/* 무기 슬롯 HUD */}
      {(phase === "playing" || phase === "levelup") && stats && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-end gap-1.5 pointer-events-none">
          {Array.from({ length: 4 }).map((_, i) => {
            const w = stats.weapons[i];
            return (
              <div
                key={i}
                className="flex flex-col items-center gap-0.5"
                style={{ opacity: w ? 1 : 0.25 }}
              >
                {/* 레벨 바 (5칸) */}
                <div className="flex gap-[2px]">
                  {Array.from({ length: 5 }).map((_, lv) => (
                    <div
                      key={lv}
                      className="w-3 h-1 rounded-sm"
                      style={{
                        background: w && lv < w.level
                          ? w.awakened ? "#fbbf24" : "#3b82f6"
                          : "rgba(255,255,255,0.15)",
                        boxShadow: w?.awakened && lv < (w?.level ?? 0) ? "0 0 4px #fbbf24" : undefined,
                      }}
                    />
                  ))}
                </div>
                {/* 무기 아이콘 */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                  style={{
                    background: w?.awakened
                      ? "linear-gradient(135deg, rgba(251,191,36,0.3), rgba(245,158,11,0.15))"
                      : "rgba(0,0,0,0.55)",
                    border: w?.awakened ? "1px solid rgba(251,191,36,0.6)" : "1px solid rgba(255,255,255,0.12)",
                    boxShadow: w?.awakened ? "0 0 8px rgba(251,191,36,0.4)" : undefined,
                  }}
                >
                  {w ? w.emoji : <span className="text-white/20 text-sm">+</span>}
                </div>
                {/* 레벨 텍스트 */}
                {w && (
                  <span
                    className="text-[9px] font-bold tabular-nums"
                    style={{ color: w.awakened ? "#fbbf24" : "rgba(255,255,255,0.5)" }}
                  >
                    {w.awakened ? "각성" : `Lv.${w.level}`}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 보스 HP 바 */}
      {(phase === "playing" || phase === "levelup") && stats?.boss && (
        <div className="absolute bottom-24 left-4 right-4 z-10 pointer-events-none">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{stats.boss.emoji}</span>
            <span className="text-white font-black text-sm">{stats.boss.name}</span>
            <span className="text-white/50 text-xs ml-auto tabular-nums">
              {stats.boss.hp}/{stats.boss.maxHp}
            </span>
          </div>
          <div className="h-3 bg-black/60 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{
                width: `${(stats.boss.hp / stats.boss.maxHp) * 100}%`,
                background: "linear-gradient(90deg, #ef4444, #f59e0b)",
              }}
            />
          </div>
        </div>
      )}

      {/* Phaser 캔버스 */}
      <div ref={containerRef} className="w-full h-full" />

      {/* 닫기 버튼 */}
      {(phase === "playing" || phase === "levelup") && (
        <button
          onClick={() => {
            sceneRef.current?.scene?.pause?.();
            setShowExitConfirm(true);
          }}
          className="absolute top-3 right-3 z-30 w-8 h-8 rounded-full bg-black/60 text-white/70 text-sm flex items-center justify-center"
        >
          ✕
        </button>
      )}

      {/* 종료 확인 모달 */}
      {showExitConfirm && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.75)" }}
        >
          <div
            className="w-72 rounded-2xl p-6 flex flex-col items-center gap-4"
            style={{ background: "#1a1a2e", border: "1px solid rgba(245,158,11,0.3)" }}
          >
            <p className="text-2xl">⏸️</p>
            <div className="text-center">
              <p className="text-white font-bold text-base mb-1">게임을 종료할까요?</p>
              <p className="text-white/50 text-xs">지금까지의 기록은 저장되지 않아요</p>
            </div>
            <div className="flex gap-2 w-full">
              <button
                onClick={() => {
                  sceneRef.current?.scene?.resume?.();
                  setShowExitConfirm(false);
                }}
                className="flex-1 py-3 rounded-xl font-bold text-sm"
                style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}
              >
                계속하기
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl font-bold text-sm"
                style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)", color: "#fff" }}
              >
                종료하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 레벨업 모달 ── */}
      {phase === "levelup" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.75)" }}
        >
          <div className="w-full px-4 max-w-lg">
            <div className="text-center mb-5">
              <p className="text-[#f59e0b] text-xs font-bold tracking-widest uppercase mb-1">Level Up!</p>
              <p className="text-white text-2xl font-black mb-1">업그레이드 선택</p>
              <div className="flex items-center justify-center gap-2 mt-2">
                <div className="w-32 h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#f59e0b] rounded-full transition-all duration-1000"
                    style={{ width: `${(levelUpTimer / 5) * 100}%` }}
                  />
                </div>
                <span className="text-white/50 text-xs tabular-nums">{levelUpTimer}초</span>
              </div>
            </div>

            <div className={`grid gap-3 ${
  upgradeOptions.length >= 3
    ? "grid-cols-3"
    : upgradeOptions.length === 2
    ? "grid-cols-2 max-w-xs mx-auto w-full"
    : "grid-cols-1 max-w-[180px] mx-auto w-full"
}`}>
              {upgradeOptions.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => handleUpgrade(opt)}
                  className="group flex flex-col items-center gap-2 rounded-2xl p-4 text-center transition-all duration-150 active:scale-95"
                  style={{
                    background: i === upgradeIdx
                      ? "linear-gradient(160deg, rgba(245,158,11,0.25), rgba(245,158,11,0.1))"
                      : "linear-gradient(160deg, rgba(245,158,11,0.12), rgba(245,158,11,0.04))",
                    border: i === upgradeIdx ? "1px solid rgba(245,158,11,0.7)" : "1px solid rgba(255,255,255,0.1)",
                    boxShadow: i === upgradeIdx ? "0 0 16px rgba(245,158,11,0.3), 0 4px 24px rgba(0,0,0,0.4)" : "0 4px 24px rgba(0,0,0,0.4)",
                  }}
                >
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center text-3xl"
                    style={{ background: "rgba(245,158,11,0.15)" }}
                  >
                    {opt.emoji}
                  </div>
                  <p className="text-white font-bold text-xs leading-tight">{opt.label}</p>
                  <p className="text-white/45 text-[10px] leading-snug">{opt.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 게임 클리어 모달 ── */}
      {phase === "gameclear" && runResult && (
        <div className="absolute inset-0 z-20 overflow-y-auto"
          style={{ background: "rgba(0,0,0,0.92)" }}
        >
          <div className="min-h-full flex items-start justify-center py-8 px-4">
            <div className="w-full max-w-sm">

              <div className="text-center mb-5">
                <div className="text-5xl mb-3">🏆</div>
                <h2 className="text-white text-2xl font-black mb-1">게임 클리어!</h2>
                <p className="text-[#f59e0b] text-sm font-medium mb-1">30웨이브 보스를 처치했어요</p>
                {saving ? (
                  <p className="text-[#f59e0b]/70 text-sm">기록 저장 중...</p>
                ) : saveError ? (
                  <p className="text-[#ef4444] text-sm">저장에 실패했어요</p>
                ) : (
                  <p className="text-[#22c55e] text-sm font-medium">✓ 기록이 저장됐어요</p>
                )}
              </div>

              {/* 이번 런 스탯 */}
              <div className="grid grid-cols-2 gap-2 mb-5">
                <Stat label="최종 점수"  value={runResult.score.toLocaleString()} highlight />
                <Stat label="웨이브"     value={`${runResult.wave_reached}웨이브`} />
                <Stat label="생존 시간"  value={formatTime(runResult.duration_sec)} />
                <Stat label="처치"       value={`${runResult.killed_count}마리`} />
                <Stat label="획득 코인"  value={`🪙 ${runResult.coins_earned}`} />
              </div>

              {/* 리더보드 */}
              <div className="mb-5">
                <div className="flex items-center mb-2">
                  <p className="text-white/70 text-xs font-bold tracking-widest uppercase">
                    🏆 누적 리더보드
                  </p>
                </div>
                <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                  {leaderboardLoading ? (
                    <div className="py-6 text-center text-white/30 text-sm">불러오는 중...</div>
                  ) : !leaderboard || leaderboard.scores.length === 0 ? (
                    <div className="py-6 text-center text-white/30 text-sm">아직 기록이 없어요</div>
                  ) : (
                    leaderboard.scores.map((entry, i) => {
                      const isMe = entry.user_id === myUserId;
                      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
                      return (
                        <div
                          key={entry.user_id}
                          className="flex items-center gap-3 px-3 py-2.5"
                          style={{
                            background: isMe ? "rgba(245,158,11,0.15)" : undefined,
                            borderBottom: i < leaderboard.scores.length - 1 ? "1px solid rgba(255,255,255,0.05)" : undefined,
                          }}
                        >
                          <span className="text-white/40 text-xs tabular-nums w-5 text-center shrink-0">
                            {medal ?? `${i + 1}`}
                          </span>
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                            style={{ backgroundColor: entry.profiles?.color_hex ?? "#8B95A1" }}
                          >
                            {entry.profiles?.name?.charAt(0) ?? "?"}
                          </div>
                          <span className={`flex-1 text-sm font-medium truncate ${isMe ? "text-[#f59e0b]" : "text-white"}`}>
                            {entry.profiles?.name ?? "알 수 없음"}
                            {isMe && <span className="text-[#f59e0b]/60 text-[10px] ml-1">나</span>}
                          </span>
                          <div className="text-right shrink-0">
                            <p className={`text-sm font-bold tabular-nums ${isMe ? "text-[#f59e0b]" : "text-white"}`}>
                              {fmtScore(entry.best_run_score)}
                            </p>
                            <p className="text-[10px] tabular-nums" style={{ color: isMe ? "rgba(245,158,11,0.6)" : "rgba(255,255,255,0.35)" }}>
                              {entry.highest_wave}라운드 · {fmtScore(entry.total_score)}누적
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 py-3.5 rounded-2xl text-white/60 font-semibold text-sm"
                  style={{ background: "rgba(255,255,255,0.08)" }}
                >
                  그만할래요
                </button>
                <button
                  onClick={onClose}
                  disabled={saving}
                  className="flex-1 py-3.5 rounded-2xl text-white font-bold text-sm disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}
                >
                  한판 더
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ── 게임 오버 모달 ── */}
      {phase === "gameover" && runResult && (
        <div className="absolute inset-0 z-20 overflow-y-auto"
          style={{ background: "rgba(0,0,0,0.92)" }}
        >
          <div className="min-h-full flex items-start justify-center py-8 px-4">
            <div className="w-full max-w-sm">

              <div className="text-center mb-5">
                <div className="text-5xl mb-3">😿</div>
                <h2 className="text-white text-2xl font-black mb-1">게임 오버</h2>
                {saving ? (
                  <p className="text-[#f59e0b] text-sm font-medium">기록 저장 중...</p>
                ) : saveError ? (
                  <p className="text-[#ef4444] text-sm">저장에 실패했어요</p>
                ) : (
                  <p className="text-[#22c55e] text-sm font-medium">✓ 기록이 저장됐어요</p>
                )}
              </div>

              {/* 이번 런 스탯 */}
              <div className="grid grid-cols-2 gap-2 mb-5">
                <Stat label="최종 점수"  value={runResult.score.toLocaleString()} highlight />
                <Stat label="웨이브"     value={`${runResult.wave_reached}웨이브`} />
                <Stat label="생존 시간"  value={formatTime(runResult.duration_sec)} />
                <Stat label="처치"       value={`${runResult.killed_count}마리`} />
                <Stat label="획득 코인"  value={`🪙 ${runResult.coins_earned}`} />
              </div>

              {/* 리더보드 */}
              <div className="mb-5">
                <div className="flex items-center mb-2">
                  <p className="text-white/70 text-xs font-bold tracking-widest uppercase">
                    🏆 누적 리더보드
                  </p>
                </div>
                <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                  {leaderboardLoading ? (
                    <div className="py-6 text-center text-white/30 text-sm">불러오는 중...</div>
                  ) : !leaderboard || leaderboard.scores.length === 0 ? (
                    <div className="py-6 text-center text-white/30 text-sm">아직 기록이 없어요</div>
                  ) : (
                    leaderboard.scores.map((entry, i) => {
                      const isMe = entry.user_id === myUserId;
                      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
                      return (
                        <div
                          key={entry.user_id}
                          className="flex items-center gap-3 px-3 py-2.5"
                          style={{
                            background: isMe ? "rgba(245,158,11,0.15)" : undefined,
                            borderBottom: i < leaderboard.scores.length - 1 ? "1px solid rgba(255,255,255,0.05)" : undefined,
                          }}
                        >
                          <span className="text-white/40 text-xs tabular-nums w-5 text-center shrink-0">
                            {medal ?? `${i + 1}`}
                          </span>
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                            style={{ backgroundColor: entry.profiles?.color_hex ?? "#8B95A1" }}
                          >
                            {entry.profiles?.name?.charAt(0) ?? "?"}
                          </div>
                          <span className={`flex-1 text-sm font-medium truncate ${isMe ? "text-[#f59e0b]" : "text-white"}`}>
                            {entry.profiles?.name ?? "알 수 없음"}
                            {isMe && <span className="text-[#f59e0b]/60 text-[10px] ml-1">나</span>}
                          </span>
                          <div className="text-right shrink-0">
                            <p className={`text-sm font-bold tabular-nums ${isMe ? "text-[#f59e0b]" : "text-white"}`}>
                              {fmtScore(entry.best_run_score)}
                            </p>
                            <p className="text-[10px] tabular-nums" style={{ color: isMe ? "rgba(245,158,11,0.6)" : "rgba(255,255,255,0.35)" }}>
                              {entry.highest_wave}라운드 · {fmtScore(entry.total_score)}누적
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 py-3.5 rounded-2xl text-white/60 font-semibold text-sm"
                  style={{ background: "rgba(255,255,255,0.08)" }}
                >
                  그만할래요
                </button>
                {saveError ? (
                  <button
                    onClick={handleRetrySave}
                    disabled={saving}
                    className="flex-1 py-3.5 rounded-2xl text-white font-bold text-sm disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)" }}
                  >
                    다시 저장하기
                  </button>
                ) : (
                  <button
                    onClick={onClose}
                    disabled={saving}
                    className="flex-1 py-3.5 rounded-2xl text-white font-bold text-sm disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}
                  >
                    한판 더
                  </button>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-2xl p-3 text-center" style={{ background: "rgba(255,255,255,0.06)" }}>
      <p className="text-white/40 text-xs mb-1">{label}</p>
      <p className={`font-bold ${highlight ? "text-[#f59e0b] text-lg" : "text-white"}`}>{value}</p>
    </div>
  );
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}분 ${String(s).padStart(2, "0")}초`;
}
