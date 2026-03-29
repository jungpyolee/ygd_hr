-- 047: 출퇴근 미체크 리마인더 pg_cron 설정
-- Vercel Hobby 플랜 cron 제한(1일 1회) 대신 Supabase pg_cron + pg_net 사용
-- 매 10분, KST 07:00~21:59 에만 실행

-- pg_net 확장 활성화 (HTTP 호출용)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 매 10분, 7시~21시대만 실행 (DB timezone = Asia/Seoul)
-- ⚠️ 실행 시 YOUR_CRON_SECRET을 실제 값으로 교체할 것
SELECT cron.schedule(
  'attendance-reminder',
  '*/10 7-21 * * *',
  $$
  SELECT net.http_get(
    url := 'https://ygd-hr.vercel.app/api/cron/attendance-reminder',
    headers := '{"Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb
  );
  $$
);
