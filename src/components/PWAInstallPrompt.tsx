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
    // 이미 standalone(앱으로 열림)이면 설치 배너 숨김
    const inStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    if (inStandalone) {
      setIsInstalled(true);
      return;
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

  if (!showBanner || !deferredPrompt || isInstalled) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
      <p className="text-sm font-medium text-[#191F28]">
        앱으로 설치하는 걸 권장해요
      </p>
      <p className="mt-1 text-xs text-[#8B95A1]">
        아래 &quot;앱으로 설치&quot;를 눌러주세요.
      </p>
      <div className="mt-3 flex gap-2">
        <Button
          onClick={handleInstall}
          className="flex-1 rounded-xl bg-[#3182F6] text-white hover:bg-[#1B64DA]"
        >
          <Download className="mr-2 h-4 w-4" />
          앱으로 설치
        </Button>
        <Button
          variant="ghost"
          className="rounded-xl text-[#8B95A1]"
          onClick={() => setShowBanner(false)}
        >
          나중에
        </Button>
      </div>
    </div>
  );
}
