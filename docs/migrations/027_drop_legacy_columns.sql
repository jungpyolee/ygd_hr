-- 027: 레거시/미사용 컬럼 제거
-- attendance_logs.store_id  → check_in_store_id / check_out_store_id 로 이관 완료
-- stores.radius_m           → 코드에서 RADIUS_METER = 100 하드코딩으로 대체, 미사용
-- profiles.target_in_time   → 편집 폼에만 존재, 실제 로직에서 미사용
-- profiles.target_out_time  → 동일

-- [1] store_id 백필: DB-003 이전 데이터 (check_in/out_store_id가 null인 구 레코드)
UPDATE attendance_logs
SET check_in_store_id = store_id
WHERE type = 'IN'
  AND store_id IS NOT NULL
  AND check_in_store_id IS NULL;

UPDATE attendance_logs
SET check_out_store_id = store_id
WHERE type = 'OUT'
  AND store_id IS NOT NULL
  AND check_out_store_id IS NULL;

-- [2] 백필 검증 (실행 후 0건이어야 정상)
-- SELECT COUNT(*) FROM attendance_logs
--   WHERE store_id IS NOT NULL
--     AND check_in_store_id IS NULL
--     AND check_out_store_id IS NULL;

-- [3] 컬럼 DROP
ALTER TABLE attendance_logs DROP COLUMN IF EXISTS store_id;
ALTER TABLE stores           DROP COLUMN IF EXISTS radius_m;
ALTER TABLE profiles         DROP COLUMN IF EXISTS target_in_time;
ALTER TABLE profiles         DROP COLUMN IF EXISTS target_out_time;
