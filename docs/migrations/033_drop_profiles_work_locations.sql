-- Migration 033: profiles.work_locations 컬럼 제거
-- 전제: 032_employee_store_assignments.sql 이 적용되어 데이터 이관 완료 상태
ALTER TABLE profiles DROP COLUMN IF EXISTS work_locations;
