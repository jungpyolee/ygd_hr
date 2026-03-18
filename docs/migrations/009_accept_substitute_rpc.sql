-- Migration 009: accept_substitute RPC 함수
-- 목적: 대타 수락 플로우를 원자적 트랜잭션으로 처리 (Race Condition + 원자성 없음 해결)
-- 관련 이슈: BE-CRIT01, BE-CRIT02, BE-CRIT04, BUG-SCH-001/006/010/014

CREATE OR REPLACE FUNCTION accept_substitute(
  p_request_id UUID,
  p_acceptor_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request   substitute_requests%ROWTYPE;
  v_orig_slot schedule_slots%ROWTYPE;
BEGIN
  -- 1. 요청 잠금 + 상태/권한 검증 (FOR UPDATE → 동시 수락 차단)
  SELECT * INTO v_request
    FROM substitute_requests
   WHERE id = p_request_id
     AND status = 'approved'
     AND p_acceptor_id = ANY(eligible_profile_ids)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ALREADY_FILLED_OR_NOT_ELIGIBLE';
  END IF;

  -- 2. 원본 슬롯 조회
  SELECT * INTO v_orig_slot
    FROM schedule_slots
   WHERE id = v_request.slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORIGINAL_SLOT_NOT_FOUND';
  END IF;

  -- 3. substitute_responses INSERT
  INSERT INTO substitute_responses(request_id, profile_id, response)
  VALUES (p_request_id, p_acceptor_id, 'accepted');

  -- 4. substitute_requests → filled
  UPDATE substitute_requests
     SET status      = 'filled',
         accepted_by = p_acceptor_id,
         accepted_at = NOW()
   WHERE id = p_request_id;

  -- 5. 원본 슬롯 → substituted
  UPDATE schedule_slots
     SET status = 'substituted'
   WHERE id = v_request.slot_id;

  -- 6. 대타자 신규 슬롯 INSERT
  INSERT INTO schedule_slots(
    weekly_schedule_id, profile_id, slot_date,
    start_time, end_time, work_location, cafe_positions, status
  )
  VALUES (
    v_orig_slot.weekly_schedule_id,
    p_acceptor_id,
    v_orig_slot.slot_date,
    v_orig_slot.start_time,
    v_orig_slot.end_time,
    v_orig_slot.work_location,
    v_orig_slot.cafe_positions,
    'active'
  );
END;
$$;

-- 인증된 사용자만 호출 가능
REVOKE ALL ON FUNCTION accept_substitute(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION accept_substitute(UUID, UUID) TO authenticated;
