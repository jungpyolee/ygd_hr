-- [MIGRATION-019] 고양이 닷지 게임 스코어 테이블
-- 목적: 이용가이드 페이지 이스터에그 게임 리더보드 저장

CREATE TABLE IF NOT EXISTS cat_dodge_scores (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  score      integer     NOT NULL CHECK (score >= 0),
  created_at timestamptz DEFAULT now()
);

-- 리더보드 조회 최적화 (유저별 최고점 → 전체 랭킹)
CREATE INDEX IF NOT EXISTS cat_dodge_scores_score_idx
  ON cat_dodge_scores(score DESC);
CREATE INDEX IF NOT EXISTS cat_dodge_scores_user_score_idx
  ON cat_dodge_scores(user_id, score DESC);

-- RLS
ALTER TABLE cat_dodge_scores ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자 누구나 조회 가능 (리더보드)
CREATE POLICY "cat_dodge_scores_select"
  ON cat_dodge_scores FOR SELECT
  TO authenticated USING (true);

-- 본인 스코어만 삽입 가능
CREATE POLICY "cat_dodge_scores_insert"
  ON cat_dodge_scores FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
