-- 030_workplace_refactor.sql
-- 근무지·포지션 SaaS 범용화 리팩토링
--
-- 변경 사항:
--  1. stores.lat/lng → nullable (GPS 없는 근무지 지원)
--  2. stores.is_gps_required boolean 추가
--  3. catering store 업데이트 (lat=null, lng=null, is_gps_required=false)
--  4. cafe_positions → position_keys rename (schedule_slots, work_defaults, profiles)
--  5. schedule_slots.store_id uuid FK 추가 + 기존 work_location → store_id 데이터 마이그레이션
--  6. work_defaults.store_id uuid FK 추가 + 기존 work_location → store_id 데이터 마이그레이션
--  ※ work_location text 컬럼은 코드 전환 완료 후 별도 마이그레이션으로 DROP 예정

-- ─────────────────────────────────────────
-- ① stores.lat / stores.lng → nullable
-- ─────────────────────────────────────────
ALTER TABLE stores
  ALTER COLUMN lat DROP NOT NULL,
  ALTER COLUMN lng DROP NOT NULL;

-- ─────────────────────────────────────────
-- ② stores.is_gps_required 추가
-- ─────────────────────────────────────────
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS is_gps_required boolean NOT NULL DEFAULT true;

-- ─────────────────────────────────────────
-- ③ catering 업데이트 (lat/lng null, GPS 불필요)
-- ─────────────────────────────────────────
UPDATE stores
SET lat = NULL,
    lng = NULL,
    is_gps_required = false
WHERE work_location_key = 'catering';

-- Production 전용: catering row가 없는 경우 INSERT
INSERT INTO stores (name, lat, lng, work_location_key, label, color, bg_color, display_order, is_gps_required)
VALUES ('케이터링', NULL, NULL, 'catering', '케이터링', '#F59E0B', '#FFF7E6', 3, false)
ON CONFLICT (work_location_key) DO NOTHING;

-- ─────────────────────────────────────────
-- ④ cafe_positions → position_keys rename
-- ─────────────────────────────────────────
ALTER TABLE schedule_slots       RENAME COLUMN cafe_positions TO position_keys;
ALTER TABLE work_defaults        RENAME COLUMN cafe_positions TO position_keys;
ALTER TABLE profiles             RENAME COLUMN cafe_positions TO position_keys;
ALTER TABLE checklist_templates  RENAME COLUMN cafe_position  TO position_key;

-- ─────────────────────────────────────────
-- ⑤ schedule_slots.store_id FK 추가
-- ─────────────────────────────────────────
ALTER TABLE schedule_slots
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id);

-- 기존 work_location → store_id 데이터 마이그레이션
UPDATE schedule_slots ss
SET store_id = s.id
FROM stores s
WHERE ss.work_location = s.work_location_key
  AND ss.store_id IS NULL;

-- ─────────────────────────────────────────
-- ⑥ work_defaults.store_id FK 추가
-- ─────────────────────────────────────────
ALTER TABLE work_defaults
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id);

-- 기존 work_location → store_id 데이터 마이그레이션
UPDATE work_defaults wd
SET store_id = s.id
FROM stores s
WHERE wd.work_location = s.work_location_key
  AND wd.store_id IS NULL;

-- ─────────────────────────────────────────
-- 검증 쿼리
-- ─────────────────────────────────────────
-- SELECT name, work_location_key, lat, lng, is_gps_required FROM stores ORDER BY display_order;
-- SELECT COUNT(*), COUNT(store_id) FROM schedule_slots;  -- store_id 채워진 수 확인
-- SELECT COUNT(*), COUNT(store_id) FROM work_defaults;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'schedule_slots' ORDER BY ordinal_position;
