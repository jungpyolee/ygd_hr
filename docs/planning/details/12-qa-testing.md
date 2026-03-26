# 12. QA & 테스트 전략

> **작성일**: 2026-03-25
> **대상**: 출첵 SaaS 멀티테넌트 전환 전체 테스트 계획
> **현황**: 자동화 테스트 일부 존재 (Vitest + Testing Library), 대부분 수동 테스트
> **제약**: 1인 개발, 제한된 시간/리소스

---

## 1. 테스트 전략 개요

### 1-1. 원칙: 비용 대비 효과가 높은 테스트에 집중

1인 개발 환경에서 모든 코드에 테스트를 작성하는 것은 비현실적이다.
**데이터 유출이 치명적인 영역**과 **돈이 걸린 계산 로직**에 자동화 테스트를 집중하고,
나머지는 체계적인 수동 테스트 체크리스트로 커버한다.

```
[자동화 필수]                    [자동화 권장]               [수동 테스트]
━━━━━━━━━━━━━━                ━━━━━━━━━━━━              ━━━━━━━━━━━
RLS 데이터 격리               E2E 핵심 플로우            UI 디자인/레이아웃
급여 계산 정확성               인증 플로우                PWA 설치/업데이트
크레딧 엔진 로직               초대 코드 수락             디바이스별 호환성
순수 유틸 함수                 미들웨어 라우팅             GPS 출퇴근
```

### 1-2. 자동화 우선순위

| 우선순위 | 영역 | 도구 | 이유 |
|---------|------|------|------|
| **P0 (필수)** | RLS 데이터 격리 | Vitest + Supabase API | 데이터 유출 = 사업 종료급 사고 |
| **P0 (필수)** | 급여 계산 | Vitest (순수 함수) | 돈 관련 오류 = 법적 분쟁 가능 |
| **P0 (필수)** | 크레딧 엔진 | Vitest (순수 함수) | 점수 오류 = 사용자 신뢰 손실 |
| **P1 (권장)** | 인증 플로우 | Vitest + Supabase API | 로그인 실패 = 서비스 사용 불가 |
| **P1 (권장)** | E2E 핵심 플로우 | Playwright | 전체 사용자 여정 검증 |
| **P2 (여유 시)** | 컴포넌트 단위 | Vitest + Testing Library | 기존 recipe.test.tsx 패턴 확장 |
| **P2 (여유 시)** | API 라우트 | Vitest | 서버 액션 정상 동작 |

### 1-3. 기존 테스트 인프라 현황

```
vitest.config.ts          # UI 컴포넌트용 (jsdom, @testing-library)
vitest.config.db.ts       # DB 통합 테스트용 (node, .env.local 로드)
src/__tests__/
  setup.ts                # jsdom 환경 보완 (createObjectURL, crypto)
  recipe.test.tsx         # 레시피 유틸/컴포넌트 테스트 (기존)
  db/
    helpers.ts            # Supabase RLS 테스트 헬퍼 (유저 생성/삭제/로그인)
    rls.test.ts           # Production RLS 통합 테스트 (기존 — 단일 테넌트)
```

**package.json 스크립트:**
```bash
npm run test              # vitest run (UI 테스트)
npm run test:watch        # vitest (watch 모드)
npm run test:db           # vitest run --config vitest.config.db.ts (DB 통합)
```

**의존성 (이미 설치됨):**
- `vitest` ^4.1.0
- `@testing-library/react` ^16.3.2
- `@testing-library/jest-dom` ^6.9.1
- `@testing-library/user-event` ^14.6.1
- `@vitejs/plugin-react` ^6.0.1
- `jsdom` ^29.0.0

---

## 2. RLS 데이터 격리 테스트 (P0 -- 최우선)

### 2-1. 테스트 설계 원칙

멀티테넌트 전환에서 가장 치명적인 버그는 **조직 간 데이터 유출**이다.
모든 테이블에 대해 다음 3가지를 반드시 검증해야 한다.

```
1. 조직A의 owner  → 조직B의 데이터에 접근 불가
2. 조직A의 employee → 같은 조직 내 다른 직원의 민감 정보 접근 불가
3. master           → 모든 조직의 데이터 접근 가능
```

### 2-2. 테스트 환경 구성

기존 `src/__tests__/db/helpers.ts`를 확장해 멀티테넌트용 헬퍼를 추가한다.

```
src/__tests__/db/
  helpers.ts                   # 기존 + 멀티테넌트 확장
  rls.test.ts                  # 기존 단일 테넌트 RLS (유지)
  rls-multi-tenant.test.ts     # 신규: 멀티테넌트 격리 테스트
  rls-payroll.test.ts          # 신규: 급여 관련 RLS
  rls-master.test.ts           # 신규: master 권한 테스트
```

### 2-3. 테스트 데이터 시딩

```typescript
// 테스트 시작 시 생성하는 데이터 구조
const SEED = {
  // 조직 A: "테스트카페A"
  orgA: {
    id: '',
    slug: 'test-cafe-a',
    ownerId: '',           // orgA의 사장님
    employeeId: '',        // orgA의 직원
    storeId: '',
    scheduleId: '',
    attendanceLogId: '',
    payrollPeriodId: '',
  },
  // 조직 B: "테스트카페B"
  orgB: {
    id: '',
    slug: 'test-cafe-b',
    ownerId: '',           // orgB의 사장님
    employeeId: '',        // orgB의 직원
    storeId: '',
  },
  // master
  masterId: '',
};
```

### 2-4. 테이블별 RLS 검증 매트릭스

모든 테이블에 대해 아래 패턴을 반복 적용한다.

| 테이블 | orgA owner | orgA employee | orgB owner | orgB employee | master |
|--------|-----------|---------------|-----------|---------------|--------|
| `organizations` | 자기 조직만 SELECT | 자기 조직만 SELECT | 자기 조직만 SELECT | 자기 조직만 SELECT | 전체 SELECT |
| `organization_memberships` | 자기 조직 ALL | 자기 조직 SELECT | 자기 조직 ALL | 자기 조직 SELECT | 전체 ALL |
| `stores` | 자기 조직 ALL | 자기 조직 SELECT | 자기 조직 ALL | 자기 조직 SELECT | 전체 ALL |
| `attendance_logs` | 자기 조직 ALL | 본인만 INSERT, 자기 조직 SELECT | orgA 불가 | orgA 불가 | 전체 ALL |
| `payroll_periods` | 자기 조직 ALL | 자기 조직 SELECT | orgA 불가 | orgA 불가 | 전체 ALL |
| `payroll_entries` | 자기 조직 ALL | 본인만 SELECT | orgA 불가 | orgA 불가 | 전체 ALL |
| `notifications` | 자기 조직 ALL | 본인만 SELECT | orgA 불가 | orgA 불가 | 전체 ALL |
| `recipe_categories` | 자기 조직 ALL | 자기 조직 SELECT | orgA 불가 | orgA 불가 | 전체 ALL |
| `recipe_items` | 자기 조직 ALL | 공개만 SELECT | orgA 불가 | orgA 불가 | 전체 ALL |
| `tenant_invites` | 자기 조직 ALL | 불가 | orgA 불가 | 불가 | 전체 ALL |
| `audit_logs` | 자기 조직 SELECT | 불가 | orgA 불가 | 불가 | 전체 ALL |
| `weekly_schedules` | 자기 조직 ALL | 자기 조직 SELECT | orgA 불가 | orgA 불가 | 전체 ALL |
| `schedule_slots` | 자기 조직 ALL | 자기 조직 SELECT | orgA 불가 | orgA 불가 | 전체 ALL |
| `substitute_requests` | 자기 조직 ALL | 자기 조직 SELECT/INSERT | orgA 불가 | orgA 불가 | 전체 ALL |
| `attendance_credits` | 자기 조직 SELECT | 본인만 SELECT | orgA 불가 | orgA 불가 | 전체 SELECT |
| `profiles` | 자기 조직 멤버 SELECT | 자기 조직 멤버 SELECT(제한) | orgA 직원 불가 | orgA 직원 불가 | 전체 ALL |

### 2-5. SQL 기반 테스트 스크립트

DB 레벨에서 직접 검증할 수 있는 SQL 스크립트. Dev DB에서 실행한다.

```sql
-- ============================================================
-- RLS 격리 테스트 스크립트 (Dev DB)
-- ============================================================

-- [준비] 테스트용 조직/사용자 확인
-- 이 스크립트는 테스트 시딩 후 실행한다.

-- 1. 조직A owner로 조직B 매장 조회 시도 → 0건 기대
SET request.jwt.claim.sub = '{orgA_owner_id}';
SELECT COUNT(*) AS should_be_zero
FROM stores
WHERE organization_id = '{orgB_id}';

-- 2. 조직A employee로 조직A 급여 상세 조회 → 본인 것만
SET request.jwt.claim.sub = '{orgA_employee_id}';
SELECT COUNT(*) AS should_be_one
FROM payroll_entries
WHERE organization_id = '{orgA_id}'
  AND profile_id = '{orgA_employee_id}';

-- 3. 조직A employee로 조직A 다른 직원 급여 조회 → 0건 기대
SET request.jwt.claim.sub = '{orgA_employee_id}';
SELECT COUNT(*) AS should_be_zero
FROM payroll_entries
WHERE organization_id = '{orgA_id}'
  AND profile_id != '{orgA_employee_id}';

-- 4. master로 전체 조직 데이터 접근 → N건 기대
SET request.jwt.claim.sub = '{master_id}';
SELECT COUNT(*) AS should_be_all FROM organizations;

-- 5. 조직B owner로 조직A 직원 출퇴근 기록 조회 → 0건 기대
SET request.jwt.claim.sub = '{orgB_owner_id}';
SELECT COUNT(*) AS should_be_zero
FROM attendance_logs
WHERE organization_id = '{orgA_id}';

-- 6. 조직A employee로 조직A tenant_invites 조회 → 0건 기대 (owner만 가능)
SET request.jwt.claim.sub = '{orgA_employee_id}';
SELECT COUNT(*) AS should_be_zero
FROM tenant_invites
WHERE organization_id = '{orgA_id}';

-- 7. 조직A owner로 audit_logs INSERT 시도 → 불가 (시스템만 작성)
SET request.jwt.claim.sub = '{orgA_owner_id}';
INSERT INTO audit_logs (organization_id, actor_id, action)
VALUES ('{orgA_id}', '{orgA_owner_id}', 'test_action');
-- 기대: RLS 위반 에러 또는 INSERT 정책 없음

-- 8. 조직A employee로 다른 조직원 profiles.phone 조회
SET request.jwt.claim.sub = '{orgA_employee_id}';
SELECT phone FROM profiles WHERE id = '{orgB_employee_id}';
-- 기대: 빈 결과 (RLS 차단)
```

### 2-6. Vitest 기반 멀티테넌트 RLS 테스트 구조

```typescript
// src/__tests__/db/rls-multi-tenant.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";

describe("멀티테넌트 RLS 데이터 격리", () => {
  // beforeAll: 2개 조직 + 4명 사용자 + 테스트 데이터 생성

  describe("조직 간 격리 (Cross-Org Isolation)", () => {
    it("orgA owner가 orgB stores를 조회하면 0건이다", async () => {});
    it("orgA owner가 orgB attendance_logs를 조회하면 0건이다", async () => {});
    it("orgA owner가 orgB payroll_periods를 조회하면 0건이다", async () => {});
    it("orgA owner가 orgB schedule_slots를 조회하면 0건이다", async () => {});
    it("orgA owner가 orgB recipe_items를 조회하면 0건이다", async () => {});
    it("orgA owner가 orgB notifications를 조회하면 0건이다", async () => {});
    it("orgA owner가 orgB tenant_invites를 조회하면 0건이다", async () => {});
    it("orgA employee가 orgB stores를 조회하면 0건이다", async () => {});
  });

  describe("조직 내 권한 (Intra-Org Permissions)", () => {
    it("employee가 같은 조직 다른 직원의 payroll_entries를 조회하면 0건이다", async () => {});
    it("employee가 tenant_invites를 조회하면 0건이다", async () => {});
    it("employee가 audit_logs를 조회하면 0건이다", async () => {});
    it("employee가 attendance_logs에 타인 ID로 INSERT하면 실패한다", async () => {});
    it("owner가 자기 조직 직원의 attendance_logs를 조회할 수 있다", async () => {});
    it("owner가 자기 조직 payroll을 관리할 수 있다", async () => {});
  });

  describe("master 전체 접근 (Master Bypass)", () => {
    it("master가 orgA의 모든 데이터를 조회할 수 있다", async () => {});
    it("master가 orgB의 모든 데이터를 조회할 수 있다", async () => {});
    it("master가 organizations 전체를 조회할 수 있다", async () => {});
    it("master가 모든 profiles를 조회할 수 있다", async () => {});
    it("master가 system-level audit_logs를 작성할 수 있다", async () => {});
  });

  describe("소프트 삭제 후 접근 차단", () => {
    it("terminated 상태 멤버가 조직 데이터를 조회하면 0건이다", async () => {});
    it("suspended 상태 멤버가 조직 데이터를 조회하면 0건이다", async () => {});
  });

  // afterAll: 생성한 테스트 데이터 전부 정리
});
```

### 2-7. RLS 테스트 실행 방법

```bash
# Dev DB 대상 실행 (기본)
npm run test:db

# 특정 파일만 실행
npx vitest run --config vitest.config.db.ts src/__tests__/db/rls-multi-tenant.test.ts

# verbose 모드
npx vitest run --config vitest.config.db.ts --reporter=verbose
```

---

## 3. 인증 플로우 테스트 (P1)

### 3-1. 이메일 가입/로그인

| # | 시나리오 | 기대 결과 | 자동화 |
|---|---------|----------|--------|
| A-01 | 신규 이메일 회원가입 | profiles 자동 생성, /create-organization 또는 /join 이동 | Vitest |
| A-02 | 이메일 로그인 (올바른 비밀번호) | JWT 발급, 조직 기반 리다이렉트 | Vitest |
| A-03 | 이메일 로그인 (잘못된 비밀번호) | 에러 메시지 표시, 로그인 차단 | Vitest |
| A-04 | 중복 이메일 가입 시도 | "이미 가입된 이메일이에요" 에러 | Vitest |
| A-05 | 빈 이메일/비밀번호 입력 | 인라인 유효성 에러 | 수동 |
| A-06 | 비밀번호 6자 미만 | "비밀번호를 6자 이상 입력해주세요" | 수동 |

### 3-2. 카카오 OAuth

| # | 시나리오 | 기대 결과 | 자동화 |
|---|---------|----------|--------|
| A-07 | 카카오 첫 로그인 (신규) | 카카오 인증 → callback → profiles 생성 → 온보딩 | 수동 |
| A-08 | 카카오 재로그인 (기존) | 카카오 인증 → callback → 조직 리다이렉트 | 수동 |
| A-09 | 카카오 앱 미설치 (웹 폴백) | 카카오 웹 로그인 화면 표시 | 수동 |
| A-10 | 카카오 인증 취소 | 로그인 화면으로 복귀, 에러 토스트 | 수동 |

### 3-3. Apple OAuth

| # | 시나리오 | 기대 결과 | 자동화 |
|---|---------|----------|--------|
| A-11 | Apple 첫 로그인 (신규) | Apple 인증 → callback → profiles 생성 → 온보딩 | 수동 |
| A-12 | Apple 재로그인 (기존) | Apple 인증 → callback → 조직 리다이렉트 | 수동 |
| A-13 | Apple "이메일 가리기" 선택 | relay 이메일로 가입 처리, 정상 동작 | 수동 |
| A-14 | Apple 인증 취소 | 로그인 화면 복귀 | 수동 |

### 3-4. 초대 코드 수락

| # | 시나리오 | 기대 결과 | 자동화 |
|---|---------|----------|--------|
| A-15 | 유효한 코드 + 미로그인 | 가입 화면 → 가입 완료 → 조직 자동 가입 | Vitest |
| A-16 | 유효한 코드 + 로그인됨 | 즉시 조직 가입 → /[slug]/ 이동 | Vitest |
| A-17 | 만료된 코드 | "초대 코드가 만료되었어요" 에러 | Vitest |
| A-18 | 존재하지 않는 코드 | "유효하지 않은 초대 코드예요" 에러 | Vitest |
| A-19 | 사용 횟수 초과된 코드 | "초대 코드가 모두 사용되었어요" 에러 | Vitest |
| A-20 | 이미 가입된 조직의 코드 | "이미 소속된 조직이에요" 안내 | Vitest |
| A-21 | 딥링크로 접근 (?code=ABC&org=slug) | 코드 자동 입력, 조직명 표시 | 수동 |

### 3-5. 기존 @ygd.com 계정 호환

| # | 시나리오 | 기대 결과 | 자동화 |
|---|---------|----------|--------|
| A-22 | @ygd.com 이메일 로그인 | 정상 로그인 (유예 기간 중) | Vitest |
| A-23 | @ygd.com 계정 → 카카오 연동 | identities에 카카오 추가, 이후 카카오로 로그인 가능 | 수동 |
| A-24 | @ygd.com 계정 → 실제 이메일 변경 | 이메일 업데이트, 기존 데이터 유지 | 수동 |
| A-25 | 유예 기간 종료 후 @ygd.com 로그인 | "계정을 업그레이드해주세요" 안내 | 수동 |

### 3-6. 인증 콜백 라우팅 테스트

| 조건 | 리다이렉트 대상 |
|------|---------------|
| 조직 소속 0개 + 초대 코드 없음 | `/create-organization` |
| 조직 소속 0개 + 초대 코드 있음 | `/join?code=...` |
| 조직 소속 1개 | `/[slug]/` |
| 조직 소속 N개 | `/select-organization` |
| master 역할 | `/master/` |

---

## 4. 급여 계산 정확성 테스트 (P0)

### 4-1. 순수 함수 추출 및 테스트

급여 계산 로직은 **순수 함수**로 분리해 DB 없이 테스트할 수 있도록 한다.

```typescript
// src/lib/payroll-calc.ts (신규 — 순수 함수)

interface PayrollInput {
  scheduledMinutes: number;  // 월 근무 분
  hourlyWage: number;        // 시급 (원)
  insuranceType: '2대보험' | '3.3%';
}

interface PayrollResult {
  grossSalary: number;       // 세전 급여
  deductionAmount: number;   // 공제액
  netSalary: number;         // 실수령액
  deductionDetails: {
    nationalPension?: number;     // 국민연금 4.5%
    healthInsurance?: number;     // 건강보험 3.545%
    employmentInsurance?: number; // 고용보험 0.9%
    incomeTax?: number;           // 소득세 3.0%
    localTax?: number;            // 지방소득세 0.3%
  };
}

export function calculatePayroll(input: PayrollInput): PayrollResult;
```

### 4-2. 테스트 시나리오

```typescript
// src/__tests__/payroll-calc.test.ts

describe("급여 계산 정확성", () => {

  // ─── 기본 계산 ─────────────────────────────────
  describe("2대보험 공제", () => {
    it("시급 12,000원, 월 40시간 → 세전 480,000원", () => {
      const result = calculatePayroll({
        scheduledMinutes: 40 * 60,
        hourlyWage: 12000,
        insuranceType: '2대보험',
      });
      expect(result.grossSalary).toBe(480000);
    });

    it("2대보험 공제율 합계 8.945%가 정확히 적용된다", () => {
      const result = calculatePayroll({
        scheduledMinutes: 40 * 60,
        hourlyWage: 12000,
        insuranceType: '2대보험',
      });
      // 480,000 * 0.08945 = 42,936
      expect(result.deductionAmount).toBe(42936);
      expect(result.netSalary).toBe(480000 - 42936);
    });

    it("국민연금 4.5%가 정확하다", () => {
      const result = calculatePayroll({
        scheduledMinutes: 40 * 60,
        hourlyWage: 12000,
        insuranceType: '2대보험',
      });
      // 480,000 * 0.045 = 21,600
      expect(result.deductionDetails.nationalPension).toBe(21600);
    });

    it("건강보험 3.545%가 정확하다 (장기요양 포함)", () => {
      const result = calculatePayroll({
        scheduledMinutes: 40 * 60,
        hourlyWage: 12000,
        insuranceType: '2대보험',
      });
      // 480,000 * 0.03545 = 17,016
      expect(result.deductionDetails.healthInsurance).toBe(17016);
    });

    it("고용보험 0.9%가 정확하다", () => {
      const result = calculatePayroll({
        scheduledMinutes: 40 * 60,
        hourlyWage: 12000,
        insuranceType: '2대보험',
      });
      // 480,000 * 0.009 = 4,320
      expect(result.deductionDetails.employmentInsurance).toBe(4320);
    });
  });

  describe("3.3% 원천징수 공제", () => {
    it("시급 11,000원, 월 32시간 → 세전 352,000원", () => {
      const result = calculatePayroll({
        scheduledMinutes: 32 * 60,
        hourlyWage: 11000,
        insuranceType: '3.3%',
      });
      expect(result.grossSalary).toBe(352000);
    });

    it("3.3% 공제액이 정확하다", () => {
      const result = calculatePayroll({
        scheduledMinutes: 32 * 60,
        hourlyWage: 11000,
        insuranceType: '3.3%',
      });
      // 352,000 * 0.033 = 11,616
      expect(result.deductionAmount).toBe(11616);
      expect(result.netSalary).toBe(352000 - 11616);
    });

    it("소득세 3.0%와 지방소득세 0.3%가 분리되어 있다", () => {
      const result = calculatePayroll({
        scheduledMinutes: 32 * 60,
        hourlyWage: 11000,
        insuranceType: '3.3%',
      });
      // 352,000 * 0.03 = 10,560
      expect(result.deductionDetails.incomeTax).toBe(10560);
      // 352,000 * 0.003 = 1,056
      expect(result.deductionDetails.localTax).toBe(1056);
    });
  });

  // ─── 엣지 케이스 ───────────────────────────────
  describe("엣지 케이스", () => {
    it("근무시간 0분이면 모든 금액이 0이다", () => {
      const result = calculatePayroll({
        scheduledMinutes: 0,
        hourlyWage: 12000,
        insuranceType: '2대보험',
      });
      expect(result.grossSalary).toBe(0);
      expect(result.deductionAmount).toBe(0);
      expect(result.netSalary).toBe(0);
    });

    it("분 단위 근무시간이 올바르게 시급 계산에 반영된다 (150분 = 2.5시간)", () => {
      const result = calculatePayroll({
        scheduledMinutes: 150,
        hourlyWage: 10000,
        insuranceType: '3.3%',
      });
      // 150/60 * 10000 = 25,000
      expect(result.grossSalary).toBe(25000);
    });

    it("소수점이 생기는 공제액은 원 단위 반올림 처리된다", () => {
      const result = calculatePayroll({
        scheduledMinutes: 3 * 60, // 3시간
        hourlyWage: 9860,         // 최저임금
        insuranceType: '2대보험',
      });
      // 29,580 * 0.08945 = 2,645.931
      // 반올림 → 2,646
      expect(Number.isInteger(result.deductionAmount)).toBe(true);
      expect(Number.isInteger(result.netSalary)).toBe(true);
    });

    it("월 중간 입사 (10일 근무) 계산이 정확하다", () => {
      // 10일 * 8시간 = 80시간 = 4800분
      const result = calculatePayroll({
        scheduledMinutes: 4800,
        hourlyWage: 12000,
        insuranceType: '2대보험',
      });
      // 4800/60 * 12000 = 960,000
      expect(result.grossSalary).toBe(960000);
    });

    it("시급이 변경된 경우 — 변경 전후 분리 계산은 호출자가 처리", () => {
      // 전반 15일: 시급 11,000원, 60시간
      const part1 = calculatePayroll({
        scheduledMinutes: 60 * 60,
        hourlyWage: 11000,
        insuranceType: '3.3%',
      });
      // 후반 15일: 시급 12,000원, 60시간
      const part2 = calculatePayroll({
        scheduledMinutes: 60 * 60,
        hourlyWage: 12000,
        insuranceType: '3.3%',
      });
      // 합산은 호출자 책임
      const totalGross = part1.grossSalary + part2.grossSalary;
      expect(totalGross).toBe(660000 + 720000);
    });

    it("매우 높은 시급 (100,000원)에서도 오버플로 없이 계산된다", () => {
      const result = calculatePayroll({
        scheduledMinutes: 160 * 60, // 월 160시간
        hourlyWage: 100000,
        insuranceType: '2대보험',
      });
      // 16,000,000원 — JS 정수 범위 내
      expect(result.grossSalary).toBe(16000000);
      expect(result.netSalary).toBeGreaterThan(0);
      expect(result.netSalary).toBeLessThan(result.grossSalary);
    });
  });

  // ─── 블루프린트 예시 데이터 검증 ─────────────────
  describe("블루프린트 7-2 예시 데이터 일치 검증", () => {
    it("김직원: 40시간, 시급 12,000, 2대보험 → 실수령 437,064원", () => {
      const result = calculatePayroll({
        scheduledMinutes: 40 * 60,
        hourlyWage: 12000,
        insuranceType: '2대보험',
      });
      expect(result.grossSalary).toBe(480000);
      expect(result.deductionAmount).toBe(42936);
      expect(result.netSalary).toBe(437064);
    });

    it("이직원: 32시간, 시급 11,000, 3.3% → 실수령 340,384원", () => {
      const result = calculatePayroll({
        scheduledMinutes: 32 * 60,
        hourlyWage: 11000,
        insuranceType: '3.3%',
      });
      expect(result.grossSalary).toBe(352000);
      expect(result.deductionAmount).toBe(11616);
      expect(result.netSalary).toBe(340384);
    });

    it("박직원: 24시간, 시급 12,000, 3.3% → 실수령 278,496원", () => {
      const result = calculatePayroll({
        scheduledMinutes: 24 * 60,
        hourlyWage: 12000,
        insuranceType: '3.3%',
      });
      expect(result.grossSalary).toBe(288000);
      expect(result.deductionAmount).toBe(9504);
      expect(result.netSalary).toBe(278496);
    });
  });
});
```

---

## 5. 크레딧 엔진 테스트 (P0)

### 5-1. 기존 규칙 상수 (tier-utils.ts)

```typescript
CREDIT_POINTS = {
  normal_attendance: 3,
  substitute_bonus: 10,      // 월 2회까지
  substitute_regular: 3,     // 월 2회 초과
  admin_cancel_compensation: 5,
  late_minor: -3,            // 5~10분 지각
  late_major: -10,           // 10분+ 지각
  early_leave: -8,
  missing_checkout: -5,
  same_day_cancel: -20,
  advance_cancel: -5,
  no_show: -50,
};

STREAK_MILESTONES = [
  { count: 10,  bonus: 15  },
  { count: 30,  bonus: 50  },
  { count: 60,  bonus: 80  },
  { count: 100, bonus: 150 },
];
```

### 5-2. 크레딧 순수 함수 테스트

```typescript
// src/__tests__/credit-engine.test.ts

describe("크레딧 엔진 로직", () => {

  describe("점수 상수 일관성", () => {
    it("정상 출근은 +3이다", () => {
      expect(CREDIT_POINTS.normal_attendance).toBe(3);
    });
    it("무단 결근은 -50이다", () => {
      expect(CREDIT_POINTS.no_show).toBe(-50);
    });
    it("모든 감점 이벤트는 음수이다", () => {
      const negativeEvents = ['late_minor', 'late_major', 'early_leave',
        'missing_checkout', 'same_day_cancel', 'advance_cancel', 'no_show'];
      negativeEvents.forEach(event => {
        expect(CREDIT_POINTS[event]).toBeLessThan(0);
      });
    });
    it("모든 가점 이벤트는 양수이다", () => {
      const positiveEvents = ['normal_attendance', 'substitute_bonus',
        'substitute_regular', 'admin_cancel_compensation'];
      positiveEvents.forEach(event => {
        expect(CREDIT_POINTS[event]).toBeGreaterThan(0);
      });
    });
  });

  describe("티어 판정", () => {
    it("점수 0은 아이언이다", () => {
      expect(getTier(0).key).toBe('iron');
    });
    it("점수 300은 브론즈이다", () => {
      expect(getTier(300).key).toBe('bronze');
    });
    it("점수 450은 실버이다", () => {
      expect(getTier(450).key).toBe('silver');
    });
    it("점수 600은 골드이다", () => {
      expect(getTier(600).key).toBe('gold');
    });
    it("점수 750은 플래티넘이다", () => {
      expect(getTier(750).key).toBe('platinum');
    });
    it("점수 900은 다이아몬드이다", () => {
      expect(getTier(900).key).toBe('diamond');
    });
    it("음수 점수는 아이언으로 클램핑된다", () => {
      expect(getTier(-100).key).toBe('iron');
    });
    it("1000 초과 점수는 다이아몬드로 클램핑된다", () => {
      expect(getTier(1500).key).toBe('diamond');
    });
    it("티어 경계값이 올바르다 (299=아이언, 300=브론즈)", () => {
      expect(getTier(299).key).toBe('iron');
      expect(getTier(300).key).toBe('bronze');
    });
  });

  describe("스트릭 마일스톤 보너스", () => {
    it("10일 연속 출근 보너스는 +15이다", () => {
      const milestone = STREAK_MILESTONES.find(m => m.count === 10);
      expect(milestone?.bonus).toBe(15);
    });
    it("30일 연속 출근 보너스는 +50이다", () => {
      const milestone = STREAK_MILESTONES.find(m => m.count === 30);
      expect(milestone?.bonus).toBe(50);
    });
    it("100일 연속 출근 보너스는 +150이다", () => {
      const milestone = STREAK_MILESTONES.find(m => m.count === 100);
      expect(milestone?.bonus).toBe(150);
    });
    it("마일스톤은 오름차순으로 정렬되어 있다", () => {
      for (let i = 1; i < STREAK_MILESTONES.length; i++) {
        expect(STREAK_MILESTONES[i].count).toBeGreaterThan(STREAK_MILESTONES[i - 1].count);
      }
    });
  });

  describe("전역 합산 정확성 (멀티 조직)", () => {
    // 이 테스트들은 DB 통합 테스트에서 실행
    it("orgA에서 +3, orgB에서 +3 → 전역 점수 +6", async () => {
      // DB에 두 조직에서 각각 정상 출근 기록 → profiles.credit_score 확인
    });

    it("orgA에서 -50 (결근) → 전역 점수에 반영", async () => {
      // orgB에서의 점수와 합산됨
    });

    it("스트릭은 조직을 넘나들어 계산된다", async () => {
      // 월~수: orgA 출근, 목~금: orgB 출근 → 5일 연속 스트릭
    });

    it("한 조직에서 terminated 되어도 크레딧 점수는 유지된다", async () => {
      // 소프트 삭제 후 profiles.credit_score 불변 확인
    });
  });

  describe("지각 판정 로직", () => {
    it("출근 시간이 정확하면 정상 출근 (+3)", () => {
      // scheduledTime: 09:00, actualTime: 09:00
    });
    it("5분 이내 지각은 정상 출근 (+3, grace period)", () => {
      // scheduledTime: 09:00, actualTime: 09:04
    });
    it("5~10분 지각은 경미 지각 (-3)", () => {
      // scheduledTime: 09:00, actualTime: 09:07
    });
    it("10분 초과 지각은 중대 지각 (-10)", () => {
      // scheduledTime: 09:00, actualTime: 09:15
    });
    it("정확히 5분은 grace에 해당 (정상 출근)", () => {
      expect(LATE_GRACE_MINUTES).toBe(5);
    });
    it("정확히 10분은 중대 지각 경계", () => {
      expect(LATE_MAJOR_THRESHOLD).toBe(10);
    });
  });
});
```

---

## 6. E2E 테스트 -- Playwright 도입 (P1)

### 6-1. 도입 검토

| 항목 | 판단 |
|------|------|
| **도입 비용** | `npm i -D @playwright/test` + 브라우저 설치 (1시간) |
| **학습 곡선** | 낮음 (Cypress 대비 간결한 API) |
| **실행 환경** | 로컬 + CI (GitHub Actions 무료 티어 충분) |
| **ROI** | 핵심 플로우 5개만 자동화해도 수동 테스트 시간 크게 절감 |
| **결론** | **베타 출시 전까지 도입 권장** — 최소 핵심 3개 플로우 |

### 6-2. 설치 및 설정

```bash
npm install -D @playwright/test
npx playwright install chromium  # 크롬만 (모바일 에뮬레이션 포함)
```

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    // 모바일 우선 (PWA)
    { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
    { name: 'Mobile Safari', use: { ...devices['iPhone 13'] } },
    // 데스크톱 (관리자)
    { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: true,
  },
});
```

### 6-3. 핵심 플로우 자동화 대상

#### 플로우 1: 사장님 온보딩 (가입 ~ 조직 생성 ~ 직원 초대)

```
e2e/owner-onboarding.spec.ts

1. /login 접속
2. "이메일로 시작하기" 클릭
3. 이메일/비밀번호 입력 → 가입
4. /create-organization 이동 확인
5. 조직명, 업종, slug 입력
6. "만들기" 클릭 → /[slug]/admin/ 이동
7. "직원 초대하기" → 초대 코드 생성 확인
8. 초대 링크 복사 가능 확인
```

#### 플로우 2: 직원 가입 (초대 수락)

```
e2e/employee-join.spec.ts

1. /join?code=TESTCODE 접속
2. 조직명 표시 확인
3. 이메일/비밀번호 입력 → 가입
4. organization_memberships에 추가 확인
5. /[slug]/ 직원 홈 이동 확인
6. 하단 네비게이션 정상 표시 확인
```

#### 플로우 3: 직원 출퇴근 ~ 크레딧

```
e2e/attendance-credit.spec.ts

1. 직원 로그인
2. 홈에서 "출근하기" 버튼 확인
3. (GPS mock) 출근 처리
4. attendance_logs에 기록 확인
5. 크레딧 점수 변동 확인
6. "퇴근하기" 버튼 → 퇴근 처리
7. 근무 기록 페이지에서 오늘 기록 확인
```

#### 플로우 4: 관리자 급여 정산

```
e2e/payroll.spec.ts

1. owner 로그인
2. /[slug]/admin/payroll 이동
3. 이번 달 정산 목록 확인
4. 각 직원의 세전/공제/실수령 표시 확인
5. "급여 확정하기" 클릭
6. 상태: "확정됨" 변경 확인
7. 직원 로그인 → 마이페이지에서 급여 확인
```

#### 플로우 5: 조직 전환 (다중 소속)

```
e2e/org-switch.spec.ts

1. 2개 조직에 소속된 사용자로 로그인
2. /select-organization 표시 확인
3. 조직A 선택 → /[slugA]/ 이동
4. BusinessSwitcher → 조직B 전환
5. /[slugB]/ 이동 확인
6. 각 조직의 데이터가 올바르게 표시됨
```

### 6-4. package.json 스크립트 추가

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:mobile": "playwright test --project='Mobile Chrome'"
  }
}
```

---

## 7. 수동 테스트 체크리스트

### 7-1. 기능별 수동 테스트

#### 인증/온보딩

- [ ] 이메일 회원가입 → 조직 생성 → 홈 진입
- [ ] 카카오 로그인 → 신규 사용자 온보딩
- [ ] Apple 로그인 → 신규 사용자 온보딩
- [ ] 카카오 로그인 → 기존 사용자 자동 진입
- [ ] 이메일/비밀번호 오류 시 에러 메시지
- [ ] 비밀번호 재설정 이메일 발송
- [ ] 로그아웃 → 재로그인

#### 직원 초대

- [ ] 초대 코드 생성 (owner)
- [ ] 카카오 딥링크 공유 (카카오톡 메시지 형태 확인)
- [ ] 초대 링크 복사 → 브라우저에서 열기
- [ ] 초대 코드 직접 입력
- [ ] 만료된 코드 입력 시 에러 메시지
- [ ] 이미 소속된 조직 코드 입력 시 안내

#### 출퇴근

- [ ] GPS 활성화 → 매장 범위 내 출근 성공
- [ ] GPS 활성화 → 매장 범위 외 출근 실패 + 에러 메시지
- [ ] GPS 비활성화 시 안내 메시지
- [ ] 출근 후 퇴근 버튼 전환
- [ ] 중복 출근 시도 차단
- [ ] 외근/출장 출퇴근
- [ ] 출근 기록 실시간 반영 (관리자 대시보드)

#### 스케줄

- [ ] 주간 스케줄 조회 (직원)
- [ ] 스케줄 생성/수정/삭제 (owner)
- [ ] 전주 복사 기능
- [ ] 대타 요청 → 수락/거절
- [ ] 스케줄 슬롯 드래그 이동 (관리자 캘린더)

#### 크레딧

- [ ] 출근 후 크레딧 점수 증가 확인
- [ ] 지각 시 감점 확인
- [ ] 크레딧 이력 페이지에서 상세 내역
- [ ] 티어 배지 올바른 표시
- [ ] 스트릭 카운트 표시
- [ ] 크레딧 카드 모달 열기
- [ ] 크레딧 카드 이미지 저장
- [ ] 크레딧 카드 카카오 공유

#### 급여

- [ ] 월별 급여 목록 조회 (owner)
- [ ] 급여 자동 계산 정확성 (세전/공제/실수령)
- [ ] 2대보험 vs 3.3% 전환 시 재계산
- [ ] 급여 확정 → 직원 알림 발송
- [ ] 직원 마이페이지에서 급여 확인
- [ ] 급여 상태 변경 (초안 → 확정 → 지급완료)

#### 레시피/공지

- [ ] 레시피 목록 조회 (공개/비공개 필터)
- [ ] 레시피 작성/수정/삭제 (owner)
- [ ] 레시피 검색
- [ ] 카테고리 순서 변경
- [ ] 공지사항 작성/수정/삭제 (owner)
- [ ] 공지 대상 역할 필터링

#### 관리자 대시보드

- [ ] 실시간 출근 현황 표시
- [ ] 매장별 필터
- [ ] 직원 목록/상세
- [ ] 직원 해고 (소프트 삭제) → 접근 차단 확인
- [ ] 통계 페이지 데이터 정확성

#### master 대시보드

- [ ] 전체 조직 목록 표시
- [ ] 조직별 상세 진입 (impersonation)
- [ ] 전체 사용자 목록
- [ ] 크레딧 통계/규칙 관리
- [ ] 시스템 설정

#### 조직 전환

- [ ] 2개 이상 소속 시 /select-organization 표시
- [ ] BusinessSwitcher 조직 전환
- [ ] 전환 후 데이터 올바르게 변경

### 7-2. 디바이스별 테스트

#### iOS Safari (iPhone)

- [ ] PWA 설치 ("홈 화면에 추가")
- [ ] PWA 아이콘/스플래시 표시
- [ ] 로그인 → 홈 진입
- [ ] 출퇴근 기능 (GPS 권한 팝업)
- [ ] 카카오 로그인 (인앱 브라우저 → Safari 전환)
- [ ] Apple 로그인 (Face ID/Touch ID)
- [ ] 푸시 알림 수신
- [ ] 하단 Safe Area 여백
- [ ] 스와이프 뒤로가기 동작
- [ ] 키보드 올라올 때 레이아웃 깨짐 없음

#### Android Chrome

- [ ] PWA 설치 (설치 배너)
- [ ] PWA 아이콘/스플래시 표시
- [ ] 로그인 → 홈 진입
- [ ] 출퇴근 기능 (위치 권한 팝업)
- [ ] 카카오 로그인 (카카오톡 앱 전환)
- [ ] 푸시 알림 수신
- [ ] 뒤로가기 버튼 동작
- [ ] 화면 회전 시 레이아웃

#### 데스크톱 Chrome (관리자 주 사용)

- [ ] 관리자 페이지 레이아웃
- [ ] 급여 정산 테이블 표시
- [ ] 캘린더 드래그 동작
- [ ] 데이터 테이블 스크롤

### 7-3. PWA 테스트

- [ ] `manifest.json` 유효성 (Chrome DevTools > Application)
- [ ] Service Worker 등록/활성화
- [ ] 오프라인 시 캐시된 페이지 표시 (또는 오프라인 안내)
- [ ] 앱 업데이트 감지 → "새 버전이 있어요" 알림
- [ ] 앱 업데이트 적용 후 새 버전 동작
- [ ] 홈 화면 아이콘 해상도 (192px, 512px)
- [ ] 스플래시 스크린 표시

---

## 8. 성능 테스트

### 8-1. 목표 지표

| 지표 | 목표 | 측정 방법 |
|------|------|----------|
| 첫 로드 (FCP) | < 1.5초 | Lighthouse |
| 인터랙션 (INP) | < 200ms | Chrome DevTools |
| 페이지 전환 | < 500ms | 체감 |
| RLS 쿼리 응답 | < 200ms | Supabase Dashboard > Logs |
| Realtime 메시지 전달 | < 1초 | 수동 측정 |

### 8-2. 대규모 데이터 시뮬레이션

Dev DB에서 아래 규모의 테스트 데이터를 시딩해 성능을 확인한다.

```sql
-- 시뮬레이션 목표 규모
-- 조직: 100개
-- 총 직원: 1,000명 (조직당 평균 10명)
-- 총 출퇴근 기록: 100,000건 (직원당 평균 100건)
-- 총 스케줄 슬롯: 50,000건
-- 총 크레딧 기록: 200,000건

-- 1. 조직 100개 생성
INSERT INTO organizations (name, slug, owner_id, subscription_tier, max_employees)
SELECT
  '테스트매장' || i,
  'test-store-' || i,
  '{seed_owner_id}',
  CASE WHEN i <= 20 THEN 'pro' WHEN i <= 60 THEN 'starter' ELSE 'free' END,
  CASE WHEN i <= 20 THEN 50 WHEN i <= 60 THEN 15 ELSE 5 END
FROM generate_series(1, 100) i;

-- 2. 조직당 직원 10명씩 membership 생성
-- (auth.users도 생성 필요 — 스크립트로 처리)

-- 3. attendance_logs 대량 삽입
INSERT INTO attendance_logs (profile_id, organization_id, check_type, checked_at, attendance_type)
SELECT
  profile_id,
  organization_id,
  CASE WHEN (row_number() OVER ()) % 2 = 1 THEN 'IN' ELSE 'OUT' END,
  now() - (random() * interval '365 days'),
  'regular'
FROM organization_memberships
CROSS JOIN generate_series(1, 100);
```

### 8-3. RLS 성능 측정 쿼리

```sql
-- RLS가 적용된 상태에서 쿼리 시간 측정
-- Supabase Dashboard > SQL Editor > EXPLAIN ANALYZE

EXPLAIN ANALYZE
SELECT * FROM attendance_logs
WHERE organization_id = '{org_id}'
ORDER BY checked_at DESC
LIMIT 50;

-- 인덱스 확인
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'attendance_logs';

-- RLS 정책이 쿼리 플랜에 미치는 영향 확인
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM stores WHERE organization_id = '{org_id}';
```

### 8-4. Realtime 구독 부하 테스트

```
시나리오: 10개 조직의 owner가 동시에 대시보드를 보고 있는 상황
  → 각 owner는 자기 조직의 attendance_logs를 Realtime 구독 중
  → 10명의 직원이 동시에 출근 처리
  → 모든 owner에게 1초 이내 반영 확인

도구: 브라우저 탭 10개 + 별도 스크립트로 출퇴근 INSERT
측정: 콘솔에 수신 시간 로그 → INSERT 시간과 차이 계산
```

---

## 9. 보안 테스트

### 9-1. OWASP Top 10 체크리스트

| # | 취약점 | 출첵 대응 | 테스트 방법 |
|---|-------|----------|-----------|
| A01 | Broken Access Control | RLS + is_org_member/is_org_admin | 섹션 2의 RLS 테스트 |
| A02 | Cryptographic Failures | Supabase JWT + HTTPS 강제 | SSL 인증서 확인 |
| A03 | Injection | Supabase 파라미터화 쿼리 (SQL injection 방어) | 아래 테스트 |
| A04 | Insecure Design | 역할 기반 접근 제어 설계 | 코드 리뷰 |
| A05 | Security Misconfiguration | Supabase RLS 활성화, 불필요 API 차단 | 아래 테스트 |
| A06 | Vulnerable Components | `npm audit` 정기 실행 | CI/CD |
| A07 | Auth Failures | Supabase Auth (rate limiting 내장) | 아래 테스트 |
| A08 | Data Integrity Failures | 서버 사이드 검증, DB 제약조건 | 코드 리뷰 |
| A09 | Logging Failures | audit_logs 테이블 + Supabase Logs | 감사 로그 확인 |
| A10 | SSRF | Next.js API Routes에서 외부 URL 접근 제한 | 코드 리뷰 |

### 9-2. SQL Injection 테스트

Supabase JS Client는 파라미터화 쿼리를 사용하므로 기본적으로 안전하지만,
직접 SQL을 작성하는 곳(RPC 함수 등)을 점검한다.

```
테스트 입력값:
- 조직명: '; DROP TABLE organizations; --
- 이메일: test@test.com'; DELETE FROM profiles; --
- 초대코드: ABC123' OR '1'='1
- 검색어: <script>alert(1)</script>

기대 결과: 모든 경우 에러 처리 또는 이스케이프, SQL 실행 없음
```

### 9-3. XSS 테스트

```
테스트 입력값:
- 사용자 이름: <img src=x onerror=alert(1)>
- 조직명: <script>document.cookie</script>
- 레시피 내용: <a href="javascript:alert(1)">클릭</a>
- 공지 제목: {{constructor.constructor('return this')()}}

기대 결과: React의 JSX 자동 이스케이프로 스크립트 실행 안 됨
확인 방법: 브라우저 DevTools Console에 에러 없음
```

### 9-4. 인증 우회 시도

| # | 시도 | 기대 결과 |
|---|------|----------|
| S-01 | JWT 없이 API 직접 호출 | 401 Unauthorized |
| S-02 | 만료된 JWT로 API 호출 | 401 Unauthorized |
| S-03 | orgA 유저 JWT로 orgB 데이터 요청 | RLS 차단 (빈 결과) |
| S-04 | employee JWT로 /admin/ API 호출 | 403 Forbidden |
| S-05 | 일반 유저 JWT로 /master/ 접근 | /select-organization 리다이렉트 |
| S-06 | JWT payload 변조 (role=master) | 서명 검증 실패 → 401 |
| S-07 | Supabase anon key로 service_role 기능 호출 | 차단 |
| S-08 | API Rate Limiting 테스트 (100회/분 반복) | Supabase 기본 제한 적용 |

### 9-5. 민감 데이터 보호

```
확인 항목:
- [ ] .env.local이 .gitignore에 포함되어 있다
- [ ] 클라이언트 번들에 SUPABASE_SERVICE_ROLE_KEY가 노출되지 않는다
- [ ] hr-documents 버킷은 서명된 URL(60초 만료)로만 접근 가능하다
- [ ] 급여 정보(payroll_entries)는 본인 + owner + master만 조회 가능하다
- [ ] 전화번호/주민번호 등 민감 필드는 RLS로 보호된다
- [ ] audit_logs에 급여 변경, 직원 해고 등 주요 행위가 기록된다
```

---

## 10. 테스트 환경 구성

### 10-1. Dev DB 테스트 데이터 시딩

```
테스트 시딩 스크립트: scripts/seed-test-data.ts (신규 작성 필요)

생성 대상:
  1. master 계정 1개 (정표)
  2. 조직 2개 (연경당, 테스트카페)
  3. 각 조직에 owner 1명 + employee 3명
  4. 각 조직에 매장 1개 + 포지션 2개
  5. 30일치 스케줄 + 출퇴근 기록
  6. 크레딧 이벤트 + 스트릭
  7. 1개월치 급여 기간 + 급여 항목
  8. 초대 코드 (유효 1개 + 만료 1개)
  9. 레시피 3개 + 공지 2개
```

### 10-2. 테스트 사용자 계정 구성

| 역할 | 이메일 | 비밀번호 | 용도 |
|------|--------|---------|------|
| master | `test.master@chulchek.test` | `TestMaster2026!` | master 전체 접근 검증 |
| orgA owner | `test.ownerA@chulchek.test` | `TestOwnerA2026!` | 조직A 관리자 기능 |
| orgA employee 1 | `test.empA1@chulchek.test` | `TestEmpA12026!` | 직원 기능 (정규직) |
| orgA employee 2 | `test.empA2@chulchek.test` | `TestEmpA22026!` | 직원 기능 (파트타임) |
| orgB owner | `test.ownerB@chulchek.test` | `TestOwnerB2026!` | 조직B (격리 테스트 대상) |
| orgB employee | `test.empB1@chulchek.test` | `TestEmpB12026!` | 조직B 직원 (격리 확인) |
| dual member | `test.dual@chulchek.test` | `TestDual2026!` | 다중 소속 테스트 |

### 10-3. vitest.config.db.ts 확장

```typescript
// 기존 설정에 멀티테넌트 테스트 파일 포함
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/__tests__/db/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 60000,
    sequence: { concurrent: false },  // RLS 테스트는 순차 실행
    reporters: ["verbose"],
  },
});
```

### 10-4. 테스트 실행 커맨드 요약

```bash
# 전체 단위 테스트 (UI + 순수 함수)
npm run test

# DB RLS 통합 테스트
npm run test:db

# E2E 테스트 (Playwright)
npm run test:e2e

# 특정 테스트 파일만
npx vitest run src/__tests__/payroll-calc.test.ts
npx vitest run src/__tests__/credit-engine.test.ts

# watch 모드 (개발 중)
npm run test:watch
```

---

## 11. 출시 전 최종 QA 체크리스트

### Phase A: 코드 동결 전 (개발 완료 시점)

```
자동화 테스트:
  [ ] npm run test 전체 통과
  [ ] npm run test:db 전체 통과 (RLS 격리 + 권한)
  [ ] npm run build 성공

코드 리뷰:
  [ ] 모든 Supabase 쿼리에 organization_id 필터가 있다
  [ ] 모든 admin/ 라우트에 is_org_admin 검증이 있다
  [ ] 모든 master/ 라우트에 is_master 검증이 있다
  [ ] 클라이언트에 service_role_key 노출 없다
  [ ] console.log 제거 (디버그용)
```

### Phase B: Dev 환경 통합 테스트

```
인증:
  [ ] 이메일 가입 → 프로필 생성 → 조직 생성 전체 플로우
  [ ] 카카오 로그인 (Dev 환경 OAuth 설정)
  [ ] Apple 로그인 (Dev 환경 OAuth 설정)
  [ ] 초대 코드 → 직원 가입 전체 플로우
  [ ] 다중 조직 전환

데이터 격리:
  [ ] 조직A owner → 조직B 데이터 접근 불가 (수동 확인)
  [ ] 직원 → 타 직원 급여 접근 불가
  [ ] terminated 직원 → 데이터 접근 차단

핵심 기능:
  [ ] 출퇴근 기록 정상 (GPS mock 또는 실기기)
  [ ] 크레딧 점수 변동 정확
  [ ] 스트릭 카운트 정확
  [ ] 급여 계산 정확 (블루프린트 예시값 일치)
  [ ] Realtime 알림 수신
  [ ] 푸시 알림 수신
```

### Phase C: Production 마이그레이션 전 검증

```
마이그레이션 스크립트:
  [ ] Dev에서 마이그레이션 SQL 전체 실행 성공
  [ ] 기존 연경당 데이터 → 신규 스키마 이관 정확
  [ ] organization_id가 모든 기존 레코드에 채워짐
  [ ] 기존 admin → owner 전환 완료
  [ ] 정표 계정 → master 전환 완료
  [ ] RLS 정책 전면 재적용 완료

롤백 계획:
  [ ] Production DB 백업 완료
  [ ] 롤백 SQL 스크립트 준비
  [ ] 롤백 절차 문서화
```

### Phase D: Production 배포 후 스모크 테스트

```
즉시 확인 (배포 후 5분 이내):
  [ ] 로그인 가능
  [ ] 기존 연경당 데이터 정상 표시
  [ ] 출퇴근 기능 동작
  [ ] 관리자 대시보드 접근

24시간 모니터링:
  [ ] Supabase Logs에 RLS 에러 없음
  [ ] Vercel Logs에 500 에러 없음
  [ ] 크레딧 정산 cron 정상 실행
  [ ] Realtime 연결 안정

1주 안정화:
  [ ] 일일 출퇴근 기록 누락 없음
  [ ] 급여 계산 검증 (수동 대조)
  [ ] 사용자 피드백 수집 → 버그 리포트 처리
  [ ] @ygd.com 계정 전환 유도 시작
```

---

## 부록: 테스트 파일 구조 (최종)

```
src/__tests__/
  setup.ts                      # jsdom 환경 보완 (기존)
  recipe.test.tsx               # 레시피 유틸/컴포넌트 (기존)
  payroll-calc.test.ts          # 신규: 급여 계산 순수 함수
  credit-engine.test.ts         # 신규: 크레딧 엔진 순수 함수
  db/
    helpers.ts                  # Supabase 테스트 헬퍼 (기존 + 확장)
    rls.test.ts                 # 단일 테넌트 RLS (기존)
    rls-multi-tenant.test.ts    # 신규: 멀티테넌트 격리
    rls-payroll.test.ts         # 신규: 급여 RLS
    rls-master.test.ts          # 신규: master 권한

e2e/                            # 신규: Playwright E2E
  owner-onboarding.spec.ts
  employee-join.spec.ts
  attendance-credit.spec.ts
  payroll.spec.ts
  org-switch.spec.ts

scripts/
  seed-test-data.ts             # 신규: 테스트 데이터 시딩
```
