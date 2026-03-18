-- [BUG-014] 스케줄 일간 확정 컬럼 + schedule_slots RLS 수정
-- 적용 대상: dev DB (aayedfstvegiswgjwcuw)

-- 1. 일간 확정용 컬럼 추가
ALTER TABLE weekly_schedules ADD COLUMN IF NOT EXISTS confirmed_dates date[] DEFAULT '{}';

-- 2. schedule_slots RLS 수정
--    기존: profile_id = auth.uid() (본인 슬롯만)
--    변경: 확정 주의 모든 슬롯 + 대체근무 eligible 슬롯
DROP POLICY IF EXISTS "ss_emp_own" ON schedule_slots;
CREATE POLICY "ss_emp_confirmed" ON schedule_slots FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM weekly_schedules ws
    WHERE ws.id = schedule_slots.weekly_schedule_id
      AND ws.status = 'confirmed'
  )
  OR EXISTS (
    SELECT 1 FROM substitute_requests sr
    WHERE sr.slot_id = schedule_slots.id
      AND auth.uid() = ANY(sr.eligible_profile_ids)
  )
);
