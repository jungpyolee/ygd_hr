import { redirect } from "next/navigation";
import { format } from "date-fns";
import { createServerSupabase } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import HomeClient from "@/components/HomeClient";

export interface TodaySlot {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  store_id: string;
  position_keys: string[];
  notes: string | null;
}

export interface RawLogData {
  type: string;
  created_at: string;
  attendance_type: string;
  store_name: string | null;
}

const getStores = unstable_cache(
  async () => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const [{ data: stores }, { data: positions }] = await Promise.all([
      supabase.from("stores").select("*"),
      supabase.from("store_positions").select("id, store_id, position_key, label, display_order").order("display_order"),
    ]);
    return (stores ?? []).map((s: any) => ({
      ...s,
      positions: (positions ?? []).filter((p: any) => p.store_id === s.id),
    }));
  },
  ["stores-with-positions"],
  { revalidate: 3600 },
);

export default async function HomePage() {
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const todayStr = format(new Date(), "yyyy-MM-dd");

  // Critical path: 출퇴근 버튼에 필요한 데이터만 await
  const [
    storeData,
    { data: profileData },
    { data: rawLogData },
    { data: todaySlotsData },
  ] = await Promise.all([
    getStores(),
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("attendance_logs")
      .select("type, created_at, attendance_type, check_in_store:stores!check_in_store_id(name), check_out_store:stores!check_out_store_id(name)")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("schedule_slots")
      .select(
        "id, slot_date, start_time, end_time, store_id, position_keys, notes, weekly_schedules!inner(status)",
      )
      .eq("profile_id", user.id)
      .eq("slot_date", todayStr)
      .eq("status", "active")
      .eq("weekly_schedules.status", "confirmed"),
  ]);

  const needsOnboarding = !profileData?.name || !profileData?.phone;

  // raw log → 클라이언트에서 타임존 변환을 위해 가공 최소화
  const logData: RawLogData | null = rawLogData
    ? {
        type: rawLogData.type,
        created_at: rawLogData.created_at,
        attendance_type: rawLogData.attendance_type || "regular",
        store_name:
          rawLogData.type === "IN"
            ? ((rawLogData as any).check_in_store as { name: string } | null)?.name ?? null
            : ((rawLogData as any).check_out_store as { name: string } | null)?.name ?? null,
      }
    : null;

  const todaySlots = (
    (todaySlotsData ?? []) as Array<TodaySlot & { weekly_schedules: unknown }>
  ).map(({ weekly_schedules: _ws, ...rest }) => rest as TodaySlot);

  return (
    <HomeClient
      profile={needsOnboarding ? null : profileData}
      needsOnboarding={needsOnboarding}
      stores={storeData}
      logData={logData}
      todaySlots={todaySlots}
    />
  );
}
