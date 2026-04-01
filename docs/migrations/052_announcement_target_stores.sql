-- 052_announcement_target_stores.sql
-- 공지사항에 근무지 대상 필터 추가
-- 기존 공지 2건은 카페 직원 전용으로 정합

-- ① target_store_ids 컬럼 추가 (빈 배열 = 전체 근무지)
ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS target_store_ids uuid[] NOT NULL DEFAULT '{}';

-- ② 기존 공지 → 카페 근무지 전용으로 정합
UPDATE announcements
SET target_store_ids = ARRAY[(SELECT id FROM stores WHERE work_location_key = 'cafe')]
WHERE target_store_ids = '{}';

-- ③ RLS 정책 교체: 근무지 필터 추가
DROP POLICY IF EXISTS "직원 공지 조회" ON announcements;

CREATE POLICY "직원 공지 조회" ON announcements FOR SELECT
  TO authenticated
  USING (
    is_admin()
    OR (
      -- 고용형태 필터
      (
        'all' = ANY(target_roles)
        OR ('full_time' = ANY(target_roles)
            AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND employment_type = 'full_time'))
        OR ('part_time' = ANY(target_roles)
            AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND employment_type LIKE 'part_time%'))
      )
      -- 근무지 필터
      AND (
        target_store_ids = '{}'
        OR EXISTS (
          SELECT 1 FROM employee_store_assignments
          WHERE profile_id = auth.uid()
            AND store_id = ANY(target_store_ids)
        )
      )
    )
  );

-- ④ 인덱스 (배열 겹침 검색 가속)
CREATE INDEX IF NOT EXISTS idx_announcements_target_store_ids
  ON announcements USING gin (target_store_ids);
