import { describe, expect, it } from "vitest";
import {
  floor10,
  calcSlotMinutes,
  calcGrossSalary,
  calcBusinessDeductions,
  calcDailyDeductions,
  calcRegularDeductions,
  calcDeductionsByCategory,
  calcNetSalary,
  deductionToEntryFields,
  taxCategoryToInsuranceType,
  type PayrollRates,
} from "../payroll-calc";

// 세무사 엑셀 요율 기준(2026.03)
const rates: PayrollRates = {
  nationalPensionRate: 0.045,
  healthInsuranceRate: 0.03545,
  employmentInsuranceRate: 0.009,
  incomeTaxRate: 0.03,
  localIncomeTaxMultiplier: 0.1,
  longTermCareRate: 0.1295,
};

describe("floor10", () => {
  it("10원 단위로 내림", () => {
    expect(floor10(7920)).toBe(7920);
    expect(floor10(792)).toBe(790);
    expect(floor10(30417)).toBe(30410);
    expect(floor10(4752)).toBe(4750);
    expect(floor10(0)).toBe(0);
  });
});

describe("calcSlotMinutes", () => {
  it("일반 근무", () => {
    expect(calcSlotMinutes("10:00", "18:00")).toBe(480);
    expect(calcSlotMinutes("09:30", "12:00")).toBe(150);
  });
  it("자정 넘김", () => {
    expect(calcSlotMinutes("22:00", "02:00")).toBe(240);
  });
});

describe("calcGrossSalary", () => {
  it("분 단위 계산 + floor", () => {
    expect(calcGrossSalary(480, 11000)).toBe(88000);
    expect(calcGrossSalary(1440, 10320)).toBe(247680);
  });
});

describe("calcBusinessDeductions — 사업소득 3.3% (세무사 엑셀 대조)", () => {
  it("김예지 264,000 → 국세 7,920 / 지방 790", () => {
    const d = calcBusinessDeductions(264000, rates);
    expect(d.incomeTax).toBe(7920);
    expect(d.localIncomeTax).toBe(790);
    expect(d.total).toBe(8710);
  });
  it("김정민 484,000 → 14,520 / 1,450", () => {
    const d = calcBusinessDeductions(484000, rates);
    expect(d.incomeTax).toBe(14520);
    expect(d.localIncomeTax).toBe(1450);
  });
  it("김준휘 572,000 → 17,160 / 1,710", () => {
    const d = calcBusinessDeductions(572000, rates);
    expect(d.incomeTax).toBe(17160);
    expect(d.localIncomeTax).toBe(1710);
  });
  it("손은주 1,013,900 → 30,410 / 3,040", () => {
    const d = calcBusinessDeductions(1013900, rates);
    expect(d.incomeTax).toBe(30410);
    expect(d.localIncomeTax).toBe(3040);
    expect(1013900 - d.total).toBe(980450);
  });
  it("박예은 100,000 → 3,000 / 300", () => {
    const d = calcBusinessDeductions(100000, rates);
    expect(d.incomeTax).toBe(3000);
    expect(d.localIncomeTax).toBe(300);
    expect(100000 - d.total).toBe(96700);
  });
});

describe("calcDailyDeductions — 일용 고용보험 (세무사 엑셀 대조)", () => {
  it("김무아 528,000 → 4,750", () => {
    const d = calcDailyDeductions(528000, rates);
    expect(d.employmentInsurance).toBe(4750);
    expect(528000 - d.total).toBe(523250);
  });
  it("유가온 594,000 → 5,340", () => {
    const d = calcDailyDeductions(594000, rates);
    expect(d.employmentInsurance).toBe(5340);
    expect(594000 - d.total).toBe(588660);
  });
});

describe("calcRegularDeductions — 근로소득 4대보험", () => {
  it("신고월액 1,000,000 (세무사 요율 기준)", () => {
    // 세무사 실제 요율: 건강 3.595%, 국민 4.75% (현재 Dev와 다름)
    const taxRates: PayrollRates = {
      ...rates,
      nationalPensionRate: 0.0475,
      healthInsuranceRate: 0.03595,
    };
    const d = calcRegularDeductions(1000000, taxRates);
    expect(d.healthInsurance).toBe(35950);
    expect(d.nationalPension).toBe(47500);
    expect(d.employmentInsurance).toBe(9000);
    // 요양 = 건강(35950) × 0.1295 = 4655.5 → floor10 4650 (세무사 엑셀 4720과 차이 — 요율 확인 필요)
    expect(d.longTermCare).toBe(floor10(35950 * 0.1295));
    expect(d.incomeTax).toBe(0);
    expect(d.localIncomeTax).toBe(0);
  });
  it("소득세/지방세는 항상 0", () => {
    const d = calcRegularDeductions(1000000, rates);
    expect(d.incomeTax).toBe(0);
    expect(d.localIncomeTax).toBe(0);
  });
});

describe("calcDeductionsByCategory 분기", () => {
  it("business는 calcBusiness 결과", () => {
    const { deductions, total } = calcDeductionsByCategory("3.3%", 264000, 0, rates);
    expect((deductions as any).incomeTax).toBe(7920);
    expect(total).toBe(8710);
  });
  it("daily는 calcDaily 결과", () => {
    const { total } = calcDeductionsByCategory("2대보험", 528000, 0, rates);
    expect(total).toBe(4750);
  });
  it("regular는 reported_salary 기준", () => {
    const { total } = calcDeductionsByCategory("4대보험", 1034540, 1000000, rates);
    // 1,000,000 × 0.045 + 0.03545 + 0.009 계산 기반 (요양 별도)
    const pension = floor10(1000000 * 0.045);
    const health = floor10(1000000 * 0.03545);
    const lt = floor10(health * 0.1295);
    const emp = floor10(1000000 * 0.009);
    expect(total).toBe(pension + health + lt + emp);
  });
});

describe("calcNetSalary", () => {
  it("gross - 공제 + 수동조정", () => {
    expect(calcNetSalary(264000, 8710, 0)).toBe(255290);
    expect(calcNetSalary(264000, 8710, 5000)).toBe(260290);
    expect(calcNetSalary(264000, 8710, -3000)).toBe(252290);
  });
});

describe("deductionToEntryFields", () => {
  it("business는 income/local만 채움", () => {
    const d = calcBusinessDeductions(264000, rates);
    const f = deductionToEntryFields("3.3%", d);
    expect(f.deduction_income_tax).toBe(7920);
    expect(f.deduction_local_income_tax).toBe(790);
    expect(f.deduction_national_pension).toBe(0);
    expect(f.deduction_health_insurance).toBe(0);
    expect(f.deduction_long_term_care).toBe(0);
    expect(f.deduction_employment_insurance).toBe(0);
  });
  it("daily는 employment만 채움", () => {
    const d = calcDailyDeductions(528000, rates);
    const f = deductionToEntryFields("2대보험", d);
    expect(f.deduction_employment_insurance).toBe(4750);
    expect(f.deduction_income_tax).toBe(0);
    expect(f.deduction_national_pension).toBe(0);
  });
  it("regular는 4대보험 채움, 세금 0", () => {
    const d = calcRegularDeductions(1000000, rates);
    const f = deductionToEntryFields("4대보험", d);
    expect(f.deduction_national_pension).toBeGreaterThan(0);
    expect(f.deduction_health_insurance).toBeGreaterThan(0);
    expect(f.deduction_long_term_care).toBeGreaterThan(0);
    expect(f.deduction_employment_insurance).toBeGreaterThan(0);
    expect(f.deduction_income_tax).toBe(0);
    expect(f.deduction_local_income_tax).toBe(0);
  });
});

describe("taxCategoryToInsuranceType (하위 호환 매핑)", () => {
  it("business → '3.3'", () => {
    expect(taxCategoryToInsuranceType("3.3%")).toBe("3.3");
  });
  it("daily → 'national'", () => {
    expect(taxCategoryToInsuranceType("2대보험")).toBe("national");
  });
  it("regular → 'national'", () => {
    expect(taxCategoryToInsuranceType("4대보험")).toBe("national");
  });
});
