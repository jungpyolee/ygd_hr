import { redirect } from "next/navigation";
import { format, startOfWeek, addDays } from "date-fns";
import { createServerSupabase } from "@/lib/supabase-server";
import HomeClient from "@/components/HomeClient";
import type { ScheduleSlot } from "@/components/WeeklyScheduleCard";
import type { Announcement } from "@/types/announcement";

export interface TodaySlot {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  work_location: string;
  cafe_positions: string[];
  notes: string | null;
}

export interface RawLogData {
  type: string;
  created_at: string;
  attendance_type: string;
  store_name: string | null;
}

export default async function HomePage() {
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const weekStartSun = startOfWeek(new Date(), { weekStartsOn: 0 });
  const weekEndSun = addDays(weekStartSun, 6);
  const weekStartStr = format(weekStartSun, "yyyy-MM-dd");
  const weekEndStr = format(weekEndSun, "yyyy-MM-dd");

  const [
    { data: profileData },
    { data: storeData },
    { data: rawLogData },
    { data: todaySlotsData },
    { data: weeklySlotsData },
    { data: notisData },
    { data: announcementsData },
    { data: readsData },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("stores").select("*"),
    supabase
      .from("attendance_logs")
      .select("type, created_at, attendance_type, stores!store_id(name)")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("schedule_slots")
      .select(
        "id, slot_date, start_time, end_time, work_location, cafe_positions, notes, weekly_schedules!inner(status)",
      )
      .eq("profile_id", user.id)
      .eq("slot_date", todayStr)
      .eq("status", "active")
      .eq("weekly_schedules.status", "confirmed"),
    supabase
      .from("schedule_slots")
      .select(
        "slot_date, start_time, end_time, work_location, weekly_schedules!inner(status)",
      )
      .eq("profile_id", user.id)
      .eq("status", "active")
      .eq("weekly_schedules.status", "confirmed")
      .gte("slot_date", weekStartStr)
      .lte("slot_date", weekEndStr)
      .order("slot_date"),
    supabase
      .from("notifications")
      .select("*")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("announcements")
      .select("id, title, is_pinned, created_at, content")
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("announcement_reads")
      .select("announcement_id")
      .eq("profile_id", user.id),
  ]);

  const needsOnboarding = !profileData?.name || !profileData?.phone;

  // raw log → 클라이언트에서 타임존 변환을 위해 가공 최소화
  const logData: RawLogData | null = rawLogData
    ? {
        type: rawLogData.type,
        created_at: rawLogData.created_at,
        attendance_type: rawLogData.attendance_type || "regular",
        store_name:
          (rawLogData.stores as unknown as { name: string } | null)?.name ??
          null,
      }
    : null;

  const todaySlots = (
    (todaySlotsData ?? []) as Array<TodaySlot & { weekly_schedules: unknown }>
  ).map(({ weekly_schedules: _ws, ...rest }) => rest as TodaySlot);

  const weeklySlots = (
    (weeklySlotsData ?? []) as Array<
      ScheduleSlot & { weekly_schedules: unknown }
    >
  ).map(({ weekly_schedules: _ws, ...rest }) => rest as ScheduleSlot);

  return (
    <HomeClient
      profile={needsOnboarding ? null : profileData}
      needsOnboarding={needsOnboarding}
      stores={(storeData ?? []).filter(
        (s: { name: string }) => s.name !== "목동",
      )}
      logData={logData}
      todaySlots={todaySlots}
      weeklySlots={weeklySlots}
      announcements={(announcementsData as Announcement[]) ?? []}
      announcementReadIds={(readsData ?? []).map(
        (r: { announcement_id: string }) => r.announcement_id,
      )}
      initialNotis={notisData ?? []}
    />
  );
}
