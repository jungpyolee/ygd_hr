-- Migration 011: notifications RLS public → authenticated
-- 목적: notifications 정책을 public → authenticated 로 변경하여 비인증 접근 차단
-- 관련 이슈: P4-09

ALTER POLICY "Anyone can create notifications" ON notifications TO authenticated;
ALTER POLICY "Only admins can delete notifications" ON notifications TO authenticated;
ALTER POLICY "Users can update their own notification status" ON notifications TO authenticated;
ALTER POLICY "Users can view their own notifications or admins can view all" ON notifications TO authenticated;
