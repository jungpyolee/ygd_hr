export interface ChecklistTemplate {
  id: string;
  title: string;
  trigger: "check_in" | "check_out";
  work_location: "cafe" | "factory" | "catering" | null;
  cafe_position: "hall" | "kitchen" | "showroom" | null;
  order_index: number;
  is_active: boolean;
  created_at: string;
}

export interface ChecklistSubmission {
  id: string;
  profile_id: string;
  trigger: "check_in" | "check_out";
  attendance_log_id: string | null;
  checked_item_ids: string[];
  all_checked: boolean;
  submitted_at: string;
}
