-- 043: 컬리 납품 제품 마스터 테이블
-- 마켓컬리 발주 라벨지 자동생성을 위한 제품 정보 관리

CREATE TABLE kurly_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  master_code TEXT NOT NULL UNIQUE,
  barcode TEXT,
  unit_weight TEXT,
  box_capacity INT NOT NULL DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE kurly_products IS '컬리 납품 제품 마스터';
COMMENT ON COLUMN kurly_products.name IS '상품명 (예: [연경당] 금귤정과 (진정과) 140g)';
COMMENT ON COLUMN kurly_products.master_code IS '컬리 마스터코드 (예: M00000420174)';
COMMENT ON COLUMN kurly_products.barcode IS '바코드 (예: 8800265330025)';
COMMENT ON COLUMN kurly_products.unit_weight IS '규격 중량 (예: 170g)';
COMMENT ON COLUMN kurly_products.box_capacity IS '박스당 입수량';
COMMENT ON COLUMN kurly_products.is_active IS '활성 여부 (비활성 제품은 발주 시 선택 불가)';

-- RLS
ALTER TABLE kurly_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "관리자 전체 접근" ON kurly_products
  FOR ALL USING (is_admin());

-- 초기 제품 데이터 (거래명세서 기준)
INSERT INTO kurly_products (name, master_code, barcode, unit_weight, box_capacity) VALUES
  ('[연경당] 금귤정과 (진정과) 140g', 'M00000420174', '8800265330025', '170g', 28),
  ('[증정품][연경당] 쇼핑백', 'M00000396556', NULL, '3g', 18),
  ('[쇼핑백외포][연경당] 견과류 강정 2구 세트', 'M00000255955', '8800265330056', '460g', 18),
  ('[연경당] 메밀 강정 125g', 'M00000255954', '8800265330049', '155g', 28),
  ('[연경당] 참깨 강정 160g', 'M00000255953', '8800265330032', '190g', 28);
