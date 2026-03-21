"use server";

import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { sendPushToProfile, sendPushToRole } from "@/lib/push-server";

export type NotificationType =
  | "attendance_in"
  | "attendance_out"
  | "attendance_remote_out"
  | "attendance_business_trip_in"
  | "attendance_business_trip_out"
  | "substitute_requested"
  | "substitute_approved"
  | "substitute_rejected"
  | "substitute_filled"
  | "schedule_updated"
  | "schedule_published"
  | "recipe_comment"
  | "recipe_reply"
  | "recipe_mention"
  | "announcement"
  | "health_cert_expiry"
  | "document_upload"
  | "profile_update"
  | "onboarding"
  | "attendance_fallback_in"
  | "attendance_fallback_out";

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface CreateNotificationParams {
  profile_id?: string;
  target_role: "admin" | "employee" | "all";
  type: NotificationType;
  title: string;
  content: string;
  source_id?: string;
}

/**
 * 알림 생성 + Web Push 발송
 * - DB INSERT 완료 즉시 반환 (push는 비동기 fire-and-forget)
 * - push 실패는 인앱 알림에 영향 없음
 */
export const createNotification = async ({
  profile_id,
  target_role,
  type,
  title,
  content,
  source_id,
}: CreateNotificationParams): Promise<{ error: Error | null }> => {
  // 호출자 인증 확인 (미인증 클라이언트 차단)
  const cookieStore = await cookies();
  const caller = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value } }
  );
  const {
    data: { user },
  } = await caller.auth.getUser();
  if (!user) return { error: new Error("Unauthorized") };

  // DB INSERT
  const { data: inserted, error } = await adminSupabase
    .from("notifications")
    .insert({ profile_id, target_role, type, title, content, source_id })
    .select("id")
    .single();

  if (error) return { error: new Error(error.message) };

  // ✅ push는 fire-and-forget — DB INSERT 완료 즉시 반환하여 UI 블로킹 방지
  // target_role이 수신자 역할을 이미 명시하므로 checkIsAdmin 쿼리 불필요
  const notificationId = inserted?.id as string | undefined;
  void dispatchPush({ profile_id, target_role, type, title, content, source_id, notificationId });

  return { error: null };
};

async function dispatchPush({
  profile_id,
  target_role,
  type,
  title,
  content,
  source_id,
  notificationId,
}: CreateNotificationParams & { notificationId?: string }) {
  try {
    if (profile_id) {
      await sendPushToProfile(profile_id, {
        title,
        body: content,
        type,
        sourceId: source_id,
        notificationId,
        isAdmin: target_role === "admin",  // ✅ DB 조회 없이 target_role로 판단
      });
    } else {
      await sendPushToRole(target_role, {
        title,
        body: content,
        type,
        sourceId: source_id,
        notificationId,
        isAdmin: target_role === "admin",
      });
    }
  } catch (err) {
    console.error("[Push] 발송 실패:", err);
  }
}

/** @deprecated createNotification 사용 */
export const sendNotification = createNotification;
