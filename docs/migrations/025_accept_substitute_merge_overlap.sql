-- Migration 025: accept_substitute RPC — 겹치는 슬롯 병합 처리
-- 목적: 대타 수락자에게 같은 날 같은 위치/포지션의 겹치거나 맞닿는 슬롯이 있을 경우
--       거부 대신 두 슬롯을 하나로 병합 (시작: min, 종료: max)
-- 변경: RETURNS VOID → RETURNS JSONB (mode: 'filled' | 'merged')

-- 기존 함수 삭제 (반환 타입 변경으로 DROP 필요)
DROP FUNCTION IF EXISTS accept_substitute(UUID, UUID);

CREATE OR REPLACE FUNCTION accept_substitute(
  p_request_id  UUID,
  p_acceptor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request      substitute_requests%ROWTYPE;
  v_orig_slot    schedule_slots%ROWTYPE;
  v_overlap_slot schedule_slots%ROWTYPE;
  v_merged_start time;
  v_merged_end   time;
  v_mode         text := 'filled';
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

  -- 6. 수락자의 겹치거나 맞닿는 active 슬롯 탐색
  --    조건: start_time <= orig.end_time AND end_time >= orig.start_time
  --    (등호 포함 → 맞닿는 슬롯도 병합 대상)
  SELECT * INTO v_overlap_slot
    FROM schedule_slots
   WHERE profile_id = p_acceptor_id
     AND slot_date  = v_orig_slot.slot_date
     AND status     = 'active'
     AND start_time <= v_orig_slot.end_time
     AND end_time   >= v_orig_slot.start_time
  FOR UPDATE
  LIMIT 1;

  IF FOUND THEN
    -- 병합 가능 조건:
    --   (a) 같은 work_location
    --   (b) 포지션 없는 근무지(factory, catering): cafe_positions 둘 다 NULL
    --   (c) 포지션 있는 근무지(cafe): cafe_positions 배열이 완전히 동일
    IF v_overlap_slot.work_location = v_orig_slot.work_location
       AND (
         (v_orig_slot.cafe_positions IS NULL AND v_overlap_slot.cafe_positions IS NULL)
         OR
         (v_orig_slot.cafe_positions IS NOT NULL
          AND v_overlap_slot.cafe_positions IS NOT NULL
          AND v_orig_slot.cafe_positions   <@ v_overlap_slot.cafe_positions
          AND v_overlap_slot.cafe_positions <@ v_orig_slot.cafe_positions)
       )
    THEN
      -- 병합: 기존 슬롯 시간 범위 확장 (신규 INSERT 없음 → EXCLUSION CONSTRAINT 회피)
      v_merged_start := LEAST(v_overlap_slot.start_time,  v_orig_slot.start_time);
      v_merged_end   := GREATEST(v_overlap_slot.end_time, v_orig_slot.end_time);

      UPDATE schedule_slots
         SET start_time = v_merged_start,
             end_time   = v_merged_end
       WHERE id = v_overlap_slot.id;

      v_mode := 'merged';
    ELSE
      -- 위치/포지션 불일치 → 병합 불가, 에러
      RAISE EXCEPTION 'OVERLAP_DIFFERENT_LOCATION_OR_POSITION';
    END IF;
  ELSE
    -- 겹치는 슬롯 없음 → 신규 슬롯 INSERT (기존 동작)
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
  END IF;

  RETURN jsonb_build_object(
    'mode',         v_mode,
    'merged_start', CASE WHEN v_mode = 'merged' THEN v_merged_start::text ELSE NULL END,
    'merged_end',   CASE WHEN v_mode = 'merged' THEN v_merged_end::text   ELSE NULL END
  );
END;
$$;

-- 인증된 사용자만 호출 가능
REVOKE ALL ON FUNCTION accept_substitute(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION accept_substitute(UUID, UUID) TO authenticated;
