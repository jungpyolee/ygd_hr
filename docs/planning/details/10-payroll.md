# 10. 급여 정산 기능 상세 설계

> **에픽**: B — 급여 자동 계산
> **우선순위**: MVP (출시 전 필수)
> **의사결정 참조**: D-08 (스케줄 기반 자동 계산 + 관리자 확인)
> **작성일**: 2026-03-25

---

## 목차

1. [급여 계산 로직 상세](#1-급여-계산-로직-상세)
2. [공제 계산 상세](#2-공제-계산-상세)
3. [DB 설계 상세](#3-db-설계-상세)
4. [API/Server Action 설계](#4-apiserver-action-설계)
5. [관리자 UI 설계](#5-관리자-ui-설계)
6. [직원 UI 설계](#6-직원-ui-설계)
7. [알림 연동](#7-알림-연동)
8. [한국 노동법 검증 포인트](#8-한국-노동법-검증-포인트)
9. [엣지 케이스](#9-엣지-케이스)
10. [테스트 시나리오](#10-테스트-시나리오)
11. [체크리스트](#11-체크리스트)

---

## 1. 급여 계산 로직 상세

### 1-1. 핵심 원칙

```
급여 산정 기준 = 확정된 스케줄(schedule_slots) 기반
  → 실제 출퇴근 시간(attendance_logs)이 아님
  → 이유: 9:40에 출근해도 10시부터, 7:30에 끝나도 8시까지로 간주
  → 근태 데이터 = 스케줄 준수 여부 확인용 (크레딧 시스템)
```

### 1-2. 근무시간 산출 — schedule_slots 기반

**대상 슬롯 조건:**

```sql
SELECT profile_id, slot_date, start_time, end_time
FROM schedule_slots ss
JOIN weekly_schedules ws ON ss.weekly_schedule_id = ws.id
WHERE ws.status = 'confirmed'                  -- confirmed 주차만
  AND ss.status = 'active'                     -- active 슬롯만 (cancelled, substituted 제외)
  AND ss.organization_id = :orgId
  AND ss.slot_date >= :monthStart              -- 해당 월 1일
  AND ss.slot_date <= :monthEnd                -- 해당 월 말일
```

**시간 계산:**

```typescript
// 슬롯별 근무 분 계산
function calcSlotMinutes(startTime: string, endTime: string): number {
  // start_time, end_time은 time 타입 ("HH:MM:SS" 또는 "HH:MM")
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);

  let minutes = (eh * 60 + em) - (sh * 60 + sm);

  // 야간 교차 (예: 22:00 → 02:00) — 현재 연경당에서는 발생하지 않으나 SaaS 대비
  if (minutes < 0) {
    minutes += 24 * 60; // 자정 넘김 처리
  }

  return minutes;
}

// 월 합산
const totalMinutes = slots.reduce((sum, slot) =>
  sum + calcSlotMinutes(slot.start_time, slot.end_time), 0
);
```

### 1-3. 분 단위 처리 규칙

| 항목 | 규칙 | 근거 |
|------|------|------|
| 슬롯별 근무 분 | 정수 분 그대로 합산 (반올림/절삭 없음) | schedule_slots의 start_time/end_time이 이미 정확한 시간 |
| 월 합산 분 → 시간 표시 | `총분 ÷ 60` = 시간, `총분 % 60` = 잔여분 | UI 표시용 (예: "42시간 30분") |
| 급여 계산 | `(총분 / 60) × 시급` — 분 단위까지 반영 | 1분 단위까지 계산 후 원 단위 절사 |

**급여 계산 공식:**

```
세전급여 = floor(총분 / 60 × 시급)
         = floor(totalMinutes × hourlyWage / 60)
```

> 원 단위 절사(floor)를 적용해요. 예: 2,550분 × 12,000원/60 = 510,000원 (정확히 나눠짐).
> 2,537분 × 12,000원/60 = 507,400원 (floor 적용).

### 1-4. 추가근무(overtime_requests) 반영

```
confirmed된 overtime_requests가 있는 경우:
  → status = 'approved' && minutes > 0인 건만 합산
  → 해당 날짜의 추가근무 분을 scheduled_minutes에 포함

추가근무 합산 쿼리:
SELECT profile_id, SUM(minutes) as overtime_minutes
FROM overtime_requests
WHERE organization_id = :orgId
  AND date >= :monthStart AND date <= :monthEnd
  AND status = 'approved'
GROUP BY profile_id
```

**최종 근무 분 = schedule_slots 합산 분 + approved overtime 합산 분**

### 1-5. 야간수당, 주휴수당 — MVP 범위 결정

| 수당 종류 | MVP 포함 여부 | 사유 |
|-----------|--------------|------|
| **야간수당** (22시~06시 50% 가산) | **제외** | 연경당 운영 시간 기준 야간 근무 없음. SaaS 전환 후 v2에서 추가 |
| **주휴수당** | **제외** | 주 15시간 이상 근무 시 자동 발생하나, 현재 연경이가 시급에 포함해서 관리 중. v2에서 별도 옵션으로 제공 |
| **휴일수당** (공휴일 50% 가산) | **제외** | 동일 사유, v2 범위 |

> **v2 예정**: 조직 설정에서 `야간수당 자동계산`, `주휴수당 포함`, `휴일수당 포함` 토글 옵션 제공. 현재는 사장님이 시급 설정 시 수당을 포함한 금액으로 입력하는 방식.

---

## 2. 공제 계산 상세

### 2-1. 왜 "2대보험"이고 "4대보험"이 아닌가

**4대 사회보험 구성:**

| 보험 | 근로자 부담 | 사업주 부담 | 비고 |
|------|------------|------------|------|
| 국민연금 | 4.5% | 4.5% | |
| 건강보험 | 3.545% | 3.545% | 장기요양보험 포함 |
| 고용보험 | 0.9% | 0.9%~1.65% | 사업규모별 차등 |
| **산재보험** | **0%** | **전액 사업주** | 근로자 부담 없음 |

> 산재보험은 사업주가 전액 부담하므로 **근로자 급여에서 공제할 항목이 3개**예요.
> 하지만 연경당을 포함한 소규모 F&B 사업장에서는 관행적으로 "2대보험"이라 부르며
> **국민연금 + 건강보험만 가입**하는 경우가 많아요 (주 15시간 미만 단시간 근로자 등).
>
> "출첵" 플랫폼에서는 실제 가입 보험에 따라 사장님이 `insurance_type`을 설정하고,
> 시스템은 해당 유형에 맞는 공제율을 적용해요.

### 2-2. 2대보험 공제 (`insurance_type = 'national'`)

| 항목 | 요율 | 계산 |
|------|------|------|
| 국민연금 | 4.5% | floor(세전급여 × 0.045) |
| 건강보험 | 3.545% | floor(세전급여 × 0.03545) |
| 고용보험 | 0.9% | floor(세전급여 × 0.009) |
| **합계** | **~8.945%** | 각 항목별 절사 후 합산 |

**세부 계산:**

```typescript
function calcNationalDeductions(grossSalary: number) {
  const nationalPension = Math.floor(grossSalary * 0.045);      // 국민연금
  const healthInsurance = Math.floor(grossSalary * 0.03545);     // 건강보험 (장기요양 포함)
  const employmentInsurance = Math.floor(grossSalary * 0.009);   // 고용보험

  return {
    nationalPension,
    healthInsurance,
    employmentInsurance,
    total: nationalPension + healthInsurance + employmentInsurance,
  };
}
```

**건강보험 3.545% 산출 근거 (2026년 기준):**

```
건강보험료율 (근로자): 3.545%
  = 기본 건강보험료율 3.235% (2026년 예상)
  + 장기요양보험료 추가분 0.31% (건강보험료의 약 12.81%)

※ 정확한 요율은 매년 1월 건강보험공단 고시에 따라 변경.
  코드에서는 상수로 관리하되, 연초에 업데이트해야 해요.
```

**국민연금 하한/상한 적용:**

```
2026년 기준 (예상):
  - 하한: 월 370,000원 미만 → 370,000원 기준 적용
  - 상한: 월 6,170,000원 초과 → 6,170,000원 기준 적용

아르바이트 급여 범위(보통 50만~200만)에서는 하한 근처만 해당.
```

### 2-3. 3.3% 원천징수 (`insurance_type = '3.3'`)

| 항목 | 요율 | 계산 |
|------|------|------|
| 소득세 | 3.0% | floor(세전급여 × 0.03) |
| 지방소득세 | 0.3% | floor(소득세 × 0.1) |
| **합계** | **3.3%** | |

**세부 계산:**

```typescript
function calc33Deductions(grossSalary: number) {
  const incomeTax = Math.floor(grossSalary * 0.03);              // 소득세
  const localIncomeTax = Math.floor(incomeTax * 0.1);            // 지방소득세 (소득세의 10%)

  return {
    incomeTax,
    localIncomeTax,
    total: incomeTax + localIncomeTax,
  };
}
```

> **주의**: 지방소득세는 `세전급여 × 0.003`이 아니라 `소득세 × 0.1`로 계산해요.
> 결과는 같지만 법적 정의가 "소득세의 10%"이므로 이 순서를 지켜야 해요.

### 2-4. 소수점 처리 원칙

```
원칙: 각 공제 항목별로 원 단위 절사(Math.floor) 적용

예시 (2대보험, 세전 480,000원):
  국민연금:   floor(480,000 × 0.045)   = floor(21,600)   = 21,600원
  건강보험:   floor(480,000 × 0.03545) = floor(17,016)   = 17,016원
  고용보험:   floor(480,000 × 0.009)   = floor(4,320)    = 4,320원
  공제 합계:  21,600 + 17,016 + 4,320  = 42,936원
  실수령액:   480,000 - 42,936         = 437,064원

예시 (3.3%, 세전 352,000원):
  소득세:     floor(352,000 × 0.03)    = floor(10,560)   = 10,560원
  지방소득세: floor(10,560 × 0.1)      = floor(1,056)    = 1,056원
  공제 합계:  10,560 + 1,056           = 11,616원
  실수령액:   352,000 - 11,616         = 340,384원
```

### 2-5. 비과세 항목 — MVP 범위

| 항목 | MVP 포함 여부 | 사유 |
|------|--------------|------|
| 식대 비과세 (월 20만원) | **제외** | 연경당은 식사 제공. SaaS v2에서 옵션 제공 |
| 교통비 비과세 | **제외** | 동일 사유 |
| 기타 수당 (야간, 연장 등) | **제외** | 1-5 참조 |

> v2에서는 `payroll_entries`에 `non_taxable_amount` 필드를 추가하고,
> `세전급여 - 비과세액`에 대해서만 공제율을 적용하는 구조로 확장 가능.

---

## 3. DB 설계 상세

### 3-1. payroll_periods — 급여 정산 기간

```sql
CREATE TABLE payroll_periods (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  year                integer NOT NULL,                           -- 정산 연도
  month               integer NOT NULL,                           -- 정산 월 (1~12)
  status              text NOT NULL DEFAULT 'draft',              -- 워크플로우 상태
  confirmed_at        timestamptz,                                -- 확정 시각
  confirmed_by        uuid REFERENCES profiles(id),               -- 확정한 관리자
  notes               text,                                       -- 관리자 메모
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, year, month)
);
```

**워크플로우 상태:**

```
draft → confirmed → paid

draft:
  - 자동 계산 결과가 저장된 초안 상태
  - 관리자가 시급, 시간 등을 수정할 수 있어요
  - payroll_entries 재계산 가능

confirmed:
  - 관리자가 "급여 확정하기" 버튼을 눌러 확정한 상태
  - 직원에게 알림이 발송돼요
  - entries 수정 불가 (잠금)
  - 실수 발견 시 → "확정 취소" → draft로 되돌리기 가능

paid:
  - 모든 직원에게 이체 완료된 상태
  - 개별 직원 단위(payroll_entries.payment_status)로도 관리
  - 완전 잠금 — 되돌리기 불가
```

**상태 전이 다이어그램:**

```
  ┌─────────┐     확정하기     ┌───────────┐     전체 이체     ┌──────┐
  │  draft  │ ───────────────→ │ confirmed │ ───────────────→ │ paid │
  └─────────┘                  └───────────┘                  └──────┘
       ↑                            │
       └─── 확정 취소 ──────────────┘
                (confirmed → draft만 가능)
```

### 3-2. payroll_entries — 직원별 급여 내역

```sql
CREATE TABLE payroll_entries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_period_id   uuid NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  profile_id          uuid NOT NULL REFERENCES profiles(id),
  organization_id     uuid NOT NULL REFERENCES organizations(id),

  -- 근무 시간
  scheduled_minutes   integer NOT NULL DEFAULT 0,                 -- 스케줄 기반 근무 분
  overtime_minutes    integer NOT NULL DEFAULT 0,                 -- 승인된 추가근무 분
  total_minutes       integer NOT NULL DEFAULT 0,                 -- scheduled + overtime

  -- 급여 스냅샷
  hourly_wage         integer NOT NULL,                           -- 정산 시점 시급 (스냅샷)
  insurance_type      text NOT NULL,                              -- 정산 시점 보험 유형 (스냅샷)

  -- 금액
  gross_salary        integer NOT NULL DEFAULT 0,                 -- 세전급여
  deduction_national_pension  integer NOT NULL DEFAULT 0,         -- 국민연금 (2대보험만)
  deduction_health_insurance  integer NOT NULL DEFAULT 0,         -- 건강보험 (2대보험만)
  deduction_employment_insurance integer NOT NULL DEFAULT 0,      -- 고용보험 (2대보험만)
  deduction_income_tax        integer NOT NULL DEFAULT 0,         -- 소득세 (3.3%만)
  deduction_local_income_tax  integer NOT NULL DEFAULT 0,         -- 지방소득세 (3.3%만)
  deduction_amount    integer NOT NULL DEFAULT 0,                 -- 공제 합계
  net_salary          integer NOT NULL DEFAULT 0,                 -- 실수령액

  -- 이체 상태
  payment_status      text NOT NULL DEFAULT 'pending',            -- 'pending' | 'paid'
  paid_at             timestamptz,                                -- 이체 완료 시각

  -- 관리자 수정
  manual_adjustment   integer NOT NULL DEFAULT 0,                 -- 수동 조정액 (+/-, 예: 교통비)
  adjustment_reason   text,                                       -- 조정 사유

  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(payroll_period_id, profile_id)
);
```

### 3-3. hourly_wage 스냅샷 — 왜 필요한가

```
문제 상황:
  3월에 시급 12,000원으로 급여 정산 완료
  → 4월에 시급을 13,000원으로 변경
  → 3월 급여를 다시 보면? profiles.hourly_wage는 13,000원

해결:
  payroll_entries.hourly_wage에 정산 시점의 시급을 스냅샷으로 기록
  → 3월 entry에는 12,000원이 저장되어 있어 과거 정산 기록이 정확히 보존돼요

같은 이유로 insurance_type도 스냅샷 저장.
```

### 3-4. RLS 정책

```sql
-- payroll_periods
CREATE POLICY "org_admin_all" ON payroll_periods
  FOR ALL USING (is_org_admin(organization_id));

CREATE POLICY "master_bypass" ON payroll_periods
  FOR ALL USING (is_master());

-- payroll_entries
CREATE POLICY "org_admin_all" ON payroll_entries
  FOR ALL USING (is_org_admin(organization_id));

CREATE POLICY "employee_own_select" ON payroll_entries
  FOR SELECT USING (
    auth.uid() = profile_id
    AND EXISTS (
      SELECT 1 FROM payroll_periods pp
      WHERE pp.id = payroll_period_id
      AND pp.status IN ('confirmed', 'paid')  -- confirmed 이상만 직원에게 노출
    )
  );

CREATE POLICY "master_bypass" ON payroll_entries
  FOR ALL USING (is_master());
```

### 3-5. 인덱스

```sql
CREATE INDEX idx_payroll_periods_org_year_month
  ON payroll_periods(organization_id, year, month);

CREATE INDEX idx_payroll_entries_period
  ON payroll_entries(payroll_period_id);

CREATE INDEX idx_payroll_entries_profile
  ON payroll_entries(profile_id, created_at DESC);
```

---

## 4. API/Server Action 설계

### 4-1. calculatePayroll(orgId, year, month)

**역할**: 해당 월의 급여를 자동 계산하여 draft 상태로 저장

```typescript
"use server";

export async function calculatePayroll(
  orgId: string,
  year: number,
  month: number,
): Promise<{ periodId: string; entryCount: number; error: string | null }> {
  await requireOrgAdmin(orgId);

  // 1. 이미 confirmed/paid인 period가 있는지 확인
  const existing = await getExistingPeriod(orgId, year, month);
  if (existing?.status === "paid") {
    return { periodId: "", entryCount: 0, error: "이미 이체 완료된 급여예요" };
  }
  if (existing?.status === "confirmed") {
    return { periodId: "", entryCount: 0, error: "이미 확정된 급여예요. 수정하려면 확정을 취소해주세요" };
  }

  // 2. 해당 월의 날짜 범위
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = lastDayOfMonth(year, month); // "YYYY-MM-DD"

  // 3. 조직 내 활성 직원 목록 (시급이 있는 직원만)
  const members = await getActiveMembers(orgId);
  const eligibleMembers = members.filter(m => m.hourly_wage != null);

  // 4. payroll_period upsert (기존 draft면 재사용)
  const periodId = existing?.id ?? await createPeriod(orgId, year, month);

  // 5. 직원별 계산
  const entries = [];
  for (const member of eligibleMembers) {
    // 5-1. schedule_slots에서 근무 분 합산
    const scheduledMinutes = await calcScheduledMinutes(
      member.profile_id, orgId, monthStart, monthEnd
    );

    // 5-2. overtime_requests에서 승인된 추가근무 합산
    const overtimeMinutes = await calcOvertimeMinutes(
      member.profile_id, orgId, monthStart, monthEnd
    );

    const totalMinutes = scheduledMinutes + overtimeMinutes;

    // 5-3. 세전급여
    const grossSalary = Math.floor(totalMinutes * member.hourly_wage / 60);

    // 5-4. 공제 계산
    const deductions = member.insurance_type === "national"
      ? calcNationalDeductions(grossSalary)
      : calc33Deductions(grossSalary);

    // 5-5. 수동 조정 (기존 draft entry가 있으면 유지)
    const existingEntry = await getExistingEntry(periodId, member.profile_id);
    const manualAdj = existingEntry?.manual_adjustment ?? 0;
    const adjReason = existingEntry?.adjustment_reason ?? null;

    // 5-6. 실수령액
    const netSalary = grossSalary - deductions.total + manualAdj;

    entries.push({
      payroll_period_id: periodId,
      profile_id: member.profile_id,
      organization_id: orgId,
      scheduled_minutes: scheduledMinutes,
      overtime_minutes: overtimeMinutes,
      total_minutes: totalMinutes,
      hourly_wage: member.hourly_wage,
      insurance_type: member.insurance_type,
      gross_salary: grossSalary,
      ...deductionFields(deductions, member.insurance_type),
      deduction_amount: deductions.total,
      net_salary: netSalary,
      manual_adjustment: manualAdj,
      adjustment_reason: adjReason,
      payment_status: "pending",
    });
  }

  // 6. 기존 entries 삭제 후 재삽입 (upsert)
  await upsertEntries(periodId, entries);

  return { periodId, entryCount: entries.length, error: null };
}
```

### 4-2. confirmPayroll(periodId)

**역할**: draft → confirmed 전환 + 직원 알림 발송

```typescript
export async function confirmPayroll(
  periodId: string,
): Promise<{ error: string | null }> {
  // 1. period 조회 + 권한 확인
  const period = await getPeriod(periodId);
  await requireOrgAdmin(period.organization_id);

  if (period.status !== "draft") {
    return { error: "초안 상태의 급여만 확정할 수 있어요" };
  }

  // 2. entries 검증 — 시급 0원 또는 근무시간 0인 건 경고
  const entries = await getEntries(periodId);
  const zeroWageEntries = entries.filter(e => e.hourly_wage === 0);
  if (zeroWageEntries.length > 0) {
    return { error: "시급이 0원인 직원이 있어요. 확인 후 다시 시도해주세요" };
  }

  // 3. 상태 변경
  await updatePeriodStatus(periodId, "confirmed", user.id);

  // 4. 직원 알림 발송
  const year = period.year;
  const month = period.month;
  for (const entry of entries) {
    if (entry.total_minutes > 0) { // 근무 기록이 있는 직원만
      await createNotification({
        profile_id: entry.profile_id,
        target_role: "employee",
        type: "payroll_confirmed",
        title: "급여가 확정됐어요",
        content: `${month}월 급여 ${entry.net_salary.toLocaleString()}원이 확정됐어요`,
        source_id: periodId,
      });
    }
  }

  return { error: null };
}
```

### 4-3. unconfirmPayroll(periodId)

**역할**: confirmed → draft 되돌리기

```typescript
export async function unconfirmPayroll(
  periodId: string,
): Promise<{ error: string | null }> {
  const period = await getPeriod(periodId);
  await requireOrgAdmin(period.organization_id);

  if (period.status !== "confirmed") {
    return { error: "확정 상태의 급여만 취소할 수 있어요" };
  }

  // paid 상태인 entry가 하나라도 있으면 불가
  const paidEntries = await getPaidEntries(periodId);
  if (paidEntries.length > 0) {
    return { error: "이미 이체된 직원이 있어서 확정을 취소할 수 없어요" };
  }

  await updatePeriodStatus(periodId, "draft", null);

  return { error: null };
}
```

### 4-4. markAsPaid(entryId) / markAllAsPaid(periodId)

**역할**: 개별/전체 이체 완료 처리

```typescript
// 개별 이체 완료
export async function markEntryAsPaid(
  entryId: string,
): Promise<{ error: string | null }> {
  const entry = await getEntry(entryId);
  const period = await getPeriod(entry.payroll_period_id);
  await requireOrgAdmin(period.organization_id);

  if (period.status !== "confirmed") {
    return { error: "확정된 급여만 이체 처리할 수 있어요" };
  }

  await updateEntryPaymentStatus(entryId, "paid", new Date().toISOString());

  // 모든 entries가 paid인지 확인 → period도 paid로
  await checkAndUpdatePeriodToPaid(entry.payroll_period_id);

  return { error: null };
}

// 전체 이체 완료
export async function markAllAsPaid(
  periodId: string,
): Promise<{ error: string | null }> {
  const period = await getPeriod(periodId);
  await requireOrgAdmin(period.organization_id);

  if (period.status !== "confirmed") {
    return { error: "확정된 급여만 이체 처리할 수 있어요" };
  }

  const now = new Date().toISOString();
  await updateAllEntriesPaymentStatus(periodId, "paid", now);
  await updatePeriodStatus(periodId, "paid", null);

  return { error: null };
}
```

### 4-5. updatePayrollEntry(entryId, updates)

**역할**: draft 상태에서 관리자가 개별 항목 수정

```typescript
export async function updatePayrollEntry(
  entryId: string,
  updates: {
    hourly_wage?: number;
    scheduled_minutes?: number;
    overtime_minutes?: number;
    manual_adjustment?: number;
    adjustment_reason?: string;
  },
): Promise<{ error: string | null }> {
  const entry = await getEntry(entryId);
  const period = await getPeriod(entry.payroll_period_id);
  await requireOrgAdmin(period.organization_id);

  if (period.status !== "draft") {
    return { error: "초안 상태에서만 수정할 수 있어요" };
  }

  // 변경된 값으로 재계산
  const hourlyWage = updates.hourly_wage ?? entry.hourly_wage;
  const scheduledMin = updates.scheduled_minutes ?? entry.scheduled_minutes;
  const overtimeMin = updates.overtime_minutes ?? entry.overtime_minutes;
  const totalMin = scheduledMin + overtimeMin;
  const grossSalary = Math.floor(totalMin * hourlyWage / 60);

  const deductions = entry.insurance_type === "national"
    ? calcNationalDeductions(grossSalary)
    : calc33Deductions(grossSalary);

  const manualAdj = updates.manual_adjustment ?? entry.manual_adjustment;
  const netSalary = grossSalary - deductions.total + manualAdj;

  await updateEntry(entryId, {
    hourly_wage: hourlyWage,
    scheduled_minutes: scheduledMin,
    overtime_minutes: overtimeMin,
    total_minutes: totalMin,
    gross_salary: grossSalary,
    ...deductionFields(deductions, entry.insurance_type),
    deduction_amount: deductions.total,
    net_salary: netSalary,
    manual_adjustment: manualAdj,
    adjustment_reason: updates.adjustment_reason ?? entry.adjustment_reason,
  });

  return { error: null };
}
```

---

## 5. 관리자 UI 설계

### 5-1. 라우트

```
/[slug]/admin/payroll                    — 월별 급여 목록 (메인)
/[slug]/admin/payroll/[periodId]         — 급여 상세 (직원 목록 + 합계)
/[slug]/admin/payroll/[periodId]/[entryId] — 직원별 상세 (수정 가능)
```

### 5-2. 월별 급여 목록 화면

```
/[slug]/admin/payroll

┌─────────────────────────────────────────────┐
│  급여 정산                                   │
│                                             │
│  [← 2026년 2월]  2026년 3월  [4월 →]       │
│                                             │
│  상태: 초안                                  │
│  ─────────────────────────────────────────  │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │ 김민수         40h 00m               │  │
│  │ 시급 12,000원  │  세전 480,000원     │  │
│  │ 2대보험       │  실수령 437,064원   │  │
│  ├──────────────────────────────────────┤  │
│  │ 이지현         32h 00m               │  │
│  │ 시급 11,000원  │  세전 352,000원     │  │
│  │ 3.3%          │  실수령 340,384원   │  │
│  ├──────────────────────────────────────┤  │
│  │ 박서준         24h 00m               │  │
│  │ 시급 12,000원  │  세전 288,000원     │  │
│  │ 3.3%          │  실수령 278,496원   │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  ─────────────────────────────────────────  │
│  합계  96h 00m                              │
│  세전 합계: 1,120,000원                     │
│  공제 합계: 64,056원                        │
│  실수령 합계: 1,055,944원                   │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │        급여 계산하기 (재계산)        │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────────────────────┐   │
│  │        급여 확정하기                 │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

**상태별 버튼 표시:**

| period.status | 표시 버튼 |
|---------------|----------|
| draft | "급여 계산하기 (재계산)" + "급여 확정하기" |
| confirmed | "확정 취소" + "전체 이체 완료" |
| paid | 버튼 없음 (완료 뱃지만 표시) |

### 5-3. 직원별 상세 화면

```
/[slug]/admin/payroll/[periodId]/[entryId]

┌──────────────────────────────────────────┐
│  ← 급여 상세                              │
│                                          │
│  김민수  2026년 3월                      │
│  ─────────────────────────────────       │
│                                          │
│  근무 정보                                │
│  ┌───────────────────────────────────┐   │
│  │ 스케줄 근무    38h 00m            │   │
│  │ 추가근무       2h 00m             │   │
│  │ 총 근무시간    40h 00m            │   │
│  │ 시급           12,000원    [수정] │   │
│  └───────────────────────────────────┘   │
│                                          │
│  급여 계산                                │
│  ┌───────────────────────────────────┐   │
│  │ 세전급여         480,000원        │   │
│  │                                   │   │
│  │ [공제 - 2대보험]                  │   │
│  │   국민연금       -21,600원        │   │
│  │   건강보험       -17,016원        │   │
│  │   고용보험       -4,320원         │   │
│  │   공제 합계      -42,936원        │   │
│  │                                   │   │
│  │ 수동 조정        0원      [수정]  │   │
│  │                                   │   │
│  │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━     │   │
│  │ 실수령액         437,064원        │   │
│  └───────────────────────────────────┘   │
│                                          │
│  이체 정보                                │
│  ┌───────────────────────────────────┐   │
│  │ 국민은행  123-456-789  [복사]     │   │
│  │ 상태: 미이체                      │   │
│  │                                   │   │
│  │ [이체 완료 처리]                  │   │
│  └───────────────────────────────────┘   │
└──────────────────────────────────────────┘
```

**수정 동작:**

- **시급 수정**: 인라인 입력 → 즉시 재계산 → 모든 금액 업데이트
- **근무시간 수정**: 인라인 입력 → 즉시 재계산
- **수동 조정**: +/- 금액 입력 + 사유 기록

### 5-4. 확정 전/후 잠금

| 상태 | 수정 가능 항목 | 잠금 항목 |
|------|---------------|----------|
| draft | 시급, 근무시간, 수동조정, 메모 전부 | 없음 |
| confirmed | 없음 | 전체 잠금 (이체 완료 버튼만 활성) |
| paid | 없음 | 완전 잠금 (조회만 가능) |

### 5-5. 계좌번호 복사 기능

```typescript
// 직원 상세에서 계좌번호 + 금액 복사
function handleCopyAccount(entry: PayrollEntry, profile: Profile) {
  const text = `${profile.bank_name} ${profile.account_number}`;
  navigator.clipboard.writeText(text);
  toast.success("계좌번호를 복사했어요");
}

// 금액까지 포함 복사
function handleCopyWithAmount(entry: PayrollEntry, profile: Profile) {
  const text = `${profile.name} | ${profile.bank_name} ${profile.account_number} | ${entry.net_salary.toLocaleString()}원`;
  navigator.clipboard.writeText(text);
  toast.success("이체 정보를 복사했어요");
}
```

---

## 6. 직원 UI 설계

### 6-1. 마이페이지 급여 섹션

```
/[slug]/my

┌──────────────────────────────────────────┐
│  ...기존 마이페이지 항목들...            │
│                                          │
│  급여                                     │
│  ─────────────────────────────────       │
│                                          │
│  ┌───────────────────────────────────┐   │
│  │ 3월 급여                 확정됨 ✓ │   │
│  │                                   │   │
│  │ 세전          480,000원           │   │
│  │ 공제          -42,936원           │   │
│  │ ─────────────────────────         │   │
│  │ 실수령        437,064원           │   │
│  │                                   │   │
│  │               [상세보기 →]        │   │
│  └───────────────────────────────────┘   │
│                                          │
│  [이전 급여 이력 →]                      │
└──────────────────────────────────────────┘
```

### 6-2. 급여 상세 보기

```
/[slug]/my/payroll/[entryId]

┌──────────────────────────────────────────┐
│  ← 3월 급여                              │
│                                          │
│  근무 시간                                │
│  ┌───────────────────────────────────┐   │
│  │ 총 근무시간    40h 00m            │   │
│  └───────────────────────────────────┘   │
│                                          │
│  급여 내역                                │
│  ┌───────────────────────────────────┐   │
│  │ 세전급여         480,000원        │   │
│  │                                   │   │
│  │ [공제 내역]                       │   │
│  │   국민연금       -21,600원        │   │
│  │   건강보험       -17,016원        │   │
│  │   고용보험       -4,320원         │   │
│  │   공제 합계      -42,936원        │   │
│  │                                   │   │
│  │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━     │   │
│  │ 실수령액         437,064원        │   │
│  └───────────────────────────────────┘   │
│                                          │
│  상태: 확정됨                            │
└──────────────────────────────────────────┘
```

### 6-3. 급여 이력

```
/[slug]/my/payroll

┌──────────────────────────────────────────┐
│  ← 급여 이력                              │
│                                          │
│  ┌───────────────────────────────────┐   │
│  │ 2026년 3월          437,064원    │   │
│  │ 40h 00m  │  2대보험  │  확정됨  │   │
│  ├───────────────────────────────────┤   │
│  │ 2026년 2월          340,384원    │   │
│  │ 32h 00m  │  3.3%    │  이체완료 │   │
│  ├───────────────────────────────────┤   │
│  │ 2026년 1월          278,496원    │   │
│  │ 24h 00m  │  3.3%    │  이체완료 │   │
│  └───────────────────────────────────┘   │
└──────────────────────────────────────────┘
```

> 직원에게는 confirmed 또는 paid 상태인 급여만 표시돼요.
> draft 상태는 직원에게 보이지 않아요.

---

## 7. 알림 연동

### 7-1. 알림 타입 추가

| type | 수신 대상 | 발생 시점 | 내용 |
|------|----------|----------|------|
| `payroll_confirmed` | employee | 관리자가 급여 확정 시 | "{month}월 급여 {실수령액}원이 확정됐어요" |
| `payroll_paid` | employee | 이체 완료 처리 시 | "{month}월 급여가 이체됐어요" |
| `payroll_reminder` | owner | 매월 25일 (미확정 시) | "{month}월 급여가 아직 확정되지 않았어요" |

### 7-2. 급여 확정 알림 발송

```typescript
// confirmPayroll 내부에서 호출
async function sendPayrollConfirmedNotifications(
  periodId: string,
  year: number,
  month: number,
  entries: PayrollEntry[],
) {
  const notifications = entries
    .filter(e => e.total_minutes > 0)
    .map(entry => ({
      profile_id: entry.profile_id,
      target_role: "employee",
      type: "payroll_confirmed",
      title: "급여가 확정됐어요",
      content: `${month}월 급여 ${entry.net_salary.toLocaleString()}원이 확정됐어요`,
      source_id: periodId,
    }));

  await adminSupabase.from("notifications").insert(notifications);
}
```

### 7-3. 미확정 급여 리마인더 (Cron)

```
매월 25일 09:00 KST 실행
  → 모든 조직의 해당 월 payroll_periods 확인
  → status = 'draft' 또는 period 자체가 없는 경우
  → 해당 조직의 owner에게 리마인더 알림 발송
```

---

## 8. 한국 노동법 검증 포인트

### 8-1. 최저임금 체크

```
2026년 최저임금: 10,030원 (예상, 2025년 확정가 기준 추정)
※ 실제 2026년 최저임금은 2025년 8월 고용노동부 고시 확인 필요

구현:
  - profiles.hourly_wage 입력/수정 시 최저임금 미만이면 경고
  - calculatePayroll 시 시급 < 최저임금이면 entries에 경고 표시
  - 확정은 가능 (사장님 판단 존중) — 차단이 아닌 경고만

상수 관리:
  MINIMUM_WAGE_2026 = 10030  // src/lib/payroll-constants.ts
```

### 8-2. 근로시간 상한

```
주 52시간 제한:
  - 법정 근로 40시간 + 연장 근로 12시간
  - 5인 미만 사업장은 적용 제외 (연경당 포함 대부분의 소규모 F&B)
  - 그러나 SaaS 사용자 중 5인 이상 사업장이 있을 수 있음

구현:
  - MVP: 경고만 표시 (주 52시간 초과 시)
  - 차단은 하지 않음 (업종별/사업장 규모별 예외가 많아서)
  - 주 단위 합산은 schedule_slots에서 이미 가능
```

### 8-3. 급여명세서 교부 의무

```
근로기준법 제48조:
  "임금을 지급하는 때에는 근로자에게 임금의 구성항목, 계산방법,
   공제내역 등을 적은 임금명세서를 서면으로 교부하여야 한다."

2021년 11월 19일부터 모든 사업장에 의무화.
위반 시 500만원 이하 과태료.

구현:
  - 급여 확정 시 직원에게 앱 내 알림 + 상세 조회 기능 제공
  - 급여 상세 화면이 임금명세서 역할 (구성항목 + 계산방법 + 공제내역 포함)
  - v2: PDF 다운로드 기능 (법적 "서면" 요건 충족을 위해)
```

### 8-4. 기록 보관 기간

```
근로기준법 시행령 제22조:
  - 근로계약서: 3년
  - 임금대장(급여 기록): 3년
  - 임금 지급 명세: 3년

구현:
  - payroll_periods, payroll_entries 데이터는 삭제 불가 정책
  - paid 상태에서 DELETE 차단 (RLS + 애플리케이션 로직)
  - 3년 이전 데이터는 조회는 가능하되, 통계 쿼리에서 제외 (성능)
```

### 8-5. 그 외 준수 사항

| 항목 | 내용 | MVP 대응 |
|------|------|---------|
| 임금 전액 지급 | 법정 공제 외 임의 공제 금지 | 시스템이 법정 공제만 계산, 수동조정은 사유 기록 필수 |
| 통화 지급 | 원화로 지급 (외화 불가) | 원화 단위만 지원 |
| 정기 지급 | 매월 1회 이상 정기적으로 | 월별 정산 주기 고정 |
| 직접 지급 | 근로자 본인에게 | 계좌이체 기록으로 증빙 |

---

## 9. 엣지 케이스

### 9-1. 월 중간 입사

```
시나리오: 3월 15일에 입사한 직원

처리:
  - schedule_slots는 3/15 이후에만 존재 → 자동으로 15일치만 합산
  - 별도 처리 불필요 (스케줄 기반이므로 자연스럽게 해결)
  - 입사 전 슬롯이 없으므로 0분으로 계산
```

### 9-2. 월 중간 퇴사

```
시나리오: 3월 20일에 퇴사한 직원

처리:
  - terminate_membership() 호출 시 미래 schedule_slots 삭제
  - 3/1~3/20 슬롯만 남아 있으므로 자동으로 퇴사일까지만 합산
  - payroll_entries에 기록이 남아 급여 정산 가능
  - organization_memberships.status = 'terminated'여도 해당 월 급여는 계산
```

### 9-3. 월 중간 시급 변경

```
시나리오: 3월 1일 시급 11,000원 → 3월 16일부터 12,000원

MVP 처리:
  - profiles.hourly_wage는 현재 시급만 저장 (변경 이력 없음)
  - calculatePayroll 실행 시점의 시급으로 전체 월 계산
  - 관리자가 직원 상세에서 시급 수동 조정 가능

정확한 처리가 필요한 경우:
  - 관리자가 직원 상세 화면에서 시급을 직접 수정
  - 또는 수동 조정(manual_adjustment)으로 차액 보정

v2 개선:
  - hourly_wage_history 테이블 추가
  - 기간별 시급 자동 적용 (슬롯 날짜 기준으로 해당 시점 시급 조회)
```

### 9-4. 스케줄 없는 직원

```
시나리오: 시급은 설정돼 있지만 해당 월에 schedule_slots가 없는 직원

처리:
  - scheduled_minutes = 0, gross_salary = 0
  - payroll_entries에는 포함하되 0원으로 표시
  - 관리자가 목록에서 확인 가능 (의도적 무급인지 스케줄 누락인지 판단)
```

### 9-5. 일일 알바 (1일만 근무)

```
시나리오: employment_type = 'part_time_daily'인 직원이 3월에 1일만 근무

처리:
  - 1일치 schedule_slot만 합산 → 정상 계산
  - 예: 6시간 × 12,000원 = 72,000원
  - 3.3% 공제 시 실수령 69,624원
  - 최저임금 이하 일급(일 8시간 기준 80,240원)이면 경고 표시
```

### 9-6. 시급이 설정되지 않은 직원

```
시나리오: profiles.hourly_wage = null인 직원 (정규직 등)

처리:
  - calculatePayroll에서 제외 (hourly_wage가 null인 직원은 entries 생성 안 함)
  - 정규직 급여는 월급 기반이므로 별도 시스템 필요 → MVP 범위 외
  - 관리자 UI에 "시급 미설정 직원 N명" 안내 표시
```

### 9-7. 급여 재계산 시 기존 수동 조정 보존

```
시나리오: 관리자가 김민수 급여에 교통비 +50,000원 수동 조정 후, "재계산" 실행

처리:
  - calculatePayroll 시 기존 draft entry의 manual_adjustment, adjustment_reason 보존
  - 스케줄 시간 + 시급은 재계산, 수동 조정은 유지
  - 관리자에게 "수동 조정은 유지돼요" 토스트 표시
```

### 9-8. 동일 월 중복 period 방지

```
시나리오: 3월 급여를 두 번 생성하려 함

처리:
  - UNIQUE(organization_id, year, month) 제약조건으로 차단
  - calculatePayroll 시 기존 draft period가 있으면 재사용 (재계산)
  - confirmed/paid period가 있으면 에러 반환
```

---

## 10. 테스트 시나리오

### 10-1. 단위 테스트 (계산 로직)

```
TC-01: 기본 급여 계산
  입력: 2,400분, 시급 12,000원, 2대보험
  기대: 세전 480,000원, 공제 42,936원, 실수령 437,064원

TC-02: 3.3% 공제 계산
  입력: 1,920분, 시급 11,000원, 3.3%
  기대: 세전 352,000원, 소득세 10,560원, 지방소득세 1,056원, 실수령 340,384원

TC-03: 분 단위 급여 (나누어 떨어지지 않는 경우)
  입력: 2,537분, 시급 12,000원
  기대: 세전 floor(2537 × 12000 / 60) = floor(507,400) = 507,400원

TC-04: 0분 근무
  입력: 0분, 시급 12,000원
  기대: 세전 0원, 공제 0원, 실수령 0원

TC-05: 추가근무 포함
  입력: 스케줄 2,280분 + 추가근무 120분 = 2,400분, 시급 12,000원
  기대: 세전 480,000원

TC-06: 수동 조정 포함
  입력: 세전 480,000원, 2대보험 공제 42,936원, 수동조정 +50,000원
  기대: 실수령 480,000 - 42,936 + 50,000 = 487,064원

TC-07: 각 공제 항목별 floor 적용
  입력: 세전 123,456원, 2대보험
  기대:
    국민연금 floor(123,456 × 0.045) = floor(5,555.52) = 5,555원
    건강보험 floor(123,456 × 0.03545) = floor(4,374.50) = 4,374원
    고용보험 floor(123,456 × 0.009) = floor(1,111.10) = 1,111원
    합계 = 11,040원
    실수령 = 112,416원

TC-08: 지방소득세 = 소득세의 10%
  입력: 세전 333,333원, 3.3%
  기대:
    소득세 floor(333,333 × 0.03) = floor(9,999.99) = 9,999원
    지방소득세 floor(9,999 × 0.1) = floor(999.9) = 999원
    (주의: floor(333,333 × 0.003) = 999 와 동일하지만 계산 순서가 다름)
```

### 10-2. 통합 테스트 (워크플로우)

```
TC-10: 정상 플로우 (draft → confirmed → paid)
  1. calculatePayroll 실행 → period(draft) + entries 생성
  2. confirmPayroll 실행 → status = 'confirmed', 직원 알림 발송
  3. markAllAsPaid 실행 → status = 'paid'

TC-11: 재계산 (draft 상태에서)
  1. calculatePayroll 실행 → entries 생성
  2. 스케줄 변경 (슬롯 추가)
  3. calculatePayroll 재실행 → entries 업데이트, 수동조정 보존

TC-12: confirmed 상태에서 수정 시도
  1. confirmPayroll 실행
  2. updatePayrollEntry 시도 → "초안 상태에서만 수정할 수 있어요" 에러

TC-13: 확정 취소
  1. confirmPayroll 실행
  2. unconfirmPayroll 실행 → draft로 복귀
  3. updatePayrollEntry 가능

TC-14: 부분 이체
  1. confirmPayroll 실행
  2. markEntryAsPaid (직원 1만) → 직원 1: paid, period: confirmed
  3. markEntryAsPaid (직원 2) → 전원 paid → period: paid

TC-15: paid 상태에서 확정 취소 시도
  1. markAllAsPaid 실행
  2. unconfirmPayroll 시도 → 에러 (paid는 되돌릴 수 없음)
```

### 10-3. 엣지 케이스 테스트

```
TC-20: 시급 미설정 직원 제외
  → hourly_wage = null인 직원은 entries에 포함되지 않음

TC-21: 월 중간 입사 직원
  → 입사일 이후 슬롯만 합산, 이전 날짜는 0

TC-22: 스케줄 없는 직원
  → 0분, 0원으로 entry 생성

TC-23: 자정 넘김 슬롯 (22:00 → 02:00)
  → 4시간(240분)으로 계산

TC-24: 대타 처리된 슬롯
  → status = 'substituted'인 슬롯은 원래 직원에서 제외,
     대체 직원의 새 active 슬롯에서 합산

TC-25: confirmed 아닌 weekly_schedules의 슬롯
  → draft 주차의 슬롯은 급여 계산에서 제외
```

### 10-4. RLS 테스트

```
TC-30: 직원이 다른 직원의 급여 조회 시도 → 차단
TC-31: 직원이 draft 상태 급여 조회 시도 → 차단 (confirmed 이상만)
TC-32: 타 조직 관리자가 급여 조회 시도 → 차단
TC-33: master가 모든 조직 급여 조회 → 허용
```

---

## 11. 체크리스트

### Phase 1: DB

- [ ] payroll_periods 테이블 생성
- [ ] payroll_entries 테이블 생성 (항목별 공제 컬럼 포함)
- [ ] RLS 정책 설정 (org_admin_all, employee_own_select, master_bypass)
- [ ] 인덱스 생성
- [ ] notifications type에 `payroll_confirmed`, `payroll_paid`, `payroll_reminder` 추가

### Phase 2: 공제 계산 엔진

- [ ] `src/lib/payroll-constants.ts` 생성 (요율, 최저임금 상수)
- [ ] `src/lib/payroll-calc.ts` 생성 (calcNationalDeductions, calc33Deductions)
- [ ] 단위 테스트 작성 (TC-01 ~ TC-08)

### Phase 3: Server Actions

- [ ] `src/lib/payroll-actions.ts` 생성
- [ ] calculatePayroll 구현
- [ ] confirmPayroll 구현
- [ ] unconfirmPayroll 구현
- [ ] markEntryAsPaid / markAllAsPaid 구현
- [ ] updatePayrollEntry 구현

### Phase 4: 관리자 UI

- [ ] `/[slug]/admin/payroll` 월별 목록 페이지
- [ ] 월 선택 네비게이션 (< 이전월 | 다음월 >)
- [ ] 직원별 카드 리스트 (세전/공제/실수령 표시)
- [ ] 합계 표시 바
- [ ] "급여 계산하기" 버튼 + 로딩 상태
- [ ] "급여 확정하기" 버튼 + 확인 다이얼로그
- [ ] "확정 취소" 버튼
- [ ] "전체 이체 완료" 버튼
- [ ] 직원 카드 탭 → 상세 화면 이동
- [ ] 직원 상세: 공제 항목별 표시
- [ ] 직원 상세: 시급/시간/수동조정 인라인 수정 (draft만)
- [ ] 계좌번호 복사 버튼
- [ ] 상태별 잠금 UI 처리

### Phase 5: 직원 UI

- [ ] 마이페이지 급여 섹션 (최신 급여 카드)
- [ ] 급여 상세 보기 화면
- [ ] 급여 이력 화면 (월별 리스트)
- [ ] confirmed/paid만 노출 처리

### Phase 6: 알림

- [ ] 급여 확정 시 직원 알림 발송
- [ ] 이체 완료 시 알림 발송
- [ ] 미확정 급여 리마인더 Cron (매월 25일)

### Phase 7: 검증

- [ ] 최저임금 미만 경고 표시
- [ ] 통합 테스트 (TC-10 ~ TC-15)
- [ ] 엣지 케이스 테스트 (TC-20 ~ TC-25)
- [ ] RLS 테스트 (TC-30 ~ TC-33)
- [ ] 빌드 확인 (`npm run build`)

---

## 부록: 공제 요율 상수 관리

```typescript
// src/lib/payroll-constants.ts

/** 2026년 기준 (매년 연초 업데이트 필요) */

// 최저임금
export const MINIMUM_WAGE_2026 = 10_030; // 원/시간 (2026년 예상)

// 2대보험 근로자 부담률
export const NATIONAL_PENSION_RATE = 0.045;        // 국민연금 4.5%
export const HEALTH_INSURANCE_RATE = 0.03545;      // 건강보험 3.545% (장기요양 포함)
export const EMPLOYMENT_INSURANCE_RATE = 0.009;    // 고용보험 0.9%

// 3.3% 원천징수
export const INCOME_TAX_RATE = 0.03;               // 소득세 3.0%
export const LOCAL_INCOME_TAX_RATE = 0.1;          // 지방소득세 (소득세의 10%)

// 국민연금 기준소득월액 상·하한 (2026년 예상)
export const PENSION_MIN_MONTHLY = 370_000;        // 하한
export const PENSION_MAX_MONTHLY = 6_170_000;      // 상한
```
