-- Migration 006: recipe-media Storage 버킷 RLS 정책 추가
-- 배경: 005 마이그레이션에서 버킷 생성은 됐으나 Storage 정책이 누락되어
--       이미지/영상 업로드가 전면 차단되던 문제 수정
-- 실행일: 2026-03-17

-- 어드민: 파일 업로드 (썸네일, 영상, 단계 이미지)
CREATE POLICY "어드민 recipe-media 업로드"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'recipe-media' AND is_admin());

-- 어드민: 파일 교체 (upsert — 기존 파일 덮어쓰기)
CREATE POLICY "어드민 recipe-media 수정"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'recipe-media' AND is_admin());

-- 어드민: 파일 삭제 (수정 시 orphan 파일 정리)
CREATE POLICY "어드민 recipe-media 삭제"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'recipe-media' AND is_admin());

-- 전 직원: 파일 조회 (public 버킷이지만 명시적 정책 추가)
CREATE POLICY "전 직원 recipe-media 조회"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'recipe-media');
