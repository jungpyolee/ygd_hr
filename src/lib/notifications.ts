import { createClient } from "@/lib/supabase";

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
  type: string;
  title: string;
  content: string;
  source_id?: string;
}) => {
  const supabase = createClient();
  await supabase.from("notifications").insert({
    profile_id,
    target_role,
    type,
    title,
    content,
    source_id,
  });
};
