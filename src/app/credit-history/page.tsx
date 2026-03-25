import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import CreditHistoryClient from "./CreditHistoryClient";

export default async function CreditHistoryPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: events }] = await Promise.all([
    supabase
      .from("profiles")
      .select("credit_score, current_streak, longest_streak, streak_milestones_claimed")
      .eq("id", user.id)
      .single(),
    supabase
      .from("attendance_credits")
      .select("id, event_type, points, description, reference_date, created_at, invalidated_by")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <CreditHistoryClient
      profile={profile}
      initialEvents={events ?? []}
      userId={user.id}
    />
  );
}
