-- [020] auth.users INSERT 시 profiles 자동 생성 트리거
-- handle_new_user 함수는 이미 존재하나, 트리거가 누락되어 있어 추가
-- Dev DB에는 2026-03-20 직접 실행으로 적용 완료

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
