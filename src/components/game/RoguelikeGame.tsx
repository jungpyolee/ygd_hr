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

type Phase = "countdown" | "playing" | "levelup" | "gameover";

interface LeaderboardEntry {
  user_id: string;
  total_score: number;
  best_run_score: number;
  profiles: { name: string; color_hex: string | null };
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
  const [runResult, setRunResult] = useState<GameRunPayload | null>(null);
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState(false);

  const [leaderboard, setLeaderboard]           = useState<LeaderboardData | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [myUserId, setMyUserId]                 = useState<string | null>(null);

  const [gameStarted, setGameStarted] = useState(false);

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
            <div className="text-5xl mb-6">🐱</div>
            <p className="text-white/50 text-sm mb-3 tracking-widest uppercase">Get Ready</p>
            <p className="text-[#f59e0b] font-black" style={{ fontSize: "7rem", lineHeight: 1 }}>
              {countdown === 0 ? "GO!" : countdown}
            </p>
          </div>
        </div>
      )}

      {/* HUD */}
      {(phase === "playing" || phase === "levelup") && stats && (
        <div className="absolute top-0 left-0 right-0 z-10 px-3 pt-2 pointer-events-none">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm">❤️</span>
            <div className="flex-1 h-2.5 bg-black/40 rounded-full overflow-hidden">
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
            <span className="text-white/70 text-xs tabular-nums">{stats.hp}/{stats.maxHp}</span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[#f59e0b] text-xs font-bold w-10">Lv.{stats.level}</span>
            <div className="flex-1 h-1.5 bg-black/40 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#f59e0b] rounded-full transition-all duration-300"
                style={{ width: `${(stats.exp / stats.expNext) * 100}%` }}
              />
            </div>
            {/* 다음 보스까지 */}
            {!stats.boss && stats.nextBossIn > 0 && (
              <span className="text-red-400/70 text-[10px] tabular-nums shrink-0">
                🔥 {stats.nextBossIn}웨이브 후 보스
              </span>
            )}
          </div>
          <div className="flex justify-between">
            {[
              { icon: "🌊", label: `웨이브 ${stats.wave}` },
              { icon: "💀", label: `${stats.kills}킬` },
              { icon: "⏱", label: `${Math.floor(stats.elapsed / 60)}:${String(stats.elapsed % 60).padStart(2, "0")}` },
              { icon: "🏆", label: stats.score.toLocaleString() },
              { icon: "🪙", label: `${stats.coins}` },
            ].map(({ icon, label }) => (
              <div key={icon} className="flex items-center gap-1 bg-black/50 rounded-lg px-2 py-0.5">
                <span className="text-xs">{icon}</span>
                <span className="text-white text-xs font-medium tabular-nums">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 보스 HP 바 */}
      {(phase === "playing" || phase === "levelup") && stats?.boss && (
        <div className="absolute bottom-16 left-4 right-4 z-10 pointer-events-none">
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
          onClick={onClose}
          className="absolute top-3 right-3 z-30 w-8 h-8 rounded-full bg-black/60 text-white/70 text-sm flex items-center justify-center"
        >
          ✕
        </button>
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
                  className="group flex flex-col items-center gap-2 rounded-2xl p-4 text-center border border-white/10 transition-all duration-150 active:scale-95 hover:border-[#f59e0b]/60"
                  style={{
                    background: "linear-gradient(160deg, rgba(245,158,11,0.12), rgba(245,158,11,0.04))",
                    boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
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
                              {entry.total_score.toLocaleString()}
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
