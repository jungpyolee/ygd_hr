/** 공제 요율 (payroll_settings 테이블에서 조회) */
export interface PayrollRates {
  nationalPensionRate: number;
  healthInsuranceRate: number;
  employmentInsuranceRate: number;
  incomeTaxRate: number;
  localIncomeTaxMultiplier: number;
}

/** 2대보험 공제 결과 */
export interface NationalDeductions {
  nationalPension: number;
  healthInsurance: number;
  employmentInsurance: number;
  total: number;
}

/** 3.3% 원천징수 공제 결과 */
export interface IncomeTaxDeductions {
  incomeTax: number;
  localIncomeTax: number;
  total: number;
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

/** 2대보험 공제 (각 항목별 floor) */
export function calcNationalDeductions(gross: number, rates: PayrollRates): NationalDeductions {
  const nationalPension = Math.floor(gross * rates.nationalPensionRate);
  const healthInsurance = Math.floor(gross * rates.healthInsuranceRate);
  const employmentInsurance = Math.floor(gross * rates.employmentInsuranceRate);
  return {
    nationalPension,
    healthInsurance,
    employmentInsurance,
    total: nationalPension + healthInsurance + employmentInsurance,
  };
}

/** 3.3% 원천징수 공제 (지방소득세 = 소득세의 N%) */
export function calc33Deductions(gross: number, rates: PayrollRates): IncomeTaxDeductions {
  const incomeTax = Math.floor(gross * rates.incomeTaxRate);
  const localIncomeTax = Math.floor(incomeTax * rates.localIncomeTaxMultiplier);
  return {
    incomeTax,
    localIncomeTax,
    total: incomeTax + localIncomeTax,
  };
}

/** 보험 유형에 따라 공제 계산 분기 */
export function calcDeductions(
  gross: number,
  insuranceType: string,
  rates: PayrollRates,
): { deductions: NationalDeductions | IncomeTaxDeductions; total: number } {
  if (insuranceType === "national") {
    const d = calcNationalDeductions(gross, rates);
    return { deductions: d, total: d.total };
  }
  const d = calc33Deductions(gross, rates);
  return { deductions: d, total: d.total };
}

/** 실수령액 */
export function calcNetSalary(gross: number, deductionTotal: number, manualAdjustment: number): number {
  return gross - deductionTotal + manualAdjustment;
}

/** 공제 결과를 payroll_entries 컬럼 형태로 변환 */
export function deductionToEntryFields(
  insuranceType: string,
  deductions: NationalDeductions | IncomeTaxDeductions,
) {
  if (insuranceType === "national") {
    const d = deductions as NationalDeductions;
    return {
      deduction_national_pension: d.nationalPension,
      deduction_health_insurance: d.healthInsurance,
      deduction_employment_insurance: d.employmentInsurance,
      deduction_income_tax: 0,
      deduction_local_income_tax: 0,
    };
  }
  const d = deductions as IncomeTaxDeductions;
  return {
    deduction_national_pension: 0,
    deduction_health_insurance: 0,
    deduction_employment_insurance: 0,
    deduction_income_tax: d.incomeTax,
    deduction_local_income_tax: d.localIncomeTax,
  };
}
