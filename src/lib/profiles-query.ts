import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 활성 직원 (재직중)만 조회하는 헬퍼.
 * `terminated_at IS NULL` 필터를 자동 적용한다.
 *
 * 본인 단건 조회(`eq("id", user.id)`)에는 사용하지 말 것 — 퇴사자도 본인 정보는 조회 가능해야 한다.
 * 급여 정산처럼 퇴사월 처리가 필요한 경우도 사용 금지.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const activeProfiles = (sb: SupabaseClient | any) =>
  sb.from("profiles").is("terminated_at", null);

/**
 * 단건 활성 여부 체크. notifications INSERT 등 알림 발송 직전에 사용.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function isActiveProfile(sb: SupabaseClient | any, id: string): Promise<boolean> {
  const { data } = await sb.from("profiles").select("terminated_at").eq("id", id).maybeSingle();
  return !!data && !data.terminated_at;
}

/**
 * 다건 활성 ID 필터링. 입력 순서를 유지한다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function filterActiveProfileIds(sb: SupabaseClient | any, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data } = await sb.from("profiles").select("id").in("id", ids).is("terminated_at", null);
  const activeSet = new Set((data ?? []).map((p: { id: string }) => p.id));
  return ids.filter((id) => activeSet.has(id));
}
