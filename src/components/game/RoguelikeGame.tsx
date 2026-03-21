"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { GameRunPayload } from "@/lib/game/api";
import { saveGameRun } from "@/lib/game/api";
import type { UpgradeOption, GameStats } from "@/lib/game/scenes/GameScene";
import { GAME_EVENTS } from "@/lib/game/scenes/GameScene";
import { toast } from "sonner";

interface Props {
  onClose: () => void;
}

type Phase = "countdown" | "playing" | "levelup" | "gameover";

export default function RoguelikeGame({ onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gameRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sceneRef = useRef<any>(null);

  const [phase, setPhase]         = useState<Phase>("countdown");
  const [countdown, setCountdown] = useState(3);
  const [stats, setStats]         = useState<GameStats | null>(null);
  const [upgradeOptions, setUpgradeOptions] = useState<UpgradeOption[]>([]);
  const [runResult, setRunResult] = useState<GameRunPayload | null>(null);
  const [saving, setSaving]       = useState(false);

  // ─── 카운트다운 ────────────────────────────
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown <= 0) {
      setPhase("playing");
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // ─── Phaser 초기화 ─────────────────────────
  useEffect(() => {
    if (phase !== "playing") return;
    if (!containerRef.current) return;

    let game: import("phaser").Game;

    (async () => {
      const Phaser = await import("phaser");
      const { default: GameScene } = await import("@/lib/game/scenes/GameScene");

      const scene = new GameScene();
      sceneRef.current = scene;

      game = new Phaser.Game({
        type: Phaser.AUTO,
        width: 800,
        height: 600,
        backgroundColor: "#1a1a2e",
        parent: containerRef.current!,
        scene: scene,
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        audio: { disableWebAudio: true },
      });
      gameRef.current = game;

      // 이벤트 구독
      scene.events.on(GAME_EVENTS.STATS_UPDATE, (s: GameStats) => {
        setStats(s);
      });

      scene.events.on(GAME_EVENTS.LEVEL_UP, (opts: UpgradeOption[]) => {
        setUpgradeOptions(opts);
        setPhase("levelup");
      });

      scene.events.on(GAME_EVENTS.GAME_OVER, (result: GameRunPayload) => {
        setRunResult(result);
        setPhase("gameover");
      });
    })();

    return () => {
      game?.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, [phase]);

  // ─── 레벨업 선택 ───────────────────────────
  const handleUpgrade = useCallback((option: UpgradeOption) => {
    sceneRef.current?.applyUpgrade(option);
    setPhase("playing");
  }, []);

  // ─── 런 결과 저장 ──────────────────────────
  const handleSaveRun = useCallback(async () => {
    if (!runResult) return;
    setSaving(true);
    try {
      await saveGameRun(runResult);
      toast.success("기록이 저장됐어요!");
    } catch {
      toast.error("저장에 실패했어요. 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  }, [runResult]);

  // ─── UI ────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[9999] bg-[#1a1a2e] flex flex-col">
      {/* 카운트다운 */}
      {phase === "countdown" && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center">
            <p className="text-white text-xl mb-4 font-semibold">준비하세요!</p>
            <p className="text-[#3182F6] text-8xl font-bold">
              {countdown === 0 ? "GO!" : countdown}
            </p>
          </div>
        </div>
      )}

      {/* HUD */}
      {(phase === "playing" || phase === "levelup") && stats && (
        <div className="absolute top-0 left-0 right-0 z-10 px-4 pt-3 pointer-events-none">
          {/* HP 바 */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-white text-sm">❤️</span>
            <div className="flex-1 h-3 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-500 rounded-full transition-all duration-200"
                style={{ width: `${(stats.hp / stats.maxHp) * 100}%` }}
              />
            </div>
            <span className="text-white text-xs w-16 text-right">{stats.hp} / {stats.maxHp}</span>
          </div>
          {/* EXP 바 */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-white text-xs">Lv.{stats.level}</span>
            <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#3182F6] rounded-full transition-all duration-200"
                style={{ width: `${(stats.exp / stats.expNext) * 100}%` }}
              />
            </div>
          </div>
          {/* 상단 정보 */}
          <div className="flex justify-between text-white text-xs">
            <span>🌊 웨이브 {stats.wave}</span>
            <span>💀 {stats.kills}킬</span>
            <span>⏱ {Math.floor(stats.elapsed / 60)}:{String(stats.elapsed % 60).padStart(2, "0")}</span>
            <span>⭐ {stats.score.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Phaser 캔버스 */}
      <div ref={containerRef} className="w-full h-full" />

      {/* 닫기 버튼 */}
      {phase === "playing" && (
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-black/50 text-white text-lg flex items-center justify-center"
        >
          ✕
        </button>
      )}

      {/* 레벨업 모달 */}
      {phase === "levelup" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60">
          <div className="bg-[#16213e] rounded-2xl p-6 mx-4 w-full max-w-sm border border-[#3182F6]/40">
            <h2 className="text-white text-xl font-bold text-center mb-1">레벨 업! 🎉</h2>
            <p className="text-gray-400 text-sm text-center mb-5">업그레이드를 선택하세요</p>
            <div className="flex flex-col gap-3">
              {upgradeOptions.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => handleUpgrade(opt)}
                  className="flex items-center gap-3 bg-[#1a1a2e] hover:bg-[#3182F6]/20 border border-gray-700 hover:border-[#3182F6] rounded-xl p-4 text-left transition-colors"
                >
                  <span className="text-3xl">{opt.emoji}</span>
                  <div>
                    <p className="text-white font-semibold text-sm">{opt.label}</p>
                    <p className="text-gray-400 text-xs mt-0.5">{opt.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 게임 오버 모달 */}
      {phase === "gameover" && runResult && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80">
          <div className="bg-[#16213e] rounded-2xl p-6 mx-4 w-full max-w-sm border border-gray-700">
            <h2 className="text-white text-2xl font-bold text-center mb-1">게임 오버</h2>
            <p className="text-gray-400 text-sm text-center mb-6">고양이가 쓰러졌어요 😿</p>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <Stat label="점수" value={runResult.score.toLocaleString()} />
              <Stat label="웨이브" value={`${runResult.wave_reached}웨이브`} />
              <Stat label="생존 시간" value={formatTime(runResult.duration_sec)} />
              <Stat label="처치 수" value={`${runResult.killed_count}마리`} />
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl bg-gray-700 text-white font-semibold text-sm"
              >
                그만할래요
              </button>
              <button
                onClick={handleSaveRun}
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-[#3182F6] text-white font-semibold text-sm disabled:opacity-60"
              >
                {saving ? "저장 중..." : "기록 저장하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#1a1a2e] rounded-xl p-3 text-center">
      <p className="text-gray-400 text-xs mb-1">{label}</p>
      <p className="text-white font-bold">{value}</p>
    </div>
  );
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}분 ${String(s).padStart(2, "0")}초`;
}
