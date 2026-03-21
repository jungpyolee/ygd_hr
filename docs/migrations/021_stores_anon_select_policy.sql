-- [FEAT-033] stores 테이블 anon SELECT 정책 추가
-- 목적: unstable_cache로 빌드 시 stores 캐싱 가능하도록 anon key 접근 허용
-- stores 데이터는 공개 매장 정보로 보안 문제 없음

CREATE POLICY "anon은 매장 정보를 볼 수 있음" ON public.stores
  FOR SELECT TO anon USING (true);
