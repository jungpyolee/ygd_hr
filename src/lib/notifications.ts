import { createClient } from "@/lib/supabase";

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

export const sendNotification = async ({
  profile_id,
  target_role,
  type,
  title,
  content,
  source_id,
}: {
  profile_id?: string;
  target_role: "admin" | "employee" | "all";
  type: NotificationType;
  title: string;
  content: string;
  source_id?: string;
}): Promise<{ error: Error | null }> => {
  const supabase = createClient();
  const { error } = await supabase.from("notifications").insert({
    profile_id,
    target_role,
    type,
    title,
    content,
    source_id,
  });
  return { error: error ? new Error(error.message) : null };
};
