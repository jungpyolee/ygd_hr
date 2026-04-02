export type AnnouncementTargetRole = "all" | "full_time" | "part_time";

export interface Announcement {
  id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  target_roles: AnnouncementTargetRole[];
  target_store_ids: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
  profiles?: { name: string | null };
}

export interface AnnouncementRead {
  id: string;
  announcement_id: string;
  profile_id: string;
  read_at: string;
}
