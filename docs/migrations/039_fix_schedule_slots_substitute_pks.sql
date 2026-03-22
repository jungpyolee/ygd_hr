-- 039: schedule_slots, substitute_requests PK 및 FK 복구
-- 2026-03-23
-- CREATE TABLE IF NOT EXISTS로 인해 PK 없이 생성된 테이블에 제약조건 추가

ALTER TABLE schedule_slots ADD PRIMARY KEY (id);

ALTER TABLE substitute_requests ADD PRIMARY KEY (id);
ALTER TABLE substitute_requests
  ADD CONSTRAINT substitute_requests_slot_id_fkey
  FOREIGN KEY (slot_id) REFERENCES schedule_slots(id) ON DELETE CASCADE;

-- profiles 참조 FK (requester_id, rejected_by, approved_by, accepted_by)
ALTER TABLE substitute_requests ADD CONSTRAINT substitute_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES profiles(id);
ALTER TABLE substitute_requests ADD CONSTRAINT substitute_requests_rejected_by_fkey FOREIGN KEY (rejected_by) REFERENCES profiles(id);
ALTER TABLE substitute_requests ADD CONSTRAINT substitute_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES profiles(id);
ALTER TABLE substitute_requests ADD CONSTRAINT substitute_requests_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES profiles(id);
