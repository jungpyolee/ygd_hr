"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function AdminPushToggle() {
  const [enabled, setEnabled] = useState(false);
  const [permissionState, setPermissionState] = useState<
    "default" | "granted" | "denied" | "unsupported"
  >("default");
  const [saving, setSaving] = useState(false);

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
    setSaving(true);
    try {
      if (next) {
        const permission = await Notification.requestPermission();
        setPermissionState(permission as "granted" | "denied" | "default");
        if (permission !== "granted") {
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
          endpoint: string;
          keys: { p256dh: string; auth: string };
        };
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

      setEnabled(next);
      toast.success(next ? "푸시 알림을 켰어요." : "푸시 알림을 껐어요.");
    } catch (err) {
      console.error(err);
      toast.error("설정 저장에 실패했어요.", { description: "잠시 후 다시 시도해주세요." });
    } finally {
      setSaving(false);
    }
  }

  if (permissionState === "unsupported") return null;

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="text-sm text-[#4E5968]">푸시 알림</span>
      {permissionState === "denied" ? (
        <span className="text-xs text-[#8B95A1]">브라우저에서 허용 필요</span>
      ) : (
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={saving}
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
