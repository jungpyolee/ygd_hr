# SaaS 전환 종합 설계서
> 작성일: 2026-03-25
> 상태: Draft v2.0
> 관련 문서: `saas-market-analysis.md`, `pricing-and-messaging.md`, `legal-risks.md`, `naming.md`

---

## 목차

| # | 섹션 | 담당 관점 |
|---|------|----------|
| 1 | [현재 시스템 진단](#1-현재-시스템-진단) | 시스템 아키텍트 |
| 2 | [제품 전략 & 사용자 여정](#2-제품-전략--사용자-여정) | 프로덕트 매니저 |
| 3 | [사장님 가입 + 온보딩 UX](#3-사장님-가입--온보딩-ux) | UX 디자이너 |
| 4 | [직원 초대 & 합류 UX](#4-직원-초대--합류-ux) | UX 디자이너 |
| 5 | [멀티테넌트 데이터 설계](#5-멀티테넌트-데이터-설계) | 데이터 아키텍트 |
| 6 | [인증 & 보안 전환](#6-인증--보안-전환) | 보안 엔지니어 |
| 7 | [프론트엔드 전환 계획](#7-프론트엔드-전환-계획) | 프론트엔드 엔지니어 |
| 8 | [급여 계산 시스템](#8-급여-계산-시스템) | 도메인 전문가 (노무) |
| 9 | [결제 & 구독](#9-결제--구독) | 비즈니스 엔지니어 |
| 10 | [법적 준비](#10-법적-준비) | 법률 자문 |
| 11 | [마이그레이션 실행 계획](#11-마이그레이션-실행-계획) | DevOps |
| 12 | [실행 로드맵 & 미결 사항](#12-실행-로드맵--미결-사항) | PM + 전체 |

---

# Part A. 현황 분석

## 1. 현재 시스템 진단

> 관점: 시스템 아키텍트 — "SaaS로 전환하려면 뭘 바꿔야 하나?"

### 1-1. 전체 아키텍처

```
사용자(PWA) ─→ Next.js App Router (Vercel)
                 ├─ middleware.ts ─→ Supabase Auth (SSR 쿠키)
                 ├─ Client Component ─→ createBrowserClient(anon key)
                 ├─ Server Component ─→ createServerClient(anon key)
                 └─ Server Action ─→ Service Role Key (알림 발송)
                       │
                       ▼
                   Supabase
                   ├─ PostgreSQL (RLS 활성)
                   ├─ Realtime (notifications)
                   ├─ Storage (hr-documents)
                   └─ Auth (이메일/비밀번호)
```

### 1-2. 싱글테넌트 현황 — SaaS 전환 시 문제되는 것들

#### 인증

| 항목 | 현재 | 문제 |
|------|------|------|
| 이메일 | `userId@ygd.com` 가짜 도메인 | 모든 SaaS 고객이 같은 도메인 공유 불가 |
| 역할 | `profiles.role` = `admin`/`employee` | 조직과 무관한 글로벌 역할. "사장님" 개념 없음 |
| 가입 | 아이디+비번만으로 즉시 가입 | 조직 연결 없이 부유하는 계정 생성 |
| 온보딩 | 이름+전화번호+보건증 (직원 전용) | 사장님 온보딩(매장 등록) 없음 |
| 미들웨어 | `/admin` 경로에서 role 체크만 | 테넌트 간 데이터 격리 없음 |

#### 데이터 격리

**org_id가 없는 테이블 = SaaS에서 데이터 유출 위험**

| 위험도 | 테이블 | 현재 RLS | 문제 |
|--------|--------|----------|------|
| 🔴 | profiles | authenticated → SELECT ALL | 타 조직 직원 이름/전화번호 노출 |
| 🔴 | attendance_logs | admin → ALL | 타 조직 출퇴근 기록 조회 가능 |
| 🔴 | stores | 전체 SELECT | 모든 매장 위치(GPS 좌표) 노출 |
| 🔴 | weekly_schedules, schedule_slots | admin → ALL | 타 조직 근무 스케줄 노출 |
| 🔴 | notifications | target_role 기반 | 타 조직 알림 수신 가능 |
| 🟡 | recipe_*, announcements | 전체 SELECT | 매장별 분리 필요 |
| 🟡 | overtime_requests | admin → ALL | 타 조직 추가근무 기록 노출 |

#### 하드코딩된 "연경당" 의존성

| 파일 | 내용 | 전환 방법 |
|------|------|----------|
| `login/page.tsx` L30 | `@ygd.com` 도메인 | 실제 이메일 전환 |
| `login/page.tsx` L83-96 | "연경당 HR" / "연경당 합류를 환영해요" | 앱 이름으로 교체 |
| `layout.tsx` L13 | `"연경당 HR"` / `"연경당 테섭"` | 동적 앱 이름 or 새 브랜드 |
| `layout.tsx` L29 | `"연경당 통합 근태 관리 서비스"` | 범용 설명 |
| `layout.tsx` L53 | `"https://ygd-hr.vercel.app"` | 새 도메인 |
| `OnboardingFunnel.tsx` | "연경당" 텍스트 | 조직 이름 동적 표시 |
| `manifest.webmanifest` | PWA 이름/설명 | 새 브랜드 |

### 1-3. 현재 기능 전체 맵

**직원 영역 (BottomNav)**
```
/ (홈) ─── 출퇴근 버튼 (GPS), 오늘 스케줄, 크레딧 티어
/calendar ─ 월간 캘린더, 내 스케줄, 대타 요청
/store ──── 공지사항, 레시피 (탭 전환)
/my ─────── 프로필 편집, 크레딧 이력, 근무기록, 이용가이드, 로그아웃
```

**관리자 영역**
```
/admin ─────────── 대시보드 (KPI, 출근현황, 활동피드)
/admin/attendance ─ 일별 출퇴근 기록, 수동 처리
/admin/calendar ─── 주간 스케줄 편집 (드래그, 전주복사)
/admin/employees ── 직원 목록/상세, 서류 관리, 역할 변경
/admin/overtime ─── 추가근무 인정/넘김
/admin/settings ─── 매장별 설정 (추가근무 단위, 색상)
/admin/stats ────── 근무 통계
/admin/checklists ─ 오픈/마감 체크리스트
/admin/announcements ─ 공지사항 CRUD
/admin/recipes ───── 레시피 CRUD
/admin/schedules/substitutes ─ 대타 관리
```

### 1-4. 기존 테이블 관계 (SaaS 전환 시 영향받는 것)

```
auth.users
  └─→ profiles (1:1, 트리거 자동 생성)
        ├─→ attendance_logs (1:N)
        ├─→ employee_store_assignments (N:M → stores)
        ├─→ schedule_slots (1:N)
        ├─→ overtime_requests (1:N)
        ├─→ attendance_credits (1:N)
        └─→ notifications (1:N)

stores
  ├─→ store_positions (1:N)
  ├─→ employee_store_assignments (N:M → profiles)
  └─→ attendance_logs (FK: check_in_store_id, check_out_store_id)

weekly_schedules (1:N) → schedule_slots
                        → substitute_requests → substitute_responses
```

**핵심 관찰**: `stores`가 이미 다중 매장을 지원하고, `employee_store_assignments`가 직원-매장 배정을 관리함. 이 구조 위에 `organizations`를 얹는 게 자연스러움.

---

# Part B. 제품 설계

## 2. 제품 전략 & 사용자 여정

> 관점: 프로덕트 매니저 — "누가, 왜, 어떤 순서로 쓰게 되나?"

### 2-1. 두 종류의 사용자

| | 사장님 (Owner) | 직원 (Employee) |
|---|---|---|
| **진입 경로** | 랜딩페이지 / 광고 / 입소문 | 사장님이 보낸 초대 링크 |
| **첫 행동** | 가입 → 매장 등록 → 직원 초대 | 초대 수락 → 이름/전화번호 입력 |
| **핵심 가치** | "직원 관리가 편해졌다" | "출퇴근만 찍으면 된다" |
| **Aha Moment** | 첫 직원이 GPS로 출근 찍는 순간 | 내 스케줄이 앱에 보이는 순간 |
| **이탈 위험** | 가입했는데 직원이 안 들어옴 | 앱 설치가 귀찮음 |

### 2-2. 사장님 여정 (Critical Path)

```
[인지] 광고/입소문으로 앱 발견
  ↓
[랜딩] 랜딩페이지에서 "무료로 시작하기" 클릭
  ↓
[가입] 이메일 + 비밀번호 + 이름 입력
  ↓
[온보딩] 사업장 이름 → 매장 위치 등록 → 포지션 설정
  ↓
[초대] 초대 링크 생성 → 카카오톡으로 직원에게 전달
  ↓
[대기] 직원이 합류할 때까지 대시보드에서 안내 표시
  ↓
[Aha!] 첫 직원이 출근 찍으면 → 대시보드에 실시간 표시
  ↓
[활성] 스케줄 등록, 추가근무 관리 등 일상 사용
  ↓
[전환] 직원 4명 이상 or 급여 계산 필요 → 유료 전환
```

**이탈 방지 포인트:**
- 온보딩은 **3분 이내** 완료 가능해야 함
- 직원 합류 전에도 **혼자서 체험 가능**한 기능 제공 (데모 데이터?)
- 초대 링크는 **카카오톡 한 번 탭**으로 공유 가능해야 함

### 2-3. 직원 여정

```
[초대] 사장님이 카카오톡으로 초대 링크 전달
  ↓
[가입] 링크 클릭 → 이메일+비번 (또는 초대 코드 수동 입력)
  ↓
[온보딩] 이름 + 전화번호 (+ 보건증 — 업종에 따라 선택)
  ↓
[PWA] "홈 화면에 추가하기" 안내
  ↓
[일상] 출퇴근 찍기, 스케줄 확인, 대타 요청
```

### 2-4. MVP 기능 범위 결정

| 기능 | MVP | Phase 2 | 이유 |
|------|:---:|:-------:|------|
| 사장님 가입/온보딩 | ✅ | | 없으면 SaaS 자체가 불가 |
| 초대 링크 (직원 합류) | ✅ | | 없으면 직원 연결 불가 |
| 멀티테넌트 격리 | ✅ | | 없으면 데이터 유출 |
| 기존 기능 전체 (출퇴근/스케줄/알림...) | ✅ | | 기존 가치 유지 |
| 랜딩페이지 | ✅ | | 가입 진입점 |
| 이용약관/개인정보처리방침 | ✅ | | 법적 필수 |
| 급여 계산 | | ✅ | 핵심이지만 복잡 — 출시 후 추가 |
| 결제/구독 | | ✅ | 베타 무료 기간 활용 |
| 카카오 로그인 | | ✅ | OAuth 심사 기간 필요 |
| 급여 명세서 PDF | | ✅ | 급여 계산 이후 |
| 멀티 조직 전환 | | ✅ | MVP는 1인 1조직 |

---

## 3. 사장님 가입 + 온보딩 UX

> 관점: UX 디자이너 — "사장님이 3분 안에 매장을 등록하고 직원을 초대할 수 있어야 한다"

### 3-1. 설계 원칙

1. **한 화면 = 한 가지 질문** (토스 퍼널 패턴, 기존 `OnboardingFunnel.tsx` 재사용)
2. **프로그레스 바**로 현재 위치 표시 (총 4스텝)
3. **뒤로가기 가능** — 실수 수정 허용
4. **마지막 스텝(초대)만 스킵 가능**
5. **말투**: `~해요` 체 통일 (CLAUDE.md 규칙)

### 3-2. 퍼널 상세

#### Step 1 — 계정 만들기 (`/signup`)

```
━━━━●━━━━━━━━━━━━━━━  1/4

  반가워요!
  먼저 계정을 만들어 주세요

  ┌───────────────────────┐
  │ 이름                    │
  └───────────────────────┘
  ┌───────────────────────┐
  │ 이메일                  │
  └───────────────────────┘
  ┌───────────────────────┐
  │ 비밀번호 (8자 이상)      │
  └───────────────────────┘

  ☑ [필수] 이용약관 동의
  ☑ [필수] 개인정보 수집·이용 동의
  ☑ [필수] 위치정보 제공 동의

  ┌───────────────────────┐
  │       다음으로          │
  └───────────────────────┘

  이미 계정이 있으신가요? 로그인
```

**동작:**
- Supabase Auth signUp(email, password)
- profiles 트리거로 name 저장
- 성공 → 자동 로그인 → `/onboarding`으로 이동

#### Step 2 — 사업장 등록 (`/onboarding` step=1)

```
━━━━━━━●━━━━━━━━━━━━  2/4

  어떤 사업장을 운영하세요?

  ┌───────────────────────┐
  │ 사업장 이름 (예: 카페 봄날) │
  └───────────────────────┘

  업종을 골라주세요
  ┌──────┐ ┌──────┐ ┌──────┐
  │ 카페  │ │ 식당  │ │ 기타  │
  └──────┘ └──────┘ └──────┘

  ┌───────────────────────┐
  │       다음으로          │
  └───────────────────────┘
```

**동작:**
- organizations INSERT (name, category, owner_id)
- org_members INSERT (role: 'owner')

**업종이 필요한 이유:**
- 카페/식당 → 보건증 관련 기능 활성화
- 기타 → 보건증 비활성화
- 향후 업종별 맞춤 기능 제공 기반

#### Step 3 — 매장 위치 등록 (`/onboarding` step=2)

```
━━━━━━━━━━━●━━━━━━━  3/4

  매장 위치를 등록해 주세요
  직원들이 이 위치 근처에서 출퇴근을 찍어요

  ┌───────────────────────┐
  │ 🔍 주소 검색             │
  └───────────────────────┘

  ┌───────────────────────┐
  │                         │
  │     [ 카카오맵 미리보기 ] │
  │          📍             │
  │                         │
  └───────────────────────┘

  출퇴근 인정 반경
  ┌──────┐ ┌───────┐ ┌──────┐
  │ 50m  │ │ 100m ✓│ │ 200m │
  └──────┘ └───────┘ └──────┘
  "매장에서 100m 이내에 있으면 출근이 인정돼요"

  ┌───────────────────────┐
  │       다음으로          │
  └───────────────────────┘
```

**동작:**
- 카카오 주소 API → 주소 → 위도/경도 변환
- stores INSERT (name: org.name + " 본점", lat, lng, org_id)
- 기본 포지션 생성 (업종이 카페/식당이면 "홀", "주방" 자동 추가)

**지도 API:**
- 카카오 주소 검색 API (무료 300,000건/일)
- 카카오맵 JS SDK (지도 표시 + 핀 드래그 미세 조정)

#### Step 4 — 직원 초대 (`/onboarding` step=3)

```
━━━━━━━━━━━━━━━━━●  4/4

  직원을 초대해 보세요
  초대 링크를 카카오톡으로 보내면 돼요

  ┌───────────────────────────┐
  │                             │
  │   🔗 초대 링크가 만들어졌어요  │
  │                             │
  │   https://[앱].kr/join/A3X9K2 │
  │                             │
  │  [카카오톡으로 공유] [링크 복사] │
  │                             │
  └───────────────────────────┘

  ┌───────────────────────┐
  │     시작하기            │ ← 메인 CTA
  └───────────────────────┘

  나중에 초대할게요 (건너뛰기)
```

**동작:**
- invitations INSERT (org_id, code, invited_by)
- "카카오톡으로 공유" → 카카오 공유 API or 웹 공유 API (navigator.share)
- "시작하기" 또는 "건너뛰기" → `/admin` 대시보드로 이동

---

## 4. 직원 초대 & 합류 UX

> 관점: UX 디자이너 — "직원이 초대 링크 하나로 30초 안에 합류할 수 있어야 한다"

### 4-1. 초대 링크 구조

```
https://[앱도메인]/join/A3X9K2
                        └── 6자리 영숫자 코드
```

**왜 6자리 코드인가:**
- 짧아서 구두로도 전달 가능 ("A3X9K2로 들어와")
- URL이 안 되는 상황(카카오 인앱 브라우저 문제) 대비 수동 입력 가능
- 7일 후 자동 만료 → 코드 재사용 부담 없음

### 4-2. 직원 합류 플로우

```
[카카오톡에서 초대 링크 클릭]
  ↓
/join/A3X9K2 페이지 로드
  ↓
코드 검증 (유효 + pending + 미만료)
  ├── 실패 → "초대 링크가 만료됐어요. 사장님에게 새 링크를 요청해 주세요."
  └── 성공 ↓

  "○○○ 사업장에서 초대했어요"

  [이미 계정이 있어요 → 로그인]
  [새로 가입하기 ↓]

  ┌───────────────────────┐
  │ 이메일                  │
  │ 비밀번호                │
  │ 이름                    │
  │ 전화번호                │
  └───────────────────────┘
  ☑ [필수] 동의 항목들

  [가입하고 합류하기]
  ↓

org_members INSERT (role: 'employee')
invitation.status → 'accepted'
  ↓

  [홈 화면 / 출퇴근 페이지]
```

**기존 `OnboardingFunnel.tsx` 연동:**
- 직원 가입 시 이름+전화번호는 가입 폼에서 받으므로 기존 온보딩 스텝 1은 스킵
- 보건증 업로드는 업종이 카페/식당인 경우에만 온보딩에서 안내 (필수 아닌 선택)
- 사장님이 나중에 `/admin/employees`에서 보건증 등록 요청 가능

### 4-3. 초대 코드 수동 입력 (링크가 안 될 때)

로그인 페이지 하단:
```
  ──────────────────────────
  초대받은 직원이신가요?
  [초대 코드 입력하기]
```

클릭 시:
```
  초대 코드를 입력해 주세요
  사장님에게 받은 6자리 코드예요

  ┌───────────────────────┐
  │ A 3 X 9 K 2            │  ← 각 칸 분리형 입력
  └───────────────────────┘

  [확인]
```

### 4-4. 사장님 측 초대 관리 (`/admin/employees` 탭 추가)

기존 `/admin/employees` 페이지에 "초대" 탭 추가:

```
[직원 목록]  [초대 관리]
                ↓
  활성 초대
  ┌─────────────────────────┐
  │ 🔗 A3X9K2 · 3일 남음     │
  │    [링크 복사]  [취소]    │
  └─────────────────────────┘

  + 새 초대 링크 만들기

  최근 합류
  ├ 김철수 · 3/20 합류
  └ 이영희 · 3/18 합류
```

---

# Part C. 기술 설계

## 5. 멀티테넌트 데이터 설계

> 관점: 데이터 아키텍트 — "기존 구조를 최소한으로 변경하면서 테넌트 격리를 달성"

### 5-1. 테넌트 모델: Shared DB + Row-Level Isolation

Supabase 환경에서 유일하게 현실적인 선택.
모든 테이블에 `org_id` 컬럼 추가 → RLS로 행 단위 격리.

### 5-2. 신규 테이블

#### `organizations` — 사업장(테넌트)

```sql
CREATE TABLE organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,                  -- "카페 봄날"
  slug        text UNIQUE NOT NULL,           -- URL용: "cafe-bomnal"
  category    text NOT NULL DEFAULT 'etc',    -- 'cafe' / 'restaurant' / 'etc'
  owner_id    uuid NOT NULL REFERENCES auth.users(id),
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
-- slug 생성: 한글 이름 → nanoid 6자리 fallback (예: "카페봄날" → "ab3k9x")
```

> `plan`, `max_members`는 여기에 두지 않음. 구독 정보는 `subscriptions` 테이블에서 단일 관리 (이중 소스 방지).

#### `org_members` — 조직 멤버십

```sql
CREATE TABLE org_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'employee',  -- 'owner' / 'manager' / 'employee'
  is_active   boolean NOT NULL DEFAULT true,
  joined_at   timestamptz DEFAULT now(),
  UNIQUE(org_id, profile_id)
);
```

**기존 `profiles.role`과의 관계:**
- `profiles.role`은 **폐기하지 않음** (하위호환)
- 신규 로직은 `org_members.role`을 참조
- 마이그레이션 후 `profiles.role`은 레거시로 유지 → Phase 2에서 제거

**기존 `employee_store_assignments`와의 관계:**
- `employee_store_assignments`는 **그대로 유지**
- 역할: "이 직원이 어느 매장에서 근무하는가" (조직 내 매장 배정)
- `org_members`: "이 사람이 어느 조직에 속하는가" (조직 멤버십)
- 계층: `organizations` → `stores` → `employee_store_assignments`

#### `invitations` — 초대

```sql
CREATE TABLE invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code        text UNIQUE NOT NULL,            -- 6자리 영숫자
  role        text NOT NULL DEFAULT 'employee',
  invited_by  uuid NOT NULL REFERENCES auth.users(id),
  accepted_by uuid REFERENCES auth.users(id),
  status      text NOT NULL DEFAULT 'pending', -- 'pending' / 'accepted' / 'expired' / 'cancelled'
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at  timestamptz DEFAULT now()
);
```

### 5-3. 기존 테이블 변경 — org_id 추가

| 테이블 | org_id 추가 | 비고 |
|--------|:-----------:|------|
| `stores` | ✅ | 핵심. 매장이 조직에 속함 |
| `attendance_logs` | ✅ | stores.org_id에서 파생 가능하지만, 성능/RLS 편의상 비정규화 |
| `weekly_schedules` | ✅ | 스케줄 컨테이너 |
| `schedule_slots` | ❌ | weekly_schedules JOIN으로 충분 (RLS는 weekly_schedules에서 걸러짐) |
| `notifications` | ✅ | 조직별 알림 격리 |
| `recipe_categories` | ✅ | |
| `recipe_items` | ✅ | |
| `announcements` | ✅ | |
| `overtime_requests` | ✅ | |
| `company_events` | ✅ | |
| `attendance_credits` | ✅ | |
| `substitute_requests` | ❌ | schedule_slots → weekly_schedules 경유 |
| `substitute_responses` | ❌ | substitute_requests 경유 |
| `recipe_ingredients` | ❌ | recipe_items 경유 |
| `recipe_steps` | ❌ | recipe_items 경유 |
| `recipe_comments` | ❌ | recipe_items 경유 |
| `announcement_reads` | ❌ | announcements 경유 |
| `profiles` | ❌ | org_members로 관리 (1인 다조직 지원) |

### 5-4. RLS 전환 설계

#### 헬퍼 함수

```sql
-- 현재 유저의 활성 조직 ID (MVP: 첫 번째 조직)
CREATE OR REPLACE FUNCTION get_active_org_id()
RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT org_id FROM org_members
  WHERE profile_id = auth.uid() AND is_active = true
  ORDER BY joined_at ASC
  LIMIT 1;
$$;

-- 현재 유저가 해당 조직의 owner/manager인가
CREATE OR REPLACE FUNCTION is_org_admin(target_org_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE profile_id = auth.uid()
      AND org_id = target_org_id
      AND role IN ('owner', 'manager')
      AND is_active = true
  );
$$;

-- 현재 유저가 해당 조직의 멤버인가
CREATE OR REPLACE FUNCTION is_org_member(target_org_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE profile_id = auth.uid()
      AND org_id = target_org_id
      AND is_active = true
  );
$$;
```

#### RLS 정책 전환 예시

**stores (현재 → 전환 후):**
```sql
-- 삭제
DROP POLICY IF EXISTS "누구나 조회" ON stores;
DROP POLICY IF EXISTS "Admin Bypass" ON stores;

-- 신규
CREATE POLICY "소속 조직 매장만 조회"
  ON stores FOR SELECT
  USING (org_id = get_active_org_id());

CREATE POLICY "조직 관리자만 변경"
  ON stores FOR ALL
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));
```

**profiles (특수 케이스):**
```sql
-- profiles에는 org_id가 없으므로, org_members를 통해 "같은 조직 동료"만 조회
CREATE POLICY "같은 조직 동료 조회"
  ON profiles FOR SELECT
  USING (
    id = auth.uid()  -- 본인
    OR
    id IN (
      SELECT om.profile_id FROM org_members om
      WHERE om.org_id = get_active_org_id() AND om.is_active = true
    )
  );
```

### 5-5. 인덱스 추가

```sql
-- org_id 필터가 모든 쿼리에 걸리므로 인덱스 필수
CREATE INDEX idx_stores_org ON stores(org_id);
CREATE INDEX idx_attendance_logs_org ON attendance_logs(org_id);
CREATE INDEX idx_weekly_schedules_org ON weekly_schedules(org_id);
CREATE INDEX idx_notifications_org ON notifications(org_id);
CREATE INDEX idx_org_members_profile ON org_members(profile_id);
CREATE INDEX idx_org_members_org ON org_members(org_id);
CREATE INDEX idx_invitations_code ON invitations(code) WHERE status = 'pending';
```

### 5-6. Realtime & Storage 격리

**Realtime:**
```ts
// 현재
supabase.channel('notifications').on('postgres_changes', { event: 'INSERT', ... })

// 전환 후 — org_id 필터 추가
supabase.channel('notifications').on('postgres_changes', {
  event: 'INSERT',
  schema: 'public',
  table: 'notifications',
  filter: `org_id=eq.${activeOrgId}`
})
```

**Storage (hr-documents):**
```
현재 경로:  {userId}/{prefix}_{timestamp}.{ext}
전환 후:    {orgId}/{userId}/{prefix}_{timestamp}.{ext}
```

Storage RLS도 `org_id` prefix 기반으로 전환.

---

## 6. 인증 & 보안 전환

> 관점: 보안 엔지니어 — "`@ygd.com` 패턴을 없애면서 기존 유저를 깨뜨리지 않기"

### 6-1. @ygd.com 마이그레이션 전략

**문제**: 기존 연경당 직원들은 `hong@ygd.com` 같은 가짜 이메일로 가입되어 있음. 이걸 실제 이메일로 바꿔야 하나?

**결정: 이원화 (호환 모드)**

```
기존 유저 (@ygd.com): 기존 방식 그대로 로그인 가능
신규 유저 (실제 이메일): 새 방식으로 가입/로그인
```

**구현:**
```
로그인 페이지:
  ├── 이메일 형식 입력 → 실제 이메일로 Supabase Auth
  └── 아이디만 입력 (@ 없음) → 자동으로 @ygd.com 붙여서 기존 방식

  감지 로직:
  - 입력값에 '@' 포함 → 실제 이메일
  - 입력값에 '@' 없음 → `${input}@ygd.com` 으로 변환 (레거시 모드)
```

**왜 이 방법인가:**
- 기존 연경당 직원들의 로그인이 깨지지 않음
- Supabase Auth 데이터 마이그레이션 불필요 (auth 스키마 직접 수정은 위험)
- 연경당 사장님(정표)이 원하면 나중에 실제 이메일로 전환 가능
- 신규 SaaS 고객은 처음부터 실제 이메일 사용

### 6-2. 미들웨어 전환

```ts
// 현재 middleware.ts
if (!user && !pathname.startsWith("/login")) → /login 리다이렉트
if (user && pathname.startsWith("/admin") && role !== 'admin') → / 리다이렉트

// 전환 후
const publicPaths = ['/login', '/signup', '/join', '/pricing', '/terms', '/privacy'];

if (!user && !isPublicPath(pathname)) → /login 리다이렉트

if (user) {
  const orgMember = await getOrgMember(user.id);

  if (!orgMember && !pathname.startsWith('/onboarding')) {
    // 가입했지만 조직 없음 → 온보딩으로
    → /onboarding 리다이렉트
  }

  if (pathname.startsWith('/admin') && orgMember?.role === 'employee') {
    → / 리다이렉트
  }
}
```

### 6-3. 역할 체계

```
현재:  profiles.role = 'admin' | 'employee'  (글로벌)
전환:  org_members.role = 'owner' | 'manager' | 'employee'  (조직별)
```

| 역할 | 대시보드 | 직원관리 | 스케줄편집 | 출퇴근관리 | 결제/설정 |
|------|:--------:|:--------:|:--------:|:--------:|:--------:|
| owner | ✅ | ✅ | ✅ | ✅ | ✅ |
| manager | ✅ | 조회만 | ✅ | ✅ | ❌ |
| employee | ❌ | ❌ | ❌ | 본인만 | ❌ |

**MVP에서는 owner/employee 2가지만 사용. manager는 Phase 2.**

### 6-4. 보안 체크리스트

- [ ] 모든 RLS 정책이 org_id 기반으로 전환되었는가
- [ ] Service Role Key 사용 코드(`notifications.ts`)에서 org_id 필터가 빠지지 않았는가
- [ ] 초대 코드가 brute force에 안전한가 (6자리 영숫자 = 약 21억 조합, rate limit 필수)
- [ ] `get_active_org_id()` 가 NULL을 반환하는 경우 (조직 미가입 유저) RLS가 차단하는가
- [ ] Storage 경로에 다른 org의 파일 접근이 불가능한가

---

## 7. 프론트엔드 전환 계획

> 관점: 프론트엔드 엔지니어 — "기존 URL을 깨뜨리지 않으면서 퍼블릭 페이지를 추가"

### 7-1. 라우트 변경 원칙

**기존 직원 영역 URL은 유지한다.** (`/`, `/calendar`, `/store`, `/my`)
- PWA 홈 화면에 추가한 기존 유저의 앱이 깨지지 않음
- 랜딩페이지는 별도 경로(`/landing` 또는 서브도메인)

**변경 계획:**

```
추가되는 퍼블릭 경로:
  /signup              ← 사장님 가입
  /join/:code          ← 직원 초대 수락
  /onboarding          ← 사장님 온보딩
  /pricing             ← 요금제 안내
  /terms               ← 이용약관
  /privacy             ← 개인정보처리방침

기존 경로 (변경 없음):
  /login               ← 로그인 (이메일 전환 + @ygd.com 호환)
  /                    ← 홈 (로그인 시 직원 홈, 비로그인 시 랜딩페이지)
  /calendar            ← 직원 스케줄
  /store               ← 매장 (공지/레시피)
  /my                  ← 마이페이지
  /admin/**            ← 관리자 영역
```

**`/` 경로의 분기 처리:**
```
/ 접속
  ├── 로그인됨 → 기존 HomeClient 렌더링 (변경 없음)
  └── 비로그인 → 랜딩페이지 렌더링
```

이렇게 하면 기존 직원들의 PWA 바로가기, 북마크가 모두 정상 동작.

### 7-2. 쿼리 변경 패턴

RLS가 자동으로 org_id 필터를 적용하므로, **프론트엔드 쿼리 변경은 최소화.**

```ts
// 현재 — 변경 불필요 (RLS가 걸러줌)
supabase.from('stores').select('*')

// 단, INSERT 시에는 org_id 명시 필요
supabase.from('stores').insert({
  name: '...',
  org_id: activeOrgId,  // ← 추가
  ...
})
```

**activeOrgId 전달 방식:**
- React Context로 관리 (`OrgProvider`)
- 미들웨어에서 org_id를 쿠키에 저장 → 서버 컴포넌트에서도 접근 가능
- `useOrg()` 훅으로 client component에서 접근

```ts
// src/lib/org-context.tsx (신규)
const OrgContext = createContext<{ orgId: string; role: string } | null>(null);
export const useOrg = () => useContext(OrgContext);
```

### 7-3. 기존 `is_admin()` → `is_org_admin()` 전환

현재 코드에서 admin 체크하는 패턴:
```ts
// 현재 패턴 — middleware에서 profiles.role === 'admin' 체크
if (profile?.role !== "admin") redirect("/");
```

전환 후:
```ts
// org_members.role 기반 체크
if (!orgMember || orgMember.role === 'employee') redirect("/");
```

**영향받는 파일:**
- `middleware.ts` — admin 라우트 가드
- `HomeClient.tsx` — admin 대시보드 링크 표시 조건
- `MyPage` — admin 메뉴 표시 조건
- 모든 admin 페이지 — 암묵적으로 middleware에서 보호됨

### 7-4. 랜딩페이지 (`/` 비로그인 시)

```
┌────────────────────────────────────┐
│ [Nav] 로고  ·  기능  ·  가격  ·  [로그인]  [무료 시작] │
├────────────────────────────────────┤
│                                      │
│  알바 출퇴근,                         │
│  아직 카톡으로 확인하세요?              │
│                                      │
│  GPS 기반 자동 기록. 조작 불가.         │
│  무료로 3명까지 관리하세요.             │
│                                      │
│  [무료로 시작하기]                     │
│                                      │
├────────────────────────────────────┤
│ "매달 17만원이 새고 있을 수 있어요"     │
│  출퇴근 조작 / 주휴수당 오계산 / 초과근무  │
├────────────────────────────────────┤
│ 핵심 기능 3가지 (스크린샷)              │
│  📍 GPS 출퇴근  📅 스케줄  🔔 실시간 알림 │
├────────────────────────────────────┤
│ 요금제 (Free / Basic / Pro)            │
├────────────────────────────────────┤
│ "3분이면 시작할 수 있어요"              │
│ [무료로 시작하기]                       │
├────────────────────────────────────┤
│ Footer: 약관 · 개인정보 · 문의           │
└────────────────────────────────────┘
```

---

# Part D. 부가 시스템

## 8. 급여 계산 시스템

> 관점: 도메인 전문가 (노무) — "한국 노동법에 맞는 급여 계산"

### 8-1. 계산 공식 (근로기준법 기반)

#### 기본급
```
기본급 = 시급(profiles.hourly_wage) × 총 근무시간
총 근무시간 = Σ(퇴근시각 - 출근시각) from attendance_logs
```

#### 주휴수당 (근로기준법 제55조)
```
조건: 주 소정근로시간 15시간 이상 + 해당 주 개근
금액 = 시급 × (주 소정근로시간 / 40) × 8시간

예시: 시급 10,030원, 주 20시간 근무, 개근
     → 10,030 × (20/40) × 8 = 40,120원/주
```

#### 야간근로수당 (근로기준법 제56조)
```
22:00~06:00 근무 시간에 대해 통상시급의 50% 가산
야간수당 = 시급 × 0.5 × 야간근무시간

주의: 5인 미만 사업장은 야간수당 지급 의무 없음
→ organizations에 employee_count or 사업장 규모 필드 필요
```

#### 연장근로수당
```
1일 8시간 또는 1주 40시간 초과 시 50% 가산
연장수당 = 시급 × 0.5 × 연장근무시간

주의: 5인 미만 사업장은 연장수당 지급 의무 없음
```

#### 공제
```
3.3% 원천징수 (profiles.insurance_type = '3.3'):
  공제액 = (기본급 + 수당) × 3.3%

4대보험 (profiles.insurance_type = 'national'):
  국민연금: 4.5%
  건강보험: 3.545%
  장기요양: 건강보험료 × 12.81%
  고용보험: 0.9%
  총 공제율: 약 9.4%
```

### 8-2. 신규 테이블

```sql
CREATE TABLE payroll_records (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organizations(id),
  profile_id       uuid NOT NULL REFERENCES auth.users(id),
  year_month       text NOT NULL,              -- '2026-03'
  total_minutes    integer NOT NULL,           -- 총 근무시간(분 단위, 정밀도 위해)
  base_pay         integer NOT NULL DEFAULT 0, -- 기본급 (원)
  weekly_holiday   integer NOT NULL DEFAULT 0, -- 주휴수당
  overtime_pay     integer NOT NULL DEFAULT 0, -- 연장근무수당
  night_pay        integer NOT NULL DEFAULT 0, -- 야간수당
  gross_pay        integer NOT NULL DEFAULT 0, -- 세전 총액
  deduction        integer NOT NULL DEFAULT 0, -- 공제액
  net_pay          integer NOT NULL DEFAULT 0, -- 실수령액
  insurance_type   text NOT NULL,              -- '3.3' / 'national'
  status           text NOT NULL DEFAULT 'draft', -- 'draft' / 'confirmed' / 'sent'
  memo             text,                       -- 사장님 메모
  confirmed_at     timestamptz,
  created_at       timestamptz DEFAULT now(),
  UNIQUE(org_id, profile_id, year_month)
);
```

### 8-3. 계산 플로우

```
사장님이 /admin/payroll 접속
  ↓
"2026년 3월 급여 계산하기" 클릭
  ↓
해당 월의 attendance_logs + overtime_requests 자동 집계
  ↓
직원별 기본급 + 수당 자동 산출 → payroll_records (draft) 생성
  ↓
사장님이 결과 확인
  ├── 수정이 필요하면 금액 직접 수정 가능 (memo에 사유 기록)
  └── "확정하기" → status: confirmed
         ↓
       직원에게 "이번 달 급여가 확정됐어요" 알림
       직원이 /my에서 급여 내역 확인 가능
```

### 8-4. 구현 우선순위

**Phase 2-A (기본):**
- 근무시간 자동 집계 (attendance_logs 기반)
- 기본급 계산 (시급 × 시간)
- 3.3% 공제
- draft → confirmed 플로우

**Phase 2-B (수당):**
- 주휴수당 자동 계산
- 야간수당 / 연장수당
- 4대보험 공제
- 급여 명세서 PDF 생성

---

## 9. 결제 & 구독

> 관점: 비즈니스 엔지니어 — "MVP는 무료. 결제는 유저가 모인 후에."

### 9-1. 요금제 구조

| 플랜 | 가격 | 직원 수 | 포함 기능 |
|------|------|---------|----------|
| **Free** | 0원 | 3명 이하 | 출퇴근, 스케줄, 알림, 공지, 레시피 |
| **Basic** | 9,900원/월 | 10명 이하 | Free + 급여 계산, 근무 통계 |
| **Pro** | 29,000원/월 | 무제한 | Basic + 급여 명세서, 다중 매장, 우선 지원 |

연간 결제: 2개월 할인 (Basic 99,000원/년, Pro 290,000원/년)

### 9-2. 신규 테이블

```sql
CREATE TABLE subscriptions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid UNIQUE NOT NULL REFERENCES organizations(id),
  plan                  text NOT NULL DEFAULT 'free',     -- 'free'/'basic'/'pro'
  status                text NOT NULL DEFAULT 'active',   -- 'active'/'past_due'/'cancelled'
  billing_cycle         text NOT NULL DEFAULT 'monthly',  -- 'monthly'/'yearly'
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  toss_customer_key     text,
  toss_billing_key      text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE TABLE billing_history (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organizations(id),
  subscription_id   uuid REFERENCES subscriptions(id),
  amount            integer NOT NULL,           -- 결제 금액 (원)
  status            text NOT NULL,              -- 'paid'/'failed'/'refunded'
  toss_payment_key  text,
  description       text,
  paid_at           timestamptz,
  created_at        timestamptz DEFAULT now()
);
```

### 9-3. 토스페이먼츠 연동 플로우

```
[사장님: 유료 전환 클릭]
  ↓
토스페이먼츠 결제창 (카드 정보 입력)
  ↓
빌링키 발급 → subscriptions.toss_billing_key 저장
  ↓
첫 결제 실행 → billing_history INSERT
  ↓
subscriptions.plan 업데이트 + 기간 설정
  ↓
매월 자동결제:
  Vercel Cron (매일 00:00) → 만료 임박 구독 조회
  → 토스 빌링 API 호출
  → 성공: 기간 연장 + billing_history 기록
  → 실패: status → 'past_due' + 사장님에게 알림
```

### 9-4. 미납 처리

| 시점 | 동작 |
|------|------|
| 결제일 | 자동 결제 시도 |
| +1일 | 재시도 + 인앱 알림 |
| +3일 | 재시도 + 푸시 알림 |
| +7일 | 유료 기능 잠금 (출퇴근은 유지) |
| +30일 | Free 다운그레이드 (3명 초과 직원 비활성화) |

### 9-5. MVP에서는?

**결제 없이 전체 무료로 베타 운영.**
- `subscriptions` 테이블은 미리 만들되, plan은 전부 'free'
- 기능 제한 로직은 코드에 미리 심어두되, 베타 기간 동안 비활성
- 유저 10~20명 확보 후 유료 전환 (D+45 목표)

---

## 10. 법적 준비

> 관점: 법률 자문 — "`legal-risks.md` 기반, 베타 공개 전 필수 조치"

### 10-1. 베타 공개 전 필수 (반나절 소요)

| 항목 | 내용 | 난이도 |
|------|------|--------|
| 방통위 위치기반서비스 신고 | 온라인 30분. GPS 수집 시 법적 의무 | 하 |
| 개인정보처리방침 작성 | `/privacy` 페이지. 템플릿 활용 | 하 |
| 이용약관 작성 | `/terms` 페이지. "근태 기록의 법적 책임은 사업자에게 있음" 명시 | 하 |
| 위치정보 동의 | 가입 시 체크박스. 이미 있으나 문구 보강 필요 | 하 |

### 10-2. 유료 전환 시 추가

| 항목 | 내용 |
|------|------|
| 사업자 등록 | 전자상거래 사업자 등록 |
| 전자결제대행(PG) | 토스페이먼츠 가맹점 등록 |
| 통신판매업 신고 | 유료 서비스 판매 시 필수 |

### 10-3. 주의사항

- "세무 처리 대행" 표현 금지 (세무사법 위반)
- "급여 계산" / "급여 자동 산출"은 합법
- 직원 위치 정보는 출퇴근 시점에만 1회 수집, 실시간 추적 아님을 명시

---

# Part E. 실행

## 11. 마이그레이션 실행 계획

> 관점: DevOps — "기존 연경당 서비스를 중단하지 않으면서 전환"

### 11-1. 연경당 → 테넌트 #1 변환

```
Phase A: 테이블 추가 (서비스 영향 없음)
  1. organizations, org_members, invitations, subscriptions 테이블 CREATE
  2. organizations INSERT: name='연경당', owner_id=(정표 admin user)
  3. 기존 profiles → org_members 매핑:
     - profiles.role='admin' → org_members.role='owner'
     - profiles.role='employee' → org_members.role='employee'
  4. subscriptions INSERT: org_id=(연경당), plan='free'

Phase B: org_id 컬럼 추가 (서비스 영향 없음)
  5. 모든 대상 테이블에 org_id 컬럼 추가 (nullable, FK)
  6. 기존 데이터 백필: UPDATE stores SET org_id='(연경당 org id)';
     - attendance_logs, weekly_schedules, notifications 등 모두 동일
  7. 인덱스 생성

Phase C: 프론트엔드 전환 (이 시점에서 deploy)
  8. 로그인 페이지: 이메일 + @ygd.com 호환 모드
  9. 미들웨어: org 체크 추가
  10. OrgProvider 추가, INSERT 쿼리에 org_id 추가
  11. 새 라우트 추가 (/signup, /join, /onboarding, /pricing, /terms, /privacy)
  12. / 경로: 비로그인 → 랜딩, 로그인 → 기존 홈

Phase D: RLS 전환 (가장 위험 — Dev에서 철저히 테스트 후)
  13. Dev DB에서 신규 RLS 정책 생성 + 기존 정책 삭제
  14. 모든 기능 수동 테스트 (체크리스트 기반)
  15. org_id NOT NULL 전환
  16. Production 반영

Phase E: 정리
  17. profiles.role 참조하는 코드 → org_members.role로 전환 완료
  18. 하드코딩된 "연경당" 텍스트 제거
```

### 11-2. 다운타임 최소화 원칙

- Phase A~B: 기존 코드에 영향 없음 (컬럼 추가 + nullable)
- Phase C: 프론트엔드 배포. 기존 기능은 동일하게 동작 (org_id는 nullable이므로)
- Phase D: RLS만 전환. **Dev에서 100% 테스트 후** Production 적용
- Phase E: 코드 정리. 기능 영향 없음

### 11-3. 기존 기능 보존 테스트 체크리스트

SaaS 전환 후 연경당 기능이 모두 정상인지 확인:

- [ ] GPS 출퇴근 (일반/원격/출장/수동)
- [ ] 실시간 알림 (인앱 + 푸시)
- [ ] 주간 스케줄 조회/편집/전주복사
- [ ] 대타 요청/수락/거절
- [ ] 추가근무 인정/넘김
- [ ] 레시피 CRUD + 댓글
- [ ] 공지사항 CRUD + 읽음 표시
- [ ] 크레딧/티어/스트릭
- [ ] 오픈/마감 체크리스트
- [ ] 직원 서류 관리 (보건증, 계약서 등)
- [ ] PWA 설치 + 홈 화면 바로가기
- [ ] 직원 정보 수정 (어드민 + 본인)
- [ ] 매장별 설정 (추가근무 단위, 색상)

---

## 12. 실행 로드맵 & 미결 사항

### 12-1. 로드맵

#### Phase 1 — 멀티테넌트 기반 (2주)

**Week 1: DB + 인증**
- [ ] organizations, org_members, invitations, subscriptions 테이블
- [ ] 기존 테이블 org_id 컬럼 추가 + 연경당 데이터 백필
- [ ] RLS 헬퍼 함수 (get_active_org_id, is_org_admin, is_org_member)
- [ ] 로그인 전환 (이메일 + @ygd.com 호환)
- [ ] OrgProvider + useOrg() 훅

**Week 2: 가입 + 온보딩 + 초대**
- [ ] /signup (사장님 가입)
- [ ] /onboarding (사업장 등록 → 매장 위치 → 직원 초대)
- [ ] 카카오 주소 API 연동
- [ ] /join/:code (직원 초대 수락)
- [ ] 미들웨어 전환 (org 체크)
- [ ] RLS 정책 전환 (Dev 테스트 → Production 적용)

#### Phase 2 — 퍼블릭 + 마무리 (1주)

**Week 3: 랜딩 + 법적 + 정리**
- [ ] / 랜딩페이지 (비로그인)
- [ ] /pricing, /terms, /privacy 페이지
- [ ] 방통위 위치기반서비스 신고
- [ ] 하드코딩된 "연경당" 텍스트 제거 (앱 이름 확정 전제)
- [ ] PWA manifest 교체
- [ ] org_id NOT NULL 전환
- [ ] 기존 기능 보존 테스트 전체 통과
- [ ] **베타 오픈**

#### Phase 3 — 급여 + 결제 (2주, 베타 운영 중)

**Week 4~5:**
- [ ] payroll_records 테이블 + 급여 계산 엔진
- [ ] /admin/payroll UI
- [ ] 토스페이먼츠 연동
- [ ] 요금제 관리 UI
- [ ] 유료 전환

#### Phase 4 — 성장 (이후)
- 카카오 로그인 / 전화번호 OTP
- manager 역할
- 멀티 조직 지원 (1인 다조직)
- 급여 명세서 PDF
- 앱스토어 래핑

### 12-2. 미결 사항 — 결정 필요

| 항목 | 현재 상태 | 필요한 결정 | 데드라인 |
|------|-----------|------------|----------|
| **앱 이름** | 출근이요 vs 퇴근이요 (`naming.md`) | 최종 1개 확정 | Week 3 시작 전 |
| **도메인** | 미정 | 앱 이름 확정 후 구매 | Week 3 시작 전 |
| **카카오맵 API** | 미발급 | API 키 발급 (사업자 등록 불필요, 개인도 가능) | Week 2 시작 전 |
| **가격** | 9,900원 vs 19,800원 | 9,900원 잠정 확정 — 베타 후 조정 | Phase 3 시작 전 |
| **5인 미만 수당** | 야간/연장 수당 면제 여부 | organizations에 사업장 규모 필드 추가? | Phase 3 |

### 12-3. 기존 strategy 문서와의 정합

| 기존 문서 | 이 문서에서의 처리 |
|-----------|-------------------|
| `saas-market-analysis.md` 가격 (19,800~29,000원) | Free/9,900원/29,000원 3단계로 재정리 |
| `saas-market-analysis.md` 4주 로드맵 | 현실적으로 3주(베타) + 2주(급여/결제)로 조정 |
| `pricing-and-messaging.md` 카피 | 랜딩페이지 섹션 9에서 활용 |
| `legal-risks.md` | 섹션 10에 통합, 로드맵 Week 3에 반영 |
| `naming.md` | 미결 사항으로 유지 — Week 3 데드라인 설정 |
