"use client";

import { useState, useEffect } from "react";
// 💡 MoreHorizontal (3닷 아이콘) 추가
import { Share, PlusSquare, X, MoreHorizontal } from "lucide-react";

export default function IosInstallPrompt() {
  const [isIos, setIsIos] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator &&
        (window.navigator as any).standalone === true);

    if (isIOSDevice && !isStandalone) {
      setIsIos(true);
      setTimeout(() => setShowPrompt(true), 1500);
    }
  }, []);

  if (!isIos || !showPrompt) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[60] p-4 pb-24 mx-auto max-w-md animate-in slide-in-from-bottom-10 fade-in duration-500">
      <div className="bg-white/90 backdrop-blur-md border border-slate-200 shadow-2xl rounded-2xl p-5 relative">
        <button
          onClick={() => setShowPrompt(false)}
          className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-[16px] font-bold text-[#191F28] mb-2 flex items-center gap-2">
          🍏 아이폰이신가요? 앱으로 설치해보세요!
        </h3>

        {/* 💡 문구 수정 */}
        <p className="text-[14px] text-[#4E5968] mb-4 leading-relaxed">
          우측 하단의 <strong>3닷(···) 버튼</strong>을 누르고{" "}
          <strong>공유하기</strong>를 누른 후<br />
          <strong>홈 화면에 추가</strong>를 선택해주세요.
        </p>

        {/* 💡 3단계 플로우 UI로 변경 */}
        <div className="flex flex-wrap items-center justify-center gap-2 bg-[#F2F4F6] p-3 rounded-xl text-[12px] text-[#333D4B] font-medium">
          <div className="flex items-center gap-1.5 bg-white px-2 py-1.5 rounded shadow-sm">
            <MoreHorizontal className="w-4 h-4 text-slate-600" /> 3닷 버튼
          </div>
          <span className="text-slate-400 text-[10px]">▶</span>
          <div className="flex items-center gap-1.5 bg-white px-2 py-1.5 rounded shadow-sm">
            <Share className="w-4 h-4 text-blue-500" /> 공유하기
          </div>
          <span className="text-slate-400 text-[10px]">▶</span>
          <div className="flex items-center gap-1.5 bg-white px-2 py-1.5 rounded shadow-sm">
            <PlusSquare className="w-4 h-4 text-slate-600" /> 홈 화면 추가
          </div>
        </div>

        <div className="absolute -bottom-2 right-8 w-4 h-4 bg-white border-b border-r border-slate-200 rotate-45" />
      </div>
    </div>
  );
}
