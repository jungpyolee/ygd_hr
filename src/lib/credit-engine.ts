"use server";

import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import {
  CREDIT_POINTS,
  LATE_GRACE_MINUTES,
  LATE_MAJOR_THRESHOLD,
  STREAK_MILESTONES,
} from "@/lib/tier-utils";

const getAdminSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

// ─── 인증 헬퍼 ──────────────────────────────────────────
async function getAuthUser() {
  const cookieStore = await cookies();
  const caller = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value } },
  );
  const { data: { user } } = await caller.auth.getUser();
  return user;
}

async function requireAdmin() {
  const user = await getAuthUser();
  if (!user) throw new Error("Unauthorized");
  const { data } = await getAdminSupabase()
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (data?.role !== "admin") throw new Error("Forbidden");
  return user;
}

// ─── 크레딧 INSERT 헬퍼 ──────────────────────────────────
async function insertCredit(params: {
  profile_id: string;
  event_type: string;
  points: number;
  description: string;
  reference_id?: string;
  reference_date?: string;
}) {
  const { error } = await getAdminSupabase()
    .from("attendance_credits")
    .insert(params);
  if (error) console.error("[CreditEngine] INSERT 실패:", error.message);
  return !error;
}

// ─── 스트릭 업데이트 ─────────────────────────────────────
async function updateStreak(profileId: string, reset: boolean) {
  const { data: profile } = await getAdminSupabase()
    .from("profiles")
    .select("current_streak, longest_streak, streak_milestones_claimed")
    .eq("id", profileId)
    .single();

  if (!profile) return;

  if (reset) {
    await getAdminSupabase()
      .from("profiles")
      .update({ current_streak: 0 })
      .eq("id", profileId);
    return;
  }

  // 정상 출근 → 스트릭 증가
  const newStreak = profile.current_streak + 1;
  const newLongest = Math.max(profile.longest_streak, newStreak);

  await getAdminSupabase()
    .from("profiles")
    .update({ current_streak: newStreak, longest_streak: newLongest })
    .eq("id", profileId);

  // 마일스톤 보너스 체크
  const claimed: number[] = profile.streak_milestones_claimed ?? [];
  for (const ms of STREAK_MILESTONES) {
    if (newStreak >= ms.count && !claimed.includes(ms.count)) {
      await insertCredit({
        profile_id: profileId,
        event_type: `streak_bonus_${ms.count}`,
        points: ms.bonus,
        description: `스트릭 ${ms.count}회 달성 보너스 +${ms.bonus}점`,
      });
      claimed.push(ms.count);
    }
  }

  if (claimed.length > (profile.streak_milestones_claimed?.length ?? 0)) {
    await getAdminSupabase()
      .from("profiles")
      .update({ streak_milestones_claimed: claimed })
      .eq("id", profileId);
  }
}

// ─── 출근 크레딧 처리 ────────────────────────────────────
/**
 * 출근(IN) 기록 후 호출. 스케줄 start_time과 비교하여 정상/지각 판정.
 */
export async function processCheckinCredit(
  profileId: string,
  checkinTime: string, // ISO string (UTC)
  slotDate: string,    // YYYY-MM-DD
  slotStartTime: string, // HH:MM
): Promise<{ event_type: string; points: number } | null> {
  const user = await getAuthUser();
  if (!user) return null;

  // 이미 해당 슬롯에 크레딧이 있는지 중복 체크
  const { data: existing } = await getAdminSupabase()
    .from("attendance_credits")
    .select("id")
    .eq("profile_id", profileId)
    .eq("reference_date", slotDate)
    .in("event_type", ["normal_attendance", "late_minor", "late_major"])
    .limit(1);

  if (existing && existing.length > 0) return null; // 이미 처리됨

  // 지각 판정 — KST 기준 분(minute-of-day)으로 비교
  // (서버가 UTC이므로 setHours를 쓰면 UTC 기준이 되어 오차 발생)
  const [sh, sm] = slotStartTime.split(":").map(Number);
  const checkin = new Date(checkinTime);
  const kstCheckinMin = ((checkin.getUTCHours() + 9) % 24) * 60 + checkin.getUTCMinutes();
  const scheduledMin = sh * 60 + sm;
  const diffMin = kstCheckinMin - scheduledMin;

  let eventType: string;
  let points: number;
  let description: string;

  if (diffMin <= LATE_GRACE_MINUTES) {
    eventType = "normal_attendance";
    points = CREDIT_POINTS.normal_attendance;
    description = "정상 출퇴근 +3점";
  } else if (diffMin <= LATE_MAJOR_THRESHOLD) {
    eventType = "late_minor";
    points = CREDIT_POINTS.late_minor;
    description = `지각 (${Math.round(diffMin)}분) -3점`;
  } else {
    eventType = "late_major";
    points = CREDIT_POINTS.late_major;
    description = `지각 (${Math.round(diffMin)}분) -10점`;
  }

  await insertCredit({
    profile_id: profileId,
    event_type: eventType,
    points,
    description,
    reference_date: slotDate,
  });

  // 스트릭: 정상이면 증가, 지각이면 리셋
  await updateStreak(profileId, eventType !== "normal_attendance");

  return { event_type: eventType, points };
}

// ─── 예외 처리 (감점 무효화) ──────────────────────────────
/**
 * 기존 감점 이벤트를 무효화한다. 반대 부호의 exception_reversal 크레딧을 삽입하고
 * 원본 이벤트에 invalidated_by를 기록한다.
 */
export async function reverseCredit(
  creditId: string,
  reasonType: "gps_error" | "app_error" | "unavoidable_absence",
): Promise<{ error: string | null }> {
  try {
    await requireAdmin();
  } catch {
    return { error: "권한이 없어요" };
  }

  // 원본 크레딧 조회
  const { data: original } = await getAdminSupabase()
    .from("attendance_credits")
    .select("id, profile_id, event_type, points, description, reference_date, invalidated_by")
    .eq("id", creditId)
    .single();

  if (!original) return { error: "해당 이벤트를 찾을 수 없어요" };
  if (original.invalidated_by) return { error: "이미 무효화된 이벤트예요" };
  if (original.points >= 0) return { error: "감점 이벤트만 무효화할 수 있어요" };

  const reasonLabels: Record<string, string> = {
    gps_error: "GPS 오류",
    app_error: "앱 장애",
    unavoidable_absence: "부득이한 사유로 결근",
  };

  // 반대 부호로 reversal 크레딧 삽입
  const reversalPoints = Math.abs(original.points);
  const { data: reversal, error: insertError } = await getAdminSupabase()
    .from("attendance_credits")
    .insert({
      profile_id: original.profile_id,
      event_type: "exception_reversal",
      points: reversalPoints,
      description: `${reasonLabels[reasonType]} — 감점 취소 +${reversalPoints}점`,
      reference_id: original.id,
      reference_date: original.reference_date,
    })
    .select("id")
    .single();

  if (insertError || !reversal) return { error: "예외 처리에 실패했어요" };

  // 원본에 invalidated_by 기록
  await getAdminSupabase()
    .from("attendance_credits")
    .update({ invalidated_by: reversal.id })
    .eq("id", creditId);

  return { error: null };
}

// ─── 일괄 정산 핵심 로직 ──────────────────────────────────
/**
 * 특정 날짜의 스케줄 중 출근 기록이 없는 건 → 결근 처리
 * 출근은 했지만 퇴근 기록이 없는 건 → 퇴근 미기록 처리
 * (인증 없이 실행 가능 — 호출부에서 인증 처리)
 */
async function _settlementCore(
  targetDate: string,
): Promise<{ processed: number; error: string | null }> {
  // 해당일의 active 슬롯 조회
  const { data: slots } = await getAdminSupabase()
    .from("schedule_slots")
    .select("id, profile_id, start_time, end_time")
    .eq("slot_date", targetDate)
    .eq("status", "active");

  if (!slots || slots.length === 0) return { processed: 0, error: null };

  // 해당일 출근 로그 조회
  const { data: logs } = await getAdminSupabase()
    .from("attendance_logs")
    .select("profile_id, type, created_at")
    .gte("created_at", `${targetDate}T00:00:00+09:00`)
    .lte("created_at", `${targetDate}T23:59:59+09:00`);

  const inProfiles = new Set(
    (logs ?? []).filter((l) => l.type === "IN").map((l) => l.profile_id),
  );
  const outProfiles = new Set(
    (logs ?? []).filter((l) => l.type === "OUT").map((l) => l.profile_id),
  );

  let processed = 0;

  for (const slot of slots) {
    // 이미 출근/결근 관련 크레딧이 있는지 확인 (보너스 이벤트 제외, 무효화된 것도 제외)
    const { data: existing } = await getAdminSupabase()
      .from("attendance_credits")
      .select("id")
      .eq("profile_id", slot.profile_id)
      .eq("reference_date", targetDate)
      .in("event_type", [
        "normal_attendance", "late_minor", "late_major",
        "no_show", "missing_checkout",
      ])
      .is("invalidated_by", null)
      .limit(1);

    if (existing && existing.length > 0) continue; // 이미 처리됨

    if (!inProfiles.has(slot.profile_id)) {
      // 무단결근
      await insertCredit({
        profile_id: slot.profile_id,
        event_type: "no_show",
        points: CREDIT_POINTS.no_show,
        description: "무단결근 -50점",
        reference_id: slot.id,
        reference_date: targetDate,
      });
      await updateStreak(slot.profile_id, true);
      processed++;
    } else if (!outProfiles.has(slot.profile_id)) {
      // 퇴근 미기록
      await insertCredit({
        profile_id: slot.profile_id,
        event_type: "missing_checkout",
        points: CREDIT_POINTS.missing_checkout,
        description: "퇴근 미기록 -5점",
        reference_id: slot.id,
        reference_date: targetDate,
      });
      processed++;
    }
  }

  return { processed, error: null };
}

// ─── 어드민 수동 정산 (Server Action) ─────────────────────
export async function processDailySettlement(
  targetDate: string,
): Promise<{ processed: number; error: string | null }> {
  try {
    await requireAdmin();
  } catch {
    return { processed: 0, error: "권한이 없어요" };
  }
  return _settlementCore(targetDate);
}

// ─── Cron 자동 정산 (API Route에서 CRON_SECRET 검증) ──────
export async function processSettlementCron(
  targetDate: string,
): Promise<{ processed: number; error: string | null }> {
  return _settlementCore(targetDate);
}
