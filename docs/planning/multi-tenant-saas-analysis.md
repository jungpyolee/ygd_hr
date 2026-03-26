# YGD HR → 멀티테넌트 SaaS 전환 종합 분석 보고서

> **작성일**: 2026-03-25
> **분석 대상**: YGD HR (연경당 통합 근태 관리 시스템)
> **목적**: 단일 사업주 전용 앱 → 다중 사업주 SaaS 플랫폼 전환을 위한 전 영역 분석

---

## 목차

1. [분석 팀 구성](#1-분석-팀-구성)
2. [현재 시스템 개요](#2-현재-시스템-개요)
3. [DB 스키마 변경 계획](#3-db-스키마-변경-계획)
4. [인증 및 보안 변경 계획](#4-인증-및-보안-변경-계획)
5. [프론트엔드 및 UX 변경 계획](#5-프론트엔드-및-ux-변경-계획)
6. [비즈니스 로직 및 API 변경 계획](#6-비즈니스-로직-및-api-변경-계획)
7. [SaaS 전략 및 프로덕트 로드맵](#7-saas-전략-및-프로덕트-로드맵)
8. [마이그레이션 실행 순서](#8-마이그레이션-실행-순서)
9. [리스크 및 대응 전략](#9-리스크-및-대응-전략)

---

## 1. 분석 팀 구성

| # | 에이전트 | 담당 영역 |
|---|---------|----------|
| 1 | **DB 아키텍트** | 스키마 설계, 마이그레이션, 데이터 격리 전략 |
| 2 | **보안/인증 아키텍트** | RLS 정책, 인증 흐름, JWT, 초대 시스템 |
| 3 | **프론트엔드/UX 아키텍트** | 라우팅, 컴포넌트, 상태관리, 네비게이션 |
| 4 | **비즈니스 로직/API 아키텍트** | Server Actions, API 라우트, 크레딧 엔진 |
| 5 | **SaaS 전략/프로덕트** | 기능 로드맵, 가격 모델, 시장 분석, 법규 |

---

## 2. 현재 시스템 개요

### 2-1. 핵심 구조

- **관리자 모델**: 단일 관리자 (연경이) — `profiles.role = 'admin'`
- **직원 모델**: 모든 직원이 단일 관리자에 종속
- **매장 구조**: 3개 고정 매장 (cafe, factory, catering) — `stores.work_location_key`
- **데이터 격리**: RLS 정책 존재하지만 테넌트 개념 없음

### 2-2. 현재 관계도

```
auth.users (1) ──────── (1) profiles (role='admin'|'employee')
                             │
                    ┌────────┼────────┐
                    │        │        │
              (1:N) │   (1:N)│   (1:N)│
                    │        │        │
            attendance_logs  notifications  schedule_slots
            work_defaults    store_positions  substitute_requests
            overtime_requests employee_store_assignments
            attendance_credits
            recipe_items (created_by)
            recipe_comments (profile_id)

stores (고정 매장) ── 1:N ── store_positions
stores ← FK ── attendance_logs, schedule_slots, work_defaults, employee_store_assignments
```

### 2-3. 현재 기능 인벤토리

#### 직원 기능

| 기능 | 상세 | 성숙도 |
|------|------|--------|
| **GPS 기반 출퇴근** | 위도/경도 100m 반경 내 출퇴근, attendance_type 4종 | 완성 |
| **근무 기록 조회** | 주간/월간 근무시간 조회, WeeklyWorkStats 그래프 | 완성 |
| **내 정보 수정** | 연락처, 은행정보, 보건증, 근로계약서, 급여정보 | 완성 |
| **스케줄 확인** | confirmed 주간 스케줄 캘린더 조회, 대타 요청 | 완성 |
| **근태 크레딧/티어** | 정상출근 +3점, 지각 -3~-10점, 6단계 티어 시스템 | 완성 |
| **레시피 조회** | 음료 레시피 열람 (권한별: 매장/공장/전체) | 완성 |
| **공지사항 확인** | 어드민 공지 및 이벤트 일정 조회 | 완성 |
| **PWA 설치** | 홈화면 설치, iOS/Android 지원 | 완성 |

#### 관리자 기능

| 기능 | 상세 | 성숙도 |
|------|------|--------|
| **대시보드** | 실시간 근무중, 당일 출근현황, 서류 미비, 기록 이상 | 완성 |
| **근태 관리** | 달력 뷰(주간/월간), 근무시간 계산, 거리표시 | 완성 |
| **직원 관리** | 정보수정, 서류 관리, 계정 삭제 | 완성 |
| **스케줄 관리** | 주간 그리드 + 일간 타임라인, 슬롯 CRUD, 이전주 복사 | 완성 |
| **대타 관리** | 대타 요청 수락/거절, 알림 대상 선택 | 완성 |
| **근태 크레딧 관리** | 크레딧 점수 조정(admin_adjustment), 이벤트 로그 | 완성 |
| **레시피 관리** | 카테고리/메뉴/단계 CRUD, 영상(Storage) | 완성 |
| **공지사항 관리** | 텍스트/이미지 공지, 달력 일정 등록 | 완성 |
| **실시간 알림** | 직원 출퇴근, 대타 요청, 온보딩 완료 등 Realtime | 완성 |
| **급여 정산** | 월별 스케줄 기반 급여 계산, 공제 자동 계산 | DB만 완성 |

### 2-4. 현재 문제점

1. **직원 삭제**: `auth.users` 삭제 시 CASCADE로 모든 데이터 삭제 (소프트 삭제 없음)
2. **테넌트 개념 부재**: 여러 사업주 간 데이터 격리 메커니즘 없음
3. **크레딧 시스템**: `profiles.id`와 강하게 결합 — 테넌트 전환 시 복잡
4. **매장 소유권**: 매장이 어떤 테넌트에 속하는지 명시 안 함
5. **이메일 도메인 고정**: `@ygd.com` 하드코딩 — 다중 테넌트 불가
6. **관리자 권한 전역**: 모든 admin이 모든 데이터 접근 가능

---

## 3. DB 스키마 변경 계획

### 3-1. 핵심 아키텍처 결정

| 항목 | 결정 | 근거 |
|------|------|------|
| **테넌트 모델** | 명시적 `organizations` 테이블 | 각 사업주가 독립적인 관리자/직원 구조 |
| **관리자 관계** | `organization_admins` 관계 테이블 | 1개 조직에 여러 관리자 지원 (확장성) |
| **직원 온보딩** | `organization_memberships` 관계 테이블 | 소프트 삭제 가능, 이력 추적 |
| **크레딧 시스템** | 조직별 독립 크레딧 풀 + 사용자별 크레딧 스코어 | 조직 간 크레딧 공유 불가 |
| **매장** | `stores.organization_id` FK 추가 | 각 매장이 명시적으로 조직에 속함 |

### 3-2. 신규 테이블 (4개)

#### organizations

```sql
CREATE TABLE organizations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL UNIQUE,
  owner_email     text NOT NULL,
  subscription_tier text NOT NULL DEFAULT 'free',  -- 'free'/'starter'/'professional'/'enterprise'
  business_type   text,                             -- 'cafe'/'restaurant'/'catering'/'factory'/'other'
  business_registration_number text,                -- 사업자등록번호

  -- 조직 설정
  max_employees   integer NOT NULL DEFAULT 10,
  max_stores      integer NOT NULL DEFAULT 1,
  is_active       boolean NOT NULL DEFAULT true,

  -- 타임스탬프
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_organizations_owner_email ON organizations(owner_email);
CREATE INDEX idx_organizations_is_active ON organizations(is_active);
```

**설계 이유**:
- 각 사업주가 독립적인 조직 생성
- `subscription_tier`로 향후 유료화 지원
- `max_employees`로 플랜별 직원 수 제한

#### organization_admins

```sql
CREATE TABLE organization_admins (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'owner',  -- 'owner'/'manager'/'hr_admin'
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, profile_id)
);

CREATE INDEX idx_org_admins_org_id ON organization_admins(organization_id);
CREATE INDEX idx_org_admins_profile_id ON organization_admins(profile_id);
```

**설계 이유**:
- 1개 조직에 여러 관리자 지원 (부점장, 인사담당 등)
- `role` 필드로 미래 권한 차등 제어
- UNIQUE 제약으로 중복 관리자 방지

#### organization_memberships (핵심)

```sql
CREATE TABLE organization_memberships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- 멤버십 상태 (직원 삭제 대신 관계 해제)
  status          text NOT NULL DEFAULT 'active',
    -- 'active' | 'paused' | 'terminated' | 'archived'

  join_date       date NOT NULL DEFAULT CURRENT_DATE,
  terminated_at   timestamptz,  -- 퇴직일시 (soft delete)

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE(organization_id, profile_id)
);

CREATE INDEX idx_org_mem_org_id ON organization_memberships(organization_id);
CREATE INDEX idx_org_mem_profile_id ON organization_memberships(profile_id);
CREATE INDEX idx_org_mem_status ON organization_memberships(status);
CREATE INDEX idx_org_mem_org_active ON organization_memberships(organization_id, status)
  WHERE status = 'active';
```

**설계 이유**:
- **핵심**: 직원 삭제 대신 관계 해제 (soft delete)
- `status='terminated'` + `terminated_at` 타임스탬프로 이력 추적
- 과거 직원의 급여/수당 통계 유지 가능
- 재입사 시 `status='active'`로 복원 가능

#### tenant_credits_pool

```sql
CREATE TABLE tenant_credits_pool (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  total_issued    integer NOT NULL DEFAULT 0,
  total_consumed  integer NOT NULL DEFAULT 0,
  base_monthly_credits integer NOT NULL DEFAULT 1000,
  max_balance     integer NOT NULL DEFAULT 5000,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id)
);
```

### 3-3. 기존 테이블 수정 (19개 전체)

모든 주요 테이블에 `organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE` 컬럼 추가.

| 테이블 | 추가 컬럼 | 인덱스 |
|--------|----------|--------|
| `profiles` | `organization_id`, `primary_organization_id` | `idx_profiles_org_id` |
| `stores` | `organization_id` | `idx_stores_org_id` |
| `attendance_logs` | `organization_id` | `idx_attendance_logs_org_created` |
| `notifications` | `organization_id` | `idx_notifications_org_id` |
| `attendance_credits` | `organization_id` | `idx_credits_org_profile` |
| `work_defaults` | `organization_id` | `idx_work_defaults_org_id` |
| `weekly_schedules` | `organization_id` | `idx_weekly_schedules_org_id` |
| `schedule_slots` | `organization_id` | `idx_schedule_slots_org_id` |
| `substitute_requests` | `organization_id` | `idx_sub_requests_org_id` |
| `substitute_responses` | `organization_id` | `idx_sub_responses_org_id` |
| `recipe_categories` | `organization_id` | `idx_recipe_categories_org_id` |
| `recipe_items` | `organization_id` | `idx_recipe_items_org_id` |
| `recipe_ingredients` | `organization_id` | `idx_recipe_ingredients_org_id` |
| `recipe_comments` | `organization_id` | `idx_recipe_comments_org_id` |
| `recipe_steps` | `organization_id` | `idx_recipe_steps_org_id` |
| `store_positions` | `organization_id` | `idx_store_positions_org_id` |
| `employee_store_assignments` | `organization_id` | `idx_emp_store_assign_org_id` |
| `overtime_requests` | `organization_id` | `idx_overtime_requests_org_id` |
| `company_events` | `organization_id` | `idx_company_events_org_id` |

### 3-4. 직원-관리자 관계 재설계

#### 현재 (문제)

```
auth.users (id=abc) ──── profiles (id=abc, role='employee')
                              │
                         직원이 삭제되면
                         └── auth.users, profiles,
                             attendance_logs, work_defaults 등
                             모두 CASCADE 삭제 ❌
```

#### 변경 후

```
auth.users (id=abc) ──── profiles (id=abc)
                              │
                         organization_memberships
                         (profile_id=abc, organization_id=org1, status='terminated')
                              │
                         모든 데이터 유지 ✅
                         status='terminated'로 접근 제어
```

#### 퇴직 처리 함수 (기존 delete_user_admin 대체)

```sql
CREATE OR REPLACE FUNCTION terminate_employee(
  target_user_id uuid,
  org_id uuid
) RETURNS void AS $$
BEGIN
  -- 1. 멤버십 상태 변경
  UPDATE organization_memberships
  SET status = 'terminated',
      terminated_at = now()
  WHERE profile_id = target_user_id
    AND organization_id = org_id;

  -- 2. 미래 스케줄 슬롯 정리
  DELETE FROM schedule_slots
  WHERE profile_id = target_user_id
    AND weekly_schedule_id IN (
      SELECT id FROM weekly_schedules WHERE organization_id = org_id
    )
    AND slot_date > CURRENT_DATE;

  -- 3. auth.users는 유지 (다른 조직 소속 가능)
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 3-5. 크레딧 시스템 다중 테넌트 적용

#### 변경 사항 (최소)

1. `attendance_credits.organization_id` 추가 (FK, 성능)
2. `tenant_credits_pool` 신규 (조직 차원 통계)
3. `profiles.primary_organization_id` 추가 (기본 조직 선택)
4. RLS 변경: 조직별 크레딧 격리
5. `sync_credit_score()` 트리거: **변경 없음** (이미 정상 동작)

#### 크레딧 독립성 보장

```sql
-- 직원이 여러 조직 소속 시 조직별 크레딧 분리 조회
SELECT
  om.organization_id,
  SUM(ac.points) as total_credits
FROM organization_memberships om
LEFT JOIN attendance_credits ac ON om.profile_id = ac.profile_id
  AND ac.organization_id = om.organization_id
WHERE om.profile_id = $emp_id
GROUP BY om.organization_id;

-- Result:
-- org1 | 520
-- org2 | 450
```

### 3-6. 급여 정산 테이블 (향후 추가)

```sql
CREATE TABLE payroll_settlements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  status          text DEFAULT 'draft',     -- 'draft'|'approved'|'paid'|'cancelled'
  total_salary    integer,
  total_deductions integer,
  created_at      timestamptz DEFAULT now(),
  submitted_by    uuid REFERENCES profiles(id),
  approved_at     timestamptz,
  approved_by     uuid REFERENCES profiles(id)
);

CREATE TABLE payroll_details (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id   uuid NOT NULL REFERENCES payroll_settlements(id),
  profile_id      uuid NOT NULL REFERENCES profiles(id),
  scheduled_hours numeric(8,2),
  hourly_wage     integer,
  gross_salary    integer,
  deduction_type  text,     -- 'national'|'3.3'
  deduction_amount integer,
  net_salary      integer,
  payment_status  text DEFAULT 'pending',
  payment_date    date,
  created_at      timestamptz DEFAULT now()
);
```

### 3-7. 데이터 마이그레이션 전략

```sql
-- Step 1: 기본 조직 생성
INSERT INTO organizations (name, owner_email, subscription_tier)
VALUES ('연경당', 'admin@ygd.com', 'professional')
RETURNING id AS org_id;

-- Step 2: 모든 직원을 해당 조직에 배정
UPDATE profiles SET organization_id = (SELECT id FROM organizations LIMIT 1);

-- Step 3: admin을 organization_admins에 등록
INSERT INTO organization_admins (organization_id, profile_id, role)
SELECT (SELECT id FROM organizations LIMIT 1), id, 'owner'
FROM profiles WHERE role = 'admin';

-- Step 4: 모든 직원을 organization_memberships에 등록
INSERT INTO organization_memberships (organization_id, profile_id, status)
SELECT (SELECT id FROM organizations LIMIT 1), id, 'active'
FROM profiles WHERE status = 'active';

-- Step 5: stores 업데이트
UPDATE stores SET organization_id = (SELECT id FROM organizations LIMIT 1);

-- Step 6: 나머지 테이블 organization_id 채우기
UPDATE attendance_logs SET organization_id = (
  SELECT organization_id FROM profiles WHERE profiles.id = attendance_logs.profile_id
);
-- ... 나머지 테이블도 동일 패턴
```

---

## 4. 인증 및 보안 변경 계획

### 4-1. 현재 인증 흐름

```
Supabase Auth (SSR 쿠키 세션)
  → auth.users (JWT: sub, aud, role, email)
  → profiles (role: 'admin'|'employee')
  → is_admin() 함수로 RLS bypass
```

**현재 인증 파일**:

| 파일 | 역할 |
|------|------|
| `src/lib/supabase.ts` | 브라우저 클라이언트 (ANON KEY) |
| `src/lib/supabase-server.ts` | 서버 클라이언트 (SSR 쿠키 세션) |
| `src/lib/auth-context.tsx` | `useAuth()` hook |
| `src/middleware.ts` | 토큰 갱신, `/admin` 경로 역할 확인 |

### 4-2. is_admin() 함수 재설계

#### 현재

```sql
FUNCTION is_admin() RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  )
$$;
```

#### 변경

```sql
-- 조직 멤버 확인
CREATE OR REPLACE FUNCTION is_org_member(org_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = org_id
      AND profile_id = auth.uid()
      AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 조직 관리자 확인
CREATE OR REPLACE FUNCTION is_org_admin(org_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_admins
    WHERE organization_id = org_id
      AND profile_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 현재 테넌트 ID 반환 (효율성)
CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS uuid AS $$
  SELECT COALESCE(
    (SELECT primary_organization_id FROM profiles WHERE id = auth.uid()),
    (SELECT organization_id FROM organization_memberships WHERE profile_id = auth.uid() LIMIT 1)
  )
$$ LANGUAGE sql SECURITY DEFINER;

-- 레거시 호환: 기존 is_admin() 유지
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_admins WHERE profile_id = auth.uid()
  )
$$ LANGUAGE sql SECURITY DEFINER;
```

### 4-3. 현재 RLS 정책 인벤토리

| 테이블 | 정책 요약 | 문제점 |
|--------|----------|--------|
| `profiles` | 모든 authenticated SELECT, 본인만 UPDATE, admin ALL | 전체 직원 프로필 노출 |
| `attendance_logs` | 본인 SELECT, admin ALL | 테넌트 미분리 |
| `stores` | 모든 authenticated SELECT, admin ALL | 모든 매장 노출 |
| `notifications` | 본인 + admin, INSERT 전체 허용 | 테넌트 미분리 |
| `weekly_schedules` | admin ALL, 직원은 confirmed만 | 테넌트 미분리 |
| `schedule_slots` | admin ALL, 본인 + 대타 eligible | 테넌트 미분리 |
| `recipe_*` | admin ALL, 직원은 published만 | 테넌트 미분리 |
| `attendance_credits` | 본인 + admin | 테넌트 미분리 |

### 4-4. 신규 RLS 정책 패턴

모든 테이블에 동일한 패턴 적용:

```sql
-- 예시: attendance_logs

-- 기존 정책 삭제
DROP POLICY IF EXISTS "Admin Bypass" ON attendance_logs;
DROP POLICY IF EXISTS "인증된 사용자는 자신의 출퇴근 기록만 조회" ON attendance_logs;

-- 신규: 조직 관리자 — 자기 조직 전체
CREATE POLICY "admin_org_logs" ON attendance_logs
  FOR ALL
  USING (is_org_admin(organization_id));

-- 신규: 직원 — 자기 기록만 (조직 확인)
CREATE POLICY "own_logs" ON attendance_logs
  FOR SELECT
  USING (auth.uid() = profile_id AND is_org_member(organization_id));

-- 신규: 자기 기록 추가
CREATE POLICY "own_insert" ON attendance_logs
  FOR INSERT
  WITH CHECK (auth.uid() = profile_id AND is_org_member(organization_id));
```

### 4-5. 역할 계층 구조

```
Tenant Owner (테넌트 소유자/사장)
  - 테넌트 모든 권한 (CRUD 데이터, 인원 관리, 구독)
  - 1명 이상 (테넌트당)

Manager (매장/부서 관리자)     HR Admin (인사 전담자)
  - 배정 매장/부서 직원 관리     - 모든 직원 정보 R/W
  - 스케줄 관리                  - 급여, 계약서 관리
  - 대타 승인                    - 출퇴근 기록 관리

Employee (직원)
  - 본인 정보 R (부분 W)
  - 본인 출퇴근 R/W
  - 배정 스케줄 R
  - 대타 요청 R/W
```

#### 역할별 권한 매트릭스

| 리소스 | Owner | Manager | HR Admin | Employee |
|--------|-------|---------|----------|----------|
| profiles (전체) | R/W/D | - | R/W | R(본인만 W) |
| profiles (급여/계약) | R/W/D | - | R/W/D | - |
| attendance_logs | R/W/D | R(배정 매장) | R/W | R/W(본인) |
| stores | R/W/D | R(배정) | R | R(배정) |
| schedules | R/W/D | R/W(배정) | R/W/D | R(본인) |
| recipes | R/W/D | - | R/W/D | R(published) |

### 4-6. 초대 시스템 설계

#### 데이터 모델

```sql
CREATE TABLE tenant_invites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           text NOT NULL,
  role            text NOT NULL,        -- 초대할 역할
  invited_by      uuid NOT NULL REFERENCES profiles(id),
  token           text NOT NULL UNIQUE, -- SHA256(id + email + secret)
  is_used         boolean NOT NULL DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  expires_at      timestamptz DEFAULT (now() + interval '7 days'),
  accepted_at     timestamptz,
  accepted_by     uuid REFERENCES auth.users(id),
  UNIQUE(organization_id, email)
);

CREATE INDEX idx_tenant_invites_token ON tenant_invites(token);
```

#### 초대 플로우

```
[사장] → /admin/team → "직원 초대" 버튼
  ↓
초대 이메일 발송 (토스 스타일)
  "홍길동님이 연경당 카페에 초대했어요"
  [초대 수락하기] (토큰 포함 URL)
  7일 만료
  ↓
[직원] → /join?token=xxx
  ↓
신규 회원가입 OR 기존 계정 연결
  → 테넌트 자동 가입
  → 사장에게 알림
```

### 4-7. Storage 접근 제어 변경

#### 폴더 구조 변경

```
-- 변경 전
hr-documents/{userId}/employment_contract_2024.pdf

-- 변경 후
hr-documents/{organizationId}/{userId}/employment_contract_2024.pdf
recipe-media/{organizationId}/{recipeId}/thumbnail.jpg
```

#### RLS 정책

```sql
CREATE POLICY "org_member_access" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'hr-documents' AND
    (regexp_split_to_array(name, '/')[1])::uuid IN (
      SELECT organization_id FROM organization_memberships
      WHERE profile_id = auth.uid()
    )
  );
```

### 4-8. 감사 로그 (Audit Trail)

```sql
CREATE TABLE audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  actor_id        uuid REFERENCES auth.users(id),
  table_name      text NOT NULL,
  operation       text NOT NULL,  -- INSERT, UPDATE, DELETE
  old_values      jsonb,
  new_values      jsonb,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_audit_logs_org_created ON audit_logs(organization_id, created_at DESC);
```

---

## 5. 프론트엔드 및 UX 변경 계획

### 5-1. 라우팅 구조 변경

#### 현재

```
/                    (직원 홈)
/login               (로그인)
/calendar            (스케줄)
/store               (공지/레시피)
/my                  (마이페이지)
/attendances         (근무 기록)
/credit-history      (크레딧 이력)
/admin/**            (관리자 전용)
```

#### 변경 후

```
/login                              (로그인)
/onboarding                         (신규: 비즈니스 등록)
/auth/select-business               (신규: 다중 소속 선택)

/[businessSlug]/                    (직원 홈)
/[businessSlug]/calendar            (스케줄)
/[businessSlug]/store               (공지/레시피)
/[businessSlug]/my                  (마이페이지)
/[businessSlug]/attendances         (근무 기록)
/[businessSlug]/credit-history      (크레딧 이력)

/[businessSlug]/admin/              (관리자 대시보드)
/[businessSlug]/admin/employees     (직원 관리)
/[businessSlug]/admin/calendar      (통합 캘린더)
/[businessSlug]/admin/settings      (매장 설정)
/[businessSlug]/admin/business-settings  (신규: 비즈니스 설정)
/[businessSlug]/admin/team-members       (신규: 팀 멤버 관리)
/[businessSlug]/admin/payroll            (신규: 급여 정산)
```

### 5-2. 상태관리 확장

#### AuthContext 확장

```typescript
interface CurrentBusiness {
  id: string;
  slug: string;
  name: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  currentBusiness: CurrentBusiness | null;
  setCurrentBusiness: (business: CurrentBusiness) => void;
  businessRole: 'owner' | 'manager' | 'hr_admin' | 'employee' | null;
}
```

#### 신규 Hooks

```typescript
// src/lib/hooks/useTenant.ts
export function useTenant() {
  const { currentBusiness } = useAuth();
  // currentBusiness가 없으면 /auth/select-business로 리다이렉트
  return currentBusiness;
}

// src/lib/hooks/useUserBusinesses.ts
export function useUserBusinesses() {
  const { user } = useAuth();
  // organization_memberships 조회 → 사용자 소속 조직 목록
  return businesses;
}

// src/lib/hooks/useBusinessData.ts
export function useBusinessData<T>(table: string, query?: string) {
  const business = useTenant();
  // 모든 쿼리에 organization_id = business.id 필터 자동 적용
  return data;
}
```

### 5-3. 컴포넌트 변경사항

#### 재사용 가능 (최소 변경)

| 컴포넌트 | 변경 내용 | 영향도 |
|---------|----------|--------|
| `AttendanceCard.tsx` | businessId prop 추가 | 낮음 |
| `Clock.tsx` | 변경 없음 | 없음 |
| `MyInfoModal.tsx` | businessId 필터링 | 중간 |
| shadcn/ui 컴포넌트 | 변경 없음 | 없음 |

#### 재구성 필요 (상당한 변경)

| 컴포넌트 | 변경 내용 | 영향도 |
|---------|----------|--------|
| `HomeClient.tsx` | businessId 필터 + 비즈니스 전환 UI | 높음 |
| `BottomNav.tsx` | businessSlug 동적 경로 | 중간 |
| `admin/layout.tsx` | 비즈니스 선택기 + 팀멤버 메뉴 | 높음 |
| `DashboardKPICards.tsx` | businessId 필터 | 높음 |
| `TeamCreditOverview.tsx` | businessId 필터 | 높음 |

#### 신규 컴포넌트

```
src/components/BusinessSwitcher.tsx          - 헤더 비즈니스 전환 드롭다운
src/components/TenantSelector.tsx            - 로그인 후 비즈니스 선택
src/components/admin/TeamMembersTable.tsx     - 팀 멤버 역할 관리
src/components/admin/BusinessSettingsForm.tsx - 비즈니스 설정 폼
src/components/onboarding/BusinessOnboardingFunnel.tsx - 사장님 온보딩 퍼널
```

### 5-4. 미들웨어 업그레이드

```typescript
// src/middleware.ts 변경사항

export async function middleware(request: NextRequest) {
  // 기존: 토큰 갱신 + /admin 역할 확인
  // 추가:
  // 1. businessSlug 파싱
  // 2. 사용자가 해당 비즈니스에 접근 권한 있는지 확인
  // 3. 권한 없으면 /auth/select-business로 리다이렉트
  // 4. request headers에 x-tenant-id 추가

  if (user && pathname.startsWith("/admin")) {
    const { data: isAdmin } = await supabase
      .rpc('is_org_admin', { org_id: currentTenantId });

    if (!isAdmin) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }
}
```

### 5-5. 비즈니스 전환 기능

**직원이 여러 비즈니스에 소속된 경우:**

```
[상단 헤더]
┌─────────────────────┐
│ 연경당 카페  ▼       │
├─────────────────────┤
│ ✓ 연경당 카페       │
│   연경당 공장       │
│   홍길동 우육면     │
└─────────────────────┘
```

- 전환 시 해당 businessSlug로 라우팅
- localStorage에 마지막 접근 비즈니스 저장
- 비즈니스별 독립 데이터 로드

### 5-6. 온보딩 플로우 (사장님)

```
Step 1: 이메일/비밀번호 가입
Step 2: 이름, 연락처, 사업자등록번호 (자동 검증)
Step 3: 첫 번째 매장 등록 (매장명, 주소, GPS 좌표, 반경)
Step 4: 첫 직원 초대 (이메일 입력, 역할 선택)
Step 5: 플랜 선택 & 결제 (또는 Free로 시작)
→ /[businessSlug]/admin/ 대시보드 이동
```

---

## 6. 비즈니스 로직 및 API 변경 계획

### 6-1. API 라우트 현황 및 변경

| 경로 | 현재 기능 | 변경 필요 |
|------|----------|----------|
| `/api/log-error` | 클라이언트 에러 로깅 | organization_id 선택적 추가 |
| `/api/push/subscribe` | 푸시 알림 구독 | organization_id 컬럼 추가 |
| `/api/push/preferences` | 푸시 설정 조회/수정 | 테넌트별 설정 |
| `/api/cron/daily-settlement` | 자동 일일 정산 | **Critical: 테넌트별 루프 정산** |

### 6-2. Cron 정산 변경 (Critical)

```typescript
// 현재: 전체 schedule_slots 대상
// 변경: 각 테넌트별 정산

export async function GET(request: Request) {
  const { data: orgs } = await adminSupabase
    .from("organizations")
    .select("id")
    .eq("is_active", true);

  let totalProcessed = 0;

  for (const org of orgs ?? []) {
    const result = await processSettlementCron(targetDate, org.id);
    totalProcessed += result.processed;
  }

  return Response.json({
    targetDate,
    processed: totalProcessed,
    tenants: orgs?.length ?? 0,
  });
}
```

### 6-3. Server Actions 변경

#### notifications.ts

- `createNotification()`: organization_id 파라미터 추가
- `sendPushToRole()`: 테넌트 내 역할별 발송으로 변경
  - 현재: "admin" → 모든 admin
  - 변경: "admin" + org_id → 해당 조직 admin만

#### credit-engine.ts

- 크레딧 시스템은 이미 `profile_id` 기반 → **최소 변경**
- `processCheckinCredit()`: organization_id 검증 추가
- `processSettlementCron()`: 테넌트별 정산으로 변경
- `sync_credit_score()` 트리거: **변경 없음**

### 6-4. 직원 삭제 → 언링크 코드 변경

```typescript
// 현재: /admin/employees/page.tsx
const confirmDelete = async () => {
  const { error } = await supabase.rpc("delete_user_admin", {
    target_user_id: id,
  });
  // auth.users 완전 삭제 ❌
};

// 변경:
const confirmRemove = async () => {
  const { error } = await supabase.rpc("terminate_employee", {
    target_user_id: id,
    org_id: currentBusiness.id,
  });
  // organization_memberships.status = 'terminated' ✅
  // 모든 데이터 보존 ✅

  if (!error) {
    toast.success(`${name}님을 조직에서 제거했어요`);
  }
};
```

### 6-5. Realtime 구독 변경

```typescript
// 현재: 전체 notifications 구독
supabase.channel('notifications').on('postgres_changes', { ... })

// 변경: 테넌트 필터링
supabase
  .channel(`notifications:${orgId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'notifications',
    filter: `organization_id=eq.${orgId}`,
  }, callback)
  .subscribe();
```

### 6-6. 신규 API/기능 필요

| API | 기능 |
|-----|------|
| 테넌트 CRUD | 조직 생성/수정/삭제 |
| 멤버 관리 | 초대/수락/역할변경/제거 |
| 급여 정산 | 월별 정산 생성/승인/이체 |
| 데이터 내보내기 | CSV/Excel 다운로드 |

---

## 7. SaaS 전략 및 프로덕트 로드맵

### 7-1. 가격 모델

| 플랜 | 월 가격 | 직원 | 매장 | 핵심 기능 |
|------|---------|------|------|----------|
| **Free** | 0원 | ~5명 | 1개 | GPS 출퇴근, 스케줄, 공지 |
| **Starter** | 29,900원 | ~20명 | 3개 | + 레시피, 크레딧 시스템 |
| **Professional** | 79,900원 | ~100명 | 무제한 | + 급여정산, 고급 리포팅, 권한관리 |
| **Enterprise** | 커스텀 | 무제한 | 무제한 | + API, SSO, 감사로그, 전담CS |

연간 결제 시 20~40% 할인.

### 7-2. 크레딧 시스템 테넌트별 커스터마이징

```sql
CREATE TABLE tenant_credit_policies (
  id                        uuid PRIMARY KEY,
  organization_id           uuid NOT NULL FK,
  normal_attendance_points  int DEFAULT 3,
  late_minor_points         int DEFAULT -3,
  late_major_points         int DEFAULT -10,
  no_show_points            int DEFAULT -50,
  streak_bonus_10_days      int DEFAULT 10,
  streak_bonus_30_days      int DEFAULT 30,
  streak_bonus_60_days      int DEFAULT 60,
  streak_bonus_100_days     int DEFAULT 100,
  tier_thresholds           jsonb,  -- {"diamond": 900, "platinum": 800, ...}
  use_credit_shield         boolean DEFAULT true,
  created_at                timestamptz,
  updated_at                timestamptz
);
```

각 사장님이 자기 매장에 맞는 점수 체계 설정 가능:
- 엄격한 운영: 결근 -100점, 보호권 없음
- 유연한 운영: 결근 -20점, 보호권 3회/월

### 7-3. 기능 우선순위

#### MVP (1~3개월)

| 기능 | 우선순위 |
|------|---------|
| Multi-tenancy 기반 구조 (DB + RLS) | 최고 |
| 테넌트 가입/온보딩 플로우 | 최고 |
| 직원 초대 & 수락 시스템 | 최고 |
| 구독 & 결제 (Stripe) | 최고 |
| 기존 기능 마이그레이션 (출퇴근, 스케줄) | 높음 |

#### Phase 2 (4~6개월)

| 기능 | 내용 |
|------|------|
| 급여 정산 | 스케줄 기반 급여 계산, 공제 자동화 |
| 고급 리포팅 | 월별/년도 통계, 근태 분석, 급여 추이 |
| 크레딧 커스터마이징 | 테넌트별 정책 설정 UI |
| 데이터 내보내기 | CSV/Excel 일괄 다운로드 |

#### Phase 3 (7~12개월)

| 기능 | 내용 |
|------|------|
| REST API & Webhook | 타사 시스템 연동 |
| SSO 통합 | Google Workspace, Microsoft 365 |
| 모바일 네이티브 앱 | iOS/Android |
| 고급 자동화 | 스케줄 미준수 알림, 급여 자동 이체 |

### 7-4. 시장 분석

#### 경쟁 환경

| 분야 | 주요 서비스 | YGD 차별점 |
|------|-----------|-----------|
| 급여 관리 | 토스, 카카오페이 | B2B 미약, 소상공인 진입장벽 |
| 스케줄 관리 | 구글 캘린더, 엑셀 | 매뉴얼, 협업 기능 약함 |
| 출근 관리 | Clockify, Toggl | 해외산, 한국 노동법 미반영 |
| 레시피 관리 | 자체 문서 | 중앙화된 솔루션 없음 |

**핵심 차별점**: HR + 급여 + 스케줄 + 크레딧(게이미피케이션)이 통합된 한국 음식업 특화 플랫폼

#### 타겟 고객 세분화

```
Segment 1: 소규모 카페 (5~10명) → Free/Starter
  문제: 근무표 관리 번거로움
  솔루션: 스케줄 + GPS 출퇴근

Segment 2: 중형 음식점 (15~50명) → Professional
  문제: 급여 정산 시간, 지각 분쟁
  솔루션: 급여 자동화 + 크레딧 시스템

Segment 3: 다중점 체인 (50명 이상) → Enterprise
  문제: 분점 간 운영 표준화
  솔루션: 복수 매장 관리 + 고급 리포팅
```

### 7-5. 법규 및 컴플라이언스

#### 근로기준법 준수

| 항목 | 요구사항 | YGD 상태 |
|------|---------|---------|
| 근로계약서 | 필수 서명 및 보관 | 구현됨 (Storage) |
| 출근 기록 | 최소 3년 보관 의무 | 구현됨 (무제한 저장) |
| 급여 정산 | 월급 정산 원칙 | 구현 예정 (설정 가능) |
| 공제 금지 | 법정 공제 외 불가 | 2대보험/3.3% 자동만 |

#### 개인정보보호법 준수

| 항목 | 요구사항 | YGD 상태 |
|------|---------|---------|
| 위치정보 | 별도 동의 필수 | 온보딩 시 수집 |
| 민감정보 | 주민번호 저장 금지 | 저장 안 함 |
| 파일 보관 | Private 버킷 + 암호화 | 구현됨 |
| 서명 URL | 60초 만료 + 접근 제한 | 구현됨 |
| 데이터 삭제권 | 계정 삭제 시 제거 | CASCADE 설정 |

#### 출시 전 필수 체크리스트

- [ ] 이용약관 법무법인 검토
- [ ] 개인정보처리방침 작성 & 검토
- [ ] 급여 정산 로직 노무법인 감리
- [ ] 지각/결근 판정 기준 법적 검토
- [ ] Stripe 결제 연동 검토

---

## 8. 마이그레이션 실행 순서

### Phase 1: 기초 테이블 생성 (1시간)

```
Step 1. organizations 테이블 생성
Step 2. organization_admins 테이블 생성
Step 3. organization_memberships 테이블 생성
Step 4. tenant_credits_pool 테이블 생성
Step 5. tenant_invites 테이블 생성
Step 6. audit_logs 테이블 생성
```

### Phase 2: 기존 테이블 마이그레이션 (4시간)

```
Step 7. profiles에 organization_id, primary_organization_id 추가
Step 8. stores에 organization_id 추가
Step 9. 나머지 17개 테이블에 organization_id 추가 (일괄)
Step 10. 모든 인덱스 생성
```

### Phase 3: 데이터 마이그레이션 (2시간)

```
Step 11. organizations에 기본 조직 생성 (연경당)
Step 12. profiles 업데이트 (모든 직원을 조직에 배정)
Step 13. organization_admins 생성 (admin 등록)
Step 14. organization_memberships 생성 (모든 직원)
Step 15. stores 업데이트
Step 16. attendance_logs 등 모든 테이블 organization_id 채우기
```

### Phase 4: RLS 및 함수 변경 (2시간)

```
Step 17. is_org_admin(), is_org_member(), current_tenant_id() 함수 추가
Step 18. is_admin() 함수 수정 (레거시 호환)
Step 19. handle_new_user() 수정
Step 20. terminate_employee() 함수 생성 (delete_user_admin 대체)
Step 21. 모든 테이블 RLS 정책 재작성 (조직 기반)
```

### Phase 5: 애플리케이션 코드 변경 (4~6시간)

```
Step 22. AuthContext 확장 (currentBusiness)
Step 23. middleware.ts 업그레이드 (tenant 검증)
Step 24. 라우팅 구조 변경 (/[businessSlug]/)
Step 25. 온보딩 플로우 구현
Step 26. 모든 쿼리에 organization_id 필터 추가
Step 27. 어드민 대시보드 테넌트별 필터링
Step 28. 알림 시스템 테넌트 기반 필터링
Step 29. 직원 삭제 → 언링크 전환
Step 30. 통합 테스트 및 배포
```

### Phase 6: 테스트 & 검증

```
Step 31. 다중 테넌트 데이터 격리 테스트
Step 32. RLS 정책 보안 테스트 (교차 테넌트 접근 차단 확인)
Step 33. 직원 다중 소속 시나리오 테스트
Step 34. 초대/수락 E2E 테스트
Step 35. Cron 정산 테넌트별 동작 테스트
Step 36. 성능 테스트 (쿼리 인덱스 활용 확인)
```

---

## 9. 리스크 및 대응 전략

### 9-1. 높음 (High) — 즉시 대응

| 리스크 | 영향 | 대책 |
|--------|------|------|
| 기존 데이터 손상 | 서비스 중단 | Dev DB 완전 테스트 후 Prod 진행, 사전 백업 필수 |
| RLS 정책 누락 → 데이터 유출 | 보안 침해 | 모든 정책 재검토 + E2E 보안 테스트 |
| 직원 데이터 손실 (현재 hard delete) | 회계 감사 실패 | Soft delete 패턴 즉시 전환 |
| Cron 정산 중복 | 점수 이중 가산 | 테넌트별 정산 로직 필수 |

### 9-2. 중간 (Medium) — 계획 필요

| 리스크 | 영향 | 대책 |
|--------|------|------|
| 기존 구조와 호환성 | 배포 장애 | Feature flag로 점진적 전환 |
| N+1 쿼리 증가 | 성능 저하 | `(organization_id, ...)` 복합 인덱스 + JOIN 최적화 |
| 권한 검증 누락 | 비인가 접근 | 모든 API/Action에 middleware 확인 |
| RLS 정책 복잡성 | 유지보수 부담 | 단계별 정책 추가, 충분한 테스트 |

### 9-3. 낮음 (Low) — 향후 고려

| 리스크 | 영향 | 대책 |
|--------|------|------|
| 기존 사용자 혼란 | UX 저하 | 마이그레이션 공지 + 이용가이드 업데이트 |
| 경로 변경으로 북마크 깨짐 | 접근성 | 구 경로 → 신 경로 리다이렉트 설정 |
| 급여 정산 소수점 처리 | 정확성 | 원화 기준 정수 처리 |

### 9-4. 롤백 전략

- 마이그레이션 SQL을 역순으로 실행 가능하도록 작성
- 기존 데이터 백업 필수 (Supabase 자동 백업 확인)
- 단계별 테스트: Dev DB → Staging → Production
- 기존 RLS 정책 병행 가능 → 단계적 전환

---

## 부록: 전체 체크리스트

### A. 신규 테이블 (6개)

- [ ] organizations
- [ ] organization_admins
- [ ] organization_memberships
- [ ] tenant_credits_pool
- [ ] tenant_invites
- [ ] audit_logs

### B. 수정 테이블 (19개)

- [ ] profiles (organization_id, primary_organization_id)
- [ ] stores (organization_id)
- [ ] attendance_logs (organization_id)
- [ ] notifications (organization_id)
- [ ] attendance_credits (organization_id)
- [ ] work_defaults (organization_id)
- [ ] weekly_schedules (organization_id)
- [ ] schedule_slots (organization_id)
- [ ] substitute_requests (organization_id)
- [ ] substitute_responses (organization_id)
- [ ] recipe_categories (organization_id)
- [ ] recipe_items (organization_id)
- [ ] recipe_ingredients (organization_id)
- [ ] recipe_comments (organization_id)
- [ ] recipe_steps (organization_id)
- [ ] store_positions (organization_id)
- [ ] employee_store_assignments (organization_id)
- [ ] overtime_requests (organization_id)
- [ ] company_events (organization_id)

### C. 함수/트리거 변경

- [ ] is_org_admin(org_id) 신규
- [ ] is_org_member(org_id) 신규
- [ ] current_tenant_id() 신규
- [ ] is_admin() 수정 (레거시 호환)
- [ ] handle_new_user() 수정
- [ ] terminate_employee() 신규 (delete_user_admin 대체)

### D. RLS 정책

- [ ] 모든 테이블 organization_id 기반 RLS 재작성 (19개)
- [ ] Storage 정책 테넌트 기반 변경
- [ ] 직원/관리자 구분 명확화

### E. 프론트엔드

- [ ] AuthContext 확장 (currentBusiness, businessRole)
- [ ] middleware.ts 업그레이드 (tenant 검증)
- [ ] /[businessSlug]/ 라우팅 구조 전환
- [ ] BusinessSwitcher 컴포넌트
- [ ] BusinessOnboardingFunnel 컴포넌트
- [ ] BottomNav businessSlug 적용
- [ ] 모든 쿼리 organization_id 필터 추가
- [ ] 직원 삭제 → 제거(언링크) UI 변경

### F. API & Server Actions

- [ ] Cron 정산 테넌트별 루프
- [ ] Push 알림 테넌트 필터
- [ ] 알림 생성 organization_id 추가
- [ ] Realtime 구독 테넌트 필터

### G. 향후 추가 기능

- [ ] 급여 정산 (payroll_settlements, payroll_details)
- [ ] 테넌트별 크레딧 정책 커스터마이징
- [ ] 데이터 내보내기 (CSV/Excel)
- [ ] REST API & Webhook
- [ ] SSO 통합
- [ ] 네이티브 모바일 앱

---

> **최종 평가**: 현재 코드베이스는 멀티테넌트 전환에 적합한 기술 기반을 갖추고 있다.
> `profile_id` 기반 데이터 격리가 이미 되어있고, Server Actions 중심 아키텍처라 변경 범위가 제한적이다.
> 가장 큰 변경점 3가지:
> 1. `organizations` + `organization_memberships` 테이블 도입
> 2. 직원 삭제 → 소프트 삭제(관계 해제) 전환
> 3. 모든 RLS 정책의 `organization_id` 기반 재작성
