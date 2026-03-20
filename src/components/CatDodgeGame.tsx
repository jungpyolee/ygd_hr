"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase";
import { X } from "lucide-react";

/* ─────────────────────────────────────────────
   한국 전통 다과 목록
───────────────────────────────────────────── */
const CONFECTIONS = [
  { id: "kumquat", name: "금귤정과", src: "/daegwa/01-kumquat.svg" },
  { id: "yakgwa", name: "개성약과", src: "/daegwa/02-yakgwa.svg" },
  { id: "juak", name: "개성주악", src: "/daegwa/03-juak.svg" },
  { id: "pecan", name: "피칸강정", src: "/daegwa/04-pecan.svg" },
  { id: "walnut", name: "호두강정", src: "/daegwa/05-walnut.svg" },
  { id: "dasik", name: "흑임자다식", src: "/daegwa/06-dasik.svg" },
  { id: "yanggang", name: "양갱", src: "/daegwa/07-yanggang.svg" },
  { id: "omija", name: "오미자편", src: "/daegwa/08-omija.svg" },
  { id: "chestnut", name: "밤초", src: "/daegwa/09-chestnut.svg" },
  { id: "jujube", name: "대추초", src: "/daegwa/10-jujube.svg" },
] as const;

/* ─────────────────────────────────────────────
   타입 정의
───────────────────────────────────────────── */
interface LeaderboardEntry {
  user_id: string;
  name: string;
  score: number;
}

interface FallingItem {
  id: number;
  typeIdx: number; // CONFECTIONS 인덱스
  x: number; // center x (px)
  y: number; // center y (px)
  speed: number;
  size: number; // 이미지 크기 (px)
  rot: number; // 회전 각도 (deg)
  rotSpd: number; // 회전 속도
}

type GameState = "countdown" | "playing" | "gameover";

interface Props {
  onClose: () => void;
}

/* ─────────────────────────────────────────────
   충돌 반경
───────────────────────────────────────────── */
const CAT_R = 20; // 고양이 충돌 반경
const ITEM_R = 18; // 다과 충돌 반경

/* ─────────────────────────────────────────────
   난이도 계산 (t = 경과 초)
   30초에 개쩌는 수준 목표
───────────────────────────────────────────── */
function getDifficulty(t: number) {
  const catSpeed = 2.2 + t * 0.06; // 0s:2.2  30s:4.0
  const itemSpeed = 2.5 + t * 0.4 + (t > 20 ? (t - 20) * 0.5 : 0);
  //                  0s:2.5  10s:6.5  20s:10.5  30s:20.5
  const spawnMs = Math.max(110, 1500 - t * 48); // 0s:1500 20s:540 30s:110
  const simultaneous = 1 + Math.floor(t / 12); // 0s:1  12s:2  24s:3  30s:3
  return { catSpeed, itemSpeed, spawnMs, simultaneous };
}

/* ─────────────────────────────────────────────
   CatDodgeGame 컴포넌트
───────────────────────────────────────────── */
export default function CatDodgeGame({ onClose }: Props) {
  const supabase = createClient();

  /* --- React state (렌더링용) --- */
  const [gameState, setGameState] = useState<GameState>("countdown");
  const [countdown, setCountdown] = useState(3);
  const [catX, setCatX] = useState(0);
  const [catDir, setCatDir] = useState(1); // 1=오른쪽 -1=왼쪽
  const [items, setItems] = useState<FallingItem[]>([]);
  const [score, setScore] = useState(0);
  const [dead, setDead] = useState(false);
  const [hitItem, setHitItem] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  /* --- 게임 루프용 Ref --- */
  const gameStateRef = useRef<GameState>("countdown");
  const catXRef = useRef(0);
  const catDirRef = useRef(1);
  const itemsRef = useRef<FallingItem[]>([]);
  const scoreRef = useRef(0);
  const nextIdRef = useRef(0);
  const lastSpawnRef = useRef(0);
  const lastFrameRef = useRef(0);
  const startTimeRef = useRef(0);
  const frameRef = useRef(0);
  const screenWRef = useRef(375);
  const screenHRef = useRef(812);

  /* ── 초기화 ── */
  useEffect(() => {
    screenWRef.current = window.innerWidth;
    screenHRef.current = window.innerHeight;
    const initX = window.innerWidth / 2;
    catXRef.current = initX;
    setCatX(initX);

    supabase.auth.getUser().then(({ data }) => {
      setMyUserId(data.user?.id ?? null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── 카운트다운 ── */
  useEffect(() => {
    if (gameState !== "countdown") return;
    if (countdown <= 0) {
      gameStateRef.current = "playing";
      setGameState("playing");
      startTimeRef.current = performance.now();
      lastSpawnRef.current = performance.now();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [gameState, countdown]);

  /* ── 게임 루프 ── */
  useEffect(() => {
    if (gameState !== "playing") return;

    const CAT_Y = screenHRef.current - 96;

    const loop = (ts: number) => {
      if (gameStateRef.current !== "playing") return;

      const dt = lastFrameRef.current
        ? Math.min(ts - lastFrameRef.current, 50)
        : 16.67;
      lastFrameRef.current = ts;

      const elapsed = (ts - startTimeRef.current) / 1000;
      const diff = getDifficulty(elapsed);

      /* 고양이 자동 이동 */
      catXRef.current += catDirRef.current * diff.catSpeed * (dt / 16.67);

      /* 벽 반사 */
      const margin = 28;
      if (catXRef.current < margin) {
        catXRef.current = margin;
        catDirRef.current = 1;
        setCatDir(1);
      } else if (catXRef.current > screenWRef.current - margin) {
        catXRef.current = screenWRef.current - margin;
        catDirRef.current = -1;
        setCatDir(-1);
      }

      /* 다과 스폰 */
      if (ts - lastSpawnRef.current > diff.spawnMs) {
        const newItems: FallingItem[] = [];
        for (let i = 0; i < diff.simultaneous; i++) {
          const typeIdx = Math.floor(Math.random() * CONFECTIONS.length);
          const margin2 = 36;
          const x =
            margin2 + Math.random() * (screenWRef.current - margin2 * 2);
          const size = 38 + Math.floor(Math.random() * 14); // 38~51px
          const speed = diff.itemSpeed * (0.8 + Math.random() * 0.4);
          newItems.push({
            id: nextIdRef.current++,
            typeIdx,
            x,
            y: -size / 2,
            speed,
            size,
            rot: Math.random() * 360,
            rotSpd: (Math.random() - 0.5) * 4,
          });
        }
        itemsRef.current = [...itemsRef.current, ...newItems];
        lastSpawnRef.current = ts;
      }

      /* 다과 이동 + 화면 밖 제거 */
      itemsRef.current = itemsRef.current
        .map((c) => ({
          ...c,
          y: c.y + c.speed * (dt / 16.67),
          rot: c.rot + c.rotSpd,
        }))
        .filter((c) => c.y < screenHRef.current + 60);

      /* 충돌 감지 */
      const threshold = CAT_R + ITEM_R;
      const hitItem = itemsRef.current.find((c) => {
        const dx = catXRef.current - c.x;
        const dy = CAT_Y - c.y;
        return Math.sqrt(dx * dx + dy * dy) < threshold;
      });

      if (hitItem) {
        gameStateRef.current = "gameover";
        setGameState("gameover");
        setDead(true);
        setCatX(catXRef.current);
        setItems([...itemsRef.current]);
        const finalScore = Math.floor(elapsed);
        setScore(finalScore);
        scoreRef.current = finalScore;
        setHitItem(CONFECTIONS[hitItem.typeIdx].name);
        return;
      }

      /* 렌더 상태 갱신 */
      setCatX(catXRef.current);
      setItems([...itemsRef.current]);
      setScore(Math.floor(elapsed));

      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current);
  }, [gameState]);

  /* ── 게임오버: 저장 + 리더보드 ── */
  useEffect(() => {
    if (gameState !== "gameover") return;

    const run = async () => {
      setSaving(true);

      if (myUserId) {
        await supabase
          .from("cat_dodge_scores")
          .insert({ user_id: myUserId, score: scoreRef.current });
      }

      const { data: scores } = await supabase
        .from("cat_dodge_scores")
        .select("user_id, score")
        .order("score", { ascending: false })
        .limit(100);

      if (scores) {
        const best = new Map<string, number>();
        scores.forEach((r) => {
          if (!best.has(r.user_id) || r.score > best.get(r.user_id)!) {
            best.set(r.user_id, r.score);
          }
        });
        const topIds = Array.from(best.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([id]) => id);

        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, name")
          .in("id", topIds);

        const nameMap = new Map(profiles?.map((p) => [p.id, p.name]) ?? []);
        setLeaderboard(
          topIds.map((id) => ({
            user_id: id,
            name: nameMap.get(id) ?? "알 수 없음",
            score: best.get(id)!,
          })),
        );
      }

      setSaving(false);
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, myUserId]);

  /* ── 방향 전환 (탭/클릭) ── */
  const reverseDir = () => {
    if (gameStateRef.current !== "playing") return;
    catDirRef.current *= -1;
    setCatDir((d) => d * -1);
  };

  /* ── 키보드 (데스크톱 테스트) ── */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "ArrowLeft" || e.key === "ArrowRight")
        reverseDir();
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  /* ── 재시작 ── */
  const restart = () => {
    cancelAnimationFrame(frameRef.current);
    itemsRef.current = [];
    catXRef.current = screenWRef.current / 2;
    catDirRef.current = 1;
    scoreRef.current = 0;
    lastSpawnRef.current = 0;
    lastFrameRef.current = 0;
    nextIdRef.current = 0;

    setItems([]);
    setCatX(screenWRef.current / 2);
    setCatDir(1);
    setScore(0);
    setDead(false);
    setHitItem(null);
    setLeaderboard([]);
    setCountdown(3);
    gameStateRef.current = "countdown";
    setGameState("countdown");
  };

  /* ── 렌더링 ── */
  const catY = (screenHRef.current || 812) - 96;
  const screenW = screenWRef.current || 375;

  const rankIcon = (i: number) =>
    i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`;

  /* 난이도 표시 텍스트 */
  const dangerLevel =
    score < 10
      ? null
      : score < 20
        ? "⚡ 빨라지는 중"
        : score < 30
          ? "🔥 위험해요!"
          : "💀 살아있는 게 신기해요";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background:
          "linear-gradient(180deg, #07101f 0%, #12063a 55%, #1a0a28 100%)",
        overflow: "hidden",
        fontFamily: "Pretendard, sans-serif",
        userSelect: "none",
        WebkitUserSelect: "none",
        touchAction: "none",
      }}
      onPointerDown={(e) => {
        // 버튼 클릭은 제외
        if ((e.target as HTMLElement).tagName === "BUTTON") return;
        reverseDir();
      }}
    >
      <style>{`
        @keyframes catBobGame {
          0%, 100% { transform: translateY(0px);   }
          50%       { transform: translateY(-6px);  }
        }
        @keyframes catDie {
          0%   { transform: scale(1)   rotate(0deg)   translateY(0);    opacity: 1;   }
          40%  { transform: scale(1.6) rotate(30deg)  translateY(-10px); opacity: 1;   }
          100% { transform: scale(0.8) rotate(-20deg) translateY(15px);  opacity: 0.3; }
        }
        @keyframes itemFall {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes countdownPop {
          0%   { transform: scale(0.3); opacity: 0; }
          65%  { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1);   opacity: 1; }
        }
        @keyframes gameOverIn {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes dangerPulse {
          0%, 100% { opacity: 0.7; }
          50%       { opacity: 1;   }
        }
        @keyframes starTwinkle {
          0%, 100% { opacity: 0.25; transform: scale(0.9); }
          50%       { opacity: 1;   transform: scale(1.1); }
        }
        @keyframes tapHint {
          0%   { opacity: 0;   transform: scale(0.9); }
          20%  { opacity: 0.6; transform: scale(1);   }
          80%  { opacity: 0.6; transform: scale(1);   }
          100% { opacity: 0;   transform: scale(0.9); }
        }
      `}</style>

      {/* 별빛 */}
      {[...Array(20)].map((_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: i % 4 === 0 ? 3 : 2,
            height: i % 4 === 0 ? 3 : 2,
            borderRadius: "50%",
            background: "white",
            left: `${(i * 41 + 7) % 96}%`,
            top: `${(i * 29 + 11) % 52}%`,
            animation: `starTwinkle ${1.4 + (i % 6) * 0.35}s ease-in-out ${(i * 0.28) % 2.5}s infinite`,
          }}
        />
      ))}

      {/* 닫기 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.12)",
          border: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          zIndex: 20,
        }}
      >
        <X style={{ width: 18, height: 18, color: "rgba(255,255,255,0.75)" }} />
      </button>

      {/* 점수 + 위험도 (플레이 중) */}
      {gameState === "playing" && (
        <div
          style={{
            position: "absolute",
            top: 20,
            left: "50%",
            transform: "translateX(-50%)",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              color: "white",
              fontSize: 30,
              fontWeight: 900,
              lineHeight: 1,
            }}
          >
            {score}
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                opacity: 0.65,
                marginLeft: 3,
              }}
            >
              초
            </span>
          </div>
          {dangerLevel && (
            <div
              style={{
                marginTop: 4,
                fontSize: 11,
                fontWeight: 700,
                color:
                  score < 20 ? "#60CFFF" : score < 30 ? "#FFB830" : "#FF5555",
                animation: "dangerPulse 0.9s ease-in-out infinite",
              }}
            >
              {dangerLevel}
            </div>
          )}
        </div>
      )}

      {/* 방향 힌트 (첫 4초) */}
      {gameState === "playing" && score < 4 && (
        <div
          style={{
            position: "absolute",
            bottom: 150,
            left: "50%",
            transform: "translateX(-50%)",
            color: "rgba(255,255,255,0.55)",
            fontSize: 13,
            fontWeight: 600,
            textAlign: "center",
            pointerEvents: "none",
            animation: "tapHint 4s ease-in-out forwards",
            whiteSpace: "nowrap",
          }}
        >
          화면을 탭하면 방향이 바뀌어요
        </div>
      )}

      {/* 떨어지는 다과 */}
      {items.map((item) => (
        <div
          key={item.id}
          style={{
            position: "absolute",
            left: item.x - item.size / 2,
            top: item.y - item.size / 2,
            width: item.size,
            height: item.size,
            pointerEvents: "none",
            transform: `rotate(${item.rot}deg)`,
            animation: "itemFall 0.12s ease-out",
          }}
        >
          <Image
            src={CONFECTIONS[item.typeIdx].src}
            alt={CONFECTIONS[item.typeIdx].name}
            width={item.size}
            height={item.size}
            style={{ display: "block" }}
          />
        </div>
      ))}

      {/* 고양이 (플레이 + 카운트다운) */}
      {!dead && gameState !== "gameover" && (
        <div
          style={{
            position: "absolute",
            left: catX - 26,
            top: catY - 26,
            fontSize: 48,
            lineHeight: 1,
            pointerEvents: "none",
            transform: catDir < 0 ? "scaleX(-1)" : "scaleX(1)",
            animation:
              gameState === "playing"
                ? "catBobGame 0.5s ease-in-out infinite"
                : "none",
            transition: "transform 0.1s",
          }}
        >
          🐱
        </div>
      )}

      {/* 죽은 고양이 */}
      {dead && (
        <div
          style={{
            position: "absolute",
            left: catX - 26,
            top: catY - 26,
            fontSize: 48,
            lineHeight: 1,
            pointerEvents: "none",
            animation: "catDie 0.8s ease-out forwards",
          }}
        >
          😵
        </div>
      )}

      {/* 카운트다운 */}
      {gameState === "countdown" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 20,
            paddingBottom: 100,
            pointerEvents: "none",
          }}
        >
          <div
            key={countdown}
            style={{
              fontSize: countdown === 0 ? 48 : 88,
              color: "white",
              fontWeight: 900,
              animation: "countdownPop 0.55s cubic-bezier(0.34,1.56,0.64,1)",
              textShadow: "0 4px 24px rgba(100,160,255,0.7)",
              lineHeight: 1,
            }}
          >
            {countdown === 0 ? "시작!" : countdown}
          </div>
          <p
            style={{
              fontSize: 14,
              color: "rgba(255,255,255,0.5)",
              textAlign: "center",
              lineHeight: 1.8,
            }}
          >
            한국 전통 다과를 피해요 🍡
            <br />
            <span style={{ fontSize: 12, opacity: 0.75 }}>
              화면 탭 → 방향 전환
            </span>
          </p>
        </div>
      )}

      {/* 게임오버 */}
      {gameState === "gameover" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            overflowY: "auto",
            paddingTop: 56,
            paddingBottom: 40,
            animation: "gameOverIn 0.5s ease-out",
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div style={{ fontSize: 52 }}>😵</div>
          {hitItem && (
            <p
              style={{
                color: "rgba(255,255,255,0.5)",
                fontSize: 14,
                marginTop: 6,
              }}
            >
              {hitItem}에 맞았어요
            </p>
          )}

          {/* 점수 카드 */}
          <div
            style={{
              marginTop: 14,
              background: "rgba(255,255,255,0.08)",
              borderRadius: 20,
              padding: "16px 40px",
              textAlign: "center",
            }}
          >
            <p
              style={{
                color: "rgba(255,255,255,0.45)",
                fontSize: 12,
                marginBottom: 4,
              }}
            >
              생존 시간
            </p>
            <p
              style={{
                color: "white",
                fontSize: 56,
                fontWeight: 900,
                lineHeight: 1,
              }}
            >
              {score}
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  opacity: 0.65,
                  marginLeft: 4,
                }}
              >
                초
              </span>
            </p>
            {score >= 30 && (
              <p
                style={{
                  color: "#FFD700",
                  fontSize: 13,
                  fontWeight: 800,
                  marginTop: 6,
                }}
              >
                👑 레전드 생존자
              </p>
            )}
            {score >= 20 && score < 30 && (
              <p
                style={{
                  color: "#C0C0C0",
                  fontSize: 13,
                  fontWeight: 700,
                  marginTop: 6,
                }}
              >
                🔥 쫌 하시네요
              </p>
            )}
          </div>

          {/* 버튼 */}
          <div style={{ display: "flex", gap: 12, marginTop: 22 }}>
            <button
              onClick={restart}
              style={{
                padding: "13px 26px",
                borderRadius: 28,
                background: "#3182F6",
                color: "white",
                fontSize: 15,
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
              }}
            >
              다시 하기
            </button>
            <button
              onClick={onClose}
              style={{
                padding: "13px 26px",
                borderRadius: 28,
                background: "rgba(255,255,255,0.12)",
                color: "white",
                fontSize: 15,
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
              }}
            >
              그만할래요
            </button>
          </div>

          {/* 리더보드 */}
          <div
            style={{
              marginTop: 28,
              width: `calc(${screenW}px - 40px)`,
              maxWidth: 360,
              background: "rgba(255,255,255,0.07)",
              borderRadius: 20,
              padding: "18px 20px",
            }}
          >
            <p
              style={{
                color: "white",
                fontSize: 15,
                fontWeight: 800,
                marginBottom: 14,
              }}
            >
              🏆 리더보드
            </p>

            {saving ? (
              <p
                style={{
                  color: "rgba(255,255,255,0.4)",
                  fontSize: 13,
                  textAlign: "center",
                  padding: "12px 0",
                }}
              >
                저장 중...
              </p>
            ) : leaderboard.length === 0 ? (
              <p
                style={{
                  color: "rgba(255,255,255,0.4)",
                  fontSize: 13,
                  textAlign: "center",
                  padding: "12px 0",
                }}
              >
                아직 기록이 없어요
              </p>
            ) : (
              leaderboard.map((entry, i) => {
                const isMe = entry.user_id === myUserId;
                return (
                  <div
                    key={entry.user_id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "9px 8px",
                      borderRadius: 10,
                      background: isMe ? "rgba(49,130,246,0.2)" : "transparent",
                      borderBottom:
                        i < leaderboard.length - 1
                          ? "1px solid rgba(255,255,255,0.06)"
                          : "none",
                    }}
                  >
                    <span
                      style={{
                        fontSize: i < 3 ? 18 : 12,
                        fontWeight: 800,
                        color:
                          i === 0
                            ? "#FFD700"
                            : i === 1
                              ? "#C0C0C0"
                              : i === 2
                                ? "#CD7F32"
                                : "rgba(255,255,255,0.35)",
                        width: 26,
                        textAlign: "center",
                        flexShrink: 0,
                      }}
                    >
                      {rankIcon(i)}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        color: "white",
                        fontSize: 14,
                        fontWeight: isMe ? 700 : 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {entry.name}
                      {isMe && (
                        <span
                          style={{
                            color: "#60a5fa",
                            fontSize: 11,
                            fontWeight: 700,
                            marginLeft: 5,
                          }}
                        >
                          나
                        </span>
                      )}
                    </span>
                    <span
                      style={{
                        color: isMe ? "#93c5fd" : "rgba(255,255,255,0.65)",
                        fontSize: 14,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {entry.score}초
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
