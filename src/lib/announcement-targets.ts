import type { SupabaseClient } from "@supabase/supabase-js";

export type AnnouncementTargetRole = "all" | "full_time" | "part_time";

/**
 * 공지 대상 직원 id 목록 반환.
 * AnnouncementForm의 알림 발송 로직과 동일한 필터 규칙을 따른다.
 */
export async function getTargetProfileIds(
  supabase: SupabaseClient,
  role: AnnouncementTargetRole,
  storeIds: string[],
): Promise<string[]> {
  let query = supabase.from("profiles").select("id").eq("role", "employee");
  if (role === "full_time") query = query.eq("employment_type", "full_time");
  if (role === "part_time") query = query.like("employment_type", "part_time%");

  if (storeIds.length > 0) {
    const { data: assigned } = await supabase
      .from("employee_store_assignments")
      .select("profile_id")
      .in("store_id", storeIds);
    const ids = assigned?.map((a) => a.profile_id) ?? [];
    if (!ids.length) return [];
    query = query.in("id", ids);
  }

  const { data } = await query;
  return data?.map((p) => p.id) ?? [];
}
