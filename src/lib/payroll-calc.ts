/** 세금 유형 — 세무사 신고 구분 */
export type TaxCategory = "business" | "daily" | "regular";

/** 공제 요율 (payroll_settings 테이블에서 조회) */
export interface PayrollRates {
  nationalPensionRate: number;
  healthInsuranceRate: number;
  employmentInsuranceRate: number;
  incomeTaxRate: number;
  localIncomeTaxMultiplier: number;
  longTermCareRate: number;
}

/** 사업소득(3.3%) 공제 */
export interface BusinessDeductions {
  incomeTax: number;
  localIncomeTax: number;
  total: number;
}

/** 일용소득(고용보험만) 공제 */
export interface DailyDeductions {
  employmentInsurance: number;
  total: number;
}

/** 근로소득(4대보험) 공제 — 신고월액 기준 */
export interface RegularDeductions {
  nationalPension: number;
  healthInsurance: number;
  longTermCare: number;
  employmentInsurance: number;
  incomeTax: number;
  localIncomeTax: number;
  total: number;
}

export type Deductions = BusinessDeductions | DailyDeductions | RegularDeductions;

/** 10원 단위 절사 — 세무사 엑셀과 동일 규칙 */
export function floor10(n: number): number {
  return Math.floor(n / 10) * 10;
}

/** 슬롯 근무 분 계산 (자정 넘김 처리 포함) */
export function calcSlotMinutes(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes < 0) minutes += 24 * 60;
  return minutes;
}

/** 세전급여 = floor(총분 × 시급 / 60) */
export function calcGrossSalary(totalMinutes: number, hourlyWage: number): number {
  return Math.floor(totalMinutes * hourlyWage / 60);
}

/** 사업소득 공제 — 소득세 3% + 지방세 = 소득세 × 10%, 모두 10원 절사 */
export function calcBusinessDeductions(gross: number, rates: PayrollRates): BusinessDeductions {
  const incomeTax = floor10(gross * rates.incomeTaxRate);
  const localIncomeTax = floor10(incomeTax * rates.localIncomeTaxMultiplier);
  return { incomeTax, localIncomeTax, total: incomeTax + localIncomeTax };
}

/** 일용소득 공제 — 고용보험 한 건만, 10원 절사 */
export function calcDailyDeductions(gross: number, rates: PayrollRates): DailyDeductions {
  const employmentInsurance = floor10(gross * rates.employmentInsuranceRate);
  return { employmentInsurance, total: employmentInsurance };
}

/** 근로소득 공제 — 4대보험, 신고월액 기준. 소득세/지방세는 0 (세무사가 별도 급여명세서 작성). */
export function calcRegularDeductions(reportedSalary: number, rates: PayrollRates): RegularDeductions {
  const healthInsurance = floor10(reportedSalary * rates.healthInsuranceRate);
  const longTermCare = floor10(healthInsurance * rates.longTermCareRate);
  const nationalPension = floor10(reportedSalary * rates.nationalPensionRate);
  const employmentInsurance = floor10(reportedSalary * rates.employmentInsuranceRate);
  return {
    nationalPension,
    healthInsurance,
    longTermCare,
    employmentInsurance,
    incomeTax: 0,
    localIncomeTax: 0,
    total: nationalPension + healthInsurance + longTermCare + employmentInsurance,
  };
}

/** 세금 유형에 따라 공제 분기 */
export function calcDeductionsByCategory(
  category: TaxCategory,
  gross: number,
  reportedSalary: number,
  rates: PayrollRates,
): { deductions: Deductions; total: number } {
  if (category === "business") {
    const d = calcBusinessDeductions(gross, rates);
    return { deductions: d, total: d.total };
  }
  if (category === "daily") {
    const d = calcDailyDeductions(gross, rates);
    return { deductions: d, total: d.total };
  }
  const d = calcRegularDeductions(reportedSalary, rates);
  return { deductions: d, total: d.total };
}

/** 실수령액 */
export function calcNetSalary(gross: number, deductionTotal: number, manualAdjustment: number): number {
  return gross - deductionTotal + manualAdjustment;
}

/** 공제 결과를 payroll_entries 컬럼 형태로 변환 */
export function deductionToEntryFields(category: TaxCategory, d: Deductions) {
  const base = {
    deduction_national_pension: 0,
    deduction_health_insurance: 0,
    deduction_long_term_care: 0,
    deduction_employment_insurance: 0,
    deduction_income_tax: 0,
    deduction_local_income_tax: 0,
  };
  if (category === "business") {
    const x = d as BusinessDeductions;
    return { ...base, deduction_income_tax: x.incomeTax, deduction_local_income_tax: x.localIncomeTax };
  }
  if (category === "daily") {
    const x = d as DailyDeductions;
    return { ...base, deduction_employment_insurance: x.employmentInsurance };
  }
  const x = d as RegularDeductions;
  return {
    ...base,
    deduction_national_pension: x.nationalPension,
    deduction_health_insurance: x.healthInsurance,
    deduction_long_term_care: x.longTermCare,
    deduction_employment_insurance: x.employmentInsurance,
  };
}

/** insurance_type 하위 호환용 매핑 */
export function taxCategoryToInsuranceType(category: TaxCategory): string {
  return category === "business" ? "3.3" : "national";
}
