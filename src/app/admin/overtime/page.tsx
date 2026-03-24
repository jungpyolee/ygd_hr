"use client";

import { useState } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { format, subDays } from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";
import {
  ChevronLeft,
  Plus,
  X,
  CheckCircle2,
  Check,
} from "lucide-react";

interface ApprovedRecord {
  id: string;
  start_time: string; // "HH:mm"
  end_time: string;   // "HH:mm"
}

interface OvertimeEmployee {
  profile_id: string;
  name: string;
  color_hex: string;
  date: string; // "yyyy-MM-dd"
  actual_in: string;
  actual_out: string;
  actual_minutes: number;
  scheduled_minutes: number;
  schedule_start: string | null;
  schedule_end: string | null;
  overtime_minutes: number;
  approved_minutes: number;
  last_approved_end: string | null;
  approved_records: ApprovedRecord[];
}

interface Employee {
  id: string;
  name: string;
  color_hex: string | null;
}

const QUICK_MINS = [1, 5, 10, 30, 60] as const;

function timeToMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function addMinutesToTime(timeStr: string, mins: number): string {
  const total = timeToMins(timeStr) + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function minsToLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간`;
  return `${m}분`;
}

function TimelineBar({
  actualIn, actualOut, scheduleStart, scheduleEnd, approvedRecords,
}: {
  actualIn: string;
  actualOut: string;
  scheduleStart: string | null;
  scheduleEnd: string | null;
  approvedRecords: ApprovedRecord[];
}) {
  const allMins = [
    timeToMins(actualIn),
    timeToMins(actualOut),
    scheduleStart ? timeToMins(scheduleStart) : null,
    scheduleEnd ? timeToMins(scheduleEnd) : null,
    ...approvedRecords.map((r) => timeToMins(r.end_time)),
  ].filter((t): t is number => t !== null);

  const rangeStart = Math.min(...allMins) - 20;
  const rangeEnd = Math.max(...allMins) + 20;
  const range = rangeEnd - rangeStart;

  const pct = (t: string) => (((timeToMins(t) - rangeStart) / range) * 100).toFixed(2);
  const pctNum = (t: string) => (timeToMins(t) - rangeStart) / range * 100;

  const actualInPct = pctNum(actualIn);
  const actualOutPct = pctNum(actualOut);
  const schedStartPct = scheduleStart ? pctNum(scheduleStart) : actualInPct;
  const schedEndPct = scheduleEnd ? pctNum(scheduleEnd) : actualOutPct;

  // overtime portion start = scheduleEnd (or actualIn if no schedule)
  const otStartPct = scheduleEnd ? schedEndPct : actualInPct;

  return (
    <div className="mt-3 mb-1">
      {/* Bar */}
      <div className="relative h-5">
        {/* Background track */}
        <div className="absolute top-1.5 left-0 right-0 h-2 bg-[#F2F4F6] rounded-full" />

        {/* Schedule zone — light blue */}
        {scheduleStart && scheduleEnd && (
          <div
            className="absolute top-1.5 h-2 rounded-sm bg-[#DBEAFE]"
            style={{ left: `${schedStartPct}%`, width: `${schedEndPct - schedStartPct}%` }}
          />
        )}

        {/* Actual regular work (in → min(schedEnd, actualOut)) */}
        <div
          className="absolute top-1.5 h-2 rounded-sm bg-[#94A3B8]/50"
          style={{
            left: `${actualInPct}%`,
            width: `${Math.max(0, Math.min(otStartPct, actualOutPct) - actualInPct)}%`,
          }}
        />

        {/* Overtime portion (schedEnd → actualOut) */}
        {actualOutPct > otStartPct && (
          <div
            className="absolute top-1.5 h-2 rounded-sm bg-[#F59E0B]/70"
            style={{ left: `${otStartPct}%`, width: `${actualOutPct - otStartPct}%` }}
          />
        )}

        {/* Approved OT blocks — solid blue, slightly taller */}
        {approvedRecords.map((rec) => {
          const s = pctNum(rec.start_time);
          const e = pctNum(rec.end_time);
          return (
            <div
              key={rec.id}
              className="absolute top-1 h-3 rounded-sm bg-[#3182F6] opacity-80"
              style={{ left: `${s}%`, width: `${e - s}%` }}
            />
          );
        })}

        {/* Dot: actual in */}
        <div
          className="absolute top-1 w-3 h-3 rounded-full bg-[#4E5968] border-2 border-white shadow-sm"
          style={{ left: `${pct(actualIn)}%`, transform: "translateX(-50%)" }}
        />
        {/* Dot: actual out */}
        <div
          className="absolute top-1 w-3 h-3 rounded-full bg-[#F59E0B] border-2 border-white shadow-sm"
          style={{ left: `${pct(actualOut)}%`, transform: "translateX(-50%)" }}
        />
        {/* Tick: schedule start */}
        {scheduleStart && (
          <div
            className="absolute top-0.5 w-0.5 h-4 bg-[#3182F6]/40 rounded-full"
            style={{ left: `${pct(scheduleStart)}%` }}
          />
        )}
        {/* Tick: schedule end */}
        {scheduleEnd && (
          <div
            className="absolute top-0.5 w-0.5 h-4 bg-[#3182F6]/40 rounded-full"
            style={{ left: `${pct(scheduleEnd)}%` }}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
        {scheduleStart && scheduleEnd && (
          <span className="flex items-center gap-1 text-[10px] text-[#8B95A1]">
            <span className="inline-block w-2 h-1.5 rounded-sm bg-[#DBEAFE]" />
            스케줄 {scheduleStart}~{scheduleEnd}
          </span>
        )}
        <span className="flex items-center gap-1 text-[10px] text-[#8B95A1]">
          <span className="inline-block w-2 h-1.5 rounded-sm bg-[#94A3B8]/50" />
          근무 {actualIn}~{actualOut}
        </span>
        {approvedRecords.length > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-[#3182F6]">
            <span className="inline-block w-2 h-1.5 rounded-sm bg-[#3182F6]/80" />
            승인 {minsToLabel(approvedRecords.reduce((s, r) => s + timeToMins(r.end_time) - timeToMins(r.start_time), 0))}
          </span>
        )}
      </div>
    </div>
  );
}

export default function AdminOvertimePage() {
  const router = useRouter();
  const [pendingMins, setPendingMins] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ApprovedRecord | null>(null);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [assignForm, setAssignForm] = useState({
    profile_id: "",
    date: format(new Date(), "yyyy-MM-dd"),
    start_time: "",
    end_time: "",
    reason: "",
  });
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  const { data: overtimeEmployees = [], mutate: mutateOT } = useSWR(
    "admin-overtime-employees-all",
    async () => {
      const supabase = createClient();
      const today = new Date();
      const startDate = format(subDays(today, 13), "yyyy-MM-dd");
      const endDate = format(today, "yyyy-MM-dd");
      const startStr = new Date(`${startDate}T00:00:00+09:00`).toISOString();
      const endStr = new Date(`${endDate}T23:59:59.999+09:00`).toISOString();

      // 출퇴근 로그
      const { data: logs } = await supabase
        .from("attendance_logs")
        .select("profile_id, type, created_at, profiles!profile_id(name, color_hex)")
        .gte("created_at", startStr)
        .lte("created_at", endStr)
        .order("created_at", { ascending: true });

      // date_profileId → { in_time, out_time, name, color }
      const pairMap = new Map<string, {
        date: string; profile_id: string; name: string; color: string;
        in_time: Date; out_time: Date | null;
      }>();

      (logs || []).forEach((log: any) => {
        const d = format(new Date(log.created_at), "yyyy-MM-dd");
        const key = `${d}_${log.profile_id}`;
        if (log.type === "IN") {
          if (!pairMap.has(key)) {
            pairMap.set(key, {
              date: d,
              profile_id: log.profile_id,
              name: log.profiles?.name || "알 수 없음",
              color: log.profiles?.color_hex || "#8B95A1",
              in_time: new Date(log.created_at),
              out_time: null,
            });
          }
        } else if (log.type === "OUT") {
          const pair = pairMap.get(key);
          if (pair) pair.out_time = new Date(log.created_at);
        }
      });

      // 스케줄 슬롯
      const { data: slots } = await supabase
        .from("schedule_slots")
        .select("profile_id, slot_date, start_time, end_time")
        .gte("slot_date", startDate)
        .lte("slot_date", endDate)
        .eq("status", "active");

      const slotMap = new Map<string, { mins: number; start: string; end: string }>();
      (slots || []).forEach((slot: any) => {
        const key = `${slot.slot_date}_${slot.profile_id}`;
        const [sh, sm] = slot.start_time.split(":").map(Number);
        const [eh, em] = slot.end_time.split(":").map(Number);
        const mins = (eh * 60 + em) - (sh * 60 + sm);
        const s = slot.start_time.slice(0, 5);
        const e = slot.end_time.slice(0, 5);
        const existing = slotMap.get(key);
        if (!existing) {
          slotMap.set(key, { mins, start: s, end: e });
        } else {
          slotMap.set(key, {
            mins: existing.mins + mins,
            start: s < existing.start ? s : existing.start,
            end: e > existing.end ? e : existing.end,
          });
        }
      });

      // 승인된 추가근무
      const { data: approved } = await supabase
        .from("overtime_requests")
        .select("id, profile_id, date, start_time, end_time")
        .gte("date", startDate)
        .lte("date", endDate)
        .eq("status", "approved")
        .order("end_time", { ascending: true });

      const approvedMap = new Map<string, {
        total_mins: number; last_end: string;
        records: ApprovedRecord[];
      }>();
      (approved || []).forEach((ot: any) => {
        const key = `${ot.date}_${ot.profile_id}`;
        const [sh, sm] = ot.start_time.split(":").map(Number);
        const [eh, em] = ot.end_time.split(":").map(Number);
        const mins = (eh * 60 + em) - (sh * 60 + sm);
        const rec: ApprovedRecord = {
          id: ot.id,
          start_time: ot.start_time.slice(0, 5),
          end_time: ot.end_time.slice(0, 5),
        };
        const existing = approvedMap.get(key);
        if (!existing) {
          approvedMap.set(key, { total_mins: mins, last_end: rec.end_time, records: [rec] });
        } else {
          approvedMap.set(key, {
            total_mins: existing.total_mins + mins,
            last_end: rec.end_time > existing.last_end ? rec.end_time : existing.last_end,
            records: [...existing.records, rec],
          });
        }
      });

      const result: OvertimeEmployee[] = [];
      pairMap.forEach((pair, key) => {
        if (!pair.out_time) return;
        const actualMins = Math.floor((pair.out_time.getTime() - pair.in_time.getTime()) / 60000);
        const slot = slotMap.get(key);
        const scheduledMins = slot?.mins ?? 0;
        const overtimeMins = Math.max(0, actualMins - scheduledMins);
        const approvedData = approvedMap.get(key);
        const approvedMins = approvedData?.total_mins ?? 0;
        if (overtimeMins > 0 || approvedMins > 0) {
          result.push({
            profile_id: pair.profile_id,
            name: pair.name,
            color_hex: pair.color,
            date: pair.date,
            actual_in: format(pair.in_time, "HH:mm"),
            actual_out: format(pair.out_time, "HH:mm"),
            actual_minutes: actualMins,
            scheduled_minutes: scheduledMins,
            schedule_start: slot?.start ?? null,
            schedule_end: slot?.end ?? null,
            overtime_minutes: overtimeMins,
            approved_minutes: approvedMins,
            last_approved_end: approvedData?.last_end ?? null,
            approved_records: approvedData?.records ?? [],
          });
        }
      });

      return result.sort((a, b) =>
        b.date.localeCompare(a.date) || b.overtime_minutes - a.overtime_minutes
      );
    },
    { dedupingInterval: 30_000, revalidateOnFocus: true }
  );

  const { data: employees = [] } = useSWR("admin-employees-list", async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, name, color_hex")
      .neq("role", "admin")
      .order("name");
    return (data ?? []) as Employee[];
  });

  const handleAddMinutes = async (emp: OvertimeEmployee, mins: number) => {
    const empKey = `${emp.date}_${emp.profile_id}`;
    if (submitting) return;
    setSubmitting(empKey);
    try {
      const supabase = createClient();
      const startTime = emp.last_approved_end ?? emp.schedule_end ?? "18:00";
      const endTime = addMinutesToTime(startTime, mins);
      const { error } = await supabase.from("overtime_requests").insert({
        profile_id: emp.profile_id,
        date: emp.date,
        start_time: startTime + ":00",
        end_time: endTime + ":00",
        status: "approved",
      });
      if (error) throw error;
      toast.success(`${emp.name}님 +${minsToLabel(mins)} 승인했어요`);
      setPendingMins((prev) => { const n = { ...prev }; delete n[empKey]; return n; });
      mutateOT();
    } catch {
      toast.error("저장에 실패했어요", { description: "잠시 후 다시 시도해주세요." });
    } finally {
      setSubmitting(null);
    }
  };

  const handleCancelOT = async () => {
    if (!cancelTarget) return;
    setDeletingId(cancelTarget.id);
    setCancelTarget(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("overtime_requests").delete().eq("id", cancelTarget.id);
      if (error) throw error;
      toast.success("추가근무 승인을 취소했어요");
      mutateOT();
    } catch {
      toast.error("취소에 실패했어요", { description: "잠시 후 다시 시도해주세요." });
    } finally {
      setDeletingId(null);
    }
  };

  const handleAssign = async () => {
    if (!assignForm.profile_id) { toast.error("직원을 선택해주세요"); return; }
    if (!assignForm.start_time || !assignForm.end_time) {
      toast.error("시간을 입력해주세요", { description: "시작 시간과 종료 시간이 필요해요." }); return;
    }
    if (assignForm.start_time >= assignForm.end_time) {
      toast.error("시간을 확인해주세요", { description: "종료 시간이 시작 시간보다 늦어야 해요." }); return;
    }
    setAssignSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("overtime_requests").insert({
        profile_id: assignForm.profile_id,
        date: assignForm.date,
        start_time: assignForm.start_time,
        end_time: assignForm.end_time,
        reason: assignForm.reason || null,
        status: "approved",
      });
      if (error) throw error;
      toast.success("추가근무를 할당했어요");
      setShowAssignForm(false);
      setAssignForm({ profile_id: "", date: format(new Date(), "yyyy-MM-dd"), start_time: "", end_time: "", reason: "" });
      mutateOT();
    } catch {
      toast.error("할당에 실패했어요", { description: "잠시 후 다시 시도해주세요." });
    } finally {
      setAssignSubmitting(false);
    }
  };

  // 날짜별 그룹핑
  const grouped = overtimeEmployees.reduce<Record<string, OvertimeEmployee[]>>((acc, emp) => {
    if (!acc[emp.date]) acc[emp.date] = [];
    acc[emp.date].push(emp);
    return acc;
  }, {});
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="min-h-screen bg-[#F2F4F6] font-pretendard pb-10">
      {/* 헤더 */}
      <header className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 bg-white/80 backdrop-blur-md border-b border-[#E5E8EB]">
        <button
          onClick={() => router.back()}
          className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-[#F2F4F6]"
        >
          <ChevronLeft className="w-5 h-5 text-[#191F28]" />
        </button>
        <h1 className="text-[17px] font-bold text-[#191F28]">추가근무 관리</h1>
        <p className="text-[12px] text-[#8B95A1] ml-1">최근 14일</p>
        <button
          onClick={() => setShowAssignForm(true)}
          className="ml-auto flex items-center gap-1.5 bg-[#3182F6] text-white px-3.5 py-2 rounded-full text-[13px] font-bold"
        >
          <Plus className="w-4 h-4" />
          직접 할당
        </button>
      </header>

      {/* 목록 */}
      <div className="px-5 pt-5 space-y-6">
        {sortedDates.length === 0 ? (
          <div className="bg-white rounded-[24px] p-10 flex flex-col items-center gap-2 border border-slate-100 mt-2">
            <CheckCircle2 className="w-10 h-10 text-[#D1D6DB]" />
            <p className="text-[14px] text-[#8B95A1]">초과 근무 직원이 없어요</p>
            <p className="text-[12px] text-[#B0B8C1] text-center">
              최근 14일간 스케줄을 초과해 퇴근한 직원만 표시돼요
            </p>
          </div>
        ) : (
          sortedDates.map((date) => (
            <div key={date}>
              <p className="text-[13px] font-bold text-[#8B95A1] px-1 mb-2">
                {format(new Date(date + "T00:00:00"), "M월 d일 (eeee)", { locale: ko })}
              </p>
              <div className="space-y-3">
                {grouped[date].map((emp) => {
                  const empKey = `${emp.date}_${emp.profile_id}`;
                  const pending = pendingMins[empKey];
                  const startTime = emp.last_approved_end ?? emp.schedule_end ?? "18:00";
                  const previewEnd = pending ? addMinutesToTime(startTime, pending) : null;
                  const isSubmitting = submitting === empKey;

                  return (
                    <div key={empKey} className="bg-white rounded-[20px] p-5 border border-slate-100">
                      {/* 직원 정보 */}
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-[15px]"
                          style={{ backgroundColor: emp.color_hex }}
                        >
                          {emp.name?.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] font-bold text-[#191F28]">{emp.name}</p>
                        </div>
                        <div className="text-right shrink-0 space-y-0.5">
                          <p className="text-[13px] font-bold text-[#F59E0B]">
                            초과 {minsToLabel(emp.overtime_minutes)}
                          </p>
                          {emp.approved_minutes > 0 && (
                            <p className="text-[11px] font-semibold text-[#3182F6]">
                              승인 {minsToLabel(emp.approved_minutes)}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* 타임라인 */}
                      <TimelineBar
                        actualIn={emp.actual_in}
                        actualOut={emp.actual_out}
                        scheduleStart={emp.schedule_start}
                        scheduleEnd={emp.schedule_end}
                        approvedRecords={emp.approved_records}
                      />

                      {/* 승인된 추가근무 레코드 */}
                      {emp.approved_records.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {emp.approved_records.map((rec) => (
                            <div
                              key={rec.id}
                              className="flex items-center gap-1.5 px-2.5 py-1 bg-[#E8F3FF] rounded-full"
                            >
                              <Check className="w-3 h-3 text-[#3182F6]" />
                              <span className="text-[12px] font-semibold text-[#3182F6]">
                                {rec.start_time}~{rec.end_time}
                              </span>
                              <button
                                onClick={() => setCancelTarget(rec)}
                                disabled={deletingId === rec.id}
                                className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-[#3182F6]/10 disabled:opacity-40"
                              >
                                <X className="w-2.5 h-2.5 text-[#3182F6]" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 빠른 추가 버튼 */}
                      <div className="mt-3 flex gap-1.5 flex-wrap">
                        {QUICK_MINS.map((mins) => (
                          <button
                            key={mins}
                            onClick={() =>
                              setPendingMins((prev) => ({
                                ...prev,
                                [empKey]: prev[empKey] === mins ? 0 : mins,
                              }))
                            }
                            disabled={isSubmitting}
                            className={`flex-1 min-w-[48px] py-2 rounded-[10px] text-[13px] font-bold transition-all active:scale-[0.97] disabled:opacity-50 ${
                              pending === mins
                                ? "bg-[#3182F6] text-white"
                                : "bg-[#F2F4F6] text-[#4E5968]"
                            }`}
                          >
                            {mins === 60 ? "+1시간" : `+${mins}분`}
                          </button>
                        ))}
                      </div>

                      {/* 스테이징 미리보기 */}
                      {pending ? (
                        <div className="mt-2 flex items-center justify-between bg-[#F8FAFF] border border-[#DBEAFE] rounded-[12px] px-3.5 py-2.5">
                          <div>
                            <p className="text-[12px] font-semibold text-[#3182F6]">
                              {startTime} → {previewEnd}
                            </p>
                            <p className="text-[11px] text-[#8B95A1] mt-0.5">
                              +{minsToLabel(pending)} 추가 예정이에요
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                setPendingMins((prev) => { const n = { ...prev }; delete n[empKey]; return n; })
                              }
                              className="px-3 py-1.5 rounded-[8px] text-[12px] text-[#4E5968] bg-white border border-[#E5E8EB] font-semibold"
                            >
                              취소
                            </button>
                            <button
                              onClick={() => handleAddMinutes(emp, pending)}
                              disabled={isSubmitting}
                              className="px-3 py-1.5 rounded-[8px] text-[12px] text-white bg-[#3182F6] font-bold disabled:opacity-60"
                            >
                              {isSubmitting ? "승인 중..." : "승인하기"}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 승인 취소 확인 모달 */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCancelTarget(null)} />
          <div className="relative bg-white rounded-[24px] px-6 py-6 w-full max-w-sm animate-in fade-in zoom-in-95 duration-200">
            <p className="text-[17px] font-bold text-[#191F28] mb-1">승인을 취소할까요?</p>
            <p className="text-[14px] text-[#4E5968]">
              {cancelTarget.start_time}~{cancelTarget.end_time} 추가근무 승인이 삭제돼요.
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setCancelTarget(null)}
                className="flex-1 py-3 rounded-[14px] bg-[#F2F4F6] text-[15px] font-bold text-[#4E5968]"
              >
                돌아가기
              </button>
              <button
                onClick={handleCancelOT}
                className="flex-1 py-3 rounded-[14px] bg-red-500 text-[15px] font-bold text-white"
              >
                취소하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 직접 할당 바텀시트 */}
      {showAssignForm && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowAssignForm(false)}
          />
          <div className="relative bg-white rounded-t-[28px] px-5 pt-5 pb-8 space-y-4 animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-[18px] font-bold text-[#191F28]">추가근무 할당하기</h2>
              <button
                onClick={() => setShowAssignForm(false)}
                className="w-8 h-8 rounded-full bg-[#F2F4F6] flex items-center justify-center"
              >
                <X className="w-4 h-4 text-[#4E5968]" />
              </button>
            </div>

            <div>
              <label className="text-[13px] font-semibold text-[#4E5968] mb-1.5 block">직원</label>
              <select
                value={assignForm.profile_id}
                onChange={(e) => setAssignForm((f) => ({ ...f, profile_id: e.target.value }))}
                className="w-full bg-[#F2F4F6] rounded-[14px] px-4 py-3 text-[15px] font-semibold text-[#191F28] outline-none"
              >
                <option value="">직원을 선택해주세요</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[13px] font-semibold text-[#4E5968] mb-1.5 block">날짜</label>
              <input
                type="date"
                value={assignForm.date}
                onChange={(e) => setAssignForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full bg-[#F2F4F6] rounded-[14px] px-4 py-3 text-[15px] font-semibold text-[#191F28] outline-none"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[13px] font-semibold text-[#4E5968] mb-1.5 block">시작 시간</label>
                <input
                  type="time"
                  value={assignForm.start_time}
                  onChange={(e) => setAssignForm((f) => ({ ...f, start_time: e.target.value }))}
                  className="w-full bg-[#F2F4F6] rounded-[14px] px-4 py-3 text-[15px] font-semibold text-[#191F28] outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="text-[13px] font-semibold text-[#4E5968] mb-1.5 block">종료 시간</label>
                <input
                  type="time"
                  value={assignForm.end_time}
                  onChange={(e) => setAssignForm((f) => ({ ...f, end_time: e.target.value }))}
                  className="w-full bg-[#F2F4F6] rounded-[14px] px-4 py-3 text-[15px] font-semibold text-[#191F28] outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-[13px] font-semibold text-[#4E5968] mb-1.5 block">사유 (선택)</label>
              <textarea
                value={assignForm.reason}
                onChange={(e) => setAssignForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="추가근무 내용을 간단히 적어주세요"
                rows={2}
                className="w-full bg-[#F2F4F6] rounded-[14px] px-4 py-3 text-[14px] text-[#191F28] placeholder:text-[#B0B8C1] outline-none resize-none"
              />
            </div>

            <button
              onClick={handleAssign}
              disabled={assignSubmitting}
              className="w-full bg-[#3182F6] text-white rounded-[16px] py-4 text-[16px] font-bold active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {assignSubmitting ? "할당 중..." : "추가근무 승인 처리하기"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
