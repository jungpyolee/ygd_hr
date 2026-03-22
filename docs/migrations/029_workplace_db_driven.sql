-- 029_workplace_db_driven.sql
-- 근무지·포지션을 DB에서 관리하도록 stores 테이블 확장 + store_positions 테이블 신규 생성

-- ① stores 테이블에 근무지 메타데이터 컬럼 추가
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS work_location_key text,
  ADD COLUMN IF NOT EXISTS label             text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS color             text    NOT NULL DEFAULT '#8B95A1',
  ADD COLUMN IF NOT EXISTS bg_color          text    NOT NULL DEFAULT '#F2F4F6',
  ADD COLUMN IF NOT EXISTS display_order     integer NOT NULL DEFAULT 0;

ALTER TABLE stores
  ADD CONSTRAINT stores_work_location_key_unique UNIQUE (work_location_key);

-- ② store_positions 테이블 신규 생성
CREATE TABLE IF NOT EXISTS store_positions (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      uuid    NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  position_key  text    NOT NULL,
  label         text    NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  UNIQUE (store_id, position_key)
);

-- ③ RLS
ALTER TABLE store_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_store_positions"
  ON store_positions FOR SELECT TO anon USING (true);

CREATE POLICY "authenticated_select_store_positions"
  ON store_positions FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin_all_store_positions"
  ON store_positions FOR ALL USING (is_admin());

-- ④ 기본 데이터 삽입 (카페 / 공장 / 케이터링)
--    Dev DB는 stores가 비어있으므로 INSERT, Production은 기존 rows UPDATE
--    → Production 전용 업데이트는 배포 시 별도 실행 (029b)
INSERT INTO stores (name, lat, lng, work_location_key, label, color, bg_color, display_order)
VALUES
  ('카페',     37.5665, 126.9780, 'cafe',      '카페',     '#3182F6', '#E8F3FF', 1),
  ('공장',     37.5650, 126.9770, 'factory',   '공장',     '#00B761', '#E6FAF0', 2),
  ('케이터링', 37.5640, 126.9760, 'catering',  '케이터링', '#F59E0B', '#FFF7E6', 3)
ON CONFLICT (work_location_key) DO UPDATE
  SET label         = EXCLUDED.label,
      color         = EXCLUDED.color,
      bg_color      = EXCLUDED.bg_color,
      display_order = EXCLUDED.display_order;

-- ⑤ 포지션 데이터 삽입 (카페 전용)
INSERT INTO store_positions (store_id, position_key, label, display_order)
SELECT s.id, p.position_key, p.label, p.display_order
FROM stores s
CROSS JOIN (VALUES
  ('hall',     '홀',   1),
  ('kitchen',  '주방', 2),
  ('showroom', '쇼룸', 3)
) AS p(position_key, label, display_order)
WHERE s.work_location_key = 'cafe'
ON CONFLICT (store_id, position_key) DO NOTHING;
