-- Epic: 직원-어드민 1:1 채팅
-- 2026-03-22

-- 1. chat_conversations (직원별 채팅방 1개)
CREATE TABLE IF NOT EXISTS chat_conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid REFERENCES profiles NOT NULL UNIQUE,
  last_message_at timestamptz DEFAULT now(),
  unread_count_admin integer DEFAULT 0,
  unread_count_employee integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 2. chat_messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid REFERENCES chat_conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id uuid REFERENCES profiles NOT NULL,
  -- 메시지 종류: text(일반) | action_request(직원 요청) | action_response(어드민 답변)
  message_type text NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'action_request', 'action_response')),
  content text NOT NULL,
  -- 직원 템플릿: late(지각) | early_leave(조퇴) | absent(결근)
  -- 어드민 템플릿: confirmed(확인) | early_out_allowed(조기퇴근허가) | schedule_change(스케줄변경)
  template_key text
    CHECK (template_key IN ('late', 'early_leave', 'absent', 'confirmed', 'early_out_allowed', 'schedule_change')),
  -- action_request일 때만: pending | approved | rejected
  action_status text DEFAULT NULL
    CHECK (action_status IN ('pending', 'approved', 'rejected')),
  -- 스케줄 컨텍스트 (slot_id, slot_date, start_time, end_time, store_label)
  context_data jsonb DEFAULT NULL,
  created_at timestamptz DEFAULT now()
);

-- 3. 인덱스
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id
  ON chat_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_profile_id
  ON chat_conversations(profile_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_last_message
  ON chat_conversations(last_message_at DESC);

-- 4. RLS
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- chat_conversations RLS
CREATE POLICY "Admin can do all on conversations"
  ON chat_conversations FOR ALL
  USING (is_admin());

CREATE POLICY "Employee can view own conversation"
  ON chat_conversations FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "Employee can insert own conversation"
  ON chat_conversations FOR INSERT
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Employee can update own conversation"
  ON chat_conversations FOR UPDATE
  USING (profile_id = auth.uid());

-- chat_messages RLS
CREATE POLICY "Admin can do all on messages"
  ON chat_messages FOR ALL
  USING (is_admin());

CREATE POLICY "Employee can view messages in own conversation"
  ON chat_messages FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM chat_conversations WHERE profile_id = auth.uid()
    )
  );

CREATE POLICY "Employee can send messages in own conversation"
  ON chat_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND conversation_id IN (
      SELECT id FROM chat_conversations WHERE profile_id = auth.uid()
    )
  );

-- 5. Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE chat_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
