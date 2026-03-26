# 02. 데이터베이스 마이그레이션 상세 계획

> **작성일**: 2026-03-25
> **대상**: Dev DB (`rddplpiwvmclreeblkmi`) → 검증 후 Prod (`ymvdjxzkjodasctktunh`)
> **기준 문서**: `docs/planning/multi-tenant-saas-blueprint.md` v3
> **마지막 기존 마이그레이션**: `041_attendance_credits.sql`

---

## 목차

1. [마이그레이션 파일 목록](#1-마이그레이션-파일-목록)
2. [신규 테이블 CREATE 문](#2-신규-테이블-create-문)
3. [기존 테이블 ALTER 문](#3-기존-테이블-alter-문)
4. [함수 변경](#4-함수-변경)
5. [RLS 정책 전면 재작성](#5-rls-정책-전면-재작성)
6. [데이터 마이그레이션](#6-데이터-마이그레이션)
7. [검증 SQL](#7-검증-sql)
8. [롤백 계획](#8-롤백-계획)
9. [Prod 배포 시 실행 순서](#9-prod-배포-시-실행-순서)
10. [체크리스트](#10-체크리스트)

---

## 1. 마이그레이션 파일 목록

총 7개 파일, 반드시 번호 순서대로 실행.

| # | 파일명 | 내용 | 의존성 |
|---|--------|------|--------|
| 1 | `042_create_organizations.sql` | organizations, organization_memberships, organization_admins 테이블 생성 | 없음 |
| 2 | `043_create_tenant_invites.sql` | tenant_invites 테이블 생성 | 042 |
| 3 | `044_create_payroll_tables.sql` | payroll_periods, payroll_entries 테이블 생성 | 042 |
| 4 | `045_create_audit_logs.sql` | audit_logs 테이블 생성 | 042 |
| 5 | `046_alter_existing_tables.sql` | 기존 19개 테이블에 organization_id FK + profiles 수정 | 042 |
| 6 | `047_functions_and_triggers.sql` | is_master(), is_org_admin(), is_org_member(), terminate_membership(), handle_new_user() 수정 | 042~046 |
| 7 | `048_rls_rewrite.sql` | 모든 테이블 RLS 정책 DROP + 재생성 | 042~047 |

> 데이터 마이그레이션(기존 연경당 데이터 채우기)은 048 이후 별도 SQL로 실행 (자동화 스크립트).

---

## 2. 신규 테이블 CREATE 문

### 042_create_organizations.sql

```sql
-- ============================================================
-- 042: 조직 핵심 테이블 3종 생성
-- organizations, organization_memberships, organization_admins
-- ============================================================

-- ─────────────────────────────────────────
-- 1. organizations
-- ─────────────────────────────────────────
CREATE TABLE organizations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  slug                text NOT NULL,
  owner_id            uuid NOT NULL REFERENCES profiles(id),
  business_type       text CHECK (business_type IN ('cafe', 'restaurant', 'factory', 'catering', 'other')),
  business_reg_number text,
  logo_url            text,
  subscription_tier   text NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free', 'starter', 'pro')),
  max_employees       integer NOT NULL DEFAULT 5,
  max_stores          integer NOT NULL DEFAULT 1,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organizations ADD CONSTRAINT organizations_slug_unique UNIQUE (slug);

CREATE INDEX idx_organizations_owner ON organizations(owner_id);
CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_active ON organizations(is_active) WHERE is_active = true;

-- slug 형식 제약: 영소문자, 숫자, 하이픈만 허용, 2~50자
ALTER TABLE organizations
  ADD CONSTRAINT organizations_slug_format
  CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,49}$');

-- updated_at 자동 갱신
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────
-- 2. organization_memberships
-- ─────────────────────────────────────────
CREATE TABLE organization_memberships (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'terminated', 'suspended')),
  join_date           date NOT NULL DEFAULT CURRENT_DATE,
  terminated_at       timestamptz,
  terminated_by       uuid REFERENCES profiles(id),
  termination_reason  text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, profile_id)
);

CREATE INDEX idx_memberships_org ON organization_memberships(organization_id);
CREATE INDEX idx_memberships_profile ON organization_memberships(profile_id);
CREATE INDEX idx_memberships_active ON organization_memberships(organization_id, profile_id)
  WHERE status = 'active';

CREATE TRIGGER trg_memberships_updated_at
  BEFORE UPDATE ON organization_memberships
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────
-- 3. organization_admins
-- ─────────────────────────────────────────
CREATE TABLE organization_admins (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role                text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'manager')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, profile_id)
);

CREATE INDEX idx_org_admins_org ON organization_admins(organization_id);
CREATE INDEX idx_org_admins_profile ON organization_admins(profile_id);

ALTER TABLE organization_admins ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────
-- 검증 쿼리
-- ─────────────────────────────────────────
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public'
--   AND tablename IN ('organizations', 'organization_memberships', 'organization_admins');
-- -> 3행
```

### 043_create_tenant_invites.sql

```sql
-- ============================================================
-- 043: 직원 초대 테이블
-- ============================================================

CREATE TABLE tenant_invites (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invited_by          uuid NOT NULL REFERENCES profiles(id),
  invite_code         text NOT NULL,
  role                text NOT NULL DEFAULT 'employee' CHECK (role IN ('employee', 'owner')),
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired')),
  max_uses            integer DEFAULT NULL,
  use_count           integer NOT NULL DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  expires_at          timestamptz DEFAULT (now() + interval '7 days')
);

ALTER TABLE tenant_invites ADD CONSTRAINT tenant_invites_code_unique UNIQUE (invite_code);

CREATE INDEX idx_invite_code ON tenant_invites(invite_code) WHERE status = 'active';
CREATE INDEX idx_invite_org ON tenant_invites(organization_id);
CREATE INDEX idx_invite_expires ON tenant_invites(expires_at) WHERE status = 'active';

ALTER TABLE tenant_invites ENABLE ROW LEVEL SECURITY;

-- 검증 쿼리
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'tenant_invites' ORDER BY ordinal_position;
```

### 044_create_payroll_tables.sql

```sql
-- ============================================================
-- 044: 급여 정산 테이블 2종
-- payroll_periods (월별 정산 기간)
-- payroll_entries (직원별 급여 내역)
-- ============================================================

-- ─────────────────────────────────────────
-- 1. payroll_periods
-- ─────────────────────────────────────────
CREATE TABLE payroll_periods (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  year                integer NOT NULL CHECK (year >= 2020 AND year <= 2100),
  month               integer NOT NULL CHECK (month >= 1 AND month <= 12),
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'paid')),
  confirmed_at        timestamptz,
  confirmed_by        uuid REFERENCES profiles(id),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, year, month)
);

CREATE INDEX idx_payroll_periods_org ON payroll_periods(organization_id);
CREATE INDEX idx_payroll_periods_org_year_month ON payroll_periods(organization_id, year DESC, month DESC);

CREATE TRIGGER trg_payroll_periods_updated_at
  BEFORE UPDATE ON payroll_periods
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE payroll_periods ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────
-- 2. payroll_entries
-- ─────────────────────────────────────────
CREATE TABLE payroll_entries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_period_id   uuid NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  profile_id          uuid NOT NULL REFERENCES profiles(id),
  organization_id     uuid NOT NULL REFERENCES organizations(id),
  scheduled_minutes   integer NOT NULL DEFAULT 0,
  hourly_wage         integer NOT NULL,
  insurance_type      text NOT NULL CHECK (insurance_type IN ('national', '3.3')),
  gross_salary        integer NOT NULL DEFAULT 0,
  deduction_amount    integer NOT NULL DEFAULT 0,
  net_salary          integer NOT NULL DEFAULT 0,
  payment_status      text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid')),
  paid_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(payroll_period_id, profile_id)
);

CREATE INDEX idx_payroll_entries_period ON payroll_entries(payroll_period_id);
CREATE INDEX idx_payroll_entries_profile ON payroll_entries(profile_id);
CREATE INDEX idx_payroll_entries_org ON payroll_entries(organization_id);

ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;

-- 검증 쿼리
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public'
--   AND tablename IN ('payroll_periods', 'payroll_entries');
-- -> 2행
```

### 045_create_audit_logs.sql

```sql
-- ============================================================
-- 045: 감사 로그 테이블
-- ============================================================

CREATE TABLE audit_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid REFERENCES organizations(id),
  actor_id            uuid REFERENCES profiles(id),
  action              text NOT NULL,
  resource_type       text,
  resource_id         uuid,
  details             jsonb,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_audit_org ON audit_logs(organization_id);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 검증 쿼리
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'audit_logs' ORDER BY ordinal_position;
```

---

## 3. 기존 테이블 ALTER 문

### 046_alter_existing_tables.sql

```sql
-- ============================================================
-- 046: 기존 테이블에 organization_id FK 추가 + profiles 수정
-- ============================================================

-- ─────────────────────────────────────────
-- 1. profiles 수정
-- ─────────────────────────────────────────

-- 1-1. primary_organization_id 추가
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS primary_organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;

-- 1-2. role 제약 변경: 'admin' → 'owner', 신규 'master' 허용
-- 기존 CHECK 제약이 있으면 제거 (없을 수 있음)
-- profiles.role에 기존 CHECK가 없으므로 새 CHECK 추가
-- (role 값 변환은 데이터 마이그레이션 단계에서 수행)
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('master', 'owner', 'employee'));

-- 1-3. email UNIQUE 제약을 DROP하고 nullable로 변경
-- SNS 로그인 시 email이 없을 수 있음 (카카오에서 이메일 미제공 시)
-- 주의: 기존 데이터에서 role='admin'인 값이 있으면 CHECK에 걸림
--       따라서 role 변환을 먼저 실행해야 함
-- → 이 제약 추가는 데이터 마이그레이션 후로 이동 (아래 주석 참고)

-- ─────────────────────────────────────────
-- 2. 19개 테이블에 organization_id 추가
-- ─────────────────────────────────────────

-- 2-1. stores
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_stores_org ON stores(organization_id);

-- 2-2. attendance_logs
ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_attendance_logs_org ON attendance_logs(organization_id);

-- 2-3. attendance_credits (출처 추적용, 점수 합산은 전역)
ALTER TABLE attendance_credits
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_credits_org ON attendance_credits(organization_id);

-- 2-4. notifications
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_notifications_org ON notifications(organization_id);

-- 2-5. work_defaults
ALTER TABLE work_defaults
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_work_defaults_org ON work_defaults(organization_id);

-- 2-6. weekly_schedules
ALTER TABLE weekly_schedules
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_weekly_schedules_org ON weekly_schedules(organization_id);
-- week_start UNIQUE 제약을 (organization_id, week_start)로 변경
ALTER TABLE weekly_schedules DROP CONSTRAINT IF EXISTS weekly_schedules_week_start_key;
ALTER TABLE weekly_schedules
  ADD CONSTRAINT weekly_schedules_org_week_unique UNIQUE (organization_id, week_start);

-- 2-7. schedule_slots
ALTER TABLE schedule_slots
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_schedule_slots_org ON schedule_slots(organization_id);

-- 2-8. substitute_requests
ALTER TABLE substitute_requests
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_substitute_requests_org ON substitute_requests(organization_id);

-- 2-9. substitute_responses
ALTER TABLE substitute_responses
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_substitute_responses_org ON substitute_responses(organization_id);

-- 2-10. recipe_categories
ALTER TABLE recipe_categories
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_recipe_categories_org ON recipe_categories(organization_id);

-- 2-11. recipe_items
ALTER TABLE recipe_items
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_recipe_items_org ON recipe_items(organization_id);

-- 2-12. recipe_ingredients
ALTER TABLE recipe_ingredients
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_org ON recipe_ingredients(organization_id);

-- 2-13. recipe_comments
ALTER TABLE recipe_comments
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_recipe_comments_org ON recipe_comments(organization_id);

-- 2-14. recipe_steps
ALTER TABLE recipe_steps
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_recipe_steps_org ON recipe_steps(organization_id);

-- 2-15. store_positions (stores 경유이지만 직접 org_id 보유 — RLS 단순화)
ALTER TABLE store_positions
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_store_positions_org ON store_positions(organization_id);

-- 2-16. employee_store_assignments
ALTER TABLE employee_store_assignments
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_esa_org ON employee_store_assignments(organization_id);

-- 2-17. overtime_requests
ALTER TABLE overtime_requests
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_overtime_org ON overtime_requests(organization_id);

-- 2-18. company_events
ALTER TABLE company_events
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_company_events_org ON company_events(organization_id);

-- ─────────────────────────────────────────
-- 3. 조직 비종속 테이블 (organization_id 불필요)
-- ─────────────────────────────────────────
-- 아래 테이블은 organization_id를 추가하지 않음:
--   - error_logs: 시스템 전역 에러 로그 (master만 관리)
--   - push_subscriptions: 디바이스 단위 (조직 무관)
--   - push_preferences: 사용자 단위 (조직 무관)
--   - cat_dodge_scores: 게임 (조직 무관)
--   - game_profiles, game_runs, game_seasons, game_season_scores, game_hr_rewards: 게임 (조직 무관)
--   - announcements: → organization_id 추가 필요 (빠뜨림 — 아래 보충)
--   - announcement_reads: → organization_id 추가 필요
--   - checklist_templates: → organization_id 추가 필요
--   - checklist_submissions: → organization_id 추가 필요

-- ─────────────────────────────────────────
-- 4. 추가 테이블 — org_id 보충 (016 마이그레이션에서 생성)
-- ─────────────────────────────────────────

-- 4-1. announcements
ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_announcements_org ON announcements(organization_id);

-- 4-2. announcement_reads
ALTER TABLE announcement_reads
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_announcement_reads_org ON announcement_reads(organization_id);

-- 4-3. checklist_templates
ALTER TABLE checklist_templates
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_checklist_templates_org ON checklist_templates(organization_id);

-- 4-4. checklist_submissions
ALTER TABLE checklist_submissions
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_checklist_submissions_org ON checklist_submissions(organization_id);

-- ─────────────────────────────────────────
-- 검증 쿼리
-- ─────────────────────────────────────────
-- 전 테이블 organization_id 컬럼 존재 여부 확인
-- SELECT t.tablename, c.column_name
-- FROM pg_tables t
-- LEFT JOIN information_schema.columns c
--   ON c.table_name = t.tablename AND c.column_name = 'organization_id'
-- WHERE t.schemaname = 'public'
--   AND t.tablename NOT IN (
--     'organizations', 'organization_memberships', 'organization_admins',
--     'tenant_invites', 'payroll_periods', 'payroll_entries', 'audit_logs',
--     'error_logs', 'push_subscriptions', 'push_preferences',
--     'cat_dodge_scores', 'game_profiles', 'game_runs', 'game_seasons',
--     'game_season_scores', 'game_hr_rewards'
--   )
-- ORDER BY t.tablename;
```

---

## 4. 함수 변경

### 047_functions_and_triggers.sql

```sql
-- ============================================================
-- 047: 함수 생성/수정 + 트리거 변경
-- ============================================================

-- ─────────────────────────────────────────
-- 1. is_master() — 신규 생성
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_master()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'master'
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─────────────────────────────────────────
-- 2. is_org_admin(p_org_id uuid) — 신규 생성
--    master이거나 해당 조직의 admin인지 확인
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_org_admin(p_org_id uuid)
RETURNS boolean AS $$
  SELECT is_master() OR EXISTS (
    SELECT 1 FROM organization_admins
    WHERE organization_id = p_org_id AND profile_id = auth.uid()
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─────────────────────────────────────────
-- 3. is_org_member(p_org_id uuid) — 신규 생성
--    master이거나 해당 조직의 active 멤버인지 확인
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_org_member(p_org_id uuid)
RETURNS boolean AS $$
  SELECT is_master() OR EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = p_org_id
      AND profile_id = auth.uid()
      AND status = 'active'
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─────────────────────────────────────────
-- 4. is_admin() — 레거시 호환 수정
--    기존: profiles.role = 'admin' 확인
--    변경: master이거나 아무 조직의 admin인지 확인
--    주의: 기존 코드에서 is_admin() 호출하는 곳이 org 필터 전환 전까지 호환 필요
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT is_master() OR EXISTS (
    SELECT 1 FROM organization_admins
    WHERE profile_id = auth.uid()
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─────────────────────────────────────────
-- 5. handle_new_user() — SNS 가입 대응 수정
--    기존: email, name만 삽입
--    변경: SNS 가입 시 email이 없을 수 있음, provider 정보 활용
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email text;
  user_name text;
  invite_org_id uuid;
  invite_record record;
BEGIN
  -- 이메일 추출: 직접 email 또는 user_metadata에서
  user_email := COALESCE(
    NEW.email,
    NEW.raw_user_meta_data->>'email'
  );

  -- 이름 추출: user_metadata에서 (카카오: nickname, Apple: name, 이메일: name)
  user_name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'nickname',
    NEW.raw_user_meta_data->>'preferred_username',
    split_part(user_email, '@', 1)
  );

  -- profiles 생성
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (NEW.id, user_email, user_name, 'employee')
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────
-- 6. terminate_membership() — 소프트 삭제 함수
--    auth.users 유지, membership만 terminated 처리
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION terminate_membership(
  p_target_user_id uuid,
  p_organization_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  -- 권한 확인: 해당 조직의 admin 또는 master
  IF NOT is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized'
      USING ERRCODE = 'P0001';
  END IF;

  -- 1. 멤버십 상태 변경
  UPDATE organization_memberships
  SET status = 'terminated',
      terminated_at = now(),
      terminated_by = auth.uid(),
      termination_reason = p_reason,
      updated_at = now()
  WHERE profile_id = p_target_user_id
    AND organization_id = p_organization_id
    AND status = 'active';

  -- 변경된 행이 없으면 에러
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active membership not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- 2. 미래 스케줄 슬롯 삭제
  DELETE FROM schedule_slots
  WHERE profile_id = p_target_user_id
    AND slot_date > CURRENT_DATE
    AND organization_id = p_organization_id;

  -- 3. organization_admins에서 제거 (owner 포함)
  DELETE FROM organization_admins
  WHERE profile_id = p_target_user_id
    AND organization_id = p_organization_id;

  -- 4. employee_store_assignments에서 제거
  DELETE FROM employee_store_assignments
  WHERE profile_id = p_target_user_id
    AND organization_id = p_organization_id;

  -- 5. primary_organization_id 정리
  UPDATE profiles
  SET primary_organization_id = (
    SELECT om.organization_id
    FROM organization_memberships om
    WHERE om.profile_id = p_target_user_id
      AND om.status = 'active'
      AND om.organization_id != p_organization_id
    LIMIT 1
  )
  WHERE id = p_target_user_id
    AND primary_organization_id = p_organization_id;

  -- 6. 감사 로그
  INSERT INTO audit_logs (organization_id, actor_id, action, resource_type, resource_id, details)
  VALUES (
    p_organization_id,
    auth.uid(),
    'employee_terminated',
    'profile',
    p_target_user_id,
    jsonb_build_object('reason', p_reason)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────
-- 7. delete_user_admin() 폐기
--    기존 함수를 의존하는 코드가 없어질 때까지 유지하되 deprecated 표시
--    즉시 삭제 대신 에러를 발생시키도록 변경
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION delete_user_admin(target_user_id uuid)
RETURNS void AS $$
BEGIN
  RAISE EXCEPTION 'DEPRECATED: Use terminate_membership() instead'
    USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────
-- 8. accept_substitute_request용 organization_id 전파
--    기존 accept_substitute RPC가 있다면 organization_id를 포함하도록 수정
--    (코드 레벨에서 처리하므로 DB 함수 수정은 선택적)
-- ─────────────────────────────────────────

-- ─────────────────────────────────────────
-- 검증 쿼리
-- ─────────────────────────────────────────
-- SELECT routine_name, routine_type
-- FROM information_schema.routines
-- WHERE routine_schema = 'public'
--   AND routine_name IN ('is_master', 'is_org_admin', 'is_org_member', 'is_admin',
--                        'handle_new_user', 'terminate_membership', 'delete_user_admin');
-- -> 7행
```

---

## 5. RLS 정책 전면 재작성

### 048_rls_rewrite.sql

> **원칙**: 모든 기존 RLS 정책을 DROP 후 재생성. 조직 테이블은 `organization_id` 기반 격리.

```sql
-- ============================================================
-- 048: RLS 정책 전면 재작성
-- 모든 기존 정책 DROP → 신규 멀티테넌트 정책 생성
-- ============================================================

-- =============================================
-- STEP 1: 기존 RLS 정책 전부 DROP
-- =============================================

-- profiles
DROP POLICY IF EXISTS "Admin Bypass" ON profiles;
DROP POLICY IF EXISTS "Profiles are viewable by users" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- attendance_logs
DROP POLICY IF EXISTS "Admin Bypass" ON attendance_logs;
DROP POLICY IF EXISTS "인증된 사용자는 자신의 출퇴근 기록만 볼 수 있음" ON attendance_logs;
DROP POLICY IF EXISTS "인증된 사용자는 자신의 출퇴근 기록을 남길 수 있음" ON attendance_logs;

-- stores
DROP POLICY IF EXISTS "Admin Bypass" ON stores;
DROP POLICY IF EXISTS "인증된 사용자는 매장 정보를 볼 수 있음" ON stores;
DROP POLICY IF EXISTS "stores_anon_select" ON stores;

-- store_positions
DROP POLICY IF EXISTS "anon_select_store_positions" ON store_positions;
DROP POLICY IF EXISTS "authenticated_select_store_positions" ON store_positions;
DROP POLICY IF EXISTS "admin_all_store_positions" ON store_positions;

-- employee_store_assignments
DROP POLICY IF EXISTS "admin_all_esa" ON employee_store_assignments;
DROP POLICY IF EXISTS "employee_select_own_esa" ON employee_store_assignments;

-- notifications
DROP POLICY IF EXISTS "Anyone can create notifications" ON notifications;
DROP POLICY IF EXISTS "Users can view their own or admins view all" ON notifications;
DROP POLICY IF EXISTS "Users can update their own notification status" ON notifications;
DROP POLICY IF EXISTS "Only admins can delete notifications" ON notifications;

-- work_defaults
DROP POLICY IF EXISTS "Admin bypass" ON work_defaults;
DROP POLICY IF EXISTS "View own defaults" ON work_defaults;

-- weekly_schedules
DROP POLICY IF EXISTS "Admin bypass" ON weekly_schedules;
DROP POLICY IF EXISTS "Employees view confirmed" ON weekly_schedules;

-- schedule_slots
DROP POLICY IF EXISTS "Admin bypass" ON schedule_slots;
DROP POLICY IF EXISTS "View own confirmed slots" ON schedule_slots;
DROP POLICY IF EXISTS "employee_view_confirmed_team_slots" ON schedule_slots;

-- substitute_requests
DROP POLICY IF EXISTS "Admin bypass" ON substitute_requests;
DROP POLICY IF EXISTS "Requester can view own" ON substitute_requests;
DROP POLICY IF EXISTS "Requester can insert" ON substitute_requests;
DROP POLICY IF EXISTS "Eligible can view approved" ON substitute_requests;

-- substitute_responses
DROP POLICY IF EXISTS "Admin bypass" ON substitute_responses;
DROP POLICY IF EXISTS "Users can manage own response" ON substitute_responses;
DROP POLICY IF EXISTS "Request parties can view" ON substitute_responses;

-- recipe_categories
DROP POLICY IF EXISTS "레시피 카테고리 조회" ON recipe_categories;
DROP POLICY IF EXISTS "어드민 레시피 카테고리 관리" ON recipe_categories;

-- recipe_items
DROP POLICY IF EXISTS "레시피 조회" ON recipe_items;
DROP POLICY IF EXISTS "어드민 레시피 관리" ON recipe_items;

-- recipe_steps
DROP POLICY IF EXISTS "레시피 단계 조회" ON recipe_steps;
DROP POLICY IF EXISTS "어드민 레시피 단계 관리" ON recipe_steps;

-- recipe_ingredients
DROP POLICY IF EXISTS "레시피 재료 조회" ON recipe_ingredients;
DROP POLICY IF EXISTS "어드민 레시피 재료 관리" ON recipe_ingredients;

-- recipe_comments
DROP POLICY IF EXISTS "레시피 댓글 조회" ON recipe_comments;
DROP POLICY IF EXISTS "직원 댓글 삽입" ON recipe_comments;
DROP POLICY IF EXISTS "본인 댓글 수정" ON recipe_comments;
DROP POLICY IF EXISTS "어드민 댓글 관리" ON recipe_comments;

-- overtime_requests
DROP POLICY IF EXISTS "overtime_select_own" ON overtime_requests;
DROP POLICY IF EXISTS "overtime_insert_own" ON overtime_requests;
DROP POLICY IF EXISTS "overtime_update_admin" ON overtime_requests;
DROP POLICY IF EXISTS "overtime_delete_admin" ON overtime_requests;

-- company_events
DROP POLICY IF EXISTS "admin_all_company_events" ON company_events;
DROP POLICY IF EXISTS "employee_select_company_events" ON company_events;

-- attendance_credits
DROP POLICY IF EXISTS "credits_select_own_or_admin" ON attendance_credits;
DROP POLICY IF EXISTS "credits_insert_admin" ON attendance_credits;
DROP POLICY IF EXISTS "credits_update_admin" ON attendance_credits;
DROP POLICY IF EXISTS "credits_delete_admin" ON attendance_credits;

-- announcements
DROP POLICY IF EXISTS "어드민 공지 관리" ON announcements;
DROP POLICY IF EXISTS "직원 공지 조회" ON announcements;

-- announcement_reads
DROP POLICY IF EXISTS "본인 읽음 등록" ON announcement_reads;
DROP POLICY IF EXISTS "본인 읽음 조회" ON announcement_reads;

-- checklist_templates
DROP POLICY IF EXISTS "어드민 템플릿 관리" ON checklist_templates;
DROP POLICY IF EXISTS "직원 템플릿 조회" ON checklist_templates;

-- checklist_submissions
DROP POLICY IF EXISTS "어드민 제출 기록 조회" ON checklist_submissions;
DROP POLICY IF EXISTS "직원 제출 기록 관리" ON checklist_submissions;

-- error_logs
DROP POLICY IF EXISTS "admin_select_error_logs" ON error_logs;
DROP POLICY IF EXISTS "admin_update_error_logs" ON error_logs;

-- push_subscriptions
DROP POLICY IF EXISTS "push_subscriptions_select" ON push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_insert" ON push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_delete" ON push_subscriptions;

-- push_preferences
DROP POLICY IF EXISTS "push_preferences_select" ON push_preferences;
DROP POLICY IF EXISTS "push_preferences_insert" ON push_preferences;
DROP POLICY IF EXISTS "push_preferences_update" ON push_preferences;

-- game tables
DROP POLICY IF EXISTS "본인 조회" ON game_profiles;
DROP POLICY IF EXISTS "본인 수정" ON game_profiles;
DROP POLICY IF EXISTS "어드민 전체" ON game_profiles;
DROP POLICY IF EXISTS "전체 조회 game_profiles" ON game_profiles;

DROP POLICY IF EXISTS "본인 조회" ON game_runs;
DROP POLICY IF EXISTS "본인 삽입" ON game_runs;
DROP POLICY IF EXISTS "어드민 전체" ON game_runs;

DROP POLICY IF EXISTS "전체 조회" ON game_seasons;
DROP POLICY IF EXISTS "어드민 전체" ON game_seasons;

DROP POLICY IF EXISTS "전체 조회" ON game_season_scores;
DROP POLICY IF EXISTS "본인 수정" ON game_season_scores;
DROP POLICY IF EXISTS "어드민 전체" ON game_season_scores;

DROP POLICY IF EXISTS "본인 조회" ON game_hr_rewards;
DROP POLICY IF EXISTS "어드민 전체" ON game_hr_rewards;

DROP POLICY IF EXISTS "cat_dodge_scores_select" ON cat_dodge_scores;
DROP POLICY IF EXISTS "cat_dodge_scores_insert" ON cat_dodge_scores;


-- =============================================
-- STEP 2: 신규 RLS 정책 생성
-- =============================================

-- ─────────────────────────────────────────
-- organizations
-- ─────────────────────────────────────────
CREATE POLICY "master_all_orgs"
  ON organizations FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_select"
  ON organizations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_admins oa
      WHERE oa.organization_id = organizations.id
        AND oa.profile_id = auth.uid()
    )
  );

CREATE POLICY "org_admin_update"
  ON organizations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_admins oa
      WHERE oa.organization_id = organizations.id
        AND oa.profile_id = auth.uid()
    )
  );

CREATE POLICY "member_select_org"
  ON organizations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships om
      WHERE om.organization_id = organizations.id
        AND om.profile_id = auth.uid()
        AND om.status = 'active'
    )
  );

-- slug로 조직 조회 허용 (가입 전 초대 페이지 등에서 필요)
CREATE POLICY "anon_select_org_by_slug"
  ON organizations FOR SELECT
  TO anon
  USING (is_active = true);

-- ─────────────────────────────────────────
-- organization_memberships
-- ─────────────────────────────────────────
CREATE POLICY "master_all_memberships"
  ON organization_memberships FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_all_memberships"
  ON organization_memberships FOR ALL
  TO authenticated
  USING (is_org_admin(organization_id));

CREATE POLICY "member_select_own_membership"
  ON organization_memberships FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- ─────────────────────────────────────────
-- organization_admins
-- ─────────────────────────────────────────
CREATE POLICY "master_all_org_admins"
  ON organization_admins FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_select_admins"
  ON organization_admins FOR SELECT
  TO authenticated
  USING (is_org_admin(organization_id));

CREATE POLICY "member_select_admins"
  ON organization_admins FOR SELECT
  TO authenticated
  USING (is_org_member(organization_id));

-- ─────────────────────────────────────────
-- tenant_invites
-- ─────────────────────────────────────────
CREATE POLICY "master_all_invites"
  ON tenant_invites FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_all_invites"
  ON tenant_invites FOR ALL
  TO authenticated
  USING (is_org_admin(organization_id));

-- 초대 코드 검증 시 anon/authenticated 모두 SELECT 가능
CREATE POLICY "anyone_select_active_invite"
  ON tenant_invites FOR SELECT
  TO authenticated
  USING (status = 'active' AND (expires_at IS NULL OR expires_at > now()));

-- ─────────────────────────────────────────
-- profiles
-- ─────────────────────────────────────────
CREATE POLICY "master_all_profiles"
  ON profiles FOR ALL
  USING (is_master());

-- 같은 조직 멤버끼리 조회 가능
CREATE POLICY "org_member_select_profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships om1
      JOIN organization_memberships om2 ON om1.organization_id = om2.organization_id
      WHERE om1.profile_id = auth.uid() AND om1.status = 'active'
        AND om2.profile_id = profiles.id AND om2.status = 'active'
    )
    OR id = auth.uid()
  );

-- 본인 프로필 수정
CREATE POLICY "self_update_profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- org admin이 소속 직원 프로필 수정 (시급, 보험유형 등)
CREATE POLICY "org_admin_update_member_profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_admins oa
      JOIN organization_memberships om ON oa.organization_id = om.organization_id
      WHERE oa.profile_id = auth.uid()
        AND om.profile_id = profiles.id
        AND om.status = 'active'
    )
  );

-- ─────────────────────────────────────────
-- attendance_logs
-- ─────────────────────────────────────────
CREATE POLICY "master_all_attendance"
  ON attendance_logs FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_all_attendance"
  ON attendance_logs FOR ALL
  TO authenticated
  USING (is_org_admin(organization_id));

CREATE POLICY "member_select_own_attendance"
  ON attendance_logs FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid() AND is_org_member(organization_id));

CREATE POLICY "member_insert_own_attendance"
  ON attendance_logs FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

-- ─────────────────────────────────────────
-- stores
-- ─────────────────────────────────────────
CREATE POLICY "master_all_stores"
  ON stores FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_all_stores"
  ON stores FOR ALL
  TO authenticated
  USING (is_org_admin(organization_id));

CREATE POLICY "member_select_stores"
  ON stores FOR SELECT
  TO authenticated
  USING (is_org_member(organization_id));

-- anon은 조직 가입 플로우에서 매장 정보 필요할 수 있음
CREATE POLICY "anon_select_stores"
  ON stores FOR SELECT
  TO anon
  USING (true);

-- ─────────────────────────────────────────
-- store_positions
-- ─────────────────────────────────────────
CREATE POLICY "master_all_store_positions"
  ON store_positions FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_all_store_positions"
  ON store_positions FOR ALL
  TO authenticated
  USING (is_org_admin(organization_id));

CREATE POLICY "member_select_store_positions"
  ON store_positions FOR SELECT
  TO authenticated
  USING (is_org_member(organization_id));

CREATE POLICY "anon_select_store_positions"
  ON store_positions FOR SELECT
  TO anon
  USING (true);

-- ─────────────────────────────────────────
-- employee_store_assignments
-- ─────────────────────────────────────────
CREATE POLICY "master_all_esa"
  ON employee_store_assignments FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_all_esa"
  ON employee_store_assignments FOR ALL
  TO authenticated
  USING (is_org_admin(organization_id));

CREATE POLICY "member_select_own_esa"
  ON employee_store_assignments FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- ─────────────────────────────────────────
-- notifications
-- ─────────────────────────────────────────
CREATE POLICY "master_all_notifications"
  ON notifications FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_all_notifications"
  ON notifications FOR ALL
  TO authenticated
  USING (is_org_admin(organization_id));

-- 서비스 롤/코드에서 INSERT
CREATE POLICY "authenticated_insert_notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "member_select_own_notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (
    is_org_member(organization_id) AND (
      profile_id = auth.uid()
      OR target_role = 'all'
      OR (target_role = 'admin' AND is_org_admin(organization_id))
      OR (target_role = 'employee' AND NOT is_org_admin(organization_id))
    )
  );

CREATE POLICY "member_update_own_notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (
    profile_id = auth.uid()
    OR target_role = 'all'
    OR (target_role = 'admin' AND is_org_admin(organization_id))
  );

-- ─────────────────────────────────────────
-- work_defaults
-- ─────────────────────────────────────────
CREATE POLICY "master_all_work_defaults"
  ON work_defaults FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_all_work_defaults"
  ON work_defaults FOR ALL
  TO authenticated
  USING (is_org_admin(organization_id));

CREATE POLICY "member_select_own_work_defaults"
  ON work_defaults FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- ─────────────────────────────────────────
-- weekly_schedules
-- ─────────────────────────────────────────
CREATE POLICY "master_all_weekly_schedules"
  ON weekly_schedules FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_all_weekly_schedules"
  ON weekly_schedules FOR ALL
  TO authenticated
  USING (is_org_admin(organization_id));

CREATE POLICY "member_select_confirmed_schedules"
  ON weekly_schedules FOR SELECT
  TO authenticated
  USING (is_org_member(organization_id) AND status = 'confirmed');

-- ─────────────────────────────────────────
-- schedule_slots
-- ─────────────────────────────────────────
CREATE POLICY "master_all_schedule_slots"
  ON schedule_slots FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_all_schedule_slots"
  ON schedule_slots FOR ALL
  TO authenticated
  USING (is_org_admin(organization_id));

-- 직원: 확정 주의 모든 슬롯 조회 (팀뷰)
CREATE POLICY "member_select_confirmed_slots"
  ON schedule_slots FOR SELECT
  TO authenticated
  USING (
    is_org_member(organization_id) AND EXISTS (
      SELECT 1 FROM weekly_schedules ws
      WHERE ws.id = schedule_slots.weekly_schedule_id
        AND ws.status = 'confirmed'
    )
  );

-- ─────────────────────────────────────────
-- substitute_requests
-- ─────────────────────────────────────────
CREATE POLICY "master_all_sub_requests"
  ON substitute_requests FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_all_sub_requests"
  ON substitute_requests FOR ALL
  TO authenticated
  USING (is_org_admin(organization_id));

CREATE POLICY "requester_select_own_sub"
  ON substitute_requests FOR SELECT
  TO authenticated
  USING (requester_id = auth.uid());

CREATE POLICY "requester_insert_sub"
  ON substitute_requests FOR INSERT
  TO authenticated
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "eligible_select_approved_sub"
  ON substitute_requests FOR SELECT
  TO authenticated
  USING (status = 'approved' AND auth.uid() = ANY(eligible_profile_ids));

-- ─────────────────────────────────────────
-- substitute_responses
-- ─────────────────────────────────────────
CREATE POLICY "master_all_sub_responses"
  ON substitute_responses FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_all_sub_responses"
  ON substitute_responses FOR ALL
  TO authenticated
  USING (is_org_admin(organization_id));

CREATE POLICY "self_manage_sub_response"
  ON substitute_responses FOR ALL
  TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "request_parties_view_sub_response"
  ON substitute_responses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM substitute_requests sr
      WHERE sr.id = substitute_responses.request_id
        AND (sr.requester_id = auth.uid() OR auth.uid() = ANY(sr.eligible_profile_ids))
    )
  );

-- ─────────────────────────────────────────
-- recipe_categories
-- ─────────────────────────────────────────
CREATE POLICY "master_all_recipe_categories"
  ON recipe_categories FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_all_recipe_categories"
  ON recipe_categories FOR ALL
  TO authenticated
  USING (is_org_admin(organization_id));

CREATE POLICY "member_select_recipe_categories"
  ON recipe_categories FOR SELECT
  TO authenticated
  USING (is_org_member(organization_id));

-- ─────────────────────────────────────────
-- recipe_items
-- ─────────────────────────────────────────
CREATE POLICY "master_all_recipe_items"
  ON recipe_items FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_all_recipe_items"
  ON recipe_items FOR ALL
  TO authenticated
  USING (is_org_admin(organization_id));

CREATE POLICY "member_select_published_recipes"
  ON recipe_items FOR SELECT
  TO authenticated
  USING (
    is_org_member(organization_id) AND (is_published = true OR created_by = auth.uid())
  );

-- full_time 직원이 본인 레시피 관리
CREATE POLICY "fulltime_manage_own_recipes"
  ON recipe_items FOR ALL
  TO authenticated
  USING (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
        AND employment_type = 'full_time'
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
        AND employment_type = 'full_time'
    )
  );

-- ─────────────────────────────────────────
-- recipe_steps
-- ─────────────────────────────────────────
CREATE POLICY "master_all_recipe_steps"
  ON recipe_steps FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_all_recipe_steps"
  ON recipe_steps FOR ALL
  TO authenticated
  USING (is_org_admin(organization_id));

CREATE POLICY "member_select_published_recipe_steps"
  ON recipe_steps FOR SELECT
  TO authenticated
  USING (
    is_org_member(organization_id) AND EXISTS (
      SELECT 1 FROM recipe_items ri
      WHERE ri.id = recipe_steps.recipe_id
        AND (ri.is_published = true OR ri.created_by = auth.uid())
    )
  );

-- ─────────────────────────────────────────
-- recipe_ingredients
-- ─────────────────────────────────────────
CREATE POLICY "master_all_recipe_ingredients"
  ON recipe_ingredients FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_all_recipe_ingredients"
  ON recipe_ingredients FOR ALL
  TO authenticated
  USING (is_org_admin(organization_id));

CREATE POLICY "member_select_published_recipe_ingredients"
  ON recipe_ingredients FOR SELECT
  TO authenticated
  USING (
    is_org_member(organization_id) AND EXISTS (
      SELECT 1 FROM recipe_items ri
      WHERE ri.id = recipe_ingredients.recipe_id
        AND (ri.is_published = true OR ri.created_by = auth.uid())
    )
  );

-- ─────────────────────────────────────────
-- recipe_comments
-- ─────────────────────────────────────────
CREATE POLICY "master_all_recipe_comments"
  ON recipe_comments FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_all_recipe_comments"
  ON recipe_comments FOR ALL
  TO authenticated
  USING (is_org_admin(organization_id));

CREATE POLICY "member_select_recipe_comments"
  ON recipe_comments FOR SELECT
  TO authenticated
  USING (is_org_member(organization_id));

CREATE POLICY "member_insert_recipe_comments"
  ON recipe_comments FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid() AND is_org_member(organization_id));

CREATE POLICY "self_update_recipe_comments"
  ON recipe_comments FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid());

-- ─────────────────────────────────────────
-- overtime_requests
-- ─────────────────────────────────────────
CREATE POLICY "master_all_overtime"
  ON overtime_requests FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_all_overtime"
  ON overtime_requests FOR ALL
  TO authenticated
  USING (is_org_admin(organization_id));

CREATE POLICY "member_select_own_overtime"
  ON overtime_requests FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "member_insert_own_overtime"
  ON overtime_requests FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

-- ─────────────────────────────────────────
-- company_events
-- ─────────────────────────────────────────
CREATE POLICY "master_all_company_events"
  ON company_events FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_all_company_events"
  ON company_events FOR ALL
  TO authenticated
  USING (is_org_admin(organization_id));

CREATE POLICY "member_select_company_events"
  ON company_events FOR SELECT
  TO authenticated
  USING (
    is_org_member(organization_id) AND (
      store_id IS NULL
      OR EXISTS (
        SELECT 1 FROM employee_store_assignments esa
        WHERE esa.profile_id = auth.uid()
          AND esa.store_id = company_events.store_id
      )
    )
  );

-- ─────────────────────────────────────────
-- attendance_credits (전역 — organization_id는 출처 추적용)
-- ─────────────────────────────────────────
CREATE POLICY "master_all_credits"
  ON attendance_credits FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_select_member_credits"
  ON attendance_credits FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_admins oa
      JOIN organization_memberships om ON oa.organization_id = om.organization_id
      WHERE oa.profile_id = auth.uid()
        AND om.profile_id = attendance_credits.profile_id
        AND om.status = 'active'
    )
  );

CREATE POLICY "org_admin_insert_credits"
  ON attendance_credits FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "org_admin_update_credits"
  ON attendance_credits FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "org_admin_delete_credits"
  ON attendance_credits FOR DELETE
  TO authenticated
  USING (is_admin());

CREATE POLICY "self_select_credits"
  ON attendance_credits FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- ─────────────────────────────────────────
-- announcements
-- ─────────────────────────────────────────
CREATE POLICY "master_all_announcements"
  ON announcements FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_all_announcements"
  ON announcements FOR ALL
  TO authenticated
  USING (is_org_admin(organization_id));

CREATE POLICY "member_select_announcements"
  ON announcements FOR SELECT
  TO authenticated
  USING (
    is_org_member(organization_id) AND (
      'all' = ANY(target_roles)
      OR (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'employee')
        AND 'employee' = ANY(target_roles)
      )
    )
  );

-- ─────────────────────────────────────────
-- announcement_reads
-- ─────────────────────────────────────────
CREATE POLICY "master_all_announcement_reads"
  ON announcement_reads FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_select_announcement_reads"
  ON announcement_reads FOR SELECT
  TO authenticated
  USING (is_org_admin(organization_id));

CREATE POLICY "self_insert_announcement_reads"
  ON announcement_reads FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "self_select_announcement_reads"
  ON announcement_reads FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- ─────────────────────────────────────────
-- checklist_templates
-- ─────────────────────────────────────────
CREATE POLICY "master_all_checklist_templates"
  ON checklist_templates FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_all_checklist_templates"
  ON checklist_templates FOR ALL
  TO authenticated
  USING (is_org_admin(organization_id));

CREATE POLICY "member_select_active_checklist_templates"
  ON checklist_templates FOR SELECT
  TO authenticated
  USING (is_org_member(organization_id) AND is_active = true);

-- ─────────────────────────────────────────
-- checklist_submissions
-- ─────────────────────────────────────────
CREATE POLICY "master_all_checklist_submissions"
  ON checklist_submissions FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_all_checklist_submissions"
  ON checklist_submissions FOR ALL
  TO authenticated
  USING (is_org_admin(organization_id));

CREATE POLICY "self_manage_checklist_submissions"
  ON checklist_submissions FOR ALL
  TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- ─────────────────────────────────────────
-- payroll_periods
-- ─────────────────────────────────────────
CREATE POLICY "master_all_payroll_periods"
  ON payroll_periods FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_all_payroll_periods"
  ON payroll_periods FOR ALL
  TO authenticated
  USING (is_org_admin(organization_id));

CREATE POLICY "member_select_payroll_periods"
  ON payroll_periods FOR SELECT
  TO authenticated
  USING (is_org_member(organization_id) AND status IN ('confirmed', 'paid'));

-- ─────────────────────────────────────────
-- payroll_entries
-- ─────────────────────────────────────────
CREATE POLICY "master_all_payroll_entries"
  ON payroll_entries FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_all_payroll_entries"
  ON payroll_entries FOR ALL
  TO authenticated
  USING (is_org_admin(organization_id));

CREATE POLICY "self_select_payroll_entries"
  ON payroll_entries FOR SELECT
  TO authenticated
  USING (
    profile_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM payroll_periods pp
      WHERE pp.id = payroll_entries.payroll_period_id
        AND pp.status IN ('confirmed', 'paid')
    )
  );

-- ─────────────────────────────────────────
-- audit_logs
-- ─────────────────────────────────────────
CREATE POLICY "master_all_audit_logs"
  ON audit_logs FOR ALL
  USING (is_master());

CREATE POLICY "org_admin_select_audit_logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (is_org_admin(organization_id));

-- INSERT는 SECURITY DEFINER 함수에서만 (terminate_membership 등)
CREATE POLICY "service_insert_audit_logs"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ─────────────────────────────────────────
-- error_logs (조직 무관 — master/admin만)
-- ─────────────────────────────────────────
CREATE POLICY "master_all_error_logs"
  ON error_logs FOR ALL
  USING (is_master());

CREATE POLICY "admin_select_error_logs"
  ON error_logs FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "admin_update_error_logs"
  ON error_logs FOR UPDATE
  TO authenticated
  USING (is_admin());

-- ─────────────────────────────────────────
-- push_subscriptions (조직 무관 — 개인 디바이스)
-- ─────────────────────────────────────────
CREATE POLICY "self_select_push_subs"
  ON push_subscriptions FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "self_insert_push_subs"
  ON push_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "self_delete_push_subs"
  ON push_subscriptions FOR DELETE
  TO authenticated
  USING (profile_id = auth.uid());

-- admin이 푸시 발송 시 구독 조회 필요
CREATE POLICY "admin_select_push_subs"
  ON push_subscriptions FOR SELECT
  TO authenticated
  USING (is_admin());

-- ─────────────────────────────────────────
-- push_preferences (조직 무관 — 개인 설정)
-- ─────────────────────────────────────────
CREATE POLICY "self_select_push_prefs"
  ON push_preferences FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "self_insert_push_prefs"
  ON push_preferences FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "self_update_push_prefs"
  ON push_preferences FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid());

-- ─────────────────────────────────────────
-- 게임 테이블 (조직 무관)
-- ─────────────────────────────────────────

-- game_profiles
CREATE POLICY "self_select_game_profiles"
  ON game_profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "self_update_game_profiles"
  ON game_profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());

CREATE POLICY "master_all_game_profiles"
  ON game_profiles FOR ALL
  USING (is_master());

-- 리더보드용 전체 조회
CREATE POLICY "authenticated_select_game_profiles"
  ON game_profiles FOR SELECT TO authenticated
  USING (true);

-- game_runs
CREATE POLICY "self_select_game_runs"
  ON game_runs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "self_insert_game_runs"
  ON game_runs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "master_all_game_runs"
  ON game_runs FOR ALL
  USING (is_master());

-- game_seasons
CREATE POLICY "authenticated_select_game_seasons"
  ON game_seasons FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "master_all_game_seasons"
  ON game_seasons FOR ALL
  USING (is_master());

-- game_season_scores
CREATE POLICY "authenticated_select_game_season_scores"
  ON game_season_scores FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "self_manage_game_season_scores"
  ON game_season_scores FOR ALL TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "master_all_game_season_scores"
  ON game_season_scores FOR ALL
  USING (is_master());

-- game_hr_rewards
CREATE POLICY "self_select_game_hr_rewards"
  ON game_hr_rewards FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "master_all_game_hr_rewards"
  ON game_hr_rewards FOR ALL
  USING (is_master());

-- cat_dodge_scores
CREATE POLICY "authenticated_select_cat_dodge"
  ON cat_dodge_scores FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "self_insert_cat_dodge"
  ON cat_dodge_scores FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- Realtime publication 추가
-- ─────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE organizations;
ALTER PUBLICATION supabase_realtime ADD TABLE organization_memberships;
ALTER PUBLICATION supabase_realtime ADD TABLE payroll_periods;

-- ─────────────────────────────────────────
-- 검증 쿼리
-- ─────────────────────────────────────────
-- SELECT schemaname, tablename, policyname, cmd, roles
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
```

---

## 6. 데이터 마이그레이션

> 042~048 실행 후, 기존 연경당 데이터를 새 구조로 옮기는 SQL.
> 별도 파일: `049_data_migration_ygd.sql`

```sql
-- ============================================================
-- 049: 기존 연경당 데이터 → 멀티테넌트 구조 마이그레이션
-- 주의: 이 SQL은 한 번만 실행 (멱등하게 작성하되 중복 실행 시 충돌 안전)
-- ============================================================

-- ─────────────────────────────────────────
-- STEP 1: profiles.role 값 변환
-- 'admin' → 'owner' (CHECK 제약 추가 전에 실행)
-- ─────────────────────────────────────────
UPDATE profiles SET role = 'owner' WHERE role = 'admin';

-- 정표 계정을 master로 설정 (이메일로 식별)
-- 주의: 정표의 실제 이메일/ID로 교체 필요
UPDATE profiles SET role = 'master'
WHERE email = 'jungpyo@ygd.com'  -- 또는 정표의 auth.users.id 직접 지정
   OR id = '정표의_실제_UUID';

-- ─────────────────────────────────────────
-- STEP 2: 연경당 조직 생성
-- ─────────────────────────────────────────
INSERT INTO organizations (id, name, slug, owner_id, business_type, subscription_tier, max_employees, max_stores)
SELECT
  gen_random_uuid(),
  '연경당',
  'yeonggyeongdang',
  (SELECT id FROM profiles WHERE role = 'master' LIMIT 1),
  'cafe',
  'pro',
  50,
  10
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE slug = 'yeonggyeongdang');

-- 조직 ID를 변수로 사용하기 위해 CTE 활용
-- (Management API에서는 DO 블록 사용)
DO $$
DECLARE
  ygd_org_id uuid;
  master_id uuid;
  owner_profile RECORD;
BEGIN
  SELECT id INTO ygd_org_id FROM organizations WHERE slug = 'yeonggyeongdang';
  SELECT id INTO master_id FROM profiles WHERE role = 'master' LIMIT 1;

  -- ─────────────────────────────────────────
  -- STEP 3: 모든 기존 직원 → organization_memberships
  -- ─────────────────────────────────────────
  INSERT INTO organization_memberships (organization_id, profile_id, status, join_date)
  SELECT ygd_org_id, p.id, 'active', COALESCE(p.join_date, p.created_at::date)
  FROM profiles p
  WHERE p.id != master_id  -- master는 memberships에 추가하지 않거나 추가 (선택)
  ON CONFLICT (organization_id, profile_id) DO NOTHING;

  -- master도 멤버십 추가 (조직에서 직접 활동하므로)
  INSERT INTO organization_memberships (organization_id, profile_id, status, join_date)
  VALUES (ygd_org_id, master_id, 'active', CURRENT_DATE)
  ON CONFLICT (organization_id, profile_id) DO NOTHING;

  -- ─────────────────────────────────────────
  -- STEP 4: owner/admin → organization_admins
  -- ─────────────────────────────────────────
  -- 기존 'owner' (이전 'admin')들을 조직 admin으로 등록
  INSERT INTO organization_admins (organization_id, profile_id, role)
  SELECT ygd_org_id, p.id, 'owner'
  FROM profiles p
  WHERE p.role = 'owner'
  ON CONFLICT (organization_id, profile_id) DO NOTHING;

  -- master도 조직 admin으로 등록
  INSERT INTO organization_admins (organization_id, profile_id, role)
  VALUES (ygd_org_id, master_id, 'owner')
  ON CONFLICT (organization_id, profile_id) DO NOTHING;

  -- ─────────────────────────────────────────
  -- STEP 5: profiles.primary_organization_id 설정
  -- ─────────────────────────────────────────
  UPDATE profiles
  SET primary_organization_id = ygd_org_id
  WHERE id IN (SELECT profile_id FROM organization_memberships WHERE organization_id = ygd_org_id);

  -- ─────────────────────────────────────────
  -- STEP 6: 기존 테이블 organization_id 채우기
  -- ─────────────────────────────────────────

  -- stores
  UPDATE stores SET organization_id = ygd_org_id WHERE organization_id IS NULL;

  -- attendance_logs
  UPDATE attendance_logs SET organization_id = ygd_org_id WHERE organization_id IS NULL;

  -- attendance_credits
  UPDATE attendance_credits SET organization_id = ygd_org_id WHERE organization_id IS NULL;

  -- notifications
  UPDATE notifications SET organization_id = ygd_org_id WHERE organization_id IS NULL;

  -- work_defaults
  UPDATE work_defaults SET organization_id = ygd_org_id WHERE organization_id IS NULL;

  -- weekly_schedules
  UPDATE weekly_schedules SET organization_id = ygd_org_id WHERE organization_id IS NULL;

  -- schedule_slots
  UPDATE schedule_slots SET organization_id = ygd_org_id WHERE organization_id IS NULL;

  -- substitute_requests
  UPDATE substitute_requests SET organization_id = ygd_org_id WHERE organization_id IS NULL;

  -- substitute_responses
  UPDATE substitute_responses SET organization_id = ygd_org_id WHERE organization_id IS NULL;

  -- recipe_categories
  UPDATE recipe_categories SET organization_id = ygd_org_id WHERE organization_id IS NULL;

  -- recipe_items
  UPDATE recipe_items SET organization_id = ygd_org_id WHERE organization_id IS NULL;

  -- recipe_ingredients
  UPDATE recipe_ingredients SET organization_id = ygd_org_id WHERE organization_id IS NULL;

  -- recipe_comments
  UPDATE recipe_comments SET organization_id = ygd_org_id WHERE organization_id IS NULL;

  -- recipe_steps
  UPDATE recipe_steps SET organization_id = ygd_org_id WHERE organization_id IS NULL;

  -- store_positions
  UPDATE store_positions SET organization_id = ygd_org_id WHERE organization_id IS NULL;

  -- employee_store_assignments
  UPDATE employee_store_assignments SET organization_id = ygd_org_id WHERE organization_id IS NULL;

  -- overtime_requests
  UPDATE overtime_requests SET organization_id = ygd_org_id WHERE organization_id IS NULL;

  -- company_events
  UPDATE company_events SET organization_id = ygd_org_id WHERE organization_id IS NULL;

  -- announcements
  UPDATE announcements SET organization_id = ygd_org_id WHERE organization_id IS NULL;

  -- announcement_reads
  UPDATE announcement_reads SET organization_id = ygd_org_id WHERE organization_id IS NULL;

  -- checklist_templates
  UPDATE checklist_templates SET organization_id = ygd_org_id WHERE organization_id IS NULL;

  -- checklist_submissions
  UPDATE checklist_submissions SET organization_id = ygd_org_id WHERE organization_id IS NULL;

  RAISE NOTICE 'Data migration completed for organization: %', ygd_org_id;
END;
$$;
```

### 050_add_not_null_constraints.sql

> 데이터 마이그레이션 후, organization_id에 NOT NULL 제약 추가 (attendance_credits 제외).

```sql
-- ============================================================
-- 050: organization_id NOT NULL 제약 추가
-- 049 데이터 마이그레이션 완료 후 실행
-- ============================================================

-- 조직 종속 테이블: NOT NULL 강제
ALTER TABLE stores ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE attendance_logs ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE notifications ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE work_defaults ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE weekly_schedules ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE schedule_slots ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE substitute_requests ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE substitute_responses ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE recipe_categories ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE recipe_items ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE recipe_ingredients ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE recipe_comments ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE recipe_steps ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE store_positions ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE employee_store_assignments ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE overtime_requests ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE company_events ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE announcements ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE announcement_reads ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE checklist_templates ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE checklist_submissions ALTER COLUMN organization_id SET NOT NULL;

-- attendance_credits: NULL 허용 유지 (전역 점수, organization_id는 출처 추적용)
-- ALTER TABLE attendance_credits ALTER COLUMN organization_id SET NOT NULL; -- 의도적 제외

-- 검증: NULL 남아있는지 확인
-- SELECT 'stores' AS tbl, COUNT(*) FROM stores WHERE organization_id IS NULL
-- UNION ALL
-- SELECT 'attendance_logs', COUNT(*) FROM attendance_logs WHERE organization_id IS NULL
-- UNION ALL
-- SELECT 'notifications', COUNT(*) FROM notifications WHERE organization_id IS NULL
-- ... (모든 테이블 반복)
```

---

## 7. 검증 SQL

각 마이그레이션 단계별 검증 쿼리.

### 7-1. 042 검증: 신규 핵심 테이블 존재

```sql
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('organizations', 'organization_memberships', 'organization_admins')
ORDER BY tablename;
-- 기대: 3행

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'organizations'
ORDER BY ordinal_position;
```

### 7-2. 043~045 검증: 초대/급여/감사 테이블 존재

```sql
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('tenant_invites', 'payroll_periods', 'payroll_entries', 'audit_logs')
ORDER BY tablename;
-- 기대: 4행
```

### 7-3. 046 검증: organization_id 컬럼 존재 확인

```sql
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE column_name = 'organization_id'
  AND table_schema = 'public'
ORDER BY table_name;
-- 기대: organizations 자체 + 모든 대상 테이블에 존재
```

### 7-4. 047 검증: 함수 존재 확인

```sql
SELECT routine_name, routine_type, data_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'is_master', 'is_org_admin', 'is_org_member', 'is_admin',
    'handle_new_user', 'terminate_membership', 'delete_user_admin'
  )
ORDER BY routine_name;
-- 기대: 7행
```

### 7-5. 048 검증: RLS 정책 목록

```sql
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
-- 모든 테이블에 master_* 정책이 존재해야 함 (조직 테이블의 경우)
```

### 7-6. 049 데이터 마이그레이션 검증

```sql
-- 1) 연경당 조직 존재
SELECT id, name, slug, owner_id, subscription_tier FROM organizations WHERE slug = 'yeonggyeongdang';

-- 2) 멤버십 수 = 기존 profiles 수
SELECT
  (SELECT COUNT(*) FROM profiles) AS total_profiles,
  (SELECT COUNT(*) FROM organization_memberships WHERE organization_id = (
    SELECT id FROM organizations WHERE slug = 'yeonggyeongdang'
  )) AS total_memberships;

-- 3) admin 수
SELECT COUNT(*) FROM organization_admins WHERE organization_id = (
  SELECT id FROM organizations WHERE slug = 'yeonggyeongdang'
);

-- 4) master 존재
SELECT id, email, role FROM profiles WHERE role = 'master';

-- 5) organization_id NULL 없는지 확인 (attendance_credits 제외)
SELECT 'stores' AS tbl, COUNT(*) AS null_count FROM stores WHERE organization_id IS NULL
UNION ALL SELECT 'attendance_logs', COUNT(*) FROM attendance_logs WHERE organization_id IS NULL
UNION ALL SELECT 'notifications', COUNT(*) FROM notifications WHERE organization_id IS NULL
UNION ALL SELECT 'weekly_schedules', COUNT(*) FROM weekly_schedules WHERE organization_id IS NULL
UNION ALL SELECT 'schedule_slots', COUNT(*) FROM schedule_slots WHERE organization_id IS NULL
UNION ALL SELECT 'recipe_categories', COUNT(*) FROM recipe_categories WHERE organization_id IS NULL
UNION ALL SELECT 'recipe_items', COUNT(*) FROM recipe_items WHERE organization_id IS NULL
UNION ALL SELECT 'work_defaults', COUNT(*) FROM work_defaults WHERE organization_id IS NULL
UNION ALL SELECT 'overtime_requests', COUNT(*) FROM overtime_requests WHERE organization_id IS NULL
UNION ALL SELECT 'company_events', COUNT(*) FROM company_events WHERE organization_id IS NULL
UNION ALL SELECT 'announcements', COUNT(*) FROM announcements WHERE organization_id IS NULL
UNION ALL SELECT 'checklist_templates', COUNT(*) FROM checklist_templates WHERE organization_id IS NULL
UNION ALL SELECT 'checklist_submissions', COUNT(*) FROM checklist_submissions WHERE organization_id IS NULL;
-- 기대: 모든 행의 null_count = 0

-- 6) role 값 정합성
SELECT role, COUNT(*) FROM profiles GROUP BY role;
-- 기대: 'master': 1, 'owner': N, 'employee': M (admin 없어야 함)
```

### 7-7. 050 검증: NOT NULL 제약 확인

```sql
SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE column_name = 'organization_id'
  AND table_schema = 'public'
  AND table_name NOT IN ('organizations', 'audit_logs', 'attendance_credits')
ORDER BY table_name;
-- 기대: 모든 행의 is_nullable = 'NO'
```

### 7-8. RLS 보안 테스트 (수동)

```sql
-- 직원 A가 다른 조직 B의 데이터를 볼 수 없는지 확인
-- (코드 레벨에서 테스트 필요 — Supabase client로 특정 유저 세션에서 쿼리)

-- 아래는 서비스 롤로 RLS 우회 확인:
-- SET LOCAL role = 'authenticated';
-- SET LOCAL request.jwt.claim.sub = '직원A_UUID';
-- SELECT * FROM attendance_logs WHERE organization_id = '조직B_UUID';
-- 기대: 0행
```

---

## 8. 롤백 계획

### 원칙

- 각 마이그레이션 파일에 대한 역순 롤백 SQL 준비
- 롤백 시 데이터 손실 최소화
- 신규 테이블은 DROP, ALTER는 역 ALTER

### 롤백 SQL

#### 050 롤백 (NOT NULL 제거)

```sql
ALTER TABLE stores ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE attendance_logs ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE notifications ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE work_defaults ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE weekly_schedules ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE schedule_slots ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE substitute_requests ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE substitute_responses ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE recipe_categories ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE recipe_items ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE recipe_ingredients ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE recipe_comments ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE recipe_steps ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE store_positions ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE employee_store_assignments ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE overtime_requests ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE company_events ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE announcements ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE announcement_reads ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE checklist_templates ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE checklist_submissions ALTER COLUMN organization_id DROP NOT NULL;
```

#### 049 롤백 (데이터 마이그레이션 되돌리기)

```sql
-- organization_id 값 NULL로 되돌리기
UPDATE stores SET organization_id = NULL;
UPDATE attendance_logs SET organization_id = NULL;
UPDATE attendance_credits SET organization_id = NULL;
-- ... (모든 테이블 반복)

-- profiles.role 원복
UPDATE profiles SET role = 'admin' WHERE role IN ('owner', 'master');

-- profiles.primary_organization_id NULL
UPDATE profiles SET primary_organization_id = NULL;

-- 조직 데이터 삭제 (CASCADE로 memberships, admins도 제거)
DELETE FROM organizations WHERE slug = 'yeonggyeongdang';
```

#### 048 롤백 (RLS 정책 원복)

```sql
-- 신규 정책 전부 DROP 후 기존 정책 복원
-- 분량이 매우 크므로 기존 마이그레이션(005, 007, 012, 016, 029, 032, 034, 035, 036, 041)의
-- RLS CREATE POLICY 문을 그대로 재실행하는 스크립트로 준비

-- 핵심: 048에서 DROP한 정책 이름 목록을 보관하고, 기존 마이그레이션 SQL에서 복원
```

#### 047 롤백 (함수 원복)

```sql
-- is_admin() 원복
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- handle_new_user() 원복
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 신규 함수 삭제
DROP FUNCTION IF EXISTS is_master();
DROP FUNCTION IF EXISTS is_org_admin(uuid);
DROP FUNCTION IF EXISTS is_org_member(uuid);
DROP FUNCTION IF EXISTS terminate_membership(uuid, uuid, text);

-- delete_user_admin 원복 (원본 코드)
CREATE OR REPLACE FUNCTION delete_user_admin(target_user_id uuid)
RETURNS void AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### 046 롤백 (ALTER 되돌리기)

```sql
-- organization_id 컬럼 제거 (모든 대상 테이블)
ALTER TABLE stores DROP COLUMN IF EXISTS organization_id;
ALTER TABLE attendance_logs DROP COLUMN IF EXISTS organization_id;
ALTER TABLE attendance_credits DROP COLUMN IF EXISTS organization_id;
ALTER TABLE notifications DROP COLUMN IF EXISTS organization_id;
ALTER TABLE work_defaults DROP COLUMN IF EXISTS organization_id;
ALTER TABLE weekly_schedules DROP COLUMN IF EXISTS organization_id;
ALTER TABLE schedule_slots DROP COLUMN IF EXISTS organization_id;
ALTER TABLE substitute_requests DROP COLUMN IF EXISTS organization_id;
ALTER TABLE substitute_responses DROP COLUMN IF EXISTS organization_id;
ALTER TABLE recipe_categories DROP COLUMN IF EXISTS organization_id;
ALTER TABLE recipe_items DROP COLUMN IF EXISTS organization_id;
ALTER TABLE recipe_ingredients DROP COLUMN IF EXISTS organization_id;
ALTER TABLE recipe_comments DROP COLUMN IF EXISTS organization_id;
ALTER TABLE recipe_steps DROP COLUMN IF EXISTS organization_id;
ALTER TABLE store_positions DROP COLUMN IF EXISTS organization_id;
ALTER TABLE employee_store_assignments DROP COLUMN IF EXISTS organization_id;
ALTER TABLE overtime_requests DROP COLUMN IF EXISTS organization_id;
ALTER TABLE company_events DROP COLUMN IF EXISTS organization_id;
ALTER TABLE announcements DROP COLUMN IF EXISTS organization_id;
ALTER TABLE announcement_reads DROP COLUMN IF EXISTS organization_id;
ALTER TABLE checklist_templates DROP COLUMN IF EXISTS organization_id;
ALTER TABLE checklist_submissions DROP COLUMN IF EXISTS organization_id;

-- profiles 수정 되돌리기
ALTER TABLE profiles DROP COLUMN IF EXISTS primary_organization_id;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- weekly_schedules UNIQUE 제약 원복
ALTER TABLE weekly_schedules DROP CONSTRAINT IF EXISTS weekly_schedules_org_week_unique;
ALTER TABLE weekly_schedules ADD CONSTRAINT weekly_schedules_week_start_key UNIQUE (week_start);
```

#### 045~042 롤백 (신규 테이블 DROP)

```sql
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS payroll_entries;
DROP TABLE IF EXISTS payroll_periods;
DROP TABLE IF EXISTS tenant_invites;
DROP TABLE IF EXISTS organization_admins;
DROP TABLE IF EXISTS organization_memberships;
DROP TABLE IF EXISTS organizations;
```

---

## 9. Prod 배포 시 실행 순서

> CLAUDE.md 섹션 3-1 절차에 따라, Claude Code가 Management API로 직접 실행.

```
[PRE] Dev에서 전체 마이그레이션 완료 + 검증 통과 확인
[PRE] npm run build 통과 확인
[PRE] Dev DB에서 모든 검증 SQL 통과 확인

[STEP 1] Prod DB 현재 상태 백업 확인
  source .env.local
  curl -s -X POST "https://api.supabase.com/v1/projects/ymvdjxzkjodasctktunh/database/query" \
    -H "Authorization: Bearer $SUPABASE_PROD_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"query": "SELECT tablename FROM pg_tables WHERE schemaname = '\''public'\'' ORDER BY tablename;"}'

[STEP 2] 순서대로 실행 (각 실행 후 검증)
  1. 042_create_organizations.sql     → 검증 7-1
  2. 043_create_tenant_invites.sql    → 검증 7-2
  3. 044_create_payroll_tables.sql    → 검증 7-2
  4. 045_create_audit_logs.sql        → 검증 7-2
  5. 046_alter_existing_tables.sql    → 검증 7-3
  6. 047_functions_and_triggers.sql   → 검증 7-4
  7. 048_rls_rewrite.sql              → 검증 7-5
  8. 049_data_migration_ygd.sql       → 검증 7-6
  9. 050_add_not_null_constraints.sql → 검증 7-7

[STEP 3] 최종 통합 검증
  - 테이블 목록 일치 (Dev = Prod)
  - 핵심 테이블 컬럼 일치
  - RLS 정책 전체 목록 일치
  - Realtime publication 테이블 확인
  - 트리거 목록 일치

[STEP 4] dev → main 머지 & push
  git checkout main && git pull origin main
  git merge dev --no-edit
  git push origin main

[STEP 5] Vercel 배포 확인 + 회귀 테스트
```

### 실행 시 주의사항

1. **Management API 문자열 이스케이프**: SQL 내 작은따옴표는 `'\''` 로 이스케이프
2. **DO 블록**: Management API에서 PL/pgSQL DO 블록 실행 가능 (검증 완료)
3. **실행 순서 엄수**: FK 의존성 때문에 반드시 번호 순서 준수
4. **각 단계 사이 검증**: 한 단계 실패 시 즉시 중단, 롤백 판단
5. **RLS DROP 시 일시적 보안 공백**: 048에서 DROP과 CREATE를 하나의 쿼리로 실행하여 공백 최소화

---

## 10. 체크리스트

### Phase 1: Dev DB 스키마 마이그레이션

- [ ] `042_create_organizations.sql` 실행
- [ ] 검증 7-1 통과
- [ ] `043_create_tenant_invites.sql` 실행
- [ ] `044_create_payroll_tables.sql` 실행
- [ ] `045_create_audit_logs.sql` 실행
- [ ] 검증 7-2 통과
- [ ] `046_alter_existing_tables.sql` 실행
- [ ] 검증 7-3 통과 (모든 테이블에 organization_id 존재)
- [ ] `047_functions_and_triggers.sql` 실행
- [ ] 검증 7-4 통과 (7개 함수 존재)
- [ ] `048_rls_rewrite.sql` 실행
- [ ] 검증 7-5 통과 (모든 테이블에 새 RLS 정책 존재)

### Phase 2: Dev DB 데이터 마이그레이션

- [ ] `049_data_migration_ygd.sql` 실행
- [ ] 검증 7-6 통과 (연경당 조직 존재, 멤버십 정합, NULL 없음)
- [ ] `050_add_not_null_constraints.sql` 실행
- [ ] 검증 7-7 통과 (NOT NULL 확인)

### Phase 3: Dev 기능 검증

- [ ] 기존 연경당 기능 정상 동작 (출퇴근, 스케줄, 레시피, 알림)
- [ ] RLS 격리 테스트 (조직 간 데이터 분리)
- [ ] is_master() / is_org_admin() / is_org_member() 함수 동작 확인
- [ ] terminate_membership() 함수 동작 확인
- [ ] 크레딧 전역 합산 정상 동작 확인
- [ ] `npm run build` 통과

### Phase 4: Prod 배포

- [ ] `source .env.local` 로 토큰 로드
- [ ] Prod 현재 테이블 목록 백업
- [ ] 042~050 순서대로 Prod 실행 (각 단계별 검증)
- [ ] Prod 최종 통합 검증
- [ ] `git checkout main && git merge dev && git push origin main`
- [ ] Vercel 배포 확인
- [ ] 연경당 직원 기능 회귀 테스트

### 전체 테이블 대장

> 마이그레이션 완료 후 public 스키마에 존재해야 하는 모든 테이블.

| # | 테이블 | organization_id | 비고 |
|---|--------|:-:|------|
| 1 | `profiles` | `primary_organization_id` | role 변경 |
| 2 | `organizations` | (자기 자신) | **신규** |
| 3 | `organization_memberships` | O | **신규** |
| 4 | `organization_admins` | O | **신규** |
| 5 | `tenant_invites` | O | **신규** |
| 6 | `payroll_periods` | O | **신규** |
| 7 | `payroll_entries` | O | **신규** |
| 8 | `audit_logs` | O (nullable) | **신규** |
| 9 | `attendance_logs` | O | FK 추가 |
| 10 | `attendance_credits` | O (nullable) | FK 추가 (출처 추적) |
| 11 | `stores` | O | FK 추가 |
| 12 | `store_positions` | O | FK 추가 |
| 13 | `employee_store_assignments` | O | FK 추가 |
| 14 | `notifications` | O | FK 추가 |
| 15 | `work_defaults` | O | FK 추가 |
| 16 | `weekly_schedules` | O | FK 추가, UNIQUE 변경 |
| 17 | `schedule_slots` | O | FK 추가 |
| 18 | `substitute_requests` | O | FK 추가 |
| 19 | `substitute_responses` | O | FK 추가 |
| 20 | `recipe_categories` | O | FK 추가 |
| 21 | `recipe_items` | O | FK 추가 |
| 22 | `recipe_ingredients` | O | FK 추가 |
| 23 | `recipe_comments` | O | FK 추가 |
| 24 | `recipe_steps` | O | FK 추가 |
| 25 | `overtime_requests` | O | FK 추가 |
| 26 | `company_events` | O | FK 추가 |
| 27 | `announcements` | O | FK 추가 |
| 28 | `announcement_reads` | O | FK 추가 |
| 29 | `checklist_templates` | O | FK 추가 |
| 30 | `checklist_submissions` | O | FK 추가 |
| 31 | `error_logs` | - | 시스템 전역 |
| 32 | `push_subscriptions` | - | 디바이스 단위 |
| 33 | `push_preferences` | - | 사용자 단위 |
| 34 | `cat_dodge_scores` | - | 게임 |
| 35 | `game_profiles` | - | 게임 |
| 36 | `game_runs` | - | 게임 |
| 37 | `game_seasons` | - | 게임 |
| 38 | `game_season_scores` | - | 게임 |
| 39 | `game_hr_rewards` | - | 게임 |
