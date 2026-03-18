-- Migration 010: substitute_requests UNIQUE 제약 추가
-- 목적: 같은 직원이 같은 슬롯에 중복 요청하는 것을 DB 레벨에서 차단
-- 관련 이슈: BUG-SCH-009

-- 기존 중복 데이터 확인 (있으면 제거 후 실행)
-- SELECT slot_id, requester_id, COUNT(*) FROM substitute_requests
-- GROUP BY slot_id, requester_id HAVING COUNT(*) > 1;

ALTER TABLE substitute_requests
  ADD CONSTRAINT substitute_requests_slot_requester_unique
  UNIQUE (slot_id, requester_id);
