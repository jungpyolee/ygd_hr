"use client";

import { useState, useMemo } from "react";
import AvatarDisplay from "@/components/AvatarDisplay";
import useSWR from "swr";
import { createClient } from "@/lib/supabase";
import { format, subDays } from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, CheckCircle2, X, ChevronDown, ChevronUp } from "lucide-react";

// ── 상수 ──────────────────────────────────────────────────────────────

const POSITION_LABELS: Record<string, string> = {
  hall: "홀",
  kitchen: "주방",
  showroom: "쇼룸",
};

// ── 타입 ──────────────────────────────────────────────────────────────

interface StoreSettings {
  overtime_unit: number; // 15 | 30 | 60 | 0(자유)
  overtime_include_early: boolean;
  overtime_min_minutes: number;
}

interface EmpDay {
  profile_id: string;
  name: string;
  color_hex: string;
  avatar_config?: any;
  date: string; // "yyyy-MM-dd"
  actual_in: string; // "HH:mm"
  actual_out: string;
  actual_minutes: number;
  // 스케줄
  schedule_start: string | null;
  schedule_end: string | null;
  schedule_store_name: string | null;
  schedule_position_keys: string[];
  // 시간 차이 계산
  late_in_minutes: number;       // 지각 (스케줄보다 늦게 출근)
  early_in_raw_minutes: number;  // 일찍 출근 (항상 계산, 설정 무관)
  early_in_counted: boolean;     // overtime_include_early 설정으로 집계에 포함됐는지
  late_out_minutes: number;      // 늦게 퇴근
  // 출근 위치
  check_in_type: string;
  check_in_store_name: string | null;
  check_in_distance_m: number | null;
  // 퇴근 위치
  check_out_type: string;
  check_out_store_name: string | null;
  check_out_distance_m: number | null;
  check_out_reason: string | null;
  // 추가근무 상태
  case_type: "A" | "B"; // A=스케줄 초과, B=스케줄 없음
  ot_status: "pending" | "approved" | "dismissed";
  ot_record_id: string | null;
  ot_minutes: number | null;
}

interface DaySummary {
  date: string;
  pending_count: number;
  approved_count: number;
  dismissed_count: number;
}

// ── 헬퍼 ──────────────────────────────────────────────────────────────

function timeToMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minsToLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간`;
  return `${m}분`;
}

function formatDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)}km`;
  return `${Math.round(m)}m`;
}

function quickButtons(unit: number): number[] {
  if (unit === 15) return [15, 30, 45, 60];
  if (unit === 30) return [30, 60, 90];
  if (unit === 60) return [60, 120, 180];
  return [];
}

function generateSummary(emp: EmpDay): string {
  let timePart = "";

  if (emp.case_type === "A") {
    const parts: string[] = [];
    if (emp.late_in_minutes > 0) parts.push(`${minsToLabel(emp.late_in_minutes)} 지각`);
    if (emp.early_in_raw_minutes > 0) parts.push(`${minsToLabel(emp.early_in_raw_minutes)} 일찍 출근`);
    if (emp.late_out_minutes > 0) parts.push(`${minsToLabel(emp.late_out_minutes)} 늦게 퇴근`);
    if (parts.length > 0) timePart = parts.join(", ") + "했어요";
  } else {
    timePart = `스케줄 없이 ${minsToLabel(emp.actual_minutes)} 근무했어요`;
  }

  const annotations: string[] = [];
  if (emp.check_out_type === "remote_out") {
    annotations.push("원격퇴근이라 정확하지 않을 수 있어요");
  } else if (emp.check_in_type === "business_trip_in") {
    annotations.push("출장출근이에요");
  } else if (emp.check_out_type === "business_trip_out") {
    annotations.push("출장퇴근이에요");
  }
  if (emp.check_out_type === "fallback_out") {
    annotations.push(
      emp.check_out_reason === "관리자 수동 처리"
        ? "관리자가 퇴근 처리했어요"
        : "수동 퇴근이에요"
    );
  } else if (emp.check_in_type === "fallback_in") {
    annotations.push("수동 출근이에요");
  } else if (emp.check_in_type === "qr_in") {
    annotations.push("QR 출근이에요");
  }

  return [timePart, ...annotations].filter(Boolean).join(" · ");
}

// ── 서브 컴포넌트: 근태 타입 뱃지 ────────────────────────────────────

function AttendanceBadge({
  type,
  reason,
}: {
  type: string;
  reason?: string | null;
}) {
  if (type === "remote_out")
    return (
      <span className="text-[10px] font-bold bg-[#FFE3E3] text-[#C92A2A] px-1.5 py-0.5 rounded-md">
        원격퇴근
      </span>
    );
  if (type === "business_trip_in")
    return (
      <span className="text-[10px] font-bold bg-[#FFF3BF] text-[#E67700] px-1.5 py-0.5 rounded-md">
        출장출근
      </span>
    );
  if (type === "business_trip_out")
    return (
      <span className="text-[10px] font-bold bg-[#FFF3BF] text-[#E67700] px-1.5 py-0.5 rounded-md">
        출장퇴근
      </span>
    );
  if (type === "fallback_in")
    return (
      <span className="text-[10px] font-bold bg-[#F3F0FF] text-[#7950F2] px-1.5 py-0.5 rounded-md">
        수동출근
      </span>
    );
  if (type === "fallback_out")
    return (
      <span className="text-[10px] font-bold bg-[#F3F0FF] text-[#7950F2] px-1.5 py-0.5 rounded-md">
        {reason === "관리자 수동 처리" ? "관리자 처리" : "수동퇴근"}
      </span>
    );
  if (type === "qr_in")
    return (
      <span className="text-[10px] font-bold bg-[#E8F3FF] text-[#3182F6] px-1.5 py-0.5 rounded-md">
        QR출근
      </span>
    );
  if (type === "qr_out")
    return (
      <span className="text-[10px] font-bold bg-[#E8F3FF] text-[#3182F6] px-1.5 py-0.5 rounded-md">
        QR퇴근
      </span>
    );
  return null;
}

// ── 서브 컴포넌트: 상세 정보 패널 ────────────────────────────────────

function AttendanceDetailPanel({ emp }: { emp: EmpDay }) {
  const summary = generateSummary(emp);

  return (
    <div className="mt-3 pt-3 border-t border-[#F2F4F6] space-y-2">
      {/* 스케줄 / 실제 근무 */}
      <div className="bg-[#F8F9FA] rounded-[12px] px-3.5 py-3 space-y-1.5">
        {emp.case_type === "A" && emp.schedule_start && emp.schedule_end ? (
          <>
            {/* 스케줄 행 */}
            <div className="flex justify-between items-center text-[12px]">
              <span className="text-[#8B95A1]">스케줄</span>
              <div className="flex items-center gap-1 flex-wrap justify-end">
                <span className="font-semibold text-[#4E5968]">
                  {emp.schedule_start} ~ {emp.schedule_end}
                </span>
                {emp.schedule_store_name && (
                  <span className="bg-[#F2F4F6] text-[#4E5968] text-[10px] px-1.5 py-0.5 rounded">
                    {emp.schedule_store_name}
                  </span>
                )}
                {emp.schedule_position_keys.map((k) => (
                  <span
                    key={k}
                    className="bg-[#E8F3FF] text-[#3182F6] text-[10px] px-1.5 py-0.5 rounded"
                  >
                    {POSITION_LABELS[k] ?? k}
                  </span>
                ))}
              </div>
            </div>
            {/* 실제 행 */}
            <div className="flex justify-between text-[12px]">
              <span className="text-[#8B95A1]">실제</span>
              <span className="font-semibold text-[#4E5968]">
                {emp.actual_in} ~ {emp.actual_out}
              </span>
            </div>
            {/* 지각 */}
            {emp.late_in_minutes > 0 && (
              <div className="flex justify-between text-[12px]">
                <span className="text-[#8B95A1]">지각</span>
                <span className="font-bold text-[#EF4444]">
                  +{minsToLabel(emp.late_in_minutes)}
                </span>
              </div>
            )}
            {/* 일찍 출근 */}
            {emp.early_in_raw_minutes > 0 && (
              <div className="flex justify-between items-center text-[12px]">
                <span className="text-[#8B95A1]">일찍 출근</span>
                <div className="flex items-center gap-1.5">
                  <span
                    className={
                      emp.early_in_counted
                        ? "font-bold text-[#F59E0B]"
                        : "font-semibold text-[#B0B8C1]"
                    }
                  >
                    +{minsToLabel(emp.early_in_raw_minutes)}
                  </span>
                  {!emp.early_in_counted && (
                    <span className="text-[10px] text-[#B0B8C1] bg-[#F2F4F6] px-1.5 py-0.5 rounded">
                      집계 제외
                    </span>
                  )}
                </div>
              </div>
            )}
            {/* 늦게 퇴근 */}
            {emp.late_out_minutes > 0 && (
              <div className="flex justify-between text-[12px]">
                <span className="text-[#8B95A1]">늦게 퇴근</span>
                <span className="font-bold text-[#F59E0B]">
                  +{minsToLabel(emp.late_out_minutes)}
                </span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex justify-between text-[12px]">
              <span className="text-[#8B95A1]">실제 근무</span>
              <span className="font-semibold text-[#4E5968]">
                {emp.actual_in} ~ {emp.actual_out} ({minsToLabel(emp.actual_minutes)})
              </span>
            </div>
            <p className="text-[11px] text-[#B0B8C1]">이 날 스케줄이 없어요.</p>
          </>
        )}
      </div>

      {/* 위치 정보 */}
      <div className="bg-[#F8F9FA] rounded-[12px] px-3.5 py-3 space-y-1.5">
        {/* 출근 */}
        <div className="flex justify-between items-center text-[12px]">
          <span className="text-[#8B95A1] shrink-0">출근</span>
          <div className="flex items-center gap-1 flex-wrap justify-end">
            <AttendanceBadge type={emp.check_in_type} />
            {emp.check_in_store_name && (
              <span className="font-semibold text-[#4E5968]">
                {emp.check_in_store_name}
              </span>
            )}
            {emp.check_in_distance_m != null && emp.check_in_distance_m > 0 && (
              <span className="text-[#8B95A1]">
                ({formatDistance(emp.check_in_distance_m)})
              </span>
            )}
          </div>
        </div>
        {/* 퇴근 */}
        <div className="flex justify-between items-start text-[12px]">
          <span className="text-[#8B95A1] shrink-0 mt-0.5">퇴근</span>
          <div className="flex flex-col items-end gap-0.5">
            <div className="flex items-center gap-1 flex-wrap justify-end">
              <AttendanceBadge
                type={emp.check_out_type}
                reason={emp.check_out_reason}
              />
              {emp.check_out_store_name && (
                <span className="font-semibold text-[#4E5968]">
                  {emp.check_out_store_name}
                </span>
              )}
              {emp.check_out_distance_m != null &&
                emp.check_out_distance_m > 0 && (
                  <span className="text-[#8B95A1]">
                    ({formatDistance(emp.check_out_distance_m)})
                  </span>
                )}
            </div>
            {emp.check_out_reason &&
              emp.check_out_reason !== "관리자 수동 처리" && (
                <span className="text-[11px] text-[#8B95A1]">
                  사유: {emp.check_out_reason}
                </span>
              )}
          </div>
        </div>
      </div>

      {/* 한 줄 요약 */}
      {summary && (
        <div className="bg-[#E8F3FF] rounded-[10px] px-3.5 py-2.5">
          <p className="text-[12px] text-[#3182F6] leading-relaxed">{summary}</p>
        </div>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────

export default function AdminOvertimePage() {
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [directInput, setDirectInput] = useState<{
    emp: EmpDay;
    hours: string;
    mins: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 매장 설정
  const { data: storeSettings } = useSWR<StoreSettings>(
    "store-overtime-settings",
    async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("stores")
        .select("overtime_unit, overtime_include_early, overtime_min_minutes")
        .order("display_order")
        .limit(1)
        .single();
      return (
        data ?? {
          overtime_unit: 30,
          overtime_include_early: false,
          overtime_min_minutes: 10,
        }
      );
    },
    { dedupingInterval: 60_000 }
  );

  // 추가근무 데이터
  const {
    data: empDays = [],
    mutate,
    isLoading,
  } = useSWR<EmpDay[]>(
    storeSettings ? ["admin-overtime-v3", storeSettings] : null,
    async () => {
      const supabase = createClient();
      const today = new Date();
      const startDate = format(subDays(today, 29), "yyyy-MM-dd");
      const endDate = format(today, "yyyy-MM-dd");
      const startStr = new Date(`${startDate}T00:00:00+09:00`).toISOString();
      const endStr = new Date(`${endDate}T23:59:59.999+09:00`).toISOString();

      // 출퇴근 로그 (위치·타입·사유 포함)
      const { data: logs } = await supabase
        .from("attendance_logs")
        .select(
          `profile_id, type, attendance_type, reason, distance_m, created_at,
           profiles!profile_id(name, color_hex, avatar_config),
           check_in_store:check_in_store_id(name, label),
           check_out_store:check_out_store_id(name, label)`
        )
        .gte("created_at", startStr)
        .lte("created_at", endStr)
        .order("created_at", { ascending: true });

      // (date, profile_id) 별 in/out 쌍
      const pairMap = new Map<
        string,
        {
          date: string;
          profile_id: string;
          name: string;
          color: string;
          avatar_config: any | null;
          in_time: Date;
          in_type: string;
          in_store_name: string | null;
          in_distance_m: number | null;
          out_time: Date | null;
          out_type: string | null;
          out_store_name: string | null;
          out_distance_m: number | null;
          out_reason: string | null;
        }
      >();

      (logs ?? []).forEach((log: any) => {
        const d = format(new Date(log.created_at), "yyyy-MM-dd");
        const key = `${d}_${log.profile_id}`;
        if (log.type === "IN") {
          if (!pairMap.has(key)) {
            pairMap.set(key, {
              date: d,
              profile_id: log.profile_id,
              name: log.profiles?.name ?? "알 수 없음",
              color: log.profiles?.color_hex ?? "#8B95A1",
              avatar_config: log.profiles?.avatar_config ?? null,
              in_time: new Date(log.created_at),
              in_type: log.attendance_type ?? "regular",
              in_store_name:
                log.check_in_store?.label ||
                log.check_in_store?.name ||
                null,
              in_distance_m: log.distance_m ?? null,
              out_time: null,
              out_type: null,
              out_store_name: null,
              out_distance_m: null,
              out_reason: null,
            });
          }
        } else if (log.type === "OUT") {
          const pair = pairMap.get(key);
          if (pair) {
            pair.out_time = new Date(log.created_at);
            pair.out_type = log.attendance_type ?? "regular";
            pair.out_store_name =
              log.check_out_store?.label ||
              log.check_out_store?.name ||
              null;
            pair.out_distance_m = log.distance_m ?? null;
            pair.out_reason = log.reason ?? null;
          }
        }
      });

      // 스케줄 슬롯 (매장·포지션 포함)
      const { data: slots } = await supabase
        .from("schedule_slots")
        .select(
          `profile_id, slot_date, start_time, end_time, position_keys,
           store:store_id(name, label)`
        )
        .gte("slot_date", startDate)
        .lte("slot_date", endDate)
        .eq("status", "active");

      const slotMap = new Map<
        string,
        {
          start: string;
          end: string;
          store_name: string | null;
          position_keys: string[];
        }
      >();
      (slots ?? []).forEach((slot: any) => {
        const key = `${slot.slot_date}_${slot.profile_id}`;
        const s = slot.start_time.slice(0, 5);
        const e = slot.end_time.slice(0, 5);
        const ex = slotMap.get(key);
        const storeName =
          slot.store?.label || slot.store?.name || null;
        const posKeys: string[] = slot.position_keys ?? [];
        if (!ex) {
          slotMap.set(key, {
            start: s,
            end: e,
            store_name: storeName,
            position_keys: posKeys,
          });
        } else {
          slotMap.set(key, {
            start: s < ex.start ? s : ex.start,
            end: e > ex.end ? e : ex.end,
            store_name: ex.store_name ?? storeName,
            position_keys: [
              ...new Set([...ex.position_keys, ...posKeys]),
            ],
          });
        }
      });

      // 추가근무 기록
      const { data: otRecords } = await supabase
        .from("overtime_requests")
        .select("id, profile_id, date, minutes, status")
        .gte("date", startDate)
        .lte("date", endDate)
        .in("status", ["approved", "dismissed"]);

      const otMap = new Map<
        string,
        { id: string; minutes: number; status: "approved" | "dismissed" }
      >();
      (otRecords ?? []).forEach((r: any) => {
        otMap.set(`${r.date}_${r.profile_id}`, {
          id: r.id,
          minutes: r.minutes,
          status: r.status,
        });
      });

      const result: EmpDay[] = [];
      const settings = storeSettings!;

      pairMap.forEach((pair, key) => {
        if (!pair.out_time) return;
        const actualMins = Math.floor(
          (pair.out_time.getTime() - pair.in_time.getTime()) / 60000
        );
        const slot = slotMap.get(key);
        const otRecord = otMap.get(key);

        let lateOut = 0;
        let earlyInRaw = 0;
        let earlyInCounted = false;
        let lateIn = 0;
        let caseType: "A" | "B";

        if (slot) {
          caseType = "A";
          const schedEnd = timeToMins(slot.end);
          const schedStart = timeToMins(slot.start);
          const actualOut = timeToMins(format(pair.out_time, "HH:mm"));
          const actualIn = timeToMins(format(pair.in_time, "HH:mm"));

          lateOut = Math.max(0, actualOut - schedEnd);
          earlyInRaw = Math.max(0, schedStart - actualIn);
          lateIn = Math.max(0, actualIn - schedStart);
          earlyInCounted = settings.overtime_include_early && earlyInRaw > 0;

          const candidateMins = lateOut + (earlyInCounted ? earlyInRaw : 0);
          if (candidateMins < settings.overtime_min_minutes && !otRecord) return;
        } else {
          caseType = "B";
        }

        const otStatus = otRecord?.status ?? "pending";

        result.push({
          profile_id: pair.profile_id,
          name: pair.name,
          color_hex: pair.color,
          avatar_config: pair.avatar_config ?? null,
          date: pair.date,
          actual_in: format(pair.in_time, "HH:mm"),
          actual_out: format(pair.out_time, "HH:mm"),
          actual_minutes: actualMins,
          schedule_start: slot?.start ?? null,
          schedule_end: slot?.end ?? null,
          schedule_store_name: slot?.store_name ?? null,
          schedule_position_keys: slot?.position_keys ?? [],
          late_in_minutes: lateIn,
          early_in_raw_minutes: earlyInRaw,
          early_in_counted: earlyInCounted,
          late_out_minutes: lateOut,
          check_in_type: pair.in_type,
          check_in_store_name: pair.in_store_name,
          check_in_distance_m: pair.in_distance_m,
          check_out_type: pair.out_type ?? "regular",
          check_out_store_name: pair.out_store_name,
          check_out_distance_m: pair.out_distance_m,
          check_out_reason: pair.out_reason,
          case_type: caseType,
          ot_status: otStatus,
          ot_record_id: otRecord?.id ?? null,
          ot_minutes: otRecord?.minutes ?? null,
        });
      });

      return result.sort(
        (a, b) =>
          b.date.localeCompare(a.date) || a.name.localeCompare(b.name)
      );
    },
    { dedupingInterval: 30_000, revalidateOnFocus: true }
  );

  // 날짜별 요약
  const daySummaries = useMemo<DaySummary[]>(() => {
    const map = new Map<string, DaySummary>();
    empDays.forEach((e) => {
      if (!map.has(e.date)) {
        map.set(e.date, {
          date: e.date,
          pending_count: 0,
          approved_count: 0,
          dismissed_count: 0,
        });
      }
      const s = map.get(e.date)!;
      if (e.ot_status === "pending") s.pending_count++;
      else if (e.ot_status === "approved") s.approved_count++;
      else if (e.ot_status === "dismissed") s.dismissed_count++;
    });
    return Array.from(map.values()).sort((a, b) =>
      b.date.localeCompare(a.date)
    );
  }, [empDays]);

  const pendingDays = daySummaries.filter((d) => d.pending_count > 0);
  const confirmedDays = daySummaries.filter((d) => d.pending_count === 0);

  const selectedDayEmps = useMemo(
    () => empDays.filter((e) => e.date === selectedDate),
    [empDays, selectedDate]
  );

  // ── 액션 ──────────────────────────────────────────────────────────

  const handleApprove = async (emp: EmpDay, minutes: number) => {
    const key = `${emp.date}_${emp.profile_id}`;
    if (submitting) return;
    setSubmitting(key);
    try {
      const supabase = createClient();

      if (emp.ot_record_id) {
        const { error } = await supabase
          .from("overtime_requests")
          .update({ status: "approved", minutes })
          .eq("id", emp.ot_record_id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("overtime_requests").insert({
          profile_id: emp.profile_id,
          date: emp.date,
          minutes,
          status: "approved",
        });
        if (error) throw error;
      }

      await supabase.from("notifications").insert({
        profile_id: emp.profile_id,
        target_role: "employee",
        type: "overtime_approved",
        title: "추가근무가 등록됐어요",
        content: `${format(new Date(emp.date + "T00:00:00"), "M월 d일", { locale: ko })} 추가근무 ${minsToLabel(minutes)}이 등록됐어요.`,
      });

      toast.success(`${emp.name}님 ${minsToLabel(minutes)} 인정했어요`);
      mutate();
    } catch {
      toast.error("저장에 실패했어요", {
        description: "잠시 후 다시 시도해주세요.",
      });
    } finally {
      setSubmitting(null);
    }
  };

  const handleDismiss = async (emp: EmpDay) => {
    const key = `${emp.date}_${emp.profile_id}`;
    if (submitting) return;
    setSubmitting(key);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("overtime_requests").insert({
        profile_id: emp.profile_id,
        date: emp.date,
        minutes: 0,
        status: "dismissed",
      });
      if (error) throw error;
      toast.success(`${emp.name}님 넘겼어요`);
      mutate();
    } catch {
      toast.error("처리에 실패했어요", {
        description: "잠시 후 다시 시도해주세요.",
      });
    } finally {
      setSubmitting(null);
    }
  };

  const handleCancelApproved = async (emp: EmpDay) => {
    if (!emp.ot_record_id || submitting) return;
    const key = `${emp.date}_${emp.profile_id}`;
    setSubmitting(key);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("overtime_requests")
        .delete()
        .eq("id", emp.ot_record_id);
      if (error) throw error;

      await supabase.from("notifications").insert({
        profile_id: emp.profile_id,
        target_role: "employee",
        type: "overtime_cancelled",
        title: "추가근무가 취소됐어요",
        content: `${format(new Date(emp.date + "T00:00:00"), "M월 d일", { locale: ko })} 추가근무가 취소됐어요.`,
      });

      toast.success("추가근무 인정을 취소했어요");
      mutate();
    } catch {
      toast.error("취소에 실패했어요", {
        description: "잠시 후 다시 시도해주세요.",
      });
    } finally {
      setSubmitting(null);
    }
  };

  const openDirectInput = (emp: EmpDay) => {
    setDirectInput({ emp, hours: "0", mins: "30" });
  };

  const handleDirectInputSubmit = async () => {
    if (!directInput) return;
    const h = parseInt(directInput.hours) || 0;
    const m = parseInt(directInput.mins) || 0;
    const totalMins = h * 60 + m;
    if (totalMins <= 0) {
      toast.error("시간을 입력해주세요");
      return;
    }
    setDirectInput(null);
    await handleApprove(directInput.emp, totalMins);
  };

  // ── 렌더 ──────────────────────────────────────────────────────────

  const openDetail = (date: string) => {
    setSelectedDate(date);
    setView("detail");
  };

  const closeDetail = () => {
    setView("list");
    setSelectedDate(null);
  };

  const unit = storeSettings?.overtime_unit ?? 30;
  const buttons = quickButtons(unit);

  // ── 날짜 목록 뷰 ──────────────────────────────────────────────────

  if (view === "list") {
    return (
      <>
        <h1 className="text-[22px] font-bold text-[#191F28] mb-6">
          추가근무 관리
        </h1>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 bg-[#F2F4F6] rounded-[16px] animate-pulse"
              />
            ))}
          </div>
        ) : daySummaries.length === 0 ? (
          <div className="bg-white rounded-[24px] p-10 flex flex-col items-center gap-2 border border-[#E5E8EB]">
            <CheckCircle2 className="w-10 h-10 text-[#D1D6DB]" />
            <p className="text-[14px] text-[#8B95A1]">
              추가근무 확인 내역이 없어요
            </p>
            <p className="text-[12px] text-[#B0B8C1] text-center">
              최근 30일간 스케줄을 초과하거나 스케줄 없이 근무한 직원만
              표시돼요
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {pendingDays.length > 0 && (
              <section>
                <p className="text-[12px] font-bold text-[#8B95A1] mb-2 px-1">
                  확인 필요
                </p>
                <div className="space-y-2">
                  {pendingDays.map((day) => (
                    <button
                      key={day.date}
                      onClick={() => openDetail(day.date)}
                      className="w-full flex items-center justify-between bg-white rounded-[16px] px-5 py-4 border border-[#E5E8EB] active:bg-[#F8F9FA]"
                    >
                      <div className="text-left">
                        <p className="text-[15px] font-bold text-[#191F28]">
                          {format(
                            new Date(day.date + "T00:00:00"),
                            "M월 d일 (eeee)",
                            { locale: ko }
                          )}
                          {day.date === format(new Date(), "yyyy-MM-dd") && (
                            <span className="ml-2 text-[12px] text-[#3182F6] font-semibold">
                              오늘
                            </span>
                          )}
                        </p>
                        <p className="text-[13px] text-[#F59E0B] font-semibold mt-0.5">
                          {day.pending_count}명 대기
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-[#B0B8C1]" />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {confirmedDays.length > 0 && (
              <section>
                <p className="text-[12px] font-bold text-[#8B95A1] mb-2 px-1">
                  확인 완료
                </p>
                <div className="space-y-2">
                  {confirmedDays.map((day) => (
                    <button
                      key={day.date}
                      onClick={() => openDetail(day.date)}
                      className="w-full flex items-center justify-between bg-white rounded-[16px] px-5 py-4 border border-[#E5E8EB] active:bg-[#F8F9FA]"
                    >
                      <div className="text-left">
                        <p className="text-[15px] font-bold text-[#191F28]">
                          {format(
                            new Date(day.date + "T00:00:00"),
                            "M월 d일 (eeee)",
                            { locale: ko }
                          )}
                        </p>
                        <p className="text-[13px] text-[#8B95A1] mt-0.5">
                          {day.approved_count > 0 && day.dismissed_count > 0
                            ? `추가근무 ${day.approved_count}건 · 넘김 ${day.dismissed_count}건`
                            : day.approved_count > 0
                              ? `추가근무 ${day.approved_count}건`
                              : `전원 넘김`}
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-[#B0B8C1]" />
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </>
    );
  }

  // ── 날짜 상세 뷰 ──────────────────────────────────────────────────

  const pendingEmps = selectedDayEmps.filter((e) => e.ot_status === "pending");
  const approvedEmps = selectedDayEmps.filter(
    (e) => e.ot_status === "approved"
  );
  const dismissedEmps = selectedDayEmps.filter(
    (e) => e.ot_status === "dismissed"
  );

  return (
    <>
      {/* 뒤로가기 */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={closeDetail}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F2F4F6] -ml-1"
        >
          <ChevronLeft className="w-5 h-5 text-[#191F28]" />
        </button>
        <h1 className="text-[20px] font-bold text-[#191F28]">
          {selectedDate &&
            format(new Date(selectedDate + "T00:00:00"), "M월 d일 (eeee)", {
              locale: ko,
            })}
        </h1>
      </div>

      <div className="space-y-6">
        {/* 확인 필요 */}
        {pendingEmps.length > 0 && (
          <section>
            <p className="text-[12px] font-bold text-[#8B95A1] mb-2 px-1">
              확인 필요
            </p>
            <div className="space-y-3">
              {pendingEmps.map((emp) => {
                const key = `${emp.date}_${emp.profile_id}`;
                const isSubmitting = submitting === key;

                return (
                  <div
                    key={key}
                    className="bg-white rounded-[20px] p-5 border border-[#E5E8EB]"
                  >
                    {/* 직원 정보 */}
                    <div className="flex items-center gap-3 mb-3">
                      <AvatarDisplay userId={emp.profile_id} avatarConfig={emp.avatar_config} size={40} />
                      <div className="flex-1">
                        <p className="text-[15px] font-bold text-[#191F28]">
                          {emp.name}
                        </p>
                        <p className="text-[12px] text-[#8B95A1]">
                          {emp.case_type === "A" ? "스케줄 초과" : "스케줄 없음"}
                        </p>
                      </div>
                    </div>

                    {/* 상세 정보 */}
                    <AttendanceDetailPanel emp={emp} />

                    {/* 액션 버튼 */}
                    <div className="flex gap-2 flex-wrap mt-3">
                      <button
                        onClick={() => handleDismiss(emp)}
                        disabled={isSubmitting}
                        className="flex-none px-4 py-2.5 rounded-[12px] bg-[#F2F4F6] text-[13px] font-bold text-[#4E5968] disabled:opacity-50 active:scale-[0.97]"
                      >
                        넘기기
                      </button>
                      {emp.case_type === "B" && emp.actual_minutes > 0 ? (
                        <button
                          onClick={() => handleApprove(emp, emp.actual_minutes)}
                          disabled={isSubmitting}
                          className="flex-1 py-2.5 rounded-[12px] bg-[#E8F3FF] text-[13px] font-bold text-[#3182F6] disabled:opacity-50 active:scale-[0.97]"
                        >
                          전체 등록 ({minsToLabel(emp.actual_minutes)})
                        </button>
                      ) : null}
                      {emp.case_type === "A" &&
                        buttons.map((mins) => (
                          <button
                            key={mins}
                            onClick={() => handleApprove(emp, mins)}
                            disabled={isSubmitting}
                            className="flex-1 min-w-[56px] py-2.5 rounded-[12px] bg-[#E8F3FF] text-[13px] font-bold text-[#3182F6] disabled:opacity-50 active:scale-[0.97]"
                          >
                            {minsToLabel(mins)}
                          </button>
                        ))}
                      <button
                        onClick={() => openDirectInput(emp)}
                        disabled={isSubmitting}
                        className="flex-none px-4 py-2.5 rounded-[12px] bg-[#F2F4F6] text-[13px] font-bold text-[#4E5968] disabled:opacity-50 active:scale-[0.97]"
                      >
                        직접입력
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 추가근무 인정 */}
        {approvedEmps.length > 0 && (
          <section>
            <p className="text-[12px] font-bold text-[#8B95A1] mb-2 px-1">
              추가근무 인정
            </p>
            <div className="space-y-2">
              {approvedEmps.map((emp) => {
                const key = `${emp.date}_${emp.profile_id}`;
                const isSubmitting = submitting === key;
                const isExpanded = expandedKeys.has(key);
                return (
                  <div
                    key={key}
                    className="bg-white rounded-[16px] px-5 py-4 border border-[#E5E8EB]"
                  >
                    <div className="flex items-center gap-3">
                      <AvatarDisplay userId={emp.profile_id} avatarConfig={emp.avatar_config} size={32} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-bold text-[#191F28]">
                          {emp.name}
                        </p>
                        <p className="text-[12px] text-[#3182F6] font-semibold">
                          {minsToLabel(emp.ot_minutes!)} 인정됨
                        </p>
                      </div>
                      <button
                        onClick={() => toggleExpand(key)}
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F2F4F6] shrink-0"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-[#8B95A1]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[#8B95A1]" />
                        )}
                      </button>
                      <button
                        onClick={() => handleCancelApproved(emp)}
                        disabled={isSubmitting}
                        className="px-3.5 py-2 rounded-[10px] bg-[#F2F4F6] text-[12px] font-bold text-[#4E5968] disabled:opacity-50 active:scale-[0.97] shrink-0"
                      >
                        취소
                      </button>
                    </div>
                    {isExpanded && <AttendanceDetailPanel emp={emp} />}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 넘김 */}
        {dismissedEmps.length > 0 && (
          <section>
            <p className="text-[12px] font-bold text-[#8B95A1] mb-2 px-1">
              넘김
            </p>
            <div className="space-y-2">
              {dismissedEmps.map((emp) => {
                const key = `${emp.date}_${emp.profile_id}`;
                const isSubmitting = submitting === key;
                const isExpanded = expandedKeys.has(key);
                return (
                  <div
                    key={key}
                    className="bg-white rounded-[16px] px-5 py-4 border border-[#E5E8EB]"
                  >
                    <div className="flex items-center gap-3">
                      <AvatarDisplay userId={emp.profile_id} avatarConfig={emp.avatar_config} size={32} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-bold text-[#191F28]">
                          {emp.name}
                        </p>
                        <p className="text-[12px] text-[#8B95A1]">넘김</p>
                      </div>
                      <button
                        onClick={() => toggleExpand(key)}
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F2F4F6] shrink-0"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-[#8B95A1]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[#8B95A1]" />
                        )}
                      </button>
                      <button
                        onClick={() => openDirectInput(emp)}
                        disabled={isSubmitting}
                        className="px-3.5 py-2 rounded-[10px] bg-[#E8F3FF] text-[12px] font-bold text-[#3182F6] disabled:opacity-50 active:scale-[0.97] shrink-0"
                      >
                        추가근무로
                      </button>
                    </div>
                    {isExpanded && <AttendanceDetailPanel emp={emp} />}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {selectedDayEmps.length === 0 && (
          <div className="bg-white rounded-[24px] p-10 flex flex-col items-center gap-2 border border-[#E5E8EB]">
            <CheckCircle2 className="w-10 h-10 text-[#D1D6DB]" />
            <p className="text-[14px] text-[#8B95A1]">
              이 날은 확인할 내용이 없어요
            </p>
          </div>
        )}
      </div>

      {/* 직접 입력 바텀시트 */}
      {directInput && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setDirectInput(null)}
          />
          <div className="relative bg-white rounded-t-[28px] px-5 pt-5 pb-8 animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[18px] font-bold text-[#191F28]">
                추가근무 시간 입력
              </h2>
              <button
                onClick={() => setDirectInput(null)}
                className="w-8 h-8 rounded-full bg-[#F2F4F6] flex items-center justify-center"
              >
                <X className="w-4 h-4 text-[#4E5968]" />
              </button>
            </div>

            <p className="text-[13px] text-[#8B95A1] mb-4">
              {directInput.emp.name}님 —{" "}
              {selectedDate &&
                format(new Date(selectedDate + "T00:00:00"), "M월 d일", {
                  locale: ko,
                })}
            </p>

            <div className="flex gap-4 mb-6">
              <div className="flex-1">
                <label className="text-[13px] font-semibold text-[#4E5968] mb-1.5 block">
                  시간
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={directInput.hours}
                    onChange={(e) =>
                      setDirectInput((d) =>
                        d ? { ...d, hours: e.target.value } : d
                      )
                    }
                    className="w-full bg-[#F2F4F6] rounded-[14px] px-4 py-3.5 text-[18px] font-bold text-[#191F28] outline-none text-center"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] text-[#8B95A1] font-semibold">
                    시간
                  </span>
                </div>
              </div>
              <div className="flex-1">
                <label className="text-[13px] font-semibold text-[#4E5968] mb-1.5 block">
                  분
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={directInput.mins}
                    onChange={(e) =>
                      setDirectInput((d) =>
                        d ? { ...d, mins: e.target.value } : d
                      )
                    }
                    className="w-full bg-[#F2F4F6] rounded-[14px] px-4 py-3.5 text-[18px] font-bold text-[#191F28] outline-none text-center"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] text-[#8B95A1] font-semibold">
                    분
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handleDirectInputSubmit}
              className="w-full bg-[#3182F6] text-white rounded-[16px] py-4 text-[16px] font-bold active:scale-[0.99] transition-all"
            >
              등록하기
            </button>
          </div>
        </div>
      )}
    </>
  );
}
