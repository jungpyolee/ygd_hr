-- 042: stores 테이블에 QR 출퇴근용 토큰 추가
-- 매장별 고정 QR 코드 생성을 위한 고유 토큰

ALTER TABLE stores ADD COLUMN IF NOT EXISTS qr_token text UNIQUE;

-- 기존 매장에 랜덤 토큰 생성
UPDATE stores SET qr_token = encode(gen_random_bytes(16), 'hex') WHERE qr_token IS NULL;
