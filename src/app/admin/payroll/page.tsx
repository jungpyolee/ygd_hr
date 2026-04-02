"use client";

import { useState, useMemo, useCallback } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase";
import { format, lastDayOfMonth } from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";
import AvatarDisplay from "@/components/AvatarDisplay";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Settings2,
  Download,
  Calculator,
  Copy,
  ClipboardList,
  X,
  Pencil,
  AlertTriangle,
} from "lucide-react";
import {
  calcSlotMinutes,
  calcGrossSalary,
  calcDeductions,
  calcNetSalary,
  deductionToEntryFields,
  type PayrollRates,
} from "@/lib/payroll-calc";
import { MINIMUM_WAGE } from "@/lib/payroll-constants";

// ── 타입 ──────────────────────────────────────────────────────────────

interface PayrollSettings {
  id: string;
  national_pension_rate: number;
  health_insurance_rate: number;
  employment_insurance_rate: number;
  income_tax_rate: number;
  local_income_tax_multiplier: number;
}

interface PayrollPeriod {
  id: string;
  year: number;
  month: number;
  status: string;
  notes: string | null;
}

interface PayrollEntry {
  id: string;
  payroll_period_id: string;
  profile_id: string;
  scheduled_minutes: number;
  overtime_minutes: number;
  total_minutes: number;
  hourly_wage: number;
  insurance_type: string;
  gross_salary: number;
  deduction_national_pension: number;
  deduction_health_insurance: number;
  deduction_employment_insurance: number;
  deduction_income_tax: number;
  deduction_local_income_tax: number;
  deduction_amount: number;
  net_salary: number;
  payment_status: string;
  paid_at: string | null;
  manual_adjustment: number;
  adjustment_reason: string | null;
  // joined profile
  name: string;
  color_hex: string;
  avatar_config: any;
  bank_name: string | null;
  account_number: string | null;
  resident_registration_number: string | null;
}

interface SlotDetail {
  slot_date: string;
  start_time: string;
  end_time: string;
  store_name: string;
  minutes: number;
}

interface OTDetail {
  date: string;
  minutes: number;
}

// ── 헬퍼 ──────────────────────────────────────────────────────────────

function minutesToLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간`;
  return `${m}분`;
}

function minutesToHours(mins: number): string {
  const h = mins / 60;
  return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
}

function won(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

function settingsToRates(s: PayrollSettings): PayrollRates {
  return {
    nationalPensionRate: Number(s.national_pension_rate),
    healthInsuranceRate: Number(s.health_insurance_rate),
    employmentInsuranceRate: Number(s.employment_insurance_rate),
    incomeTaxRate: Number(s.income_tax_rate),
    localIncomeTaxMultiplier: Number(s.local_income_tax_multiplier),
  };
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────────

export default function AdminPayrollPage() {
  const supabase = useMemo(() => createClient(), []);
  const now = new Date();

  // 월 네비게이션
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  // UI 상태
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showWorkDetail, setShowWorkDetail] = useState<string | null>(null); // profile_id
  const [processing, setProcessing] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    hourly_wage?: number;
    scheduled_minutes?: number;
    overtime_minutes?: number;
    manual_adjustment?: number;
    adjustment_reason?: string;
  }>({});
  // 월 이동
  const goPrev = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
    setExpandedId(null);
  };
  const goNext = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
    setExpandedId(null);
  };

  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = format(lastDayOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");

  // ── 데이터 fetch ────────────────────────────────────────────────────

  // 1. 요율 설정
  const { data: settings, mutate: mutateSettings } = useSWR(
    "payroll-settings",
    async () => {
      const { data } = await supabase
        .from("payroll_settings")
        .select("*")
        .limit(1)
        .single();
      return data as PayrollSettings | null;
    },
    { dedupingInterval: 60_000 },
  );

  // 2. 해당 월 period
  const { data: period, mutate: mutatePeriod } = useSWR(
    ["payroll-period", year, month],
    async () => {
      const { data } = await supabase
        .from("payroll_periods")
        .select("*")
        .eq("year", year)
        .eq("month", month)
        .maybeSingle();
      return data as PayrollPeriod | null;
    },
    { dedupingInterval: 30_000 },
  );

  // 3. entries (period 있을 때만)
  const { data: entries = [], mutate: mutateEntries } = useSWR(
    period ? ["payroll-entries", period.id] : null,
    async () => {
      const { data } = await supabase
        .from("payroll_entries")
        .select(`
          *,
          profiles!profile_id(name, color_hex, avatar_config, bank_name, account_number, resident_registration_number)
        `)
        .eq("payroll_period_id", period!.id)
        .order("created_at");
      return (data ?? []).map((e: any) => ({
        ...e,
        name: e.profiles?.name ?? "?",
        color_hex: e.profiles?.color_hex ?? "#8B95A1",
        avatar_config: e.profiles?.avatar_config,
        bank_name: e.profiles?.bank_name,
        account_number: e.profiles?.account_number,
        resident_registration_number: e.profiles?.resident_registration_number,
        profiles: undefined,
      })) as PayrollEntry[];
    },
  );

  // 4. 근무내역 오버레이용 상세 데이터
  const { data: workDetailData } = useSWR(
    showWorkDetail ? ["payroll-work-detail", showWorkDetail, year, month] : null,
    async () => {
      const profileId = showWorkDetail!;
      // schedule_slots
      const { data: slots } = await supabase
        .from("schedule_slots")
        .select("slot_date, start_time, end_time, store_id, stores!store_id(name), weekly_schedules!inner(status)")
        .eq("profile_id", profileId)
        .eq("status", "active")
        .eq("weekly_schedules.status", "confirmed")
        .gte("slot_date", monthStart)
        .lte("slot_date", monthEnd)
        .order("slot_date");

      // overtime_requests
      const { data: ot } = await supabase
        .from("overtime_requests")
        .select("date, minutes")
        .eq("profile_id", profileId)
        .eq("status", "approved")
        .gte("date", monthStart)
        .lte("date", monthEnd)
        .order("date");

      const slotDetails: SlotDetail[] = (slots ?? []).map((s: any) => ({
        slot_date: s.slot_date,
        start_time: s.start_time,
        end_time: s.end_time,
        store_name: s.stores?.name ?? "",
        minutes: calcSlotMinutes(s.start_time, s.end_time),
      }));

      const otDetails: OTDetail[] = (ot ?? []).map((o: any) => ({
        date: o.date,
        minutes: o.minutes,
      }));

      return { slots: slotDetails, overtime: otDetails };
    },
  );

  // ── 합계 ────────────────────────────────────────────────────────────

  const totals = useMemo(() => {
    return entries.reduce(
      (acc, e) => ({
        totalMinutes: acc.totalMinutes + e.total_minutes,
        grossSalary: acc.grossSalary + e.gross_salary,
        deductionAmount: acc.deductionAmount + e.deduction_amount,
        netSalary: acc.netSalary + e.net_salary,
      }),
      { totalMinutes: 0, grossSalary: 0, deductionAmount: 0, netSalary: 0 },
    );
  }, [entries]);

  // ── 액션: 급여 계산하기 ─────────────────────────────────────────────

  const handleCalculate = useCallback(async () => {
    if (!settings) { toast.error("요율 설정을 불러올 수 없어요"); return; }
    setProcessing(true);
    try {
      const rates = settingsToRates(settings);

      // 1. 시급이 있는 활성 직원 목록
      const { data: members } = await supabase
        .from("profiles")
        .select("id, hourly_wage, insurance_type")
        .not("hourly_wage", "is", null)
        .eq("role", "employee");
      // admin도 포함 (사장님이 본인 급여도 계산할 수 있음)
      const { data: admins } = await supabase
        .from("profiles")
        .select("id, hourly_wage, insurance_type")
        .not("hourly_wage", "is", null)
        .eq("role", "admin");
      const allMembers = [...(members ?? []), ...(admins ?? [])];
      if (allMembers.length === 0) {
        toast.error("시급이 설정된 직원이 없어요");
        setProcessing(false);
        return;
      }

      // 2. schedule_slots (확정 스케줄, active 슬롯)
      const { data: slots } = await supabase
        .from("schedule_slots")
        .select("profile_id, start_time, end_time, weekly_schedules!inner(status)")
        .eq("status", "active")
        .eq("weekly_schedules.status", "confirmed")
        .gte("slot_date", monthStart)
        .lte("slot_date", monthEnd);

      // 3. overtime_requests (승인된 것만)
      const { data: otRecords } = await supabase
        .from("overtime_requests")
        .select("profile_id, minutes")
        .eq("status", "approved")
        .gte("date", monthStart)
        .lte("date", monthEnd);

      // 4. 슬롯별 분 합산 맵
      const slotMinMap = new Map<string, number>();
      (slots ?? []).forEach((s: any) => {
        const prev = slotMinMap.get(s.profile_id) ?? 0;
        slotMinMap.set(s.profile_id, prev + calcSlotMinutes(s.start_time, s.end_time));
      });

      // 5. 추가근무 분 합산 맵
      const otMinMap = new Map<string, number>();
      (otRecords ?? []).forEach((o: any) => {
        const prev = otMinMap.get(o.profile_id) ?? 0;
        otMinMap.set(o.profile_id, prev + o.minutes);
      });

      // 6. period upsert
      let periodId = period?.id;
      if (!periodId) {
        const { data: newPeriod, error } = await supabase
          .from("payroll_periods")
          .insert({ year, month })
          .select("id")
          .single();
        if (error) throw error;
        periodId = newPeriod.id;
      }

      // 7. 기존 entries의 수동 조정 보존
      const { data: existingEntries } = await supabase
        .from("payroll_entries")
        .select("profile_id, manual_adjustment, adjustment_reason")
        .eq("payroll_period_id", periodId);
      const adjMap = new Map<string, { manual_adjustment: number; adjustment_reason: string | null }>();
      (existingEntries ?? []).forEach((e: any) => {
        if (e.manual_adjustment !== 0) {
          adjMap.set(e.profile_id, {
            manual_adjustment: e.manual_adjustment,
            adjustment_reason: e.adjustment_reason,
          });
        }
      });

      // 8. 기존 entries 삭제
      await supabase.from("payroll_entries").delete().eq("payroll_period_id", periodId);

      // 9. 새 entries 계산 & 삽입
      const newEntries = allMembers.map((m: any) => {
        const scheduledMinutes = slotMinMap.get(m.id) ?? 0;
        const overtimeMinutes = otMinMap.get(m.id) ?? 0;
        const totalMinutes = scheduledMinutes + overtimeMinutes;
        const grossSalary = calcGrossSalary(totalMinutes, m.hourly_wage);
        const insuranceType = m.insurance_type ?? "3.3";
        const { deductions, total: deductionTotal } = calcDeductions(grossSalary, insuranceType, rates);
        const adj = adjMap.get(m.id);
        const manualAdj = adj?.manual_adjustment ?? 0;
        const netSalary = calcNetSalary(grossSalary, deductionTotal, manualAdj);

        return {
          payroll_period_id: periodId,
          profile_id: m.id,
          scheduled_minutes: scheduledMinutes,
          overtime_minutes: overtimeMinutes,
          total_minutes: totalMinutes,
          hourly_wage: m.hourly_wage,
          insurance_type: insuranceType,
          gross_salary: grossSalary,
          ...deductionToEntryFields(insuranceType, deductions),
          deduction_amount: deductionTotal,
          net_salary: netSalary,
          manual_adjustment: manualAdj,
          adjustment_reason: adj?.adjustment_reason ?? null,
        };
      });

      const { error: insertError } = await supabase
        .from("payroll_entries")
        .insert(newEntries);
      if (insertError) throw insertError;

      await mutatePeriod();
      await mutateEntries();
      toast.success(`${allMembers.length}명의 급여를 계산했어요`);
      if (adjMap.size > 0) {
        toast.info(`수동 조정 ${adjMap.size}건이 유지됐어요`);
      }
    } catch (err: any) {
      toast.error("급여 계산에 실패했어요");
      console.error(err);
    } finally {
      setProcessing(false);
    }
  }, [supabase, settings, period, year, month, monthStart, monthEnd, mutatePeriod, mutateEntries]);

  // ── 액션: 인라인 수정 ───────────────────────────────────────────────

  const handleSaveEntry = async (entry: PayrollEntry) => {
    if (!settings || !period) return;
    setProcessing(true);
    try {
      const rates = settingsToRates(settings);
      const hw = editValues.hourly_wage ?? entry.hourly_wage;
      const sm = editValues.scheduled_minutes ?? entry.scheduled_minutes;
      const om = editValues.overtime_minutes ?? entry.overtime_minutes;
      const totalMin = sm + om;
      const gross = calcGrossSalary(totalMin, hw);
      const { deductions, total: deductionTotal } = calcDeductions(gross, entry.insurance_type, rates);
      const manualAdj = editValues.manual_adjustment ?? entry.manual_adjustment;
      const net = calcNetSalary(gross, deductionTotal, manualAdj);

      const { error } = await supabase
        .from("payroll_entries")
        .update({
          hourly_wage: hw,
          scheduled_minutes: sm,
          overtime_minutes: om,
          total_minutes: totalMin,
          gross_salary: gross,
          ...deductionToEntryFields(entry.insurance_type, deductions),
          deduction_amount: deductionTotal,
          net_salary: net,
          manual_adjustment: manualAdj,
          adjustment_reason: editValues.adjustment_reason ?? entry.adjustment_reason,
        })
        .eq("id", entry.id);
      if (error) throw error;

      await mutateEntries();
      setEditingEntryId(null);
      setEditValues({});
      toast.success("수정했어요");
    } catch (err) {
      toast.error("수정에 실패했어요");
    } finally {
      setProcessing(false);
    }
  };

  // ── 액션: 요율 저장 ─────────────────────────────────────────────────

  const [rateForm, setRateForm] = useState<Partial<PayrollSettings>>({});

  const handleSaveSettings = async () => {
    if (!settings) return;
    setProcessing(true);
    try {
      const { error } = await supabase
        .from("payroll_settings")
        .update({
          national_pension_rate: rateForm.national_pension_rate ?? settings.national_pension_rate,
          health_insurance_rate: rateForm.health_insurance_rate ?? settings.health_insurance_rate,
          employment_insurance_rate: rateForm.employment_insurance_rate ?? settings.employment_insurance_rate,
          income_tax_rate: rateForm.income_tax_rate ?? settings.income_tax_rate,
          local_income_tax_multiplier: rateForm.local_income_tax_multiplier ?? settings.local_income_tax_multiplier,
        })
        .eq("id", settings.id);
      if (error) throw error;
      await mutateSettings();
      setShowSettings(false);
      setRateForm({});
      toast.success("요율을 저장했어요");
    } catch (err) {
      toast.error("저장에 실패했어요");
    } finally {
      setProcessing(false);
    }
  };

  // ── 액션: 엑셀 내보내기 ─────────────────────────────────────────────

  const handleExportExcel = async () => {
    if (entries.length === 0) return;
    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(`${year}년 ${month}월 급여`);

      // 제목 행
      sheet.mergeCells("A1:I1");
      const titleCell = sheet.getCell("A1");
      titleCell.value = `시급계산기 — ${year}년 ${month}월`;
      titleCell.font = { bold: true, size: 14 };
      titleCell.alignment = { horizontal: "center" };

      // 헤더 행
      const headers = [
        "순번", "성명", "주민등록번호",
        "일한 시간", "시간당 시급", "총 시급",
        "공제 유형", "공제액", "실제 지불 급여",
      ];
      const headerRow = sheet.addRow(headers);
      headerRow.font = { bold: true };
      headerRow.eachCell(cell => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F3FF" } };
        cell.border = {
          bottom: { style: "thin", color: { argb: "FFD1D6DB" } },
        };
      });

      // 데이터 행
      entries.forEach((entry, idx) => {
        const hours = entry.total_minutes / 60;
        const insuranceLabel = entry.insurance_type === "national" ? "2대보험" : "3.3%";
        const row = sheet.addRow([
          idx + 1,
          entry.name,
          entry.resident_registration_number ?? "",
          Number(hours % 1 === 0 ? hours : hours.toFixed(1)),
          entry.hourly_wage,
          entry.gross_salary,
          insuranceLabel + (entry.manual_adjustment !== 0 ? " (조정)" : ""),
          entry.deduction_amount - entry.manual_adjustment,
          entry.net_salary,
        ]);
        // 숫자 포맷
        [5, 6, 8, 9].forEach(col => {
          row.getCell(col).numFmt = "#,##0";
        });
      });

      // 합계 행
      sheet.addRow([]);
      const totalRow = sheet.addRow([
        "", "합계", "",
        Number((totals.totalMinutes / 60).toFixed(1)),
        "",
        totals.grossSalary,
        "",
        totals.deductionAmount,
        totals.netSalary,
      ]);
      totalRow.font = { bold: true };
      [6, 8, 9].forEach(col => {
        totalRow.getCell(col).numFmt = "#,##0";
      });

      // 열 너비
      sheet.getColumn(1).width = 6;
      sheet.getColumn(2).width = 12;
      sheet.getColumn(3).width = 18;
      sheet.getColumn(4).width = 12;
      sheet.getColumn(5).width = 12;
      sheet.getColumn(6).width = 14;
      sheet.getColumn(7).width = 14;
      sheet.getColumn(8).width = 12;
      sheet.getColumn(9).width = 16;

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `급여_${year}년${String(month).padStart(2, "0")}월.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("엑셀을 다운로드했어요");
    } catch (err) {
      toast.error("엑셀 생성에 실패했어요");
      console.error(err);
    }
  };

  // ── 복사 ────────────────────────────────────────────────────────────

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label}을 복사했어요`);
  };

  // ── 렌더 ────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[640px] mx-auto pb-32">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-[22px] font-bold text-[#191F28]">급여 정산</h1>
        <button
          onClick={() => {
            setRateForm({});
            setShowSettings(true);
          }}
          className="p-2 rounded-xl hover:bg-[#F2F4F6] transition-colors"
          title="공제 요율 설정"
        >
          <Settings2 className="w-5 h-5 text-[#8B95A1]" />
        </button>
      </div>

      {/* 월 네비게이션 */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={goPrev} className="p-2 rounded-xl hover:bg-[#F2F4F6]">
          <ChevronLeft className="w-5 h-5 text-[#4E5968]" />
        </button>
        <p className="text-[17px] font-bold text-[#191F28]">
          {year}년 {month}월
        </p>
        <button onClick={goNext} className="p-2 rounded-xl hover:bg-[#F2F4F6]">
          <ChevronRight className="w-5 h-5 text-[#4E5968]" />
        </button>
      </div>

      {/* 급여 데이터가 없을 때 */}
      {!period && (
        <div className="text-center py-16">
          <Calculator className="w-12 h-12 text-[#D1D6DB] mx-auto mb-4" />
          <p className="text-[15px] text-[#8B95A1] mb-6">
            {year}년 {month}월 급여가 아직 계산되지 않았어요
          </p>
          <button
            onClick={handleCalculate}
            disabled={processing}
            className="px-6 py-3 bg-[#3182F6] text-white rounded-2xl text-[15px] font-semibold
                       hover:bg-[#1B64DA] disabled:opacity-50 transition-colors"
          >
            {processing ? "계산중..." : "급여 계산하기"}
          </button>
        </div>
      )}

      {/* 직원 카드 리스트 */}
      {period && entries.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#E5E8EB] overflow-hidden mb-4">
          <div className="divide-y divide-[#F2F4F6]">
            {entries.map(entry => {
              const isExpanded = expandedId === entry.id;
              const isEditing = editingEntryId === entry.id;
              const belowMinWage = entry.hourly_wage < MINIMUM_WAGE;

              return (
                <div key={entry.id}>
                  {/* 카드 헤더 */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    className={`w-full text-left px-4 py-3.5 transition-colors ${
                      isExpanded ? "bg-[#F9FAFB]" : "hover:bg-[#F9FAFB]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <AvatarDisplay
                        userId={entry.profile_id}
                        avatarConfig={entry.avatar_config}
                        size={40}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] font-semibold text-[#191F28]">
                            {entry.name}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            entry.insurance_type === "national"
                              ? "bg-[#E8F3FF] text-[#3182F6]"
                              : "bg-[#FEF3C7] text-[#F59E0B]"
                          }`}>
                            {entry.insurance_type === "national" ? "2대보험" : "3.3%"}
                          </span>
                          {belowMinWage && (
                            <AlertTriangle className="w-3.5 h-3.5 text-[#F59E0B]" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[12px] text-[#8B95A1]">
                            {minutesToHours(entry.total_minutes)}
                          </span>
                          <span className="text-[12px] text-[#8B95A1]">·</span>
                          <span className="text-[12px] text-[#8B95A1]">
                            시급 {entry.hourly_wage.toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[14px] font-bold text-[#191F28]">
                          {won(entry.net_salary)}
                        </p>
                        <p className="text-[11px] text-[#8B95A1]">
                          세전 {won(entry.gross_salary)}
                        </p>
                      </div>
                      <div className="ml-1">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-[#D1D6DB]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[#D1D6DB]" />
                        )}
                      </div>
                    </div>
                  </button>

                  {/* 확장 상세 패널 */}
                  {isExpanded && (
                    <div className="px-4 py-4 bg-[#F9FAFB] border-t border-[#F2F4F6] space-y-4">
                      {/* 근무 시간 */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[12px] font-semibold text-[#4E5968]">근무 시간</p>
                          <button
                            onClick={() => setShowWorkDetail(entry.profile_id)}
                            className="flex items-center gap-1 text-[11px] text-[#3182F6] font-semibold"
                          >
                            <ClipboardList className="w-3.5 h-3.5" />
                            근무내역 보기
                          </button>
                        </div>
                        {isEditing ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] text-[#8B95A1] w-16">스케줄</span>
                              <input
                                type="number"
                                defaultValue={entry.scheduled_minutes}
                                onChange={e => setEditValues(v => ({ ...v, scheduled_minutes: Number(e.target.value) }))}
                                className="w-24 px-2 py-1 text-[13px] border border-[#E5E8EB] rounded-lg"
                              />
                              <span className="text-[11px] text-[#8B95A1]">분</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] text-[#8B95A1] w-16">추가근무</span>
                              <input
                                type="number"
                                defaultValue={entry.overtime_minutes}
                                onChange={e => setEditValues(v => ({ ...v, overtime_minutes: Number(e.target.value) }))}
                                className="w-24 px-2 py-1 text-[13px] border border-[#E5E8EB] rounded-lg"
                              />
                              <span className="text-[11px] text-[#8B95A1]">분</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] text-[#8B95A1] w-16">시급</span>
                              <input
                                type="number"
                                defaultValue={entry.hourly_wage}
                                onChange={e => setEditValues(v => ({ ...v, hourly_wage: Number(e.target.value) }))}
                                className="w-24 px-2 py-1 text-[13px] border border-[#E5E8EB] rounded-lg"
                              />
                              <span className="text-[11px] text-[#8B95A1]">원</span>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-2 text-[13px]">
                            <div>
                              <p className="text-[#8B95A1] text-[11px]">스케줄</p>
                              <p className="font-semibold text-[#191F28]">{minutesToLabel(entry.scheduled_minutes)}</p>
                            </div>
                            <div>
                              <p className="text-[#8B95A1] text-[11px]">추가근무</p>
                              <p className="font-semibold text-[#191F28]">{minutesToLabel(entry.overtime_minutes)}</p>
                            </div>
                            <div>
                              <p className="text-[#8B95A1] text-[11px]">합계</p>
                              <p className="font-semibold text-[#191F28]">{minutesToLabel(entry.total_minutes)}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 공제 상세 */}
                      <div>
                        <p className="text-[12px] font-semibold text-[#4E5968] mb-2">급여 계산</p>
                        <div className="space-y-1 text-[13px]">
                          <div className="flex justify-between">
                            <span className="text-[#4E5968]">세전급여</span>
                            <span className="font-semibold">{won(entry.gross_salary)}</span>
                          </div>
                          {entry.insurance_type === "national" ? (
                            <>
                              <div className="flex justify-between text-[#8B95A1]">
                                <span className="pl-3">국민연금</span>
                                <span>-{won(entry.deduction_national_pension)}</span>
                              </div>
                              <div className="flex justify-between text-[#8B95A1]">
                                <span className="pl-3">건강보험</span>
                                <span>-{won(entry.deduction_health_insurance)}</span>
                              </div>
                              <div className="flex justify-between text-[#8B95A1]">
                                <span className="pl-3">고용보험</span>
                                <span>-{won(entry.deduction_employment_insurance)}</span>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex justify-between text-[#8B95A1]">
                                <span className="pl-3">소득세</span>
                                <span>-{won(entry.deduction_income_tax)}</span>
                              </div>
                              <div className="flex justify-between text-[#8B95A1]">
                                <span className="pl-3">지방소득세</span>
                                <span>-{won(entry.deduction_local_income_tax)}</span>
                              </div>
                            </>
                          )}
                          <div className="flex justify-between text-[#4E5968] font-semibold">
                            <span>공제 합계</span>
                            <span>-{won(entry.deduction_amount)}</span>
                          </div>
                          {entry.manual_adjustment !== 0 && (
                            <div className="flex justify-between text-[#3182F6]">
                              <span>수동 조정{entry.adjustment_reason ? ` (${entry.adjustment_reason})` : ""}</span>
                              <span>{entry.manual_adjustment > 0 ? "+" : ""}{won(entry.manual_adjustment)}</span>
                            </div>
                          )}
                          <div className="border-t border-[#E5E8EB] pt-1 flex justify-between font-bold text-[#191F28]">
                            <span>실수령액</span>
                            <span>{won(entry.net_salary)}</span>
                          </div>
                        </div>
                      </div>

                      {/* 수동 조정 (편집모드) */}
                      {isEditing && (
                        <div>
                          <p className="text-[12px] font-semibold text-[#4E5968] mb-2">수동 조정</p>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              defaultValue={entry.manual_adjustment}
                              onChange={e => setEditValues(v => ({ ...v, manual_adjustment: Number(e.target.value) }))}
                              className="w-28 px-2 py-1 text-[13px] border border-[#E5E8EB] rounded-lg"
                              placeholder="금액"
                            />
                            <span className="text-[11px] text-[#8B95A1]">원</span>
                          </div>
                          <input
                            type="text"
                            defaultValue={entry.adjustment_reason ?? ""}
                            onChange={e => setEditValues(v => ({ ...v, adjustment_reason: e.target.value }))}
                            className="mt-1 w-full px-2 py-1 text-[13px] border border-[#E5E8EB] rounded-lg"
                            placeholder="사유 (예: 교통비, 4대보험 공제)"
                          />
                        </div>
                      )}

                      {/* 계좌 정보 */}
                      {(entry.bank_name || entry.account_number) && (
                        <div>
                          <p className="text-[12px] font-semibold text-[#4E5968] mb-1">이체 정보</p>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] text-[#191F28]">
                              {entry.bank_name} {entry.account_number}
                            </span>
                            <button
                              onClick={() => copyText(
                                `${entry.bank_name} ${entry.account_number}`,
                                "계좌번호",
                              )}
                              className="p-1 hover:bg-[#E5E8EB] rounded"
                            >
                              <Copy className="w-3.5 h-3.5 text-[#8B95A1]" />
                            </button>
                            <button
                              onClick={() => copyText(
                                `${entry.name} | ${entry.bank_name} ${entry.account_number} | ${won(entry.net_salary)}`,
                                "이체 정보",
                              )}
                              className="text-[11px] text-[#3182F6] font-semibold"
                            >
                              전체 복사
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 액션 버튼 */}
                      <div className="flex gap-2 pt-1">
                        {!isEditing && (
                          <button
                            onClick={() => {
                              setEditingEntryId(entry.id);
                              setEditValues({});
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-semibold text-[#4E5968] bg-white border border-[#E5E8EB] rounded-xl hover:bg-[#F2F4F6]"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            수정
                          </button>
                        )}
                        {isEditing && (
                          <>
                            <button
                              onClick={() => handleSaveEntry(entry)}
                              disabled={processing}
                              className="px-3 py-1.5 text-[12px] font-semibold text-white bg-[#3182F6] rounded-xl hover:bg-[#1B64DA] disabled:opacity-50"
                            >
                              저장
                            </button>
                            <button
                              onClick={() => { setEditingEntryId(null); setEditValues({}); }}
                              className="px-3 py-1.5 text-[12px] font-semibold text-[#8B95A1] bg-white border border-[#E5E8EB] rounded-xl"
                            >
                              취소
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 합계 바 */}
      {period && entries.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#E5E8EB] p-4 mb-4">
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <div>
              <p className="text-[#8B95A1] text-[11px]">총 근무시간</p>
              <p className="font-bold text-[#191F28]">{minutesToLabel(totals.totalMinutes)}</p>
            </div>
            <div>
              <p className="text-[#8B95A1] text-[11px]">세전 합계</p>
              <p className="font-bold text-[#191F28]">{won(totals.grossSalary)}</p>
            </div>
            <div>
              <p className="text-[#8B95A1] text-[11px]">공제 합계</p>
              <p className="font-bold text-[#EF4444]">-{won(totals.deductionAmount)}</p>
            </div>
            <div>
              <p className="text-[#8B95A1] text-[11px]">실수령 합계</p>
              <p className="font-bold text-[#3182F6] text-[15px]">{won(totals.netSalary)}</p>
            </div>
          </div>
        </div>
      )}

      {/* 액션 버튼 영역 */}
      {period && (
        <div className="space-y-2 mb-6">
          {entries.length > 0 && (
            <button
              onClick={handleExportExcel}
              className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-[#E5E8EB] rounded-2xl text-[14px] font-semibold text-[#4E5968] hover:bg-[#F9FAFB] transition-colors"
            >
              <Download className="w-4 h-4" />
              세무기장용 엑셀 내보내기
            </button>
          )}
          <button
            onClick={handleCalculate}
            disabled={processing}
            className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-[#E5E8EB] rounded-2xl text-[14px] font-semibold text-[#4E5968] hover:bg-[#F9FAFB] disabled:opacity-50 transition-colors"
          >
            <Calculator className="w-4 h-4" />
            {processing ? "계산중..." : "급여 재계산"}
          </button>
        </div>
      )}

      {/* ── 요율 설정 모달 ───────────────────────────────────────────── */}
      {showSettings && settings && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[28px] w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[17px] font-bold text-[#191F28]">공제 요율 설정</h2>
              <button onClick={() => setShowSettings(false)} className="p-1">
                <X className="w-5 h-5 text-[#8B95A1]" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-[13px] font-semibold text-[#4E5968] mb-2">2대보험</p>
                <div className="space-y-2">
                  {([
                    ["national_pension_rate", "국민연금"] as const,
                    ["health_insurance_rate", "건강보험"] as const,
                    ["employment_insurance_rate", "고용보험"] as const,
                  ]).map(([key, label]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-[13px] text-[#4E5968] w-16">{label}</span>
                      <input
                        type="number"
                        step="0.001"
                        defaultValue={Number(Number(settings[key]) * 100).toFixed(3)}
                        onChange={e => setRateForm(f => ({ ...f, [key]: Number(e.target.value) / 100 }))}
                        className="w-24 px-2 py-1.5 text-[13px] border border-[#E5E8EB] rounded-lg text-right"
                      />
                      <span className="text-[13px] text-[#8B95A1]">%</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[13px] font-semibold text-[#4E5968] mb-2">3.3% 원천징수</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-[#4E5968] w-16">소득세</span>
                    <input
                      type="number"
                      step="0.01"
                      defaultValue={Number(Number(settings.income_tax_rate) * 100).toFixed(2)}
                      onChange={e => setRateForm(f => ({ ...f, income_tax_rate: Number(e.target.value) / 100 }))}
                      className="w-24 px-2 py-1.5 text-[13px] border border-[#E5E8EB] rounded-lg text-right"
                    />
                    <span className="text-[13px] text-[#8B95A1]">%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-[#4E5968] w-16">지방소득세</span>
                    <span className="text-[13px] text-[#8B95A1]">소득세의</span>
                    <input
                      type="number"
                      step="1"
                      defaultValue={Number(Number(settings.local_income_tax_multiplier) * 100).toFixed(0)}
                      onChange={e => setRateForm(f => ({ ...f, local_income_tax_multiplier: Number(e.target.value) / 100 }))}
                      className="w-16 px-2 py-1.5 text-[13px] border border-[#E5E8EB] rounded-lg text-right"
                    />
                    <span className="text-[13px] text-[#8B95A1]">%</span>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleSaveSettings}
              disabled={processing}
              className="w-full mt-6 py-3 bg-[#3182F6] text-white rounded-2xl text-[14px] font-semibold
                         hover:bg-[#1B64DA] disabled:opacity-50 transition-colors"
            >
              {processing ? "저장중..." : "저장"}
            </button>
          </div>
        </div>
      )}

      {/* ── 근무내역 오버레이 ────────────────────────────────────────── */}
      {showWorkDetail && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white rounded-t-[28px] sm:rounded-[28px] w-full max-w-md max-h-[80vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[17px] font-bold text-[#191F28]">
                {entries.find(e => e.profile_id === showWorkDetail)?.name} — {month}월 근무내역
              </h2>
              <button onClick={() => setShowWorkDetail(null)} className="p-1">
                <X className="w-5 h-5 text-[#8B95A1]" />
              </button>
            </div>

            {!workDetailData ? (
              <p className="text-[13px] text-[#8B95A1] text-center py-8">불러오는 중...</p>
            ) : (
              <div className="space-y-5">
                {/* 스케줄 근무 */}
                <div>
                  <p className="text-[13px] font-semibold text-[#4E5968] mb-2">스케줄 근무</p>
                  {workDetailData.slots.length === 0 ? (
                    <p className="text-[12px] text-[#8B95A1]">스케줄 없음</p>
                  ) : (
                    <div className="space-y-1">
                      {workDetailData.slots.map((slot, i) => (
                        <div key={i} className="flex items-center text-[13px] py-1">
                          <span className="text-[#4E5968] w-20">
                            {format(new Date(slot.slot_date + "T00:00:00"), "M/d (EEE)", { locale: ko })}
                          </span>
                          <span className="text-[#191F28] flex-1">
                            {slot.start_time.slice(0, 5)}~{slot.end_time.slice(0, 5)}
                          </span>
                          <span className="text-[#8B95A1] w-10 text-right">
                            {minutesToLabel(slot.minutes)}
                          </span>
                          <span className="text-[#8B95A1] w-12 text-right text-[11px]">
                            {slot.store_name}
                          </span>
                        </div>
                      ))}
                      <div className="border-t border-[#F2F4F6] pt-1 flex justify-between text-[13px] font-semibold">
                        <span className="text-[#4E5968]">소계</span>
                        <span className="text-[#191F28]">
                          {minutesToLabel(workDetailData.slots.reduce((s, sl) => s + sl.minutes, 0))}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 추가근무 */}
                <div>
                  <p className="text-[13px] font-semibold text-[#4E5968] mb-2">추가근무 (승인)</p>
                  {workDetailData.overtime.length === 0 ? (
                    <p className="text-[12px] text-[#8B95A1]">추가근무 없음</p>
                  ) : (
                    <div className="space-y-1">
                      {workDetailData.overtime.map((ot, i) => (
                        <div key={i} className="flex items-center text-[13px] py-1">
                          <span className="text-[#4E5968] w-20">
                            {format(new Date(ot.date + "T00:00:00"), "M/d (EEE)", { locale: ko })}
                          </span>
                          <span className="text-[#191F28] flex-1">{minutesToLabel(ot.minutes)}</span>
                        </div>
                      ))}
                      <div className="border-t border-[#F2F4F6] pt-1 flex justify-between text-[13px] font-semibold">
                        <span className="text-[#4E5968]">소계</span>
                        <span className="text-[#191F28]">
                          {minutesToLabel(workDetailData.overtime.reduce((s, o) => s + o.minutes, 0))}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 총합 */}
                <div className="bg-[#F2F4F6] rounded-xl p-3 flex justify-between text-[14px] font-bold">
                  <span className="text-[#191F28]">총 합계</span>
                  <span className="text-[#3182F6]">
                    {minutesToLabel(
                      workDetailData.slots.reduce((s, sl) => s + sl.minutes, 0) +
                      workDetailData.overtime.reduce((s, o) => s + o.minutes, 0),
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
