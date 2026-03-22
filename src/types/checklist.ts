export interface ChecklistTemplate {
  id: string;
  title: string;
  trigger: "check_in" | "check_out";
  work_location: string | null;
  position_key: string | null;
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

export interface ChecklistDraft {
  userId: string;
  date: string;                   // "YYYY-MM-DD"
  trigger: "check_in" | "check_out";
  attendanceLogId: string | null; // check_in만 사용
  checkedIds: string[];
  totalItems: number;
}
