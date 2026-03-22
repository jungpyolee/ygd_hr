import useSWR from "swr";
import { createClient } from "@/lib/supabase";
import type { WorkLocation, StorePosition } from "@/types/workplace";

async function fetchWorkplaces(): Promise<WorkLocation[]> {
  const supabase = createClient();
  const [{ data: stores }, { data: positions }] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, lat, lng, work_location_key, label, color, bg_color, display_order")
      .not("work_location_key", "is", null)
      .order("display_order"),
    supabase
      .from("store_positions")
      .select("id, store_id, position_key, label, display_order")
      .order("display_order"),
  ]);

  return (stores ?? []).map((s) => ({
    ...s,
    positions: (positions ?? []).filter((p: StorePosition) => p.store_id === s.id),
  })) as WorkLocation[];
}

export function useWorkplaces() {
  const { data = [], isLoading, mutate } = useSWR(
    "workplaces",
    fetchWorkplaces,
    { dedupingInterval: 300_000, revalidateOnFocus: false }
  );

  /** work_location_key → WorkLocation */
  const byKey = Object.fromEntries(data.map((w) => [w.work_location_key, w]));

  /** 해당 근무지의 포지션 목록 */
  const positionsOf = (locationKey: string) =>
    byKey[locationKey]?.positions ?? [];

  /** 근무지에 포지션이 있는지 여부 */
  const hasPositions = (locationKey: string) =>
    positionsOf(locationKey).length > 0;

  return { workplaces: data, byKey, positionsOf, hasPositions, isLoading, mutate };
}
