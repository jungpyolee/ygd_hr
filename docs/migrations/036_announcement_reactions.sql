-- 036_announcement_reactions.sql
-- 공지사항 이모지 리액션 기능 추가

CREATE TABLE announcement_reactions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid        NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  profile_id      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji           text        NOT NULL CHECK (emoji IN ('👍', '❤️', '😊', '🎉', '💪')),
  created_at      timestamptz DEFAULT now(),
  UNIQUE(announcement_id, profile_id, emoji)
);

-- 인덱스
CREATE INDEX idx_announcement_reactions_announcement_id
  ON announcement_reactions(announcement_id);

-- RLS
ALTER TABLE announcement_reactions ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자 전체 조회 (카운트 표시 용도)
CREATE POLICY "reactions_select_authenticated" ON announcement_reactions
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- 본인 리액션만 추가 가능
CREATE POLICY "reactions_insert_own" ON announcement_reactions
  FOR INSERT WITH CHECK (auth.uid() = profile_id);

-- 본인 리액션만 삭제 가능
CREATE POLICY "reactions_delete_own" ON announcement_reactions
  FOR DELETE USING (auth.uid() = profile_id);
