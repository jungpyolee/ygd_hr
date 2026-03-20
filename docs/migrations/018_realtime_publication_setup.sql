-- [018] Realtime publication 설정
-- notifications, attendance_logs 테이블을 supabase_realtime publication에 추가
-- REPLICA IDENTITY FULL: 변경 전후 행 데이터를 포함해 서버 측 filter 지원

ALTER PUBLICATION supabase_realtime ADD TABLE notifications, attendance_logs;

ALTER TABLE notifications REPLICA IDENTITY FULL;
ALTER TABLE attendance_logs REPLICA IDENTITY FULL;

-- 확인
-- SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
-- → notifications, attendance_logs 두 행 확인
