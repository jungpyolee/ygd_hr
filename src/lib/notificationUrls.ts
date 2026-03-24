import type { NotificationType } from "@/lib/notifications";

/**
 * 알림 타입 + 역할 → 클릭 시 이동할 URL 반환
 * SW notificationclick 핸들러와 push payload 생성 시 모두 사용
 */
export function getNotificationUrl(
  type: NotificationType,
  sourceId: string | undefined,
  isAdmin: boolean
): string {
  if (isAdmin) {
    switch (type) {
      case "onboarding":
      case "profile_update":
      case "document_upload":
      case "health_cert_expiry":
        return "/admin/employees";
      case "attendance_in":
      case "attendance_out":
      case "attendance_remote_out":
      case "attendance_business_trip_in":
      case "attendance_business_trip_out":
      case "attendance_fallback_in":
      case "attendance_fallback_out":
        return "/admin/attendance";
      case "substitute_requested":
        return "/admin/schedules/substitutes";
      case "announcement":
        return "/admin/announcements";
      default:
        return "/admin";
    }
  }

  switch (type) {
    case "substitute_approved":
      return "/calendar";
    case "substitute_rejected":
    case "substitute_filled":
    case "schedule_updated":
    case "schedule_published":
      return "/calendar";
    case "recipe_comment":
    case "recipe_reply":
    case "recipe_mention":
      return sourceId ? `/recipes/${sourceId}` : "/recipes";
    case "announcement":
      return sourceId ? `/announcements/${sourceId}` : "/announcements";
    default:
      return "/";
  }
}
