-- Migration: 001_attendance_logs_indexes
-- Date: 2026-03-16
-- Description: attendance_logs 테이블 성능 인덱스 추가

-- 직원별 기록 조회용
CREATE INDEX IF NOT EXISTS idx_attendance_logs_profile_id
  ON public.attendance_logs (profile_id);

-- 날짜 범위 조회용 (관리자 전체 조회)
CREATE INDEX IF NOT EXISTS idx_attendance_logs_created_at
  ON public.attendance_logs (created_at DESC);

-- 직원+날짜 복합 조회용 (가장 빈번한 패턴)
CREATE INDEX IF NOT EXISTS idx_attendance_logs_profile_created
  ON public.attendance_logs (profile_id, created_at DESC);
