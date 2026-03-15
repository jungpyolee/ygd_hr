"use client";

import { useState, useEffect } from "react";
import { Share, PlusSquare, X } from "lucide-react";

export default function IosInstallPrompt() {
  const [isIos, setIsIos] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // 1. 현재 기기가 iOS인지, 그리고 브라우저가 사파리인지 감지
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);

    // PWA로 이미 설치되어 실행 중인지 확인 (설치된 상태면 안 띄움)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator &&
        (window.navigator as any).standalone === true);

    if (isIOSDevice && !isStandalone) {
      setIsIos(true);
      // 너무 빨리 뜨면 거슬리니 1.5초 뒤에 스르륵 올라오게 설정
      setTimeout(() => setShowPrompt(true), 1500);
    }
  }, []);

  if (!isIos || !showPrompt) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 mx-auto max-w-md animate-in slide-in-from-bottom-10 fade-in duration-500">
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
        <p className="text-[14px] text-[#4E5968] mb-4 leading-relaxed">
          사파리 하단 메뉴에서 공유 버튼을 누르고
          <br />홈 화면에 추가를 선택하시면 됩니다.
        </p>

        <div className="flex items-center gap-3 bg-[#F2F4F6] p-3 rounded-xl text-[13px] text-[#333D4B] font-medium">
          <div className="flex items-center gap-1.5 bg-white px-2 py-1.5 rounded shadow-sm">
            <Share className="w-4 h-4 text-blue-500" /> 공유
          </div>
          <span>→</span>
          <div className="flex items-center gap-1.5 bg-white px-2 py-1.5 rounded shadow-sm">
            <PlusSquare className="w-4 h-4 text-slate-600" /> 홈 화면에 추가
          </div>
        </div>

        {/* 사파리 하단 툴바를 향해 가리키는 화살표 꼬리 */}
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-b border-r border-slate-200 rotate-45" />
      </div>
    </div>
  );
}
