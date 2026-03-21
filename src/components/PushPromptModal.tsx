"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";

const DISMISSED_KEY = "push_prompt_dismissed_at";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7일

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr.buffer;
}

export default function PushPromptModal() {
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // 지원 여부 확인
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;

    // 권한이 이미 허용됨 → 현재 subscription을 DB에 자동 동기화 (재설치/갱신 대응)
    if (Notification.permission === "granted") {
      navigator.serviceWorker.ready
        .then(async (reg) => {
          let sub = await reg.pushManager.getSubscription();
          // subscription이 없으면 새로 생성 (권한이 있으므로 사용자 동작 불필요)
          if (!sub) {
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(
                process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
              ) as unknown as BufferSource,
            });
          }
          const subJson = sub.toJSON() as {
            endpoint?: string;
            keys?: { p256dh: string; auth: string };
          };
          if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) return;
          // 조용히 upsert (endpoint가 같으면 중복 없음, 바뀌었으면 새 row)
          await fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(subJson),
          });
        })
        .catch(() => {/* 실패해도 UX에 영향 없음 */});
      return;
    }

    // permission === "default" → 모달 표시 여부 결정
    const dismissedAt = localStorage.getItem(DISMISSED_KEY);
    if (dismissedAt && Date.now() - Number(dismissedAt) < DISMISS_DURATION_MS) return;

    // 서버에서 push_preferences 확인 — 이미 enabled면 표시 안 함
    fetch("/api/push/preferences")
      .then((r) => r.json())
      .then((prefs) => {
        if (!prefs?.enabled) setShow(true);
      })
      .catch(() => setShow(true));
  }, []);

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setShow(false);
  }

  async function handleEnable() {
    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("알림 권한이 거부됐어요.", {
          description: "브라우저 설정에서 알림을 허용해주세요.",
        });
        setShow(false);
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

      toast.success("푸시 알림을 켰어요.");
      setShow(false);
    } catch (err) {
      console.error(err);
      toast.error("설정에 실패했어요.", { description: "잠시 후 다시 시도해주세요." });
    } finally {
      setLoading(false);
    }
  }

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center px-6">
      {/* 딤 */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleDismiss}
      />

      {/* 모달 */}
      <div className="relative w-full max-w-[320px] bg-white rounded-[28px] p-7 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* 아이콘 */}
        <div className="w-14 h-14 rounded-2xl bg-[#E8F3FF] flex items-center justify-center mb-5 mx-auto">
          <Bell className="w-7 h-7 text-[#3182F6]" />
        </div>

        <h2 className="text-[18px] font-bold text-[#191F28] text-center mb-2">
          알림을 받아볼까요?
        </h2>
        <p className="text-[14px] text-[#4E5968] text-center leading-relaxed mb-7">
          스케줄 변경, 대타 승인 등 중요한 소식을 앱 밖에서도 바로 받아볼 수 있어요.
        </p>

        <div className="space-y-2">
          <button
            onClick={handleEnable}
            disabled={loading}
            className="w-full py-3.5 bg-[#3182F6] text-white rounded-2xl font-bold text-[15px] active:scale-95 transition-all disabled:opacity-60"
          >
            {loading ? "설정 중..." : "알림 켜기"}
          </button>
          <button
            onClick={handleDismiss}
            className="w-full py-3.5 text-[#8B95A1] rounded-2xl font-bold text-[15px] active:scale-95 transition-all hover:bg-[#F2F4F6]"
          >
            나중에
          </button>
        </div>
      </div>
    </div>
  );
}
