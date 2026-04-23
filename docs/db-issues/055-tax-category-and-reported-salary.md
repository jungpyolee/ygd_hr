# 055. 세금 유형 3분류 + 근로소득 신고월액 + 요양보험 요율

## 배경

세무사 엑셀(`2026.03. 시급계산기 연경당.xlsx`)은 **사업소득(3.3%) / 일용소득(2대보험) / 근로소득(4대보험)** 3시트로 구성돼요. 우리 시스템의 `profiles.insurance_type`은 `'national' | '3.3'` 두 값뿐이라 3분류를 담지 못하고, 근로소득의 "신고월액" 개념도 없어요.

대표적으로 `national`로 묶여 있는 김무아·유가온(실제는 일용)과 양인우(실제는 근로)가 섞여 있어서, 세무사 엑셀을 그대로 뽑으려면 구조적 분리가 필요해요.

## 원인 분석

- `insurance_type`은 2값 → 세무사 3분류 표현 불가.
- 근로소득 4대보험 공제는 실제 총시급이 아니라 **신고월액** 기준(양인우 예: 실지급 1,034,540 / 신고월액 1,000,000).
- 요양보험은 건강보험 공제에 파생되는 항목인데 payroll_settings에 요율이 없음.
- 세무사 엑셀은 세액을 **10원 단위 절사**로 계산 (264,000 × 0.3% = 792 → 790).

## 수정 내용

### DB (migration 055)
- `profiles.tax_category text`
- `payroll_entries.tax_category text`
- `payroll_entries.reported_salary integer` (근로소득 신고월액)
- `payroll_entries.deduction_long_term_care integer NOT NULL DEFAULT 0`
- `payroll_settings.long_term_care_rate numeric(6,4) NOT NULL DEFAULT 0.1295`
- 기존 값 매핑: `3.3 → business`, `national → regular` (일용은 관리자가 UI에서 수동 재분류)
- CHECK: `tax_category IN ('business','daily','regular')`
- `insurance_type`은 하위 호환을 위해 유지(deprecated).

### 계산 로직 (`src/lib/payroll-calc.ts`)
- `floor10` 헬퍼 추가 (10원 단위 절사).
- `calcBusinessDeductions(gross, rates)` = 소득세 3% + 지방세 = 소득세 × 10%
- `calcDailyDeductions(gross, rates)` = 고용보험 0.9%만
- `calcRegularDeductions(reported, rates)` = 건강 + 요양(건강×요양률) + 국민 + 고용, 소득세/지방세 0
- `calcDeductionsByCategory(cat, gross, reported, rates)` 분기 진입점
- `deductionToEntryFields`가 요양보험 컬럼도 매핑.

### 관리자 UI
- `EmployeeProfileModal` / `admin/employees` 편집폼: `insurance_type` → `tax_category` 셀렉트(사업/일용/근로). 근로 선택 시 `reported_salary` 입력 필드 노출.
- `admin/payroll` 카드 배지: "2대보험/3.3%" → "사업/일용/근로" 3색.
- 엔트리 편집 시 `tax_category`, 근로일 때 `reported_salary` 수정 가능.
- `insurance_type`은 저장 시 하위 호환으로 같이 갱신.

### 엑셀 출력 (`admin/payroll handleExportExcel`)
- 기존 단일 시트 제거.
- 시트 1: `사업소득(3.3%)` — 순번/성명/주민/근무시간/시급/총시급/국세/지방세/차인지급액
- 시트 2: `일용소득(2대보험)` — 순번/성명/주민/일한시간/시급/총시급/고용보험/차인지급액
- 시트 3: `근로소득(4대보험)` — 순번/성명/주민/일한시간/시급/총시급/신고월액/건강/요양/국민/고용/소득세/지방세/차인지급액
- 각 시트 하단: 총 근무시간 / 신고 총 금액 / 차인지급 총 금액 + 안내 문구.
- 파일명: `YYYY.MM. 시급계산기 연경당.xlsx`.

## 결과

### DB
- Dev(`rddplpiwvmclreeblkmi`)에 055 마이그레이션 실행 완료.
  - `profiles.tax_category`, `payroll_entries.tax_category`, `payroll_entries.reported_salary`, `payroll_entries.deduction_long_term_care`, `payroll_settings.long_term_care_rate (0.1295)` 추가.
  - 기존 매핑: `3.3 → business` (8명), `national → regular` (4명). insurance_type 없는 2명은 NULL.
  - CHECK 제약(`tax_category IN ('business','daily','regular')`) 적용.
- Prod 반영은 섹션 3-1 배포 절차로.

### 코드
- `src/lib/payroll-calc.ts` — `floor10`, `calcBusiness/Daily/Regular`, `calcDeductionsByCategory`, `deductionToEntryFields(cat, ...)`, `taxCategoryToInsuranceType`.
- `src/app/admin/payroll/page.tsx`
  - 타입: PayrollSettings에 `long_term_care_rate`, PayrollEntry에 `tax_category` / `reported_salary` / `deduction_long_term_care`.
  - `handleCalculate` — profiles에서 `tax_category` 조회, 분기 계산, insurance_type 하위 호환 유지.
  - `handleSaveEntry` — tax_category / reported_salary 편집 반영.
  - 카드 배지 3색(사업 주황 / 일용 초록 / 근로 파랑).
  - 공제 상세 패널 — tax_category별 공제 항목 노출 (근로는 신고월액·요양 포함).
  - 엔트리 편집 UI에 "세금 유형" 셀렉트 + 근로일 때 "신고월액" 입력.
  - 요율 설정 모달에 요양보험 입력 추가, 라벨도 "4대보험 / 사업소득(3.3%)"로 갱신.
- 엑셀 출력 — `사업소득(3.3%) / 일용소득(2대보험) / 근로소득(4대보험)` 3시트, 각 시트 하단 요약 3줄 + 안내 문구, 파일명 `YYYY.MM. 시급계산기 연경당.xlsx`.
- `src/components/EmployeeProfileModal.tsx` / `src/app/admin/employees/page.tsx` — "보험형태" 셀렉트/라디오 → "세금 유형"(사업/일용/근로). 저장 시 insurance_type 하위 호환으로 동시 갱신.

### 검증
- `npm run build` 통과.
- 세무사 2026.03 엑셀 대조 (공제 공식 일치 확인, 10원 단위 절사):
  - 김예지 264,000 → 국세 7,920 / 지방 790 ✅
  - 손은주 1,013,900 → 국세 30,410 / 지방 3,040 ✅
  - 김준휘 572,000 → 국세 17,160 / 지방 1,710 ✅
  - 김무아 528,000 → 고용 4,750 ✅
  - 유가온 594,000 → 고용 5,340 ✅
- 근로소득(양인우)은 현재 Dev의 요율이 세무사와 일부 달라(건강 3.55% vs 3.595%, 국민 4.5% vs 4.75%) 숫자 차이가 있으나 계산식은 동일. 요율 설정 UI에서 관리자가 조정 가능.

### 배포 후 수동 단계
1. 일용 직원(김무아·유가온 등)의 `tax_category`를 어드민에서 `daily`로 재분류.
2. 근로 직원(양인우 등)의 `reported_salary` 입력.
3. 필요 시 4대보험 요율(건강 / 국민 / 요양)을 세무사와 맞춰 `payroll_settings`에서 조정.
4. 해당 월 급여 "재계산" 한 번 → 엑셀 다운로드해 세무사 원본과 대조.
