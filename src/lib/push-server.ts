import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import type { NotificationType } from "@/lib/notifications";
import { getNotificationUrl } from "@/lib/notificationUrls";

// VAPID 설정 (서버 전용 — 클라이언트에 노출 금지)
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

// RLS 우회 admin client (서버 전용)
const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface PushPayload {
  title: string;
  body: string;
  type: NotificationType;
  sourceId?: string;
  notificationId?: string;
  isAdmin: boolean;
}

/**
 * 특정 profile에게 푸시 발송
 * - preferences + subscriptions를 병렬 조회
 */
export async function sendPushToProfile(
  profileId: string,
  payload: PushPayload
): Promise<void> {
  // ✅ 두 쿼리 병렬 실행
  const [prefs, subs] = await Promise.all([
    getPreferences(profileId),
    getSubscriptions(profileId),
  ]);

  if (!prefs?.enabled) return;
  if (!isTypeEnabled(prefs.type_settings, payload.type)) return;
  if (!subs.length) return;

  await deliverPush(subs, payload);
}

/**
 * 역할별 전체 푸시 발송 (admin / employee / all)
 * - 배치 쿼리로 N+1 제거: profiles + preferences + subscriptions 각 1회씩
 */
export async function sendPushToRole(
  role: "admin" | "employee" | "all",
  payload: PushPayload
): Promise<void> {
  // 1. 해당 role의 유저 목록
  let profileQuery = adminSupabase.from("profiles").select("id, role");
  if (role !== "all") profileQuery = profileQuery.eq("role", role);
  const { data: profiles } = await profileQuery;
  if (!profiles?.length) return;

  const profileIds = profiles.map((p) => p.id);

  // ✅ preferences + subscriptions 배치 조회 (2쿼리로 N+1 해소)
  const [{ data: allPrefs }, { data: allSubs }] = await Promise.all([
    adminSupabase
      .from("push_preferences")
      .select("profile_id, enabled, type_settings")
      .in("profile_id", profileIds)
      .eq("enabled", true),
    adminSupabase
      .from("push_subscriptions")
      .select("profile_id, endpoint, p256dh, auth_key")
      .in("profile_id", profileIds),
  ]);

  if (!allPrefs?.length || !allSubs?.length) return;

  // 수신 가능한 profile만 필터링
  const enabledProfileIds = new Set(
    allPrefs
      .filter((p) => isTypeEnabled(p.type_settings ?? {}, payload.type))
      .map((p) => p.profile_id)
  );

  // profile별 구독 목록 그룹화
  const subsByProfile = new Map<string, typeof allSubs>();
  for (const sub of allSubs) {
    if (!enabledProfileIds.has(sub.profile_id)) continue;
    const list = subsByProfile.get(sub.profile_id) ?? [];
    list.push(sub);
    subsByProfile.set(sub.profile_id, list);
  }

  // ✅ 각 profile에 병렬 발송
  const roleMap = new Map(profiles.map((p) => [p.id, p.role]));
  await Promise.allSettled(
    [...subsByProfile.entries()].map(([profileId, subs]) =>
      deliverPush(subs, {
        ...payload,
        isAdmin: roleMap.get(profileId) === "admin",
      })
    )
  );
}

// ── helpers ────────────────────────────────────────────────

async function getPreferences(profileId: string) {
  const { data } = await adminSupabase
    .from("push_preferences")
    .select("enabled, type_settings")
    .eq("profile_id", profileId)
    .single();
  return data;
}

async function getSubscriptions(profileId: string) {
  const { data } = await adminSupabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth_key")
    .eq("profile_id", profileId);
  return data ?? [];
}

function isTypeEnabled(
  typeSettings: Record<string, boolean>,
  type: NotificationType
): boolean {
  return typeSettings[type] !== false;
}

async function deliverPush(
  subs: { endpoint: string; p256dh: string; auth_key: string }[],
  payload: PushPayload
): Promise<void> {
  const url = getNotificationUrl(payload.type, payload.sourceId, payload.isAdmin);

  const tag = payload.notificationId
    ? `noti-${payload.notificationId}`
    : `${payload.type}-${payload.sourceId ?? Date.now()}`;

  const pushData = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    tag,
    url,
  });

  await Promise.allSettled(
    subs.map((sub) =>
      webpush
        .sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          pushData,
          { TTL: 86400 }
        )
        .catch(async (err: { statusCode?: number }) => {
          if (err?.statusCode === 410 || err?.statusCode === 404) {
            await adminSupabase
              .from("push_subscriptions")
              .delete()
              .eq("endpoint", sub.endpoint);
          }
        })
    )
  );
}
