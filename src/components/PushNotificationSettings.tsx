"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, ExternalLink } from "lucide-react";

interface PushPreferences {
  enabled: boolean;
  type_settings: Record<string, boolean>;
}

const EMPLOYEE_SETTING_GROUPS = [
  {
    label: "스케줄",
    items: [
      { key: "substitute_approved", label: "대타 요청 승인/거절" },
      { key: "substitute_filled", label: "대타 자리 채워짐" },
      { key: "schedule_updated", label: "스케줄 변경" },
      { key: "schedule_published", label: "스케줄 확정·공개" },
    ],
  },
  {
    label: "레시피",
    items: [
      { key: "recipe_comment", label: "새 댓글" },
      { key: "recipe_reply", label: "대댓글" },
      { key: "recipe_mention", label: "@멘션" },
    ],
  },
  {
    label: "공지사항",
    items: [{ key: "announcement", label: "새 공지사항" }],
  },
];

export default function PushNotificationSettings() {
  const [prefs, setPrefs] = useState<PushPreferences>({
    enabled: false,
    type_settings: {},
  });
  const [permissionState, setPermissionState] = useState<
    "default" | "granted" | "denied" | "unsupported"
  >("default");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDeniedGuide, setShowDeniedGuide] = useState(false);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermissionState("unsupported");
    } else {
      setPermissionState(Notification.permission as "default" | "granted" | "denied");
    }
    loadPrefs();
  }, []);

  async function loadPrefs() {
    try {
      const res = await fetch("/api/push/preferences");
      if (res.ok) setPrefs(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function handleMasterToggle(enabled: boolean) {
    if (permissionState === "unsupported") return;

    setSaving(true);
    try {
      if (enabled) {
        // 권한 요청
        const permission = await Notification.requestPermission();
        setPermissionState(permission as "granted" | "denied" | "default");
        if (permission !== "granted") {
          toast.error("알림 권한이 필요해요.", {
            description: "브라우저 설정에서 알림을 허용해주세요.",
          });
          return;
        }

        // 구독 생성
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        const sub =
          existing ??
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(
              process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
            ),
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
        // 구독 해제
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

      setPrefs((prev) => ({ ...prev, enabled }));
      toast.success(enabled ? "푸시 알림을 켰어요." : "푸시 알림을 껐어요.");
    } catch (err) {
      console.error(err);
      // 실패 시 UI 롤백
      setPrefs((prev) => ({ ...prev, enabled: !enabled }));
      toast.error("설정 저장에 실패했어요.", { description: "잠시 후 다시 시도해주세요." });
    } finally {
      setSaving(false);
    }
  }

  async function handleTypeToggle(key: string, value: boolean) {
    const prev_settings = prefs.type_settings;
    const next = { ...prev_settings, [key]: value };
    // 낙관적 업데이트
    setPrefs((prev) => ({ ...prev, type_settings: next }));

    try {
      const res = await fetch("/api/push/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type_settings: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // 실패 시 롤백
      setPrefs((prev) => ({ ...prev, type_settings: prev_settings }));
      toast.error("설정 저장에 실패했어요.", { description: "잠시 후 다시 시도해주세요." });
    }
  }

  if (loading) return null;

  return (
    <div className="space-y-4">
      {/* 마스터 토글 */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-[#191F28]">푸시 알림</p>
          {permissionState === "unsupported" && (
            <p className="text-xs text-[#8B95A1] mt-0.5">
              이 환경에서는 푸시 알림을 지원하지 않아요.
            </p>
          )}
        </div>

        {permissionState === "denied" ? (
          /* 거부 상태 — 토글 대신 안내 버튼 */
          <button
            onClick={() => setShowDeniedGuide(true)}
            className="flex items-center gap-1 text-xs font-bold text-[#3182F6] hover:bg-[#E8F3FF] px-2.5 py-1.5 rounded-xl transition-colors"
          >
            설정 방법 보기
            <ExternalLink className="w-3 h-3" />
          </button>
        ) : (
          <Toggle
            checked={prefs.enabled}
            disabled={saving || permissionState === "unsupported"}
            onChange={handleMasterToggle}
          />
        )}
      </div>

      {/* 거부 상태 안내 모달 */}
      {showDeniedGuide && <DeniedGuideModal onClose={() => setShowDeniedGuide(false)} />}

      {/* 세부 타입 설정 (enabled=true일 때만) */}
      {prefs.enabled && permissionState === "granted" && (
        <div className="space-y-4 pt-2 border-t border-[#E5E8EB]">
          {EMPLOYEE_SETTING_GROUPS.map((group) => (
            <div key={group.label} className="space-y-2">
              <p className="text-xs font-medium text-[#8B95A1]">{group.label}</p>
              {group.items.map((item) => (
                <div key={item.key} className="flex items-center justify-between py-1">
                  <span className="text-sm text-[#191F28]">{item.label}</span>
                  <Toggle
                    checked={prefs.type_settings[item.key] !== false}
                    onChange={(v) => handleTypeToggle(item.key, v)}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 토글 UI ─────────────────────────────────────────────────

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent",
        "transition-colors duration-200 ease-in-out focus-visible:outline-none",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        checked ? "bg-[#3182F6]" : "bg-[#E5E8EB]",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow",
          "transition duration-200 ease-in-out",
          checked ? "translate-x-5" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}

// ── 브라우저 알림 거부 해제 안내 모달 ──────────────────────────

function DeniedGuideModal({ onClose }: { onClose: () => void }) {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isSafariDesktop = !isIOS && !isAndroid && /^((?!chrome|android).)*safari/i.test(ua);

  // PWA standalone 모드 감지
  const isPWA =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true);

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[320px] bg-white rounded-[28px] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[16px] font-bold text-[#191F28]">알림 허용 방법</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F4F6] text-[#8B95A1]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[13px] text-[#4E5968] mb-4 leading-relaxed">
          이전에 알림을 차단했어요. 아래 방법으로 다시 허용할 수 있어요.
        </p>

        <ol className="space-y-3">
          {/* iOS PWA */}
          {isIOS && isPWA && (
            <>
              <Step num={1} text="아이폰 설정 앱 열기" />
              <Step num={2} text="상단 검색창에 '연경당' 입력" />
              <Step num={3} text="알림 → 허용으로 변경" />
            </>
          )}
          {/* iOS 브라우저 */}
          {isIOS && !isPWA && (
            <>
              <Step num={1} text="아이폰 설정 앱 열기" />
              <Step num={2} text="Safari → 알림 → 이 사이트 허용" />
            </>
          )}
          {/* Android PWA */}
          {isAndroid && isPWA && (
            <>
              <Step num={1} text="앱 아이콘 길게 누르기" />
              <Step num={2} text="앱 정보 → 권한 → 알림 → 허용" />
            </>
          )}
          {/* Android 브라우저 */}
          {isAndroid && !isPWA && (
            <>
              <Step num={1} text="주소창 왼쪽 자물쇠(🔒) 아이콘 탭" />
              <Step num={2} text="사이트 설정 → 알림 → 허용" />
            </>
          )}
          {/* Safari 데스크탑 */}
          {isSafariDesktop && (
            <>
              <Step num={1} text="Safari 메뉴 → 설정 → 웹사이트" />
              <Step num={2} text="알림 → 이 사이트 → 허용" />
            </>
          )}
          {/* Chrome 등 데스크탑 (PWA 포함) */}
          {!isIOS && !isAndroid && !isSafariDesktop && (
            <>
              {isPWA ? (
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
              )}
            </>
          )}
        </ol>

        <button
          onClick={onClose}
          className="w-full mt-5 py-3 bg-[#F2F4F6] text-[#4E5968] rounded-2xl font-bold text-[14px] active:scale-95 transition-all"
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

// VAPID public key → Uint8Array 변환
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr.buffer;
}
