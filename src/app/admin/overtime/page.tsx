"use client";

import { useState } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";
import {
  ChevronLeft,
  Plus,
  X,
  CheckCircle2,
  XCircle,
  Timer,
  Clock,
} from "lucide-react";

interface OvertimeEmployee {
  profile_id: string;
  name: string;
  color_hex: string;
  actual_in: string; // "HH:mm"
  actual_out: string; // "HH:mm"
  actual_minutes: number;
  scheduled_minutes: number;
  schedule_end: string | null; // "HH:mm"
  overtime_minutes: number;
  approved_minutes: number;
  last_approved_end: string | null; // "HH:mm" — for chaining +N
}

interface OvertimeRecord {
  id: string;
  profile_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: "approved" | "rejected" | "pending";
  profiles: { name: string; color_hex: string | null };
}

interface Employee {
  id: string;
  name: string;
  color_hex: string | null;
}

const QUICK_MINS = [1, 5, 10, 30, 60] as const;

function addMinutesToTime(timeStr: string, mins: number): string {
  const [h, m] = timeStr.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export default function AdminOvertimePage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null); // profile_id being processed
  const [assignForm, setAssignForm] = useState({
    profile_id: "",
    date: format(new Date(), "yyyy-MM-dd"),
    start_time: "",
    end_time: "",
    reason: "",
  });
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  // 선택 날짜 초과근무 직원 목록
  const { data: overtimeEmployees = [], mutate: mutateOT } = useSWR(
    ["admin-overtime-employees", selectedDate],
    async ([, date]) => {
      const supabase = createClient();
      const startStr = new Date(`${date}T00:00:00+09:00`).toISOString();
      const endStr = new Date(`${date}T23:59:59.999+09:00`).toISOString();

      // 출퇴근 로그
      const { data: logs } = await supabase
        .from("attendance_logs")
        .select("profile_id, type, created_at, profiles!profile_id(name, color_hex)")
        .gte("created_at", startStr)
        .lte("created_at", endStr)
        .order("created_at", { ascending: true });

      const inMap = new Map<string, { time: Date; name: string; color: string }>();
      const outMap = new Map<string, Date>();
      (logs || []).forEach((log: any) => {
        const pId = log.profile_id;
        if (log.type === "IN" && !inMap.has(pId)) {
          inMap.set(pId, {
            time: new Date(log.created_at),
            name: log.profiles?.name || "알 수 없음",
            color: log.profiles?.color_hex || "#8B95A1",
          });
        }
        if (log.type === "OUT") {
          outMap.set(pId, new Date(log.created_at)); // 마지막 OUT
        }
      });

      // 스케줄 슬롯 (slot_date 직접)
      const { data: slots } = await supabase
        .from("schedule_slots")
        .select("profile_id, start_time, end_time")
        .eq("slot_date", date)
        .eq("status", "active");

      const slotMap = new Map<string, { mins: number; end: string }>();
      (slots || []).forEach((slot: any) => {
        const [sh, sm] = slot.start_time.split(":").map(Number);
        const [eh, em] = slot.end_time.split(":").map(Number);
        const mins = (eh * 60 + em) - (sh * 60 + sm);
        const existing = slotMap.get(slot.profile_id);
        if (!existing) {
          slotMap.set(slot.profile_id, { mins, end: slot.end_time.slice(0, 5) });
        } else {
          slotMap.set(slot.profile_id, {
            mins: existing.mins + mins,
            end: slot.end_time > existing.end + ":00" ? slot.end_time.slice(0, 5) : existing.end,
          });
        }
      });

      // 기존 승인된 초과근무
      const { data: approved } = await supabase
        .from("overtime_requests")
        .select("profile_id, start_time, end_time")
        .eq("date", date)
        .eq("status", "approved")
        .order("end_time", { ascending: true });

      const approvedMinsMap = new Map<string, number>();
      const lastApprovedEndMap = new Map<string, string>();
      (approved || []).forEach((ot: any) => {
        const [sh, sm] = ot.start_time.split(":").map(Number);
        const [eh, em] = ot.end_time.split(":").map(Number);
        const mins = (eh * 60 + em) - (sh * 60 + sm);
        approvedMinsMap.set(ot.profile_id, (approvedMinsMap.get(ot.profile_id) ?? 0) + mins);
        lastApprovedEndMap.set(ot.profile_id, ot.end_time.slice(0, 5));
      });

      const result: OvertimeEmployee[] = [];
      inMap.forEach((info, pId) => {
        const outTime = outMap.get(pId);
        if (!outTime) return; // 아직 퇴근 안 함
        const actualMins = Math.floor((outTime.getTime() - info.time.getTime()) / 60000);
        const slot = slotMap.get(pId);
        const scheduledMins = slot?.mins ?? 0;
        const overtimeMins = Math.max(0, actualMins - scheduledMins);
        const approvedMins = approvedMinsMap.get(pId) ?? 0;

        if (overtimeMins > 0 || approvedMins > 0) {
          result.push({
            profile_id: pId,
            name: info.name,
            color_hex: info.color,
            actual_in: format(info.time, "HH:mm"),
            actual_out: format(outTime, "HH:mm"),
            actual_minutes: actualMins,
            scheduled_minutes: scheduledMins,
            schedule_end: slot?.end ?? null,
            overtime_minutes: overtimeMins,
            approved_minutes: approvedMins,
            last_approved_end: lastApprovedEndMap.get(pId) ?? null,
          });
        }
      });

      return result.sort((a, b) => b.overtime_minutes - a.overtime_minutes);
    },
    { dedupingInterval: 30_000, revalidateOnFocus: true }
  );

  // 처리 내역
  const { data: history = [], mutate: mutateHistory } = useSWR(
    "admin-overtime-history",
    async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("overtime_requests")
        .select("*, profiles!profile_id(name, color_hex)")
        .eq("status", "approved")
        .order("date", { ascending: false })
        .limit(50);
      return (data ?? []) as OvertimeRecord[];
    },
    { dedupingInterval: 30_000, revalidateOnFocus: true }
  );

  // 직원 목록 (직접 할당용)
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
    if (submitting) return;
    setSubmitting(emp.profile_id);
    try {
      const supabase = createClient();
      // 체이닝: 마지막 승인 end_time 또는 스케줄 end_time 기준
      const startTime = emp.last_approved_end ?? emp.schedule_end ?? "18:00";
      const endTime = addMinutesToTime(startTime, mins);

      const { error } = await supabase.from("overtime_requests").insert({
        profile_id: emp.profile_id,
        date: selectedDate,
        start_time: startTime + ":00",
        end_time: endTime + ":00",
        status: "approved",
      });
      if (error) throw error;

      const minsLabel = mins === 60 ? "1시간" : `${mins}분`;
      toast.success(`${emp.name}님 추가근무 +${minsLabel} 승인했어요`);
      mutateOT();
      mutateHistory();
    } catch {
      toast.error("저장에 실패했어요", { description: "잠시 후 다시 시도해주세요." });
    } finally {
      setSubmitting(null);
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
      mutateHistory();
    } catch {
      toast.error("할당에 실패했어요", { description: "잠시 후 다시 시도해주세요." });
    } finally {
      setAssignSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F4F6] font-pretendard pb-10">
      {/* 헤더 */}
      <header className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 bg-white/80 backdrop-blur-md border-b border-[#E5E8EB]">
        <button onClick={() => router.back()} className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-[#F2F4F6]">
          <ChevronLeft className="w-5 h-5 text-[#191F28]" />
        </button>
        <h1 className="text-[17px] font-bold text-[#191F28]">추가근무 관리</h1>
        <button
          onClick={() => setShowAssignForm(true)}
          className="ml-auto flex items-center gap-1.5 bg-[#3182F6] text-white px-3.5 py-2 rounded-full text-[13px] font-bold"
        >
          <Plus className="w-4 h-4" />
          직접 할당
        </button>
      </header>

      {/* 날짜 선택 */}
      <div className="px-5 py-4">
        <div className="bg-white rounded-[16px] border border-[#E5E8EB] px-4 py-3 flex items-center gap-3">
          <Clock className="w-4 h-4 text-[#3182F6] shrink-0" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="flex-1 text-[15px] font-semibold text-[#191F28] bg-transparent outline-none"
          />
        </div>
      </div>

      {/* 초과근무 직원 */}
      <div className="px-5 space-y-3">
        <p className="text-[13px] font-bold text-[#8B95A1] px-1">
          {format(new Date(selectedDate + "T00:00:00"), "M월 d일 (eeee)", { locale: ko })} · 초과 근무 직원
        </p>

        {overtimeEmployees.length === 0 ? (
          <div className="bg-white rounded-[24px] p-10 flex flex-col items-center gap-2 border border-slate-100">
            <CheckCircle2 className="w-10 h-10 text-[#D1D6DB]" />
            <p className="text-[14px] text-[#8B95A1]">초과 근무 직원이 없어요</p>
            <p className="text-[12px] text-[#B0B8C1]">퇴근 처리된 직원 중 스케줄을 초과한 경우만 표시돼요</p>
          </div>
        ) : (
          overtimeEmployees.map((emp) => {
            const otH = Math.floor(emp.overtime_minutes / 60);
            const otM = emp.overtime_minutes % 60;
            const approvedH = Math.floor(emp.approved_minutes / 60);
            const approvedM = emp.approved_minutes % 60;
            return (
              <div key={emp.profile_id} className="bg-white rounded-[20px] p-5 border border-slate-100">
                <div className="flex items-start gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white font-bold"
                    style={{ backgroundColor: emp.color_hex }}
                  >
                    {emp.name?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-bold text-[#191F28]">{emp.name}</p>
                    <p className="text-[12px] text-[#4E5968] mt-0.5">
                      {emp.actual_in} ~ {emp.actual_out}
                      {emp.schedule_end && ` · 스케줄 ~${emp.schedule_end}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[13px] font-bold text-[#F59E0B]">
                      초과 {otH > 0 ? `${otH}시간 ` : ""}{otM > 0 ? `${otM}분` : otH === 0 ? "0분" : ""}
                    </p>
                    {emp.approved_minutes > 0 && (
                      <p className="text-[11px] font-bold text-[#3182F6] mt-0.5">
                        승인 {approvedH > 0 ? `${approvedH}시간 ` : ""}{approvedM > 0 ? `${approvedM}분` : approvedH === 0 ? "0분" : ""}
                      </p>
                    )}
                  </div>
                </div>

                {/* 빠른 추가 버튼 */}
                <div className="flex gap-2 flex-wrap">
                  {QUICK_MINS.map((mins) => (
                    <button
                      key={mins}
                      onClick={() => handleAddMinutes(emp, mins)}
                      disabled={submitting === emp.profile_id}
                      className="flex-1 min-w-[52px] py-2 rounded-[10px] bg-[#E8F3FF] text-[#3182F6] text-[13px] font-bold active:scale-[0.97] transition-all disabled:opacity-50"
                    >
                      {mins === 60 ? "+1시간" : `+${mins}분`}
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 할당 내역 */}
      {history.length > 0 && (
        <div className="px-5 mt-6 space-y-3">
          <p className="text-[13px] font-bold text-[#8B95A1] px-1">할당 내역</p>
          {history.slice(0, 20).map((rec) => {
            const startH = rec.start_time.slice(0, 5);
            const endH = rec.end_time.slice(0, 5);
            return (
              <div key={rec.id} className="bg-white rounded-[20px] px-5 py-4 border border-slate-100">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-[13px]"
                    style={{ backgroundColor: rec.profiles?.color_hex || "#8B95A1" }}
                  >
                    {rec.profiles?.name?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-[#191F28]">{rec.profiles?.name}</p>
                    <p className="text-[12px] text-[#4E5968] mt-0.5">
                      {format(new Date(rec.date + "T00:00:00"), "M월 d일", { locale: ko })} · {startH}~{endH}
                    </p>
                  </div>
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#E8F3FF] text-[#3182F6] shrink-0">
                    <CheckCircle2 className="w-3 h-3" />
                    승인됨
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 직접 할당 바텀시트 */}
      {showAssignForm && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAssignForm(false)} />
          <div className="relative bg-white rounded-t-[28px] px-5 pt-5 pb-8 space-y-4 animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-[18px] font-bold text-[#191F28]">추가근무 할당하기</h2>
              <button onClick={() => setShowAssignForm(false)} className="w-8 h-8 rounded-full bg-[#F2F4F6] flex items-center justify-center">
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
