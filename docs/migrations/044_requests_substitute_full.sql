-- 044_requests_substitute_full.sql
-- 신 시스템(requests 테이블) 완전 전환
-- 1. accept_substitute RPC → requests 테이블 기반으로 재작성
-- 2. substitute_responses, substitute_requests 테이블 DROP

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. accept_substitute RPC 재작성 (requests 테이블 기반)
-- ──────────────────────────────────────────────────────────────────────────────

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
  v_request      requests%ROWTYPE;
  v_orig_slot    schedule_slots%ROWTYPE;
  v_overlap_slot schedule_slots%ROWTYPE;
  v_merged_start time;
  v_merged_end   time;
  v_mode         text := 'filled';
BEGIN
  -- 1. 요청 잠금 + 상태/권한 검증 (FOR UPDATE → 동시 수락 차단)
  SELECT * INTO v_request
    FROM requests
   WHERE id     = p_request_id
     AND type   = 'substitute'
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

  -- 3. requests → filled + accepted_by 설정
  UPDATE requests
     SET status      = 'filled',
         accepted_by = p_acceptor_id,
         accepted_at = NOW()
   WHERE id = p_request_id;

  -- 4. 원본 슬롯 → substituted
  UPDATE schedule_slots
     SET status = 'substituted'
   WHERE id = v_request.slot_id;

  -- 5. 수락자의 겹치거나 맞닿는 active 슬롯 탐색
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
    -- 병합 가능 조건: 같은 store_id + position_keys 일치
    IF v_overlap_slot.store_id = v_orig_slot.store_id
       AND (
         (v_orig_slot.position_keys = '{}' AND v_overlap_slot.position_keys = '{}')
         OR
         (v_orig_slot.position_keys IS NOT NULL
          AND v_overlap_slot.position_keys IS NOT NULL
          AND v_orig_slot.position_keys   <@ v_overlap_slot.position_keys
          AND v_overlap_slot.position_keys <@ v_orig_slot.position_keys)
       )
    THEN
      -- 병합: 기존 슬롯 시간 범위 확장
      v_merged_start := LEAST(v_overlap_slot.start_time,  v_orig_slot.start_time);
      v_merged_end   := GREATEST(v_overlap_slot.end_time, v_orig_slot.end_time);

      UPDATE schedule_slots
         SET start_time = v_merged_start,
             end_time   = v_merged_end
       WHERE id = v_overlap_slot.id;

      v_mode := 'merged';
    ELSE
      -- 위치/포지션 불일치 → 병합 불가
      RAISE EXCEPTION 'OVERLAP_DIFFERENT_LOCATION_OR_POSITION';
    END IF;
  ELSE
    -- 겹치는 슬롯 없음 → 신규 슬롯 INSERT
    INSERT INTO schedule_slots(
      weekly_schedule_id, profile_id, slot_date,
      start_time, end_time, store_id, position_keys, status
    )
    VALUES (
      v_orig_slot.weekly_schedule_id,
      p_acceptor_id,
      v_orig_slot.slot_date,
      v_orig_slot.start_time,
      v_orig_slot.end_time,
      v_orig_slot.store_id,
      v_orig_slot.position_keys,
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

REVOKE ALL ON FUNCTION accept_substitute(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION accept_substitute(UUID, UUID) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. 구 시스템 테이블 DROP
-- ──────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS substitute_responses CASCADE;
DROP TABLE IF EXISTS substitute_requests CASCADE;

-- ──────────────────────────────────────────────────────────────────────────────
-- 검증
-- ──────────────────────────────────────────────────────────────────────────────

-- accept_substitute 함수 존재 확인
SELECT proname, prorettype::regtype
FROM pg_proc
WHERE proname = 'accept_substitute';

-- 구 테이블 제거 확인 (결과 없어야 정상)
SELECT table_name
FROM information_schema.tables
WHERE table_name IN ('substitute_requests', 'substitute_responses')
  AND table_schema = 'public';
