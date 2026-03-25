-- Migration 032: employee_store_assignments 테이블 생성 + 데이터 이관
-- profiles.work_locations text[] → employee_store_assignments(profile_id, store_id) 관계형 테이블로 전환

-- 1. 테이블 생성
CREATE TABLE IF NOT EXISTS employee_store_assignments (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id   uuid        NOT NULL REFERENCES stores(id)   ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(profile_id, store_id)
);

-- 2. RLS 활성화
ALTER TABLE employee_store_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_esa" ON employee_store_assignments
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "employee_select_own_esa" ON employee_store_assignments
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

-- 3. 기존 profiles.work_locations 데이터 마이그레이션
INSERT INTO employee_store_assignments (profile_id, store_id)
SELECT p.id, s.id
FROM profiles p
CROSS JOIN LATERAL unnest(p.work_locations) AS wl(key)
JOIN stores s ON s.work_location_key = wl.key
WHERE p.work_locations IS NOT NULL
  AND array_length(p.work_locations, 1) > 0
ON CONFLICT (profile_id, store_id) DO NOTHING;
