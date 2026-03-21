"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";

export default function AdminPushToggle() {
  const [enabled, setEnabled] = useState(false);
  const [permissionState, setPermissionState] = useState<
    "default" | "granted" | "denied" | "unsupported"
  >("default");
  const [saving, setSaving] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [showDeniedGuide, setShowDeniedGuide] = useState(false);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermissionState("unsupported");
    } else {
      setPermissionState(Notification.permission as "default" | "granted" | "denied");
    }

    fetch("/api/push/preferences")
      .then((r) => r.json())
      .then((d) => setEnabled(d?.enabled ?? false))
      .catch(() => {});
  }, []);

  async function handleToggle(next: boolean) {
    if (permissionState === "unsupported") return;

    // 낙관적 업데이트 — 즉시 UI 반영
    setEnabled(next);
    setSaving(true);
    try {
      if (next) {
        const permission = await Notification.requestPermission();
        setPermissionState(permission as "granted" | "denied" | "default");
        if (permission !== "granted") {
          setEnabled(false);
          toast.error("알림 권한이 필요해요.", {
            description: "브라우저 설정에서 알림을 허용해주세요.",
          });
          return;
        }

        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        const sub =
          existing ??
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(
              process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
            ) as unknown as BufferSource,
          }));

        const subJson = sub.toJSON() as {
          endpoint?: string;
          keys?: { p256dh: string; auth: string };
        };
        if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
          throw new Error("구독 정보가 올바르지 않아요.");
        }
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subJson),
        });
      } else {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
      }

      toast.success(next ? "푸시 알림을 켰어요." : "푸시 알림을 껐어요.");
      // 성공 후 2초 쿨다운
      setCooldown(true);
      setTimeout(() => setCooldown(false), 2000);
    } catch (err) {
      console.error(err);
      // 실패 시 UI 롤백
      setEnabled(!next);
      toast.error("설정 저장에 실패했어요.", { description: "잠시 후 다시 시도해주세요." });
    } finally {
      setSaving(false);
    }
  }

  if (permissionState === "unsupported") return null;

  return (
    <>
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="text-sm text-[#4E5968]">푸시 알림</span>
      {permissionState === "denied" ? (
        <button
          onClick={() => setShowDeniedGuide(true)}
          className="flex items-center gap-1 text-xs font-bold text-[#3182F6] hover:bg-[#E8F3FF] px-2 py-1 rounded-lg transition-colors"
        >
          설정 방법 보기
          <ExternalLink className="w-3 h-3" />
        </button>
      ) : (
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={saving || cooldown}
          onClick={() => handleToggle(!enabled)}
          className={[
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent",
            "transition-colors duration-200 ease-in-out focus-visible:outline-none",
            "disabled:opacity-40 disabled:cursor-not-allowed",
            enabled ? "bg-[#3182F6]" : "bg-[#E5E8EB]",
          ].join(" ")}
        >
          <span
            className={[
              "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow",
              "transition duration-200 ease-in-out",
              enabled ? "translate-x-5" : "translate-x-0",
            ].join(" ")}
          />
        </button>
      )}
    </div>
    {showDeniedGuide && <DeniedGuideModal onClose={() => setShowDeniedGuide(false)} />}
    </>
  );
}

function DeniedGuideModal({ onClose }: { onClose: () => void }) {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isSafariDesktop = !isIOS && !isAndroid && /^((?!chrome|android).)*safari/i.test(ua);

  const isPWA =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true);

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[320px] bg-white rounded-[28px] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <h3 className="text-[16px] font-bold text-[#191F28] mb-1">알림 허용 방법</h3>
        <p className="text-[13px] text-[#4E5968] mb-4 leading-relaxed">
          이전에 알림을 차단했어요. 아래 방법으로 다시 허용할 수 있어요.
        </p>
        <ol className="space-y-3 mb-5">
          {isIOS && isPWA && (
            <>
              <Step num={1} text="아이폰 설정 앱 열기" />
              <Step num={2} text="상단 검색창에 '연경당' 입력" />
              <Step num={3} text="알림 → 허용으로 변경" />
            </>
          )}
          {isIOS && !isPWA && (
            <>
              <Step num={1} text="아이폰 설정 앱 열기" />
              <Step num={2} text="Safari → 알림 → 이 사이트 허용" />
            </>
          )}
          {isAndroid && isPWA && (
            <>
              <Step num={1} text="앱 아이콘 길게 누르기" />
              <Step num={2} text="앱 정보 → 권한 → 알림 → 허용" />
            </>
          )}
          {isAndroid && !isPWA && (
            <>
              <Step num={1} text="주소창 왼쪽 자물쇠(🔒) 아이콘 탭" />
              <Step num={2} text="사이트 설정 → 알림 → 허용" />
            </>
          )}
          {isSafariDesktop && (
            <>
              <Step num={1} text="Safari 메뉴 → 설정 → 웹사이트" />
              <Step num={2} text="알림 → 이 사이트 → 허용" />
            </>
          )}
          {!isIOS && !isAndroid && !isSafariDesktop && (
            isPWA ? (
              <>
                <Step num={1} text="주소창에 해당 사이트 주소 직접 입력해서 열기" />
                <Step num={2} text="주소창 왼쪽 자물쇠(🔒) 아이콘 클릭" />
                <Step num={3} text="알림 권한 → 허용으로 변경 후 PWA 재실행" />
              </>
            ) : (
              <>
                <Step num={1} text="주소창 왼쪽 자물쇠(🔒) 아이콘 클릭" />
                <Step num={2} text="알림 권한 → 허용으로 변경" />
                <Step num={3} text="페이지 새로고침 후 다시 시도" />
              </>
            )
          )}
        </ol>
        <button
          onClick={onClose}
          className="w-full py-3 bg-[#F2F4F6] text-[#4E5968] rounded-2xl font-bold text-[14px] active:scale-95 transition-all"
        >
          확인했어요
        </button>
      </div>
    </div>
  );
}

function Step({ num, text }: { num: number; text: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="shrink-0 w-5 h-5 rounded-full bg-[#E8F3FF] text-[#3182F6] text-[11px] font-bold flex items-center justify-center mt-0.5">
        {num}
      </span>
      <span className="text-[13px] text-[#191F28] leading-snug">{text}</span>
    </li>
  );
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr.buffer;
}
