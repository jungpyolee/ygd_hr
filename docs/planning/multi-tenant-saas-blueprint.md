# 출첵 — 멀티테넌트 SaaS 전환 블루프린트 v3

> **작성일**: 2026-03-25
> **버전**: v3.0 (의사결정 확정)
> **앱 이름**: 출첵 (가칭)
> **현재 브랜치**: dev
> **목적**: 연경당 전용 HR 앱 → 다중 사업주 SaaS "출첵" 플랫폼 전환

---

## 의사결정 확정 내역

| # | 영역 | 결정 |
|---|------|------|
| **D-01** | 인증 | 이메일 로그인 + SNS (카카오, Apple) 로그인으로 전환. `@ygd.com` 패턴 폐기 |
| **D-02** | 마이그레이션 | SNS 로그인 안정화 이후 기존 연경당 직원에게 실제 이메일/SNS 전환 유도 |
| **D-03** | URL | slug 방식 (`/yeonggyeongdang/admin`) |
| **D-04** | 다중 소속 | 가능 (1계정 N조직) |
| **D-05** | 크레딧 | **전역 통합** — 조직 무관하게 한 사람 하나의 점수. 스펙처럼 공유/export 가능 |
| **D-06** | 크레딧 규칙 | **전역 동일 규칙** — 공정성 확보를 위해 모든 조직에서 동일한 점수 체계 |
| **D-07** | 직원 삭제 | auth.users 유지 (소프트 삭제) |
| **D-08** | 급여 | 스케줄 기반 자동 계산 + 관리자 확인 (출시 전 MVP에 포함) |
| **D-09** | 요금제 | 베타 무료 → 정식 출시 시 유료 |
| **D-10** | 과금 | 고정 플랜 (Free/Starter/Pro) |
| **D-11** | 사업자번호 | 선택, 나중에 입력 |
| **D-12** | 직원 초대 | 카카오 딥링크 + 초대코드 (param 또는 직접 입력) |
| **D-13** | URL 호환 | `/` → `/yeonggyeongdang/` 리다이렉트 |
| **D-14** | Storage | 기존 구조 유지 (파일 소수) |
| **D-15** | 앱 이름 | **출첵** (가칭) |
| **D-16** | 역할 | **master / owner / employee** 3단계. master=정표(시스템 총관리) |
| **D-17** | 레시피 | 전 플랜 무료 |

---

## 1. 역할 체계

### 1-1. 3단계 역할 구조

```
master (시스템 관리자 — 정표)
  │  모든 조직의 데이터 조회/관리
  │  조직 생성/삭제/정지
  │  전체 사용자 관리
  │  시스템 설정, 크레딧 규칙 관리
  │  전체 통계/모니터링 대시보드
  │
  ├── owner (사장님 — 조직별)
  │     조직 내 전체 권한
  │     직원 초대/제거
  │     매장 관리
  │     스케줄/근태/급여 관리
  │     레시피/공지 관리
  │
  └── employee (직원)
        본인 출퇴근/스케줄 조회
        대타 요청
        크레딧/급여 확인
        레시피/공지 열람
```

### 1-2. master 대시보드 (신규)

```
/master/                          (전체 현황 대시보드)
/master/organizations             (전체 조직 목록/관리)
/master/organizations/[id]        (조직 상세 — owner처럼 조회 가능)
/master/users                     (전체 사용자 목록)
/master/credits                   (크레딧 규칙/통계)
/master/system                    (시스템 설정)
```

**master 전용 기능:**
- 전체 조직 수, 활성 사용자 수, 일일 출퇴근 수 등 KPI
- 조직별 건강 상태 (활동량, 직원 수, 마지막 활동일)
- 특정 조직에 "들어가기" → owner 뷰로 전환 (impersonation)
- 전체 크레딧 분포, 티어별 인원 통계
- 시스템 에러 로그, 정산 실패 모니터링

### 1-3. DB 역할 모델

```sql
-- profiles.role 확장
-- 현재: 'admin' | 'employee'
-- 변경: 'master' | 'owner' | 'employee'
-- master는 시스템 전체, owner/employee는 organization_admins/memberships로 확인

-- master 판별 함수
CREATE OR REPLACE FUNCTION is_master()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'master'
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- RLS 패턴: master는 모든 데이터 접근
CREATE POLICY "master_bypass" ON {table}
  FOR ALL USING (is_master());
```

---

## 2. 인증 시스템 전면 전환

### 2-1. 신규 로그인 구조

```
┌─────────────────────────────────────┐
│          출첵 로그인                │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  📧 이메일로 시작하기       │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  💬 카카오로 시작하기       │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  🍎 Apple로 시작하기        │   │
│  └─────────────────────────────┘   │
│                                     │
│  이미 계정이 있어요 → 로그인       │
└─────────────────────────────────────┘
```

### 2-2. Supabase Auth Provider 설정

```typescript
// 이메일 로그인
await supabase.auth.signInWithPassword({ email, password });
await supabase.auth.signUp({ email, password, options: { data: { name } } });

// 카카오 로그인
await supabase.auth.signInWithOAuth({
  provider: 'kakao',
  options: { redirectTo: `${origin}/auth/callback` }
});

// Apple 로그인
await supabase.auth.signInWithOAuth({
  provider: 'apple',
  options: { redirectTo: `${origin}/auth/callback` }
});
```

**Supabase 대시보드 설정 필요:**
- Authentication → Providers → Kakao: Client ID + Secret (카카오 디벨로퍼스에서 발급)
- Authentication → Providers → Apple: Service ID + Secret Key (Apple Developer에서 발급)
- Redirect URL: `https://출첵도메인/auth/callback`

### 2-3. Auth Callback 처리

```
/auth/callback (신규)
  → Supabase가 code exchange 처리
  → 신규 사용자면 handle_new_user() 트리거 → profiles 자동 생성
  → 조직 소속 확인
    → 소속 없음 → /create-organization (사장님) 또는 /join (초대받은 직원)
    → 소속 1개 → /[slug]/ 자동 이동
    → 소속 N개 → /select-organization
```

### 2-4. 기존 연경당 직원 마이그레이션

```
Phase 1: 전환 완료 후 앱 내 배너 표시
  "계정을 업그레이드해주세요 — 이메일 또는 카카오/Apple 연동"

Phase 2: 마이페이지에서 "계정 연동" 기능
  → 카카오/Apple 연동 시 auth.users.identities에 추가
  → 또는 이메일 변경 (fake@ygd.com → 실제 이메일)
  → Supabase: auth.updateUser({ email: '실제이메일' })

Phase 3: 유예 기간 후 @ygd.com 로그인 차단
```

---

## 3. 직원 초대 시스템

### 3-1. 초대 플로우

```
[사장님] admin/team → "직원 초대하기"
  │
  ├── 방법 1: 카카오 딥링크 공유
  │    → 카카오톡 공유 API 호출
  │    → 메시지: "출첵에서 [연경당 카페]에 초대했어요"
  │    → 링크: https://출첵.app/join?code=ABC123&org=yeonggyeongdang
  │
  ├── 방법 2: 초대 링크 복사
  │    → URL 복사 → 카톡/문자/어디든 붙여넣기
  │    → 같은 URL: /join?code=ABC123&org=yeonggyeongdang
  │
  └── 방법 3: 초대 코드 구두 전달
       → "코드: ABC123 입력해주세요"
       → 직원이 /join → 코드 직접 입력

[직원] /join?code=ABC123
  │
  ├── 미로그인 → 회원가입/로그인 화면 → 가입 후 자동 조직 가입
  └── 로그인됨 → 즉시 조직 가입 → /[slug]/ 이동
```

### 3-2. 카카오 공유 API

```typescript
// 카카오 SDK 사용
Kakao.Share.sendDefault({
  objectType: 'feed',
  content: {
    title: '출첵 - 직원 초대',
    description: `${orgName}에서 함께 일해요!`,
    imageUrl: 'https://출첵.app/og-invite.png',
    link: {
      mobileWebUrl: `https://출첵.app/join?code=${inviteCode}&org=${slug}`,
      webUrl: `https://출첵.app/join?code=${inviteCode}&org=${slug}`,
    },
  },
  buttons: [{
    title: '초대 수락하기',
    link: {
      mobileWebUrl: `https://출첵.app/join?code=${inviteCode}&org=${slug}`,
      webUrl: `https://출첵.app/join?code=${inviteCode}&org=${slug}`,
    },
  }],
});
```

### 3-3. 초대 코드 DB

```sql
CREATE TABLE tenant_invites (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invited_by          uuid NOT NULL REFERENCES profiles(id),
  invite_code         text NOT NULL,                          -- 6자리 영숫자 (예: ABC123)
  role                text NOT NULL DEFAULT 'employee',
  status              text NOT NULL DEFAULT 'active',         -- 'active'|'used'|'expired'
  max_uses            integer DEFAULT NULL,                   -- NULL=무제한, 1=1회용
  use_count           integer NOT NULL DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  expires_at          timestamptz DEFAULT (now() + interval '7 days'),

  UNIQUE(invite_code)
);

CREATE INDEX idx_invite_code ON tenant_invites(invite_code);
CREATE INDEX idx_invite_org ON tenant_invites(organization_id);
```

**코드 생성 규칙:**
- 6자리 영대문자+숫자 (혼동 문자 제외: 0/O, 1/I/L)
- 예: `A3K7N2`, `T9B4MX`
- 기본 7일 만료, 사장님이 만료일/횟수 설정 가능

---

## 4. 크레딧 시스템 — 전역 포터블 설계

### 4-1. 핵심 원칙

```
크레딧 점수 = 개인의 전역 근태 지표
  → 어떤 조직에서 일하든 같은 점수에 반영
  → 이직 시에도 점수 유지
  → "근태 이력서"로 활용 가능
  → 규칙은 전 플랫폼 동일 (공정성)
```

### 4-2. 크레딧 카드 (공유/export)

```
┌──────────────────────────────────────┐
│  출첵 근태 프로필                    │
│                                      │
│  김민수                              │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                      │
│  💎 다이아몬드 티어                  │
│  크레딧 점수: 920                    │
│                                      │
│  📊 근태 요약                       │
│  ├─ 총 근무일수: 342일              │
│  ├─ 정시 출근율: 96.8%              │
│  ├─ 최장 연속 출근: 87일            │
│  ├─ 결근: 2회                       │
│  └─ 활동 기간: 2024.03 ~ 현재      │
│                                      │
│  🏢 근무 이력                       │
│  ├─ 연경당 카페 (2024.03~현재)      │
│  └─ 홍길동 우육면 (2025.01~2025.08) │
│                                      │
│  ─────────────────────────────────── │
│  출첵 | chulchek.app                 │
│  2026.03.25 기준                     │
└──────────────────────────────────────┘
```

### 4-3. 공유 기능 — 모달 + 프린트/공유

```
마이페이지 또는 크레딧 이력 → [내 근태 카드 보기] 버튼
  → CreditCardModal 바텀시트/모달 열림
  → 카드 UI 렌더링 (위 디자인)

모달 하단 액션:
  [이미지로 저장]  → html2canvas → PNG 다운로드 (갤러리 저장)
  [카카오톡 공유]  → 카카오 공유 API (카드 이미지 + "출첵에서 확인하세요" 메시지)
  [프린트]         → window.print() (인쇄용 CSS 적용)
```

**별도 공개 URL 페이지 없음** — 모달에서 직접 캡처/공유하는 형태.
카카오 공유 시 이미지가 전달되므로 링크 없이도 카드 내용 확인 가능.

### 4-4. DB 변경 — 크레딧은 전역

```sql
-- attendance_credits: organization_id 추가하되, 점수 합산은 전역
-- organization_id는 "어디서 발생했는지" 기록용 (출처 추적)
ALTER TABLE attendance_credits
  ADD COLUMN organization_id uuid REFERENCES organizations(id);

-- profiles.credit_score: 전역 합산 유지 (변경 없음)
-- sync_credit_score() 트리거: 전체 SUM 유지 (변경 없음)

-- 크레딧 카드는 모달 UI로 처리 (이미지 캡처/카카오 공유)
-- 별도 공개 URL 없으므로 credit_card_public 컬럼 불필요
```

### 4-5. 크레딧 규칙 — 전역 고정

기존 `tier-utils.ts` 규칙 그대로 전 플랫폼 적용:

| 이벤트 | 점수 | 비고 |
|--------|------|------|
| 정상 출근 | +3 | 5분 grace |
| 경미 지각 (5~10분) | -3 | |
| 중대 지각 (10분+) | -10 | |
| 결근 | -50 | |
| 미퇴근 기록 | -5 | |
| 대타 수락 보너스 | +10 | 월 2회까지 |
| 스트릭 10일 | +15 | |
| 스트릭 30일 | +50 | |
| 스트릭 60일 | +80 | |
| 스트릭 100일 | +150 | |

규칙 변경은 master만 가능 (전 플랫폼 일괄 적용).

---

## 5. DB 스키마 변경 계획

### 5-1. 관계도

```
profiles (기존 수정)
  ├── role: 'master' | 'owner' | 'employee'
  ├── primary_organization_id (FK)
  ├── (credit_card_public 불필요 — 모달 캡처 방식)
  └── N:M ── organizations (via organization_memberships)

organizations (신규)
  ├── 1:N ── organization_memberships ── N:1 ── profiles
  ├── 1:N ── organization_admins ── N:1 ── profiles
  ├── 1:N ── stores → store_positions, employee_store_assignments
  ├── 1:N ── weekly_schedules → schedule_slots
  ├── 1:N ── attendance_logs
  ├── 1:N ── notifications
  ├── 1:N ── substitute_requests → substitute_responses
  ├── 1:N ── overtime_requests
  ├── 1:N ── company_events
  ├── 1:N ── work_defaults
  ├── 1:N ── recipe_categories → recipe_items → recipe_steps/ingredients/comments
  ├── 1:N ── tenant_invites (신규)
  ├── 1:N ── payroll_periods → payroll_entries (신규)
  └── 1:N ── audit_logs (신규)

attendance_credits (기존 수정)
  ├── organization_id (출처 추적용, 점수 합산은 전역)
  └── profiles.credit_score = 전역 SUM(points)
```

### 5-2. 신규 테이블

#### organizations

```sql
CREATE TABLE organizations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,                          -- "연경당 카페"
  slug                text NOT NULL UNIQUE,                   -- URL용
  owner_id            uuid NOT NULL REFERENCES profiles(id),
  business_type       text,                                   -- 'cafe'|'restaurant'|'factory'|'catering'|'other'
  business_reg_number text,                                   -- 선택 입력
  logo_url            text,
  subscription_tier   text NOT NULL DEFAULT 'free',
  max_employees       integer NOT NULL DEFAULT 5,
  max_stores          integer NOT NULL DEFAULT 1,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
```

#### organization_memberships

```sql
CREATE TABLE organization_memberships (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'active',         -- 'active'|'terminated'|'suspended'
  join_date           date NOT NULL DEFAULT CURRENT_DATE,
  terminated_at       timestamptz,
  terminated_by       uuid REFERENCES profiles(id),
  termination_reason  text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, profile_id)
);
```

#### organization_admins

```sql
CREATE TABLE organization_admins (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role                text NOT NULL DEFAULT 'owner',          -- 'owner' (향후 'manager' 추가 가능)
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, profile_id)
);
```

#### tenant_invites

```sql
CREATE TABLE tenant_invites (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invited_by          uuid NOT NULL REFERENCES profiles(id),
  invite_code         text NOT NULL UNIQUE,                   -- 6자리 영숫자
  role                text NOT NULL DEFAULT 'employee',
  status              text NOT NULL DEFAULT 'active',
  max_uses            integer DEFAULT NULL,
  use_count           integer NOT NULL DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  expires_at          timestamptz DEFAULT (now() + interval '7 days')
);
```

#### payroll_periods + payroll_entries

```sql
CREATE TABLE payroll_periods (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  year                integer NOT NULL,
  month               integer NOT NULL,
  status              text NOT NULL DEFAULT 'draft',          -- 'draft'|'confirmed'|'paid'
  confirmed_at        timestamptz,
  confirmed_by        uuid REFERENCES profiles(id),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, year, month)
);

CREATE TABLE payroll_entries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_period_id   uuid NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  profile_id          uuid NOT NULL REFERENCES profiles(id),
  organization_id     uuid NOT NULL REFERENCES organizations(id),
  scheduled_minutes   integer NOT NULL DEFAULT 0,
  hourly_wage         integer NOT NULL,
  insurance_type      text NOT NULL,                          -- '2대보험'|'3.3%'
  gross_salary        integer NOT NULL DEFAULT 0,
  deduction_amount    integer NOT NULL DEFAULT 0,
  net_salary          integer NOT NULL DEFAULT 0,
  payment_status      text NOT NULL DEFAULT 'pending',        -- 'pending'|'paid'
  paid_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(payroll_period_id, profile_id)
);
```

#### audit_logs

```sql
CREATE TABLE audit_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid REFERENCES organizations(id),      -- NULL이면 시스템 레벨
  actor_id            uuid REFERENCES profiles(id),
  action              text NOT NULL,
  resource_type       text,
  resource_id         uuid,
  details             jsonb,
  created_at          timestamptz DEFAULT now()
);
```

### 5-3. 기존 테이블 수정

#### profiles

```sql
ALTER TABLE profiles
  ADD COLUMN primary_organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
-- role 컬럼: 'admin' → 'owner' 변환, 'employee' 유지, 정표 계정만 'master'
-- UPDATE profiles SET role = 'owner' WHERE role = 'admin';
-- UPDATE profiles SET role = 'master' WHERE email = '정표이메일';
```

#### 19개 테이블에 organization_id 추가

```sql
-- 모든 테이블에 동일 패턴
ALTER TABLE {table} ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX idx_{table}_org ON {table}(organization_id);
```

대상: `stores`, `attendance_logs`, `attendance_credits`, `notifications`, `work_defaults`, `weekly_schedules`, `schedule_slots`, `substitute_requests`, `substitute_responses`, `recipe_categories`, `recipe_items`, `recipe_ingredients`, `recipe_comments`, `recipe_steps`, `store_positions`, `employee_store_assignments`, `overtime_requests`, `company_events`

### 5-4. RLS 함수

```sql
-- master 판별
CREATE OR REPLACE FUNCTION is_master()
RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'master')
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 조직 admin 판별
CREATE OR REPLACE FUNCTION is_org_admin(p_org_id uuid)
RETURNS boolean AS $$
  SELECT is_master() OR EXISTS (
    SELECT 1 FROM organization_admins
    WHERE organization_id = p_org_id AND profile_id = auth.uid()
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 조직 멤버 판별
CREATE OR REPLACE FUNCTION is_org_member(p_org_id uuid)
RETURNS boolean AS $$
  SELECT is_master() OR EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = p_org_id AND profile_id = auth.uid() AND status = 'active'
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 레거시 호환
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT is_master() OR EXISTS (
    SELECT 1 FROM organization_admins WHERE profile_id = auth.uid()
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### 5-5. RLS 공통 패턴

```sql
-- 모든 조직 테이블에 동일 적용
CREATE POLICY "master_bypass" ON {table} FOR ALL USING (is_master());
CREATE POLICY "org_admin_all" ON {table} FOR ALL USING (is_org_admin(organization_id));
CREATE POLICY "member_select" ON {table} FOR SELECT USING (is_org_member(organization_id));
```

### 5-6. 직원 삭제 → 소프트 삭제

```sql
-- delete_user_admin() 폐기
-- 신규 함수:
CREATE OR REPLACE FUNCTION terminate_membership(
  p_target_user_id uuid,
  p_organization_id uuid,
  p_reason text DEFAULT NULL
) RETURNS void AS $$
BEGIN
  IF NOT is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE organization_memberships
  SET status = 'terminated', terminated_at = now(),
      terminated_by = auth.uid(), termination_reason = p_reason
  WHERE profile_id = p_target_user_id AND organization_id = p_organization_id AND status = 'active';

  DELETE FROM schedule_slots
  WHERE profile_id = p_target_user_id AND slot_date > CURRENT_DATE
    AND organization_id = p_organization_id;

  DELETE FROM organization_admins
  WHERE profile_id = p_target_user_id AND organization_id = p_organization_id;

  INSERT INTO audit_logs (organization_id, actor_id, action, resource_type, resource_id, details)
  VALUES (p_organization_id, auth.uid(), 'employee_terminated', 'profile', p_target_user_id,
    jsonb_build_object('reason', p_reason));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 6. 프론트엔드 라우팅

### 6-1. 전체 라우트 구조

```
/login                                    로그인 (이메일 + 카카오 + Apple)
/auth/callback                            OAuth 콜백 (카카오/Apple)
/signup                                   회원가입 (이메일)
/create-organization                      사장님 조직 생성 온보딩
/join                                     직원 초대 수락 (?code=ABC123)
/select-organization                      다중 소속 시 조직 선택

/[slug]/                                  직원 홈
/[slug]/calendar                          스케줄
/[slug]/store                             공지/레시피
/[slug]/my                                마이페이지 (크레딧 카드 모달 포함)
/[slug]/attendances                       근무 기록
/[slug]/credit-history                    크레딧 이력
/[slug]/guide                             이용가이드

/[slug]/admin/                            관리자 대시보드
/[slug]/admin/employees                   직원 관리
/[slug]/admin/attendance                  근태 관리
/[slug]/admin/calendar                    통합 캘린더
/[slug]/admin/schedules/substitutes       대타 관리
/[slug]/admin/recipes/**                  레시피 관리
/[slug]/admin/announcements/**            공지 관리
/[slug]/admin/checklists                  체크리스트
/[slug]/admin/overtime                    추가근무
/[slug]/admin/stats                       통계
/[slug]/admin/settings                    매장 설정
/[slug]/admin/payroll                     급여 정산
/[slug]/admin/organization                조직 설정
/[slug]/admin/team                        팀/초대 관리

/master/                                  master 대시보드
/master/organizations                     전체 조직 관리
/master/organizations/[id]                조직 상세 (impersonation)
/master/users                             전체 사용자
/master/credits                           크레딧 규칙/통계
/master/system                            시스템 설정

                                          (크레딧 카드는 모달로 처리, 별도 페이지 없음)
```

### 6-2. AuthContext 확장

```typescript
interface AuthContextValue {
  user: User | null;
  isLoading: boolean;

  // 신규
  profile: {
    id: string;
    role: 'master' | 'owner' | 'employee';
    name: string;
    credit_score: number;
  } | null;
  currentOrg: { id: string; slug: string; name: string } | null;
  isOrgAdmin: boolean;
  isMaster: boolean;
  userOrgs: Array<{ id: string; slug: string; name: string }>;
  switchOrg: (slug: string) => void;
}
```

### 6-3. 미들웨어 로직

```
요청 → middleware.ts
  │
  ├── /login, /auth/callback, /signup, /join, /credit/* → 인증 불필요, 통과
  │
  ├── 미인증 → /login 리다이렉트
  │
  ├── /master/** → is_master 확인 → 아니면 /select-organization
  │
  ├── /[slug]/** → slug로 조직 조회 → 멤버십 확인
  │   ├── 멤버 아님 → /select-organization
  │   └── /[slug]/admin/** → organization_admins 확인 → 아니면 /[slug]/
  │
  └── / → primary_organization_id 기준 → /[slug]/ 리다이렉트
```

---

## 7. 급여 정산 (출시 전 MVP)

### 7-1. 계산 로직

```
월별 급여 = SUM(confirmed schedule_slots의 근무시간) × 시급

공제:
  2대보험:
    국민연금: 4.5%
    건강보험: 3.545% (장기요양 포함)
    고용보험: 0.9%
    → 총 ~8.945%

  3.3% 원천징수:
    소득세: 3.0%
    지방소득세: 0.3%
    → 총 3.3%

실수령액 = 세전급여 - 공제액
```

### 7-2. 관리자 UI

```
/[slug]/admin/payroll

[2026년 3월]  ← →

상태: 초안 (확정 전)

┌──────────────────────────────────────────────────────────┐
│ 이름     │ 근무시간 │ 시급    │ 세전     │ 공제    │ 실수령  │
├──────────┼─────────┼────────┼─────────┼────────┼────────┤
│ 김직원   │ 40시간   │ 12,000 │ 480,000 │ 42,936 │ 437,064│
│ 이직원   │ 32시간   │ 11,000 │ 352,000 │ 11,616 │ 340,384│
│ 박직원   │ 24시간   │ 12,000 │ 288,000 │ 9,504  │ 278,496│
├──────────┼─────────┼────────┼─────────┼────────┼────────┤
│ 합계     │ 96시간   │        │1,120,000│ 64,056 │1,055,944│
└──────────────────────────────────────────────────────────┘

[급여 확정하기]  → 직원에게 알림 발송
```

### 7-3. 직원 UI

```
/[slug]/my → 급여 섹션 추가

[3월 급여]
  세전: 480,000원
  공제: -42,936원 (2대보험 8.945%)
  실수령: 437,064원
  상태: 확정됨 ✓
```

---

## 8. 마이그레이션 실행 순서

### Phase 0: 사전 준비

```
□ Supabase에 Kakao/Apple OAuth Provider 설정
□ 카카오 디벨로퍼스 앱 등록 (Client ID/Secret)
□ Apple Developer 서비스 등록 (Service ID/Secret)
□ 카카오 SDK 라이선스 키 발급 (공유 API용)
□ Dev DB 백업
□ 도메인 확보 (출첵.app 또는 chulchek.app)
```

### Phase 1: DB 스키마 (Dev DB)

```
□ organizations 테이블 생성
□ organization_memberships 테이블 생성
□ organization_admins 테이블 생성
□ tenant_invites 테이블 생성
□ payroll_periods + payroll_entries 테이블 생성
□ audit_logs 테이블 생성
□ profiles 수정 (primary_organization_id, role 확장)
□ 19개 테이블에 organization_id 추가
□ is_master(), is_org_admin(), is_org_member() 함수 생성
□ terminate_membership() 함수 생성
□ RLS 정책 전면 재작성
```

### Phase 2: 데이터 마이그레이션

```
□ "연경당" 조직 생성 (slug: 'yeonggyeongdang')
□ 정표 계정 role → 'master'
□ 연경이 계정 → organization_admins (owner)
□ 모든 직원 → organization_memberships (active)
□ 모든 테이블 organization_id 채우기
□ profiles.primary_organization_id 채우기
```

### Phase 3: 인증 시스템 전환

```
□ /login 페이지 전면 재작성 (이메일 + 카카오 + Apple)
□ /auth/callback 페이지 생성
□ /signup 페이지 생성
□ handle_new_user() 트리거 수정 (SNS 가입 대응)
□ middleware.ts 재작성 (slug + 역할 검증)
□ AuthContext 확장 (currentOrg, isMaster, orgRole)
```

### Phase 4: 라우팅 전환

```
□ app/[slug]/ 디렉토리 구조 생성
□ 기존 페이지 → [slug] 하위로 이동
□ BottomNav slug 적용
□ admin/layout.tsx slug + Realtime 필터
□ / → /[slug]/ 리다이렉트 (middleware)
```

### Phase 5: 핵심 기능 마이그레이션

```
□ 모든 Supabase 쿼리에 organization_id 필터
□ admin/employees → terminate_membership + 초대 UI
□ credit-engine.ts → organization_id 출처 기록 (합산은 전역 유지)
□ notifications.ts → organization_id 필터
□ cron/daily-settlement → 조직별 루프
□ Realtime 구독 → organization_id 필터
```

### Phase 6: 신규 기능 구현

```
□ /create-organization (사장님 온보딩)
□ /join (초대 코드 수락)
□ /select-organization (다중 소속 선택)
□ /[slug]/admin/team (팀/초대 관리 + 카카오 공유)
□ /[slug]/admin/payroll (급여 정산)
□ /[slug]/admin/organization (조직 설정)
□ CreditCardModal 컴포넌트 (모달 + html2canvas + 카카오 공유 + 프린트)
□ BusinessSwitcher 컴포넌트
```

### Phase 7: master 대시보드

```
□ /master/ (전체 현황)
□ /master/organizations (조직 목록/관리)
□ /master/users (사용자 관리)
□ /master/credits (크레딧 통계)
□ /master/system (시스템 설정)
```

### Phase 8: 테스트 & 배포

```
□ 카카오/Apple 로그인 테스트
□ 초대 코드 + 딥링크 테스트
□ 데이터 격리 테스트 (조직A ↔ 조직B)
□ RLS 보안 테스트
□ 크레딧 전역 합산 정확성 테스트
□ 급여 계산 정확성 테스트
□ master 대시보드 접근 제어 테스트
□ 기존 연경당 회귀 테스트
□ npm run build 통과
□ 브랜딩 변경 (출첵 로고, manifest, OG 이미지)
□ 배포
```

---

## 9. 추가 의사결정 확정/미정

| # | 질문 | 결정 |
|---|------|------|
| **D-18** | Google 로그인 추가? | **안 함** — 카카오 + Apple만 |
| **D-19** | 크레딧 카드 UI 형태? | **모달로 띄우고 프린트/공유**. 별도 공개 URL 페이지 불필요 |
| **D-20** | master 대시보드 MVP 포함? | **포함** |
| **D-21** | 기존 @ygd.com 계정 유예? | SNS 로그인 안정화 이후 전환 유도 (시점 미정) |
| **D-22** | 도메인? | **미정** |

---

## 10. 리스크 매트릭스

| 리스크 | 확률 | 영향 | 대응 |
|--------|------|------|------|
| 카카오/Apple OAuth 설정 오류 | 중 | 높 | Dev에서 충분히 테스트 후 Prod |
| RLS 누락 → 타 조직 데이터 노출 | 중 | 치명 | 모든 테이블 정책 재검토 + 테스트 |
| 크레딧 전역 합산 오류 (다중 조직) | 낮 | 높 | sync_credit_score 트리거 검증 |
| 기존 @ygd.com 로그인 차단 실수 | 중 | 높 | 유예 기간 + 점진적 전환 |
| 카카오 딥링크 iOS/Android 차이 | 중 | 중 | Universal Link + App Link 설정 |
| 급여 계산 오류 (공제율 등) | 중 | 높 | 관리자 확인 필수 + 노무법인 검토 |
| master 계정 탈취 | 낮 | 치명 | 2FA 적용 권장 |

---

## 부록: 파일 변경 요약

### 신규 생성

```
src/app/auth/callback/route.ts            OAuth 콜백
src/app/signup/page.tsx                    이메일 회원가입
src/app/create-organization/page.tsx       사장님 온보딩
src/app/join/page.tsx                      초대 수락
src/app/select-organization/page.tsx       조직 선택
src/app/[slug]/                            (기존 페이지 이동)
src/components/CreditCardModal.tsx          크레딧 카드 모달 (캡처/공유/프린트)
src/app/[slug]/admin/payroll/page.tsx      급여 정산
src/app/[slug]/admin/organization/page.tsx 조직 설정
src/app/[slug]/admin/team/page.tsx         팀/초대 관리
src/app/master/page.tsx                    master 대시보드
src/app/master/organizations/page.tsx      조직 관리
src/app/master/users/page.tsx              사용자 관리
src/components/BusinessSwitcher.tsx        조직 전환
src/components/CreditCard.tsx              크레딧 카드 렌더
src/components/KakaoShareButton.tsx        카카오 공유
src/types/organization.ts                  타입 정의
```

### 전면 재작성

```
src/app/login/page.tsx                     이메일+카카오+Apple 로그인
src/middleware.ts                          slug/역할/master 검증
src/lib/auth-context.tsx                   currentOrg, isMaster, orgRole
```

### 수정 (org_id 필터 추가)

```
src/components/HomeClient.tsx
src/components/BottomNav.tsx
src/app/admin/layout.tsx
src/app/admin/page.tsx
src/app/admin/employees/page.tsx           (delete→terminate, 초대 UI)
src/app/admin/attendance/page.tsx
src/app/admin/calendar/page.tsx
src/app/admin/schedules/substitutes/page.tsx
src/app/admin/recipes/**
src/app/admin/announcements/**
src/app/admin/overtime/page.tsx
src/app/admin/stats/page.tsx
src/app/admin/settings/page.tsx
src/app/admin/checklists/page.tsx
src/lib/credit-engine.ts
src/lib/notifications.ts
src/lib/push-server.ts
src/app/api/cron/daily-settlement/route.ts
src/lib/hooks/useWorkplaces.ts
```
