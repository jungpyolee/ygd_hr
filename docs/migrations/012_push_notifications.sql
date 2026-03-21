-- Migration 012: Web Push 알림 인프라
-- push_subscriptions: 브라우저 푸시 구독 정보
-- push_preferences: 유저별 푸시 수신 설정

-- 1. push_subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth_key text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(profile_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subscriptions_select" ON push_subscriptions
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "push_subscriptions_insert" ON push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "push_subscriptions_delete" ON push_subscriptions
  FOR DELETE TO authenticated
  USING (profile_id = auth.uid());

-- 2. push_preferences
CREATE TABLE IF NOT EXISTS push_preferences (
  profile_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  type_settings jsonb NOT NULL DEFAULT '{}',
  -- type_settings 예시: {"recipe_comment": false, "announcement": true}
  -- key 없으면 기본값 true (enabled=true 상태일 때)
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE push_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_preferences_select" ON push_preferences
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "push_preferences_insert" ON push_preferences
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "push_preferences_update" ON push_preferences
  FOR UPDATE TO authenticated
  USING (profile_id = auth.uid());
