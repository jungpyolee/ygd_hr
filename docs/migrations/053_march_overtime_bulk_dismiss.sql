-- ============================================================
-- 053: 3월 추가근무 미처리건 일괄 dismissed 처리
-- 목적: 3월 중 overtime_requests 레코드가 없는 출근일을 전부
--       dismissed(넘김) 처리하여 어드민 "확인 필요" 목록 정리
-- 실행: Supabase SQL Editor에서 수동 실행 (1회성)
-- ============================================================

-- Step 1: 대상 확인 (먼저 이것만 실행해서 건수 확인)
SELECT DISTINCT
  al.profile_id,
  DATE(al.created_at AT TIME ZONE 'Asia/Seoul') AS work_date,
  p.name
FROM attendance_logs al
JOIN profiles p ON p.id = al.profile_id
WHERE al.type = 'IN'
  AND DATE(al.created_at AT TIME ZONE 'Asia/Seoul') >= '2026-03-01'
  AND DATE(al.created_at AT TIME ZONE 'Asia/Seoul') <= '2026-03-31'
  AND NOT EXISTS (
    SELECT 1 FROM overtime_requests o
    WHERE o.profile_id = al.profile_id
      AND o.date = DATE(al.created_at AT TIME ZONE 'Asia/Seoul')
  )
ORDER BY work_date, p.name;

-- Step 2: 일괄 dismissed 처리 (Step 1 확인 후 실행)
INSERT INTO overtime_requests (profile_id, date, minutes, status)
SELECT DISTINCT
  al.profile_id,
  DATE(al.created_at AT TIME ZONE 'Asia/Seoul'),
  0,
  'dismissed'::overtime_status
FROM attendance_logs al
WHERE al.type = 'IN'
  AND DATE(al.created_at AT TIME ZONE 'Asia/Seoul') >= '2026-03-01'
  AND DATE(al.created_at AT TIME ZONE 'Asia/Seoul') <= '2026-03-31'
  AND NOT EXISTS (
    SELECT 1 FROM overtime_requests o
    WHERE o.profile_id = al.profile_id
      AND o.date = DATE(al.created_at AT TIME ZONE 'Asia/Seoul')
  )
ON CONFLICT (profile_id, date) DO NOTHING;
