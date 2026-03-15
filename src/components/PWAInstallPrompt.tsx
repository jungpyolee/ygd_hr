"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // 1. 이미 앱(standalone)으로 열린 상태인지 확인
    const inStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    if (inStandalone) {
      setIsInstalled(true);
      return;
    }

    // 🚀 2. "오늘 하루 보지 않기" 만료 시간 체크 로직
    const hideUntil = localStorage.getItem("hide_pwa_prompt_until");
    if (hideUntil) {
      const now = new Date().getTime();
      // 저장된 시간(오늘 자정)이 아직 안 지났으면 팝업을 띄우지 않고 종료
      if (now < parseInt(hideUntil, 10)) {
        return;
      } else {
        // 시간이 지났으면 찌꺼기 데이터 삭제
        localStorage.removeItem("hide_pwa_prompt_until");
      }
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowBanner(false);
      setDeferredPrompt(null);
    }
  };

  // 🚀 3. "오늘 하루 보지 않기" 버튼 클릭 시 실행될 함수
  const handleHideToday = () => {
    const now = new Date();
    // 오늘 밤 12시(자정)로 만료 시간을 세팅합니다.
    const midnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1
    );

    // localStorage에 자정의 timestamp를 저장
    localStorage.setItem(
      "hide_pwa_prompt_until",
      midnight.getTime().toString()
    );
    setShowBanner(false);
  };

  if (!showBanner || !deferredPrompt || isInstalled) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl animate-in slide-in-from-bottom-5 fade-in duration-300">
      <p className="text-[15px] font-bold text-[#191F28]">
        앱으로 설치하는 걸 권장해요
      </p>
      <p className="mt-1 text-[13px] text-[#4E5968]">
        더 빠르고 편하게 출퇴근을 기록할 수 있어요.
      </p>

      <div className="mt-4 flex gap-2">
        <Button
          onClick={handleInstall}
          className="flex-1 rounded-xl bg-[#3182F6] font-bold text-white hover:bg-[#1B64DA] active:scale-[0.98] transition-transform"
        >
          <Download className="mr-2 h-4 w-4" />
          앱으로 설치
        </Button>
        <Button
          variant="secondary"
          className="rounded-xl font-semibold text-[#4E5968] bg-[#F2F4F6] hover:bg-[#E5E8EB] active:scale-[0.98] transition-transform"
          onClick={() => setShowBanner(false)}
        >
          닫기
        </Button>
      </div>

      {/* 💡 오늘 하루 보지 않기 텍스트 버튼 (은은하게 배치) */}
      <div className="mt-3.5 text-center">
        <button
          onClick={handleHideToday}
          className="text-[12px] font-medium text-[#8B95A1] hover:text-[#4E5968] underline underline-offset-2 transition-colors"
        >
          오늘 하루 보지 않기
        </button>
      </div>
    </div>
  );
}
