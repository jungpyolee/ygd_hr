-- 043_requests_emp_update_policy.sql
-- 직원이 자기 요청을 취소(cancelled) 또는 취소 요청(cancel_requested)으로 변경할 수 있도록
-- 배경: req_admin_update만 있어서 직원의 취소 처리가 RLS에 막혀 실패했음

CREATE POLICY req_emp_update ON requests
  FOR UPDATE
  USING (requester_id = auth.uid())
  WITH CHECK (
    requester_id = auth.uid()
    AND status IN ('cancelled', 'cancel_requested')
  );

-- 검증
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'requests';
