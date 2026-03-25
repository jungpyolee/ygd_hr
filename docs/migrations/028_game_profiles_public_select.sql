-- [DB-028] game_profiles 전체 조회 RLS 정책 추가
-- 리더보드에서 다른 사람 점수를 조회하려면 game_profiles 전체 조회가 필요.
-- 기존 "본인 조회" 정책만 있어서 일반 직원은 본인 데이터만 볼 수 있었음.

CREATE POLICY "전체 조회" ON game_profiles
  FOR SELECT TO authenticated USING (true);
