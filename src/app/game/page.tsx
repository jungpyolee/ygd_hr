"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useRouter } from "next/navigation";

const RoguelikeGame = dynamic(
  () => import("@/components/game/RoguelikeGame"),
  { ssr: false, loading: () => null }
);

const CAT_TYPES = [
  { id: "persian",  name: "페르시안",       emoji: "🐱", desc: "범위형 · 시작 무기: 헤어볼" },
  { id: "scottish", name: "스코티시폴드",   emoji: "😺", desc: "탱커형 · 반사 능력" },
  { id: "abyssinian", name: "아비시니안",   emoji: "😸", desc: "스피드형 · 회피 특화" },
  { id: "munchkin", name: "먼치킨",          emoji: "🐈", desc: "서포터형 · 다중 공격" },
] as const;

export default function GamePage() {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [selectedCat, setSelectedCat] = useState<string>("persian");

  if (started) {
    return <RoguelikeGame onClose={() => setStarted(false)} />;
  }

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
        <h1 className="text-white text-lg font-bold">냥냥 서바이벌</h1>
      </div>

      {/* 타이틀 */}
      <div className="text-center pt-6 pb-8 px-4">
        <p className="text-6xl mb-4">🐱</p>
        <h2 className="text-white text-2xl font-bold mb-2">냥냥 서바이벌</h2>
        <p className="text-gray-400 text-sm">
          쥐떼를 막아내고 끝까지 살아남으세요
        </p>
      </div>

      {/* 캐릭터 선택 */}
      <div className="px-4 flex-1">
        <p className="text-gray-300 text-sm font-semibold mb-3">고양이 선택</p>
        <div className="grid grid-cols-2 gap-3 mb-8">
          {CAT_TYPES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCat(cat.id)}
              className={`rounded-2xl p-4 text-left border-2 transition-colors ${
                selectedCat === cat.id
                  ? "border-[#3182F6] bg-[#3182F6]/10"
                  : "border-gray-700 bg-[#16213e]"
              }`}
            >
              <p className="text-3xl mb-2">{cat.emoji}</p>
              <p className="text-white font-semibold text-sm">{cat.name}</p>
              <p className="text-gray-400 text-xs mt-1 leading-relaxed">{cat.desc}</p>
            </button>
          ))}
        </div>

        {/* 조작법 안내 */}
        <div className="bg-[#16213e] rounded-2xl p-4 mb-8">
          <p className="text-gray-300 text-sm font-semibold mb-2">조작법</p>
          <div className="space-y-1.5">
            <p className="text-gray-400 text-xs">📱 화면 터치 후 드래그 → 이동</p>
            <p className="text-gray-400 text-xs">⌨️ WASD / 방향키 → 이동</p>
            <p className="text-gray-400 text-xs">⚔️ 공격은 자동 (가장 가까운 적 조준)</p>
            <p className="text-gray-400 text-xs">⭐ 경험치 오브 수집 → 레벨업 → 무기 선택</p>
          </div>
        </div>
      </div>

      {/* 시작 버튼 */}
      <div className="px-4 pb-10">
        <button
          onClick={() => setStarted(true)}
          className="w-full py-4 bg-[#3182F6] rounded-2xl text-white text-lg font-bold"
        >
          게임 시작하기
        </button>
      </div>
    </div>
  );
}
