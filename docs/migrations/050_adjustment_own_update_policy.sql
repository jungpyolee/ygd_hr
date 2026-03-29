-- 050: 직원 본인 조정 UPDATE 정책 추가
-- upsert 재신청 시 rejected → pending 덮어쓰기에 필요

CREATE POLICY own_update ON attendance_adjustments
  FOR UPDATE
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);
