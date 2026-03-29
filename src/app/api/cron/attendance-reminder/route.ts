import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPushToProfile } from "@/lib/push-server";
import type { NotificationType } from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * 출퇴근 미체크 리마인더 Cron
 * - 매 10분 실행 (pg_cron, KST 07~21시)
 * - 출근 시간 5~15분 경과 + IN 기록 없으면 출근 리마인더
 * - 퇴근 시간 5~15분 경과 + 마지막 기록이 IN이면 퇴근 리마인더
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
  const kstParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const kstHour = Number(kstParts.find((p) => p.type === "hour")?.value ?? 0);
  const kstMinute = Number(kstParts.find((p) => p.type === "minute")?.value ?? 0);

  // 오전 7시 ~ 밤 10시(22시) 사이에만 동작
  if (kstHour < 7 || kstHour >= 22) {
    return NextResponse.json({ message: "Outside operating hours (07-22 KST)", sent: 0 });
  }

  const currentMinutes = kstHour * 60 + kstMinute;

  // 오늘 active 스케줄 전체 조회
  const { data: slots } = await supabase
    .from("schedule_slots")
    .select(
      "profile_id, start_time, end_time, store_id, weekly_schedule_id, stores!store_id(label)",
    )
    .eq("slot_date", todayStr)
    .eq("status", "active");

  if (!slots?.length) {
    return NextResponse.json({ message: "No slots today", sent: 0 });
  }

  // confirmed 주간 스케줄만 필터
  const wsIds = [...new Set(slots.map((s) => s.weekly_schedule_id))];
  const { data: wsData } = await supabase
    .from("weekly_schedules")
    .select("id")
    .in("id", wsIds)
    .eq("status", "confirmed");
  const confirmedWsIds = new Set((wsData ?? []).map((w) => w.id));
  const confirmedSlots = slots.filter((s) => confirmedWsIds.has(s.weekly_schedule_id));

  if (!confirmedSlots.length) {
    return NextResponse.json({ message: "No confirmed slots", sent: 0 });
  }

  // 오늘 출퇴근 기록 조회
  const profileIds = [...new Set(confirmedSlots.map((s) => s.profile_id))];
  const { data: logs } = await supabase
    .from("attendance_logs")
    .select("profile_id, type, created_at")
    .in("profile_id", profileIds)
    .gte("created_at", `${todayStr}T00:00:00+09:00`)
    .lte("created_at", `${todayStr}T23:59:59+09:00`);

  // profile별 IN/OUT 상태 집계
  const hasCheckIn = new Set<string>();
  const lastTypeByProfile = new Map<string, string>();
  for (const log of logs ?? []) {
    if (log.type === "IN") hasCheckIn.add(log.profile_id);
    const existing = lastTypeByProfile.get(log.profile_id);
    if (!existing) {
      lastTypeByProfile.set(log.profile_id, log.type);
    } else {
      // created_at 기준 최신
      const currentLog = (logs ?? []).find(
        (l) => l.profile_id === log.profile_id && l.type === existing,
      );
      if (currentLog && new Date(log.created_at) > new Date(currentLog.created_at)) {
        lastTypeByProfile.set(log.profile_id, log.type);
      }
    }
  }

  // 오늘 이미 발송한 리마인더 확인 (중복 방지)
  const { data: sentNotifs } = await supabase
    .from("notifications")
    .select("profile_id, type")
    .in("profile_id", profileIds)
    .in("type", ["checkin_reminder", "checkout_reminder"])
    .gte("created_at", `${todayStr}T00:00:00+09:00`);

  const alreadySent = new Set(
    (sentNotifs ?? []).map((n) => `${n.profile_id}_${n.type}`),
  );

  let sentCount = 0;

  for (const slot of confirmedSlots) {
    const [sh, sm] = slot.start_time.split(":").map(Number);
    const [eh, em] = slot.end_time.split(":").map(Number);
    const startMinutes = sh * 60 + sm;
    const endMinutes = eh * 60 + em;
    const storeName =
      (slot.stores as { label?: string } | null)?.label ?? "";

    // 출근 리마인더: 시작시간 5~15분 경과 + IN 기록 없음
    const checkinDiff = currentMinutes - startMinutes;
    if (
      checkinDiff >= 5 &&
      checkinDiff <= 15 &&
      !hasCheckIn.has(slot.profile_id) &&
      !alreadySent.has(`${slot.profile_id}_checkin_reminder`)
    ) {
      await sendReminder(
        slot.profile_id,
        "checkin_reminder",
        "출근 체크 잊지 않았나요?",
        `오늘 ${slot.start_time.slice(0, 5)} ${storeName} 근무가 시작됐어요. 출근 버튼을 눌러주세요.`,
      );
      alreadySent.add(`${slot.profile_id}_checkin_reminder`);
      sentCount++;
    }

    // 퇴근 리마인더: 종료시간 5~15분 경과 + 마지막 기록이 IN (OUT 안 찍음)
    const checkoutDiff = currentMinutes - endMinutes;
    if (
      checkoutDiff >= 5 &&
      checkoutDiff <= 15 &&
      lastTypeByProfile.get(slot.profile_id) === "IN" &&
      !alreadySent.has(`${slot.profile_id}_checkout_reminder`)
    ) {
      await sendReminder(
        slot.profile_id,
        "checkout_reminder",
        "퇴근 체크 잊지 않았나요?",
        `오늘 ${slot.end_time.slice(0, 5)} ${storeName} 근무가 끝났어요. 퇴근 버튼을 눌러주세요.`,
      );
      alreadySent.add(`${slot.profile_id}_checkout_reminder`);
      sentCount++;
    }
  }

  return NextResponse.json({ message: "OK", sent: sentCount });
}

async function sendReminder(
  profileId: string,
  type: NotificationType,
  title: string,
  content: string,
) {
  // 인앱 알림 저장
  await supabase.from("notifications").insert({
    profile_id: profileId,
    target_role: "employee",
    type,
    title,
    content,
  });

  // 푸시 발송
  await sendPushToProfile(profileId, {
    title,
    body: content,
    type,
    isAdmin: false,
  }).catch((err) => {
    console.error("[Cron] Push 실패:", profileId, err);
  });
}
