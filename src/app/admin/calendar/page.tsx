"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import AvatarDisplay from "@/components/AvatarDisplay";
import useSWR from "swr";
import { createClient } from "@/lib/supabase";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Pencil,
  Eye,
  Layers,
  CalendarDays,
  LayoutGrid,
  Clock,
  MapPin,
  PenLine,
  AlertCircle,
  Users,
} from "lucide-react";
import {
  format,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  parseISO,
  addDays,
  isBefore,
  startOfDay,
  getWeekOfMonth,
} from "date-fns";
import { ko } from "date-fns/locale";
import { useWorkplaces } from "@/lib/hooks/useWorkplaces";
import Link from "next/link";
import EmployeeProfileModal from "@/components/EmployeeProfileModal";
import { logError } from "@/lib/logError";
import { createNotification } from "@/lib/notifications";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Profile {
  id: string;
  name: string;
  color_hex: string;
  avatar_config?: any;
}


interface ScheduleSlot {
  id: string;
  weekly_schedule_id: string;
  profile_id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  store_id: string;
  position_keys: string[];
  status: string;
  notes: string | null;
}

interface WeeklySchedule {
  id: string;
  week_start: string;
  status: string;
}

interface AttendanceEntry {
  profile_id: string;
  date: string;
  name: string;
  color_hex: string;
  avatar_config?: any;
  store_name: string;
  clock_in: string | null;
  clock_out: string | null;
  is_absent: boolean;
  late_minutes: number | null;
  early_leave_minutes: number | null;
  distance_in: number | null;
  distance_out: number | null;
  attendance_type_in: string;
  attendance_type_out: string;
  reason_out: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  scheduled_location: string | null;
}

interface CompanyEvent {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  event_type: string;
  color: string;
  store_id: string | null;
}


// ─── Helpers ─────────────────────────────────────────────────────────────────
const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function generateTimeOptions(startH: number, endH: number): string[] {
  const opts: string[] = [];
  for (let h = startH; h <= endH; h++) {
    opts.push(`${String(h).padStart(2, "0")}:00`);
    if (h < endH) opts.push(`${String(h).padStart(2, "0")}:30`);
  }
  return opts;
}

const START_TIMES = generateTimeOptions(7, 21);
const END_TIMES = generateTimeOptions(7, 22);


// ─── SlotBottomSheet ─────────────────────────────────────────────────────────
interface SlotSheetProps {
  slot: Partial<ScheduleSlot> | null;
  profiles: Profile[];
  onClose: () => void;
  onSave: (data: Partial<ScheduleSlot>, isNew: boolean) => Promise<void>;
  onDelete?: (id: string) => void | Promise<void>;
  defaultDate?: string;
  defaultProfileId?: string;
}

function SlotBottomSheet({
  slot,
  profiles,
  onClose,
  onSave,
  onDelete,
  defaultDate,
  defaultProfileId,
}: SlotSheetProps) {
  const isNew = !slot?.id;
  const { workplaces, byId, positionsOfStore } = useWorkplaces();
  const [form, setForm] = useState<Partial<ScheduleSlot>>({
    profile_id: defaultProfileId || "",
    slot_date: defaultDate || "",
    start_time: "09:00",
    end_time: "18:00",
    store_id: workplaces[0]?.id || "",
    position_keys: [],
    notes: "",
    ...slot,
    ...(slot?.start_time && { start_time: slot.start_time.slice(0, 5) }),
    ...(slot?.end_time && { end_time: slot.end_time.slice(0, 5) }),
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = async () => {
    if (!form.profile_id || !form.slot_date || !form.start_time || !form.end_time || !form.store_id) {
      toast.error("모든 필드를 입력해주세요.");
      return;
    }
    if (timeToMinutes(form.start_time!) >= timeToMinutes(form.end_time!)) {
      toast.error("시작 시간이 종료 시간보다 늦어요");
      return;
    }
    setSaving(true);
    await onSave(form, isNew);
    setSaving(false);
  };

  const positions = positionsOfStore(form.store_id || "");

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-[28px] px-5 pt-6 pb-6 shadow-2xl animate-in zoom-in-95 fade-in-0 duration-200 max-h-[85vh] overflow-y-auto scrollbar-hide">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-[18px] font-bold text-[#191F28]">
            {isNew ? "근무 추가" : "근무 수정"}
          </h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F4F6]">
            <X className="w-5 h-5 text-[#8B95A1]" />
          </button>
        </div>

        <div className="space-y-4">
          {/* 직원 */}
          <div>
            <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">직원</label>
            <select
              value={form.profile_id || ""}
              onChange={(e) => setForm((p) => ({ ...p, profile_id: e.target.value }))}
              className="w-full px-3 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6]"
            >
              {isNew && <option value="">직원을 선택해주세요</option>}
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* 날짜 */}
          <div>
            <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">날짜</label>
            <input
              type="date"
              value={form.slot_date || ""}
              onChange={(e) => setForm((p) => ({ ...p, slot_date: e.target.value }))}
              className="w-full px-3 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6]"
            />
          </div>

          {/* 시간 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">시작</label>
              <select
                value={form.start_time || "09:00"}
                onChange={(e) => setForm((p) => ({ ...p, start_time: e.target.value }))}
                className="w-full px-3 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6]"
              >
                {START_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">종료</label>
              <select
                value={form.end_time || "18:00"}
                onChange={(e) => setForm((p) => ({ ...p, end_time: e.target.value }))}
                className="w-full px-3 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6]"
              >
                {END_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* 근무지 */}
          <div>
            <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">근무지</label>
            <select
              value={form.store_id || ""}
              onChange={(e) => setForm((p) => ({ ...p, store_id: e.target.value, position_keys: [] }))}
              className="w-full px-3 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6]"
            >
              {workplaces.map((w) => (
                <option key={w.id} value={w.id}>{w.label}</option>
              ))}
            </select>
          </div>

          {/* 포지션 */}
          {positions.length > 0 && (
            <div>
              <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">포지션</label>
              <div className="flex flex-wrap gap-2">
                {positions.map((pos) => {
                  const selected = form.position_keys?.includes(pos.position_key);
                  return (
                    <button
                      key={pos.position_key}
                      type="button"
                      onClick={() => {
                        setForm((p) => ({
                          ...p,
                          position_keys: selected
                            ? (p.position_keys || []).filter((k) => k !== pos.position_key)
                            : [...(p.position_keys || []), pos.position_key],
                        }));
                      }}
                      className={`px-3 py-1.5 rounded-full text-[13px] font-medium border transition-all ${
                        selected
                          ? "bg-[#3182F6] text-white border-[#3182F6]"
                          : "bg-white text-[#4E5968] border-slate-200"
                      }`}
                    >
                      {pos.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 메모 */}
          <div>
            <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">메모 (선택)</label>
            <input
              type="text"
              value={form.notes || ""}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="특이사항을 입력해요"
              className="w-full px-3 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6]"
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full mt-6 py-3.5 bg-[#3182F6] text-white font-bold rounded-2xl disabled:opacity-50 active:scale-[0.98] transition-all"
        >
          {saving ? "저장 중..." : isNew ? "추가하기" : "저장하기"}
        </button>

        {!isNew && onDelete && (
          <button
            onClick={() => {
              if (!confirmDelete) { setConfirmDelete(true); return; }
              setDeleting(true);
              Promise.resolve(onDelete(slot!.id!)).finally(() => setDeleting(false));
            }}
            disabled={deleting}
            className={`w-full mt-2 py-3 font-bold rounded-2xl transition-all text-[14px] ${
              confirmDelete
                ? "bg-red-500 text-white"
                : "bg-[#F2F4F6] text-[#8B95A1]"
            }`}
          >
            {deleting ? "삭제 중..." : confirmDelete ? "정말 삭제할까요?" : "근무 삭제하기"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── SlotInfoSheet (슬롯 정보 + 근태 상세 + 수정/삭제) ──────────────────────
interface SlotInfoSheetProps {
  slot: ScheduleSlot;
  profile: Profile | undefined;
  attendance: AttendanceEntry | undefined;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMutate: () => void;
}

function SlotInfoSheet({ slot, profile, attendance, onClose, onEdit, onDelete, onMutate }: SlotInfoSheetProps) {
  const { byId, positionsOfStore } = useWorkplaces();
  const supabase = createClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [manualOutTime, setManualOutTime] = useState("");
  const [showManualOut, setShowManualOut] = useState(false);
  const [manualOutSubmitting, setManualOutSubmitting] = useState(false);

  const store = byId[slot.store_id];
  const positions = slot.position_keys?.length
    ? slot.position_keys
        .map((k) => positionsOfStore(slot.store_id).find((p) => p.position_key === k)?.label || k)
        .join(" · ")
    : null;
  const slotDate = new Date(slot.slot_date + "T00:00:00");
  const dateLabel = format(slotDate, "M월 d일 (EEEE)", { locale: ko });
  const isPast = isBefore(slotDate, startOfDay(new Date()));
  const isTodaySlot = isToday(slotDate);

  // 근태 파생 값
  const isWorking = attendance?.clock_in && !attendance?.clock_out;
  const isAnomaly = isWorking && !isTodaySlot;
  let durationText = "";
  if (attendance?.clock_in && attendance?.clock_out) {
    const diffMs = new Date(attendance.clock_out).getTime() - new Date(attendance.clock_in).getTime();
    const hours = Math.floor(diffMs / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    durationText = `${hours}시간${mins > 0 ? ` ${mins}분` : ""}`;
  }

  const handleManualOut = async () => {
    if (!attendance || !manualOutTime) return;
    setManualOutSubmitting(true);
    const clockOutDate = new Date(`${slot.slot_date}T${manualOutTime}:00`);
    const { error } = await supabase.from("attendance_logs").insert({
      profile_id: attendance.profile_id,
      type: "OUT",
      attendance_type: "fallback_out",
      created_at: clockOutDate.toISOString(),
      reason: "관리자 수동 처리",
    });
    if (error) {
      toast.error("퇴근 처리에 실패했어요", { description: "잠시 후 다시 시도해주세요." });
    } else {
      toast.success(`${attendance.name}님 퇴근 처리가 완료됐어요.`);
      await createNotification({
        profile_id: attendance.profile_id,
        target_role: "employee",
        type: "attendance_fallback_out",
        title: "퇴근 처리 완료",
        content: "관리자가 퇴근 처리했어요.",
        source_id: attendance.profile_id,
      });
      setShowManualOut(false);
      onMutate();
    }
    setManualOutSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-[28px] px-5 pt-6 pb-6 shadow-2xl animate-in zoom-in-95 fade-in-0 duration-200 max-h-[85vh] overflow-y-auto scrollbar-hide">
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-[18px] font-bold text-[#191F28]">근무 정보</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F4F6]">
            <X className="w-5 h-5 text-[#8B95A1]" />
          </button>
        </div>

        <div className="space-y-4">
          {profile && (
            <div className="flex items-center gap-3">
              <AvatarDisplay userId={profile.id} avatarConfig={profile.avatar_config} size={40} />
              <span className="text-[16px] font-bold text-[#191F28]">{profile.name}</span>
            </div>
          )}

          <div className="text-[14px] text-[#4E5968] font-medium">{dateLabel}</div>

          {/* 스케줄 정보 */}
          <div
            className="p-3 rounded-2xl"
            style={{ backgroundColor: (store?.color || "#3182F6") + "15", borderLeft: `3px solid ${store?.color || "#3182F6"}` }}
          >
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" style={{ color: store?.color || "#3182F6" }} />
              <span className="text-[14px] font-bold" style={{ color: store?.color || "#3182F6" }}>
                {store?.label || "근무지"}
              </span>
              {positions && <span className="text-[12px] text-[#8B95A1]">· {positions}</span>}
            </div>
            <div className="flex items-center gap-1 mt-1 text-[13px] text-[#4E5968]">
              <Clock className="w-3.5 h-3.5" />
              {slot.start_time.slice(0, 5)} — {slot.end_time.slice(0, 5)}
            </div>
          </div>

          {slot.notes && (
            <div className="text-[13px] text-[#4E5968] bg-[#F9FAFB] p-3 rounded-xl">
              {slot.notes}
            </div>
          )}

          {/* ── 근태 상세 정보 ── */}
          {attendance && (
            <div className="space-y-2">
              {/* 미출근 (과거 날짜) */}
              {attendance.is_absent && isPast && (
                <div className="flex items-center gap-2 p-3 bg-[#FFF5F5] rounded-xl border border-[#FFCDD2]">
                  <span className="text-[11px] font-bold bg-[#FFCDD2] text-[#E03131] px-2 py-0.5 rounded-md">미출근</span>
                </div>
              )}

              {/* 출퇴근 타임라인 */}
              {attendance.clock_in && (
                <div className="p-3 bg-[#F9FAFB] rounded-xl space-y-2.5">
                  <div className="flex items-center gap-2 text-[13px] font-bold">
                    <span className="bg-[#F2F4F6] text-[#333D4B] px-2.5 py-1 rounded-lg">
                      {format(new Date(attendance.clock_in), "HH:mm")}
                    </span>
                    <span className="text-[#D1D6DB]">▶</span>
                    <span className={`px-2.5 py-1 rounded-lg ${
                      attendance.clock_out ? "bg-[#F2F4F6] text-[#333D4B]"
                        : isAnomaly ? "bg-[#FFF4E6] text-[#D9480F]"
                        : "bg-[#E8F3FF] text-[#3182F6]"
                    }`}>
                      {attendance.clock_out ? format(new Date(attendance.clock_out), "HH:mm")
                        : isAnomaly ? "기록없음" : "근무 중"}
                    </span>
                  </div>

                  {/* 근무 시간 */}
                  {durationText && (
                    <div className="flex items-center gap-1 text-[11px] text-[#8B95A1]">
                      <Clock className="w-3 h-3" /> 총 <span className="text-[#4E5968] font-medium">{durationText}</span> 근무했어요
                    </div>
                  )}

                  {/* 지각 / 조기퇴근 뱃지 */}
                  {((attendance.late_minutes != null && attendance.late_minutes > 0) || (attendance.early_leave_minutes != null && attendance.early_leave_minutes > 0)) && (
                    <div className="flex flex-wrap gap-1.5">
                      {attendance.late_minutes != null && attendance.late_minutes > 0 && (
                        <span className="text-[10px] font-bold bg-[#FFF7E6] text-[#F59E0B] px-1.5 py-0.5 rounded-md">+{attendance.late_minutes}분 지각</span>
                      )}
                      {attendance.early_leave_minutes != null && attendance.early_leave_minutes > 0 && (
                        <span className="text-[10px] font-bold bg-[#FFF4E6] text-[#D9480F] px-1.5 py-0.5 rounded-md">-{attendance.early_leave_minutes}분 조기퇴근</span>
                      )}
                    </div>
                  )}

                  {/* 거리 정보 */}
                  {(attendance.distance_in != null || attendance.distance_out != null) && (
                    <div className="flex items-center gap-3 flex-wrap">
                      {attendance.distance_in != null && (
                        <span className="flex items-center gap-1 text-[10px] text-[#8B95A1]"><MapPin className="w-3 h-3" />출근 {Math.round(attendance.distance_in)}m</span>
                      )}
                      {attendance.distance_out != null && (
                        <span className="flex items-center gap-1 text-[10px] text-[#8B95A1]"><MapPin className="w-3 h-3" />퇴근 {Math.round(attendance.distance_out)}m</span>
                      )}
                    </div>
                  )}

                  {/* 근무 유형 뱃지 */}
                  <div className="flex gap-1.5 flex-wrap">
                    {attendance.attendance_type_in === "business_trip_in" && <span className="text-[10px] font-bold bg-[#FFF3BF] text-[#E67700] px-1.5 py-0.5 rounded-md">출장출근</span>}
                    {attendance.attendance_type_in === "fallback_in" && <span className="text-[10px] font-bold bg-[#F3F0FF] text-[#7950F2] px-1.5 py-0.5 rounded-md">수동출근</span>}
                    {attendance.attendance_type_in === "qr_in" && <span className="text-[10px] font-bold bg-[#E8F3FF] text-[#3182F6] px-1.5 py-0.5 rounded-md">QR출근</span>}
                    {attendance.attendance_type_out === "remote_out" && <span className="text-[10px] font-bold bg-[#FFE3E3] text-[#C92A2A] px-1.5 py-0.5 rounded-md">원격퇴근</span>}
                    {attendance.attendance_type_out === "business_trip_out" && <span className="text-[10px] font-bold bg-[#FFF3BF] text-[#E67700] px-1.5 py-0.5 rounded-md">출장퇴근</span>}
                    {attendance.attendance_type_out === "fallback_out" && <span className="text-[10px] font-bold bg-[#F3F0FF] text-[#7950F2] px-1.5 py-0.5 rounded-md">수동퇴근</span>}
                    {attendance.attendance_type_out === "qr_out" && <span className="text-[10px] font-bold bg-[#E8F3FF] text-[#3182F6] px-1.5 py-0.5 rounded-md">QR퇴근</span>}
                  </div>

                  {/* 퇴근 사유 */}
                  {attendance.reason_out && (
                    <p className="text-[10px] text-[#8B95A1]">사유: {attendance.reason_out}</p>
                  )}
                </div>
              )}

              {/* 퇴근 처리 버튼 */}
              {isWorking && (
                <button
                  onClick={() => {
                    setManualOutTime(attendance.scheduled_end ? attendance.scheduled_end.slice(0, 5) : "18:00");
                    setShowManualOut(true);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-[#F3F0FF] text-[#7950F2] text-[12px] font-bold rounded-xl hover:bg-[#E9DFFF] transition-colors"
                >
                  <PenLine className="w-3.5 h-3.5" /> 퇴근 처리하기
                </button>
              )}
            </div>
          )}
        </div>

        {/* 수정/삭제 버튼 */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onEdit}
            className="flex-1 py-3.5 bg-[#3182F6] text-white font-bold rounded-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <Pencil className="w-4 h-4" />
            수정하기
          </button>
          <button
            onClick={() => {
              if (!confirmDelete) { setConfirmDelete(true); return; }
              setDeleting(true);
              onDelete();
            }}
            disabled={deleting}
            className={`flex-1 py-3.5 font-bold rounded-2xl transition-all text-[14px] ${
              confirmDelete ? "bg-red-500 text-white" : "bg-[#F2F4F6] text-[#8B95A1]"
            }`}
          >
            {deleting ? "삭제 중..." : confirmDelete ? "정말 삭제할까요?" : "삭제하기"}
          </button>
        </div>
      </div>

      {/* 수동 퇴근 처리 모달 */}
      {showManualOut && attendance && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowManualOut(false)} />
          <div className="relative bg-white rounded-[24px] shadow-xl w-full max-w-sm p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-bold text-[#191F28]">퇴근 시간 수동 입력</h2>
              <button onClick={() => setShowManualOut(false)} className="p-1.5 text-[#8B95A1] hover:bg-[#F2F4F6] rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center gap-3 bg-[#F9FAFB] rounded-[16px] p-3.5">
              {profile && <AvatarDisplay userId={profile.id} avatarConfig={profile.avatar_config} size={40} />}
              <div>
                <p className="text-[15px] font-bold text-[#191F28]">{attendance.name}</p>
                <p className="text-[12px] text-[#8B95A1]">
                  {dateLabel}
                  {attendance.scheduled_end && <span className="ml-1.5">· 예정 퇴근 {attendance.scheduled_end.slice(0, 5)}</span>}
                </p>
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-bold text-[#191F28] mb-2">퇴근 시간</label>
              <input
                type="time"
                value={manualOutTime}
                onChange={(e) => setManualOutTime(e.target.value)}
                className="w-full px-4 py-3 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[15px] font-bold text-[#191F28] focus:outline-none focus:border-[#3182F6]"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowManualOut(false)} className="flex-1 py-3 text-[14px] font-bold text-[#4E5968] bg-[#F2F4F6] rounded-xl">취소</button>
              <button
                onClick={handleManualOut}
                disabled={manualOutSubmitting || !manualOutTime}
                className="flex-1 py-3 text-[14px] font-bold text-white bg-[#3182F6] rounded-xl hover:bg-blue-600 disabled:opacity-50 transition-all"
              >
                {manualOutSubmitting ? "처리 중..." : "퇴근 처리하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CopyPreviewModal (전주 복사 미리보기) ────────────────────────────────────
interface CopyPreviewModalProps {
  initialSlots: ScheduleSlot[];
  profiles: Profile[];
  onClose: () => void;
  onSave: (slots: ScheduleSlot[]) => Promise<void>;
}

function CopyPreviewModal({ initialSlots, profiles, onClose, onSave }: CopyPreviewModalProps) {
  const [slots, setSlots] = useState<ScheduleSlot[]>(initialSlots);
  const [editingSlot, setEditingSlot] = useState<ScheduleSlot | null>(null);
  const [saving, setSaving] = useState(false);
  const { byId, positionsOfStore } = useWorkplaces();

  const profileMap = useMemo(() => {
    const map = new Map<string, ScheduleSlot[]>();
    slots.forEach((s) => {
      if (!map.has(s.profile_id)) map.set(s.profile_id, []);
      map.get(s.profile_id)!.push(s);
    });
    map.forEach((list) => list.sort((a, b) => a.slot_date.localeCompare(b.slot_date)));
    return map;
  }, [slots]);

  const handleRemove = (id: string) => {
    setSlots((prev) => prev.filter((s) => s.id !== id));
  };

  const handleEditSave = async (data: Partial<ScheduleSlot>) => {
    if (!editingSlot) return;
    setSlots((prev) =>
      prev.map((s) =>
        s.id === editingSlot.id
          ? {
              ...s,
              profile_id: data.profile_id || s.profile_id,
              slot_date: data.slot_date || s.slot_date,
              start_time: data.start_time || s.start_time,
              end_time: data.end_time || s.end_time,
              store_id: data.store_id || s.store_id,
              position_keys: data.position_keys ?? s.position_keys,
              notes: data.notes !== undefined ? (data.notes || null) : s.notes,
            }
          : s
      )
    );
    setEditingSlot(null);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    await onSave(slots);
    setSaving(false);
  };

  const visibleProfiles = profiles.filter((p) => profileMap.has(p.id));

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-[28px] shadow-2xl animate-in zoom-in-95 fade-in-0 duration-200 max-h-[85vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex justify-between items-center px-5 pt-6 pb-4 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="text-[18px] font-bold text-[#191F28]">전주 복사 미리보기</h3>
            <p className="text-[13px] text-[#8B95A1] mt-0.5">
              {visibleProfiles.length}명 · {slots.length}개 근무
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F4F6]">
            <X className="w-5 h-5 text-[#8B95A1]" />
          </button>
        </div>

        {/* 슬롯 목록 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 scrollbar-hide">
          {slots.length === 0 && (
            <div className="py-12 text-center text-[#8B95A1] text-[14px]">
              모든 근무가 제거됐어요
            </div>
          )}
          {visibleProfiles.map((profile) => (
            <div key={profile.id}>
              <div className="flex items-center gap-2 mb-2">
                <AvatarDisplay userId={profile.id} avatarConfig={profile.avatar_config} size={28} />
                <span className="text-[14px] font-bold text-[#191F28]">{profile.name}</span>
                <span className="text-[12px] text-[#8B95A1]">{profileMap.get(profile.id)?.length}개</span>
              </div>
              <div className="space-y-1.5">
                {(profileMap.get(profile.id) || []).map((slot) => {
                  const store = byId[slot.store_id];
                  const positions = slot.position_keys?.length
                    ? slot.position_keys
                        .map((k) => positionsOfStore(slot.store_id).find((p) => p.position_key === k)?.label || k)
                        .join(" · ")
                    : null;
                  return (
                    <div key={slot.id} className="flex items-center gap-2 p-2.5 bg-[#F9FAFB] rounded-xl">
                      <div className="w-1 h-8 rounded-full shrink-0" style={{ backgroundColor: store?.color || "#3182F6" }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-[13px]">
                          <span className="font-bold" style={{ color: store?.color || "#3182F6" }}>
                            {store?.label || "근무지"}
                          </span>
                          {positions && <span className="text-[#8B95A1] text-[11px]">· {positions}</span>}
                        </div>
                        <div className="text-[12px] text-[#4E5968]">
                          {format(parseISO(slot.slot_date), "M/d(EEE)", { locale: ko })} · {slot.start_time.slice(0, 5)}~{slot.end_time.slice(0, 5)}
                        </div>
                      </div>
                      <button
                        onClick={() => setEditingSlot(slot)}
                        className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#E8F3FF] transition-all"
                      >
                        <Pencil className="w-3.5 h-3.5 text-[#8B95A1]" />
                      </button>
                      <button
                        onClick={() => handleRemove(slot.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#FFEBEB] transition-all"
                      >
                        <X className="w-3.5 h-3.5 text-[#8B95A1]" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* 하단 저장 */}
        <div className="px-5 py-4 border-t border-slate-100 shrink-0">
          <button
            onClick={handleSaveAll}
            disabled={saving || slots.length === 0}
            className="w-full py-3.5 bg-[#3182F6] text-white font-bold rounded-2xl disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            {saving ? "저장 중..." : `${slots.length}개 근무 저장하기`}
          </button>
        </div>
      </div>

      {/* 슬롯 편집 */}
      {editingSlot && (
        <SlotBottomSheet
          slot={editingSlot}
          profiles={profiles}
          onClose={() => setEditingSlot(null)}
          onSave={handleEditSave}
          defaultDate={editingSlot.slot_date}
          defaultProfileId={editingSlot.profile_id}
        />
      )}
    </div>
  );
}

// ─── DaySheet (날짜 상세 바텀시트) ───────────────────────────────────────────
interface DaySheetProps {
  dateStr: string;
  slots: ScheduleSlot[];
  attendance: AttendanceEntry[];
  events: CompanyEvent[];
  profiles: Profile[];
  onClose: () => void;
  onEditSlot: (slot: ScheduleSlot) => void;
  onAddSlot: (date: string) => void;
  onMutate: () => void;
  filterProfileId?: string;
}

function DaySheet({
  dateStr,
  slots,
  attendance,
  events,
  profiles,
  onClose,
  onEditSlot,
  onAddSlot,
  onMutate,
  filterProfileId,
}: DaySheetProps) {
  const { byId, positionsOfStore } = useWorkplaces();
  const supabase = createClient();
  const [manualOutAtt, setManualOutAtt] = useState<AttendanceEntry | null>(null);
  const [manualOutTime, setManualOutTime] = useState("");
  const [manualOutSubmitting, setManualOutSubmitting] = useState(false);
  const [viewProfileId, setViewProfileId] = useState<string | null>(null);

  const dateLabel = format(parseISO(dateStr), "M월 d일 (EEEE)", { locale: ko });
  const isPast = isBefore(parseISO(dateStr), startOfDay(new Date()));

  const attByProfile: Record<string, AttendanceEntry> = {};
  attendance.forEach((a) => { attByProfile[a.profile_id] = a; });
  const profileById: Record<string, Profile> = {};
  profiles.forEach((p) => { profileById[p.id] = p; });

  const daySlots = slots.filter((s) =>
    s.slot_date === dateStr && s.status === "active" && (!filterProfileId || s.profile_id === filterProfileId)
  );
  const dayEvents = filterProfileId ? [] : events.filter((e) => e.start_date <= dateStr && e.end_date >= dateStr);
  const profilesWithSlots = new Set(daySlots.map((s) => s.profile_id));
  const unscheduledAtt = filterProfileId ? [] : attendance.filter(
    (a) => a.date === dateStr && !a.is_absent && a.clock_in && !profilesWithSlots.has(a.profile_id)
  );

  const presentCount = daySlots.filter((s) => {
    const att = attByProfile[s.profile_id];
    return att && !att.is_absent;
  }).length + unscheduledAtt.length;
  const absentCount = isPast
    ? daySlots.filter((s) => attByProfile[s.profile_id]?.is_absent).length
    : 0;

  const openManualOut = (att: AttendanceEntry) => {
    setManualOutTime(att.scheduled_end ? att.scheduled_end.slice(0, 5) : "18:00");
    setManualOutAtt(att);
  };

  const handleManualOut = async () => {
    if (!manualOutAtt || !manualOutTime) return;
    setManualOutSubmitting(true);
    const clockOutDate = new Date(`${dateStr}T${manualOutTime}:00`);
    const { error } = await supabase.from("attendance_logs").insert({
      profile_id: manualOutAtt.profile_id,
      type: "OUT",
      attendance_type: "fallback_out",
      created_at: clockOutDate.toISOString(),
      reason: "관리자 수동 처리",
    });
    if (error) {
      toast.error("퇴근 처리에 실패했어요", { description: "잠시 후 다시 시도해주세요." });
    } else {
      toast.success(`${manualOutAtt.name}님 퇴근 처리가 완료됐어요.`);
      await createNotification({
        profile_id: manualOutAtt.profile_id,
        target_role: "employee",
        type: "attendance_fallback_out",
        title: "퇴근 처리 완료",
        content: "관리자가 퇴근 처리했어요.",
        source_id: manualOutAtt.profile_id,
      });
      setManualOutAtt(null);
      onMutate();
    }
    setManualOutSubmitting(false);
  };

  const renderAttCard = (att: AttendanceEntry | undefined, slot?: ScheduleSlot) => {
    if (!att && !slot) return null;
    const profile = slot ? (profileById[slot.profile_id] ?? { name: att?.name || "?", color_hex: att?.color_hex || "#8B95A1" }) : null;
    const name = att?.name || profile?.name || "알 수 없음";
    const colorHex = att?.color_hex || profile?.color_hex || "#8B95A1";
    const profileId = att?.profile_id || slot?.profile_id || "";

    if (att?.is_absent && slot) {
      if (!isPast) return null;
      return (
        <div key={profileId} className="bg-[#FFF5F5] rounded-[18px] p-4 flex items-center gap-3 border border-[#FFCDD2]">
          <AvatarDisplay userId={profileId} avatarConfig={att?.avatar_config ?? profileById[slot?.profile_id ?? ""]?.avatar_config} size={40} />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <button
                onClick={() => profileId && setViewProfileId(profileId)}
                className="text-[15px] font-bold text-[#191F28] hover:text-[#3182F6] transition-colors"
              >
                {name}
              </button>
              <span className="text-[10px] font-bold bg-[#FFCDD2] text-[#E03131] px-1.5 py-0.5 rounded-md">미출근</span>
            </div>
            {slot.start_time && (
              <p className="text-[12px] text-[#8B95A1] mt-0.5">
                예정: {slot.start_time.slice(0, 5)} ~ {slot.end_time.slice(0, 5)}
                {slot.store_id && <span className="ml-1">({byId[slot.store_id]?.label ?? ""})</span>}
              </p>
            )}
          </div>
        </div>
      );
    }

    if (!att || (!att.clock_in && !slot)) return null;
    const isWorking = att.clock_in && !att.clock_out;
    const isAnomaly = isWorking && !isToday(parseISO(dateStr));
    let durationText = "";
    if (att.clock_in && att.clock_out) {
      const diffMs = new Date(att.clock_out).getTime() - new Date(att.clock_in).getTime();
      const hours = Math.floor(diffMs / 3600000);
      const mins = Math.floor((diffMs % 3600000) / 60000);
      durationText = `${hours}시간 ${mins > 0 ? `${mins}분` : ""}`;
    }

    return (
      <div key={`att-${att.profile_id}`} className="bg-white rounded-[18px] p-4 border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col gap-3">
        {/* 상단: 프로필 + 출퇴근 시간 */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <AvatarDisplay userId={profileId} avatarConfig={att?.avatar_config ?? profileById[slot?.profile_id ?? ""]?.avatar_config} size={40} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <button onClick={() => profileId && setViewProfileId(profileId)} className="text-[15px] font-bold text-[#191F28] truncate hover:text-[#3182F6] transition-colors">{name}</button>
                {isAnomaly && (
                  <span className="flex items-center gap-1 bg-[#FFF4E6] text-[#D9480F] text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0">
                    <AlertCircle className="w-3 h-3" /> 미퇴근
                  </span>
                )}
              </div>
              <p className="text-[12px] text-[#8B95A1] mt-0.5 truncate">{att.store_name || (slot ? byId[slot.store_id]?.label : "")}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-1.5 text-[12px] font-bold">
              <span className="bg-[#F2F4F6] text-[#333D4B] px-2 py-1 rounded-lg">
                {att.clock_in ? format(new Date(att.clock_in), "HH:mm") : "-"}
              </span>
              <span className="text-[#D1D6DB]">▶</span>
              <span className={`px-2 py-1 rounded-lg ${att.clock_out ? "bg-[#F2F4F6] text-[#333D4B]" : isAnomaly ? "bg-[#FFF4E6] text-[#D9480F]" : "bg-[#E8F3FF] text-[#3182F6]"}`}>
                {att.clock_out ? format(new Date(att.clock_out), "HH:mm") : isAnomaly ? "기록없음" : "근무중"}
              </span>
            </div>
            {durationText && (
              <span className="text-[10px] text-[#8B95A1] flex items-center gap-1">
                <Clock className="w-3 h-3" /> {durationText}
              </span>
            )}
          </div>
        </div>

        {/* 퇴근 처리 버튼 (별도 행) */}
        {isWorking && (
          <button
            onClick={() => openManualOut(att)}
            className="w-full flex items-center justify-center gap-1.5 py-2 bg-[#F3F0FF] text-[#7950F2] text-[12px] font-bold rounded-xl hover:bg-[#E9DFFF] transition-colors"
          >
            <PenLine className="w-3.5 h-3.5" /> 퇴근 처리하기
          </button>
        )}


        {/* 스케줄 정보 */}
        {att.scheduled_start && (
          <div className="flex items-center gap-2 flex-wrap pl-1">
            <span className="text-[11px] text-[#8B95A1]">스케줄:</span>
            {att.scheduled_location && (
              <span className="text-[11px] font-bold" style={{ color: byId[att.scheduled_location]?.color || "#4E5968" }}>
                {byId[att.scheduled_location]?.label || att.scheduled_location}
              </span>
            )}
            <span className="text-[11px] text-[#4E5968]">{att.scheduled_start.slice(0, 5)}~{att.scheduled_end?.slice(0, 5)}</span>
            {att.late_minutes != null && att.late_minutes > 0 && (
              <span className="text-[10px] font-bold bg-[#FFF7E6] text-[#F59E0B] px-1.5 py-0.5 rounded-md">+{att.late_minutes}분 지각</span>
            )}
            {att.early_leave_minutes != null && att.early_leave_minutes > 0 && (
              <span className="text-[10px] font-bold bg-[#FFF4E6] text-[#D9480F] px-1.5 py-0.5 rounded-md">-{att.early_leave_minutes}분 조기퇴근</span>
            )}
          </div>
        )}

        {/* 거리 + 특이사항 뱃지 */}
        <div className="flex flex-wrap gap-1.5 pl-1">
          {att.distance_in != null && (
            <span className="flex items-center gap-1 text-[10px] text-[#8B95A1]"><MapPin className="w-3 h-3" />출근 {Math.round(att.distance_in)}m</span>
          )}
          {att.distance_out != null && (
            <span className="flex items-center gap-1 text-[10px] text-[#8B95A1]"><MapPin className="w-3 h-3" />퇴근 {Math.round(att.distance_out)}m</span>
          )}
          {att.attendance_type_in === "business_trip_in" && <span className="text-[10px] font-bold bg-[#FFF3BF] text-[#E67700] px-1.5 py-0.5 rounded-md">출장출근</span>}
          {att.attendance_type_in === "fallback_in" && <span className="text-[10px] font-bold bg-[#F3F0FF] text-[#7950F2] px-1.5 py-0.5 rounded-md">수동출근</span>}
          {att.attendance_type_in === "qr_in" && <span className="text-[10px] font-bold bg-[#E8F3FF] text-[#3182F6] px-1.5 py-0.5 rounded-md">QR출근</span>}
          {att.attendance_type_out === "remote_out" && <span className="text-[10px] font-bold bg-[#FFE3E3] text-[#C92A2A] px-1.5 py-0.5 rounded-md">원격퇴근</span>}
          {att.attendance_type_out === "business_trip_out" && <span className="text-[10px] font-bold bg-[#FFF3BF] text-[#E67700] px-1.5 py-0.5 rounded-md">출장퇴근</span>}
          {att.attendance_type_out === "fallback_out" && <span className="text-[10px] font-bold bg-[#F3F0FF] text-[#7950F2] px-1.5 py-0.5 rounded-md">수동퇴근</span>}
          {att.attendance_type_out === "qr_out" && <span className="text-[10px] font-bold bg-[#E8F3FF] text-[#3182F6] px-1.5 py-0.5 rounded-md">QR퇴근</span>}
          {att.reason_out && <span className="text-[10px] text-[#8B95A1]">사유: {att.reason_out}</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-[28px] px-5 pt-6 pb-6 shadow-2xl animate-in zoom-in-95 fade-in-0 duration-200 max-h-[85vh] overflow-y-auto scrollbar-hide">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-[17px] font-bold text-[#191F28]">
              {filterProfileId && profileById[filterProfileId] ? `${profileById[filterProfileId].name} · ` : ""}{dateLabel}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              {presentCount > 0 && (
                <span className="text-[12px] font-semibold text-[#3182F6] bg-[#E8F3FF] px-2 py-0.5 rounded-full">출근 {presentCount}명</span>
              )}
              {absentCount > 0 && (
                <span className="text-[12px] font-semibold text-[#E03131] bg-[#FFEBEB] px-2 py-0.5 rounded-full">미출근 {absentCount}명</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F4F6]">
            <X className="w-5 h-5 text-[#8B95A1]" />
          </button>
        </div>

        {/* 회사 일정 */}
        {dayEvents.length > 0 && (
          <div className="mb-4 space-y-2">
            {dayEvents.map((ev) => (
              <div key={ev.id} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ backgroundColor: ev.color + "22", borderLeft: `3px solid ${ev.color}` }}>
                <span className="text-[13px] font-bold" style={{ color: ev.color }}>{ev.title}</span>
              </div>
            ))}
          </div>
        )}

        {/* 슬롯 기반 카드 */}
        <div className="space-y-2">
          {daySlots.length === 0 && unscheduledAtt.length === 0 && (
            <div className="py-8 text-center text-[#8B95A1] text-[14px]">등록된 근무가 없어요</div>
          )}

          {daySlots.map((slot) => {
            const att = attByProfile[slot.profile_id];
            const profile = profileById[slot.profile_id];
            return (
              <button
                key={slot.id}
                onClick={() => onEditSlot(slot)}
                className="w-full text-left rounded-[18px] overflow-hidden hover:ring-2 hover:ring-[#3182F6] transition-all active:scale-[0.98]"
              >
                {renderAttCard(att, slot) ?? (
                  <div className="bg-white p-4 border border-slate-100 rounded-[18px] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <AvatarDisplay userId={slot.profile_id} avatarConfig={profile?.avatar_config} size={40} />
                      <div>
                        <span className="text-[15px] font-bold text-[#191F28]">{profile?.name}</span>
                        <p className="text-[12px] text-[#8B95A1]">{byId[slot.store_id]?.label}</p>
                      </div>
                    </div>
                    <div className="text-right text-[13px] font-bold text-[#4E5968]">
                      {slot.start_time.slice(0, 5)} ~ {slot.end_time.slice(0, 5)}
                    </div>
                  </div>
                )}
              </button>
            );
          })}

          {/* 스케줄 외 출근 */}
          {unscheduledAtt.length > 0 && (
            <>
              <p className="text-[11px] text-[#8B95A1] font-medium pt-1 pl-1">스케줄 외 출근</p>
              {unscheduledAtt.map((att) => renderAttCard(att))}
            </>
          )}
        </div>

        <button
          onClick={() => { onAddSlot(dateStr); onClose(); }}
          className="w-full mt-4 py-3 border-2 border-dashed border-[#E5E8EB] rounded-2xl text-[14px] font-medium text-[#8B95A1] hover:border-[#3182F6] hover:text-[#3182F6] transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          근무 추가하기
        </button>
      </div>

      {/* 수동 퇴근 처리 모달 */}
      {manualOutAtt && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setManualOutAtt(null)} />
          <div className="relative bg-white rounded-[24px] shadow-xl w-full max-w-sm p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-bold text-[#191F28]">퇴근 시간 수동 입력</h2>
              <button onClick={() => setManualOutAtt(null)} className="p-1.5 text-[#8B95A1] hover:bg-[#F2F4F6] rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center gap-3 bg-[#F9FAFB] rounded-[16px] p-3.5">
              <AvatarDisplay userId={manualOutAtt.profile_id} avatarConfig={manualOutAtt.avatar_config} size={40} />
              <div>
                <p className="text-[15px] font-bold text-[#191F28]">{manualOutAtt.name}</p>
                <p className="text-[12px] text-[#8B95A1]">
                  {format(parseISO(dateStr), "M월 d일 (EEE)", { locale: ko })}
                  {manualOutAtt.scheduled_end && <span className="ml-1.5">· 예정 퇴근 {manualOutAtt.scheduled_end.slice(0, 5)}</span>}
                </p>
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-bold text-[#191F28] mb-2">퇴근 시간</label>
              <input
                type="time"
                value={manualOutTime}
                onChange={(e) => setManualOutTime(e.target.value)}
                className="w-full px-4 py-3 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[15px] font-bold text-[#191F28] focus:outline-none focus:border-[#3182F6]"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setManualOutAtt(null)} className="flex-1 py-3 text-[14px] font-bold text-[#4E5968] bg-[#F2F4F6] rounded-xl">취소</button>
              <button
                onClick={handleManualOut}
                disabled={manualOutSubmitting || !manualOutTime}
                className="flex-1 py-3 text-[14px] font-bold text-white bg-[#3182F6] rounded-xl hover:bg-blue-600 disabled:opacity-50 transition-all"
              >
                {manualOutSubmitting ? "처리 중..." : "퇴근 처리하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 직원 프로필 모달 */}
      {viewProfileId && (
        <EmployeeProfileModal
          profileId={viewProfileId}
          onClose={() => setViewProfileId(null)}
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdminCalendarPage() {
  const [viewType, setViewType] = useState<"month" | "week">("week");
  const [baseDate, setBaseDate] = useState(new Date());
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [layers, setLayers] = useState<{ schedule: boolean; attendance: boolean; events: boolean }>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("admin_calendar_layers");
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return { schedule: true, attendance: true, events: true };
  });
  const [editingSlot, setEditingSlot] = useState<{
    slot: Partial<ScheduleSlot> | null;
    defaultDate?: string;
    defaultProfileId?: string;
  } | null>(null);
  const [infoSlot, setInfoSlot] = useState<ScheduleSlot | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("calendar_showAdmin") === "true";
    }
    return false;
  });
  const [viewProfileId, setViewProfileId] = useState<string | null>(null);
  const [copyPreview, setCopyPreview] = useState<{ slots: ScheduleSlot[]; wsId: string } | null>(null);
  const weekScrollRef = useRef<HTMLDivElement>(null);

  const { workplaces, byId, positionsOfStore } = useWorkplaces();

  // ─── 주간뷰 오늘 컬럼으로 자동 스크롤 ───
  const scrollToToday = useCallback(() => {
    const container = weekScrollRef.current;
    if (!container) return;
    const todayCell = container.querySelector<HTMLElement>("[data-today-col]");
    if (!todayCell) return;
    const containerRect = container.getBoundingClientRect();
    const cellRect = todayCell.getBoundingClientRect();
    const scrollLeft = container.scrollLeft + cellRect.left - containerRect.left - containerRect.width / 2 + cellRect.width / 2;
    container.scrollTo({ left: Math.max(0, scrollLeft), behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (viewType === "week") {
      // 렌더 후 DOM이 준비되면 스크롤
      const timer = setTimeout(scrollToToday, 100);
      return () => clearTimeout(timer);
    }
  }, [viewType, baseDate, scrollToToday]);

  // ─── 날짜 범위 계산 ───
  const { startDate, endDate, weekDates } = useMemo(() => {
    if (viewType === "week") {
      const start = startOfWeek(baseDate, { weekStartsOn: 0 });
      const end = endOfWeek(baseDate, { weekStartsOn: 0 });
      return {
        startDate: start,
        endDate: end,
        weekDates: Array.from({ length: 7 }, (_, i) => format(addDays(start, i), "yyyy-MM-dd")),
      };
    } else {
      const monthStart = startOfMonth(baseDate);
      const monthEnd = endOfMonth(baseDate);
      const start = startOfWeek(monthStart, { weekStartsOn: 0 });
      const end = endOfWeek(monthEnd, { weekStartsOn: 0 });
      return { startDate: start, endDate: end, weekDates: [] };
    }
  }, [viewType, baseDate]);

  const rangeKey = `${format(startDate, "yyyy-MM-dd")}_${format(endDate, "yyyy-MM-dd")}`;

  // ─── 데이터 Fetch ───
  const { data, mutate, isLoading } = useSWR(
    ["admin-calendar", rangeKey, storeFilter, showAdmin ? "all" : "emp"],
    async ([, range, sf, adminFlag]) => {
      const supabase = createClient();
      const [start, end] = range.split("_");

      // 직원 목록 (adminFlag === "all" 이면 어드민 포함)
      const profileQuery = supabase.from("profiles").select("id, name, color_hex, avatar_config, role").order("name");
      const { data: profilesData } = adminFlag === "all"
        ? await profileQuery
        : await profileQuery.eq("role", "employee");

      // weekly_schedules (상태 파악용)
      const { data: wsData } = await supabase
        .from("weekly_schedules")
        .select("id, week_start, status")
        .gte("week_start", start)
        .lte("week_start", end);

      // schedule_slots
      const { data: slotsData } = await supabase
        .from("schedule_slots")
        .select("*")
        .gte("slot_date", start)
        .lte("slot_date", end)
        .neq("status", "cancelled");

      // attendance_logs
      const startStr = new Date(`${start}T00:00:00+09:00`).toISOString();
      const endStr = new Date(`${end}T23:59:59.999+09:00`).toISOString();
      const { data: logsData } = await supabase
        .from("attendance_logs")
        .select("id, profile_id, type, created_at, distance_m, attendance_type, reason, profiles(name, color_hex, avatar_config), check_in_store:stores!check_in_store_id(name)")
        .gte("created_at", startStr)
        .lte("created_at", endStr)
        .order("created_at", { ascending: true });

      // company_events (테이블 없으면 빈 배열)
      const { data: eventsData } = await supabase
        .from("company_events")
        .select("*")
        .or(`start_date.lte.${end},end_date.gte.${start}`);

      // attendance 가공: profile × date 맵
      const attMap: Record<string, AttendanceEntry> = {};
      const profileMap: Record<string, { name: string; color_hex: string; avatar_config?: any }> = {};
      (profilesData || []).forEach((p: any) => { profileMap[p.id] = { name: p.name, color_hex: p.color_hex, avatar_config: p.avatar_config }; });

      const slots = (slotsData || []) as ScheduleSlot[];

      // [1] 스케줄 기반 결근 항목 생성
      slots.forEach((slot) => {
        if (!profileMap[slot.profile_id]) return; // showAdmin 필터: profileMap에 없는 직원 skip
        const key = `${slot.profile_id}_${slot.slot_date}`;
        if (!attMap[key]) {
          const p = profileMap[slot.profile_id];
          attMap[key] = {
            profile_id: slot.profile_id,
            date: slot.slot_date,
            name: p?.name || "알 수 없음",
            color_hex: p?.color_hex || "#8B95A1",
            avatar_config: p?.avatar_config ?? null,
            store_name: "",
            clock_in: null,
            clock_out: null,
            is_absent: true,
            late_minutes: null,
            early_leave_minutes: null,
            distance_in: null,
            distance_out: null,
            attendance_type_in: "regular",
            attendance_type_out: "regular",
            reason_out: null,
            scheduled_start: slot.start_time,
            scheduled_end: slot.end_time,
            scheduled_location: slot.store_id,
          };
        } else {
          // 스케줄 정보 보완
          const entry = attMap[key];
          if (!entry.scheduled_start) {
            entry.scheduled_start = slot.start_time;
            entry.scheduled_end = slot.end_time;
            entry.scheduled_location = slot.store_id;
          }
        }
      });

      // [2] 출퇴근 로그 반영
      (logsData || []).forEach((log: any) => {
        if (!profileMap[log.profile_id]) return; // showAdmin 필터: profileMap에 없는 직원 skip
        const dateKey = format(new Date(log.created_at), "yyyy-MM-dd");
        const key = `${log.profile_id}_${dateKey}`;
        if (!attMap[key]) {
          const p = (log.profiles as any) || profileMap[log.profile_id];
          attMap[key] = {
            profile_id: log.profile_id,
            date: dateKey,
            name: p?.name || "알 수 없음",
            color_hex: p?.color_hex || "#8B95A1",
            avatar_config: p?.avatar_config ?? null,
            store_name: (log.check_in_store as any)?.name || "",
            clock_in: null,
            clock_out: null,
            is_absent: false,
            late_minutes: null,
            early_leave_minutes: null,
            distance_in: null,
            distance_out: null,
            attendance_type_in: "regular",
            attendance_type_out: "regular",
            reason_out: null,
            scheduled_start: null,
            scheduled_end: null,
            scheduled_location: null,
          };
        }
        const entry = attMap[key];
        if (log.type === "IN" && !entry.clock_in) {
          const p = (log.profiles as any) || profileMap[log.profile_id];
          entry.clock_in = log.created_at;
          entry.is_absent = false;
          entry.distance_in = log.distance_m ?? null;
          entry.attendance_type_in = log.attendance_type || "regular";
          entry.store_name = (log.check_in_store as any)?.name || entry.store_name;
          if (!entry.name || entry.name === "알 수 없음") entry.name = p?.name || entry.name;
          if (!entry.color_hex || entry.color_hex === "#8B95A1") entry.color_hex = p?.color_hex || entry.color_hex;
        } else if (log.type === "OUT" && !entry.clock_out) {
          entry.clock_out = log.created_at;
          entry.distance_out = log.distance_m ?? null;
          entry.attendance_type_out = log.attendance_type || "regular";
          entry.reason_out = log.reason ?? null;
        }
      });

      // [3] 지각 + 조기퇴근 계산
      Object.values(attMap).forEach((entry) => {
        if (!entry.scheduled_start) return;
        const dateKey = entry.date;
        if (entry.clock_in) {
          const [sh, sm] = entry.scheduled_start.split(":").map(Number);
          const schedStart = new Date(`${dateKey}T${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}:00`);
          const diff = Math.floor((new Date(entry.clock_in).getTime() - schedStart.getTime()) / 60000);
          if (diff > 10) entry.late_minutes = diff;
        }
        if (entry.clock_out && entry.scheduled_end) {
          const [eh, em] = entry.scheduled_end.split(":").map(Number);
          const schedEnd = new Date(`${dateKey}T${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}:00`);
          const diff = Math.floor((schedEnd.getTime() - new Date(entry.clock_out).getTime()) / 60000);
          if (diff > 10) entry.early_leave_minutes = diff;
        }
      });

      let profiles = (profilesData || []) as Profile[];
      if (sf !== "all") {
        const { data: assignedProfiles } = await supabase
          .from("employee_store_assignments")
          .select("profile_id")
          .eq("store_id", sf);
        const assignedIds = new Set((assignedProfiles || []).map((a: any) => a.profile_id));
        profiles = profiles.filter((p) => assignedIds.has(p.id));
      }

      return {
        profiles,
        weeklySchedules: (wsData || []) as WeeklySchedule[],
        slots,
        attendance: Object.values(attMap),
        events: (eventsData || []) as CompanyEvent[],
      };
    },
    { dedupingInterval: 30_000, revalidateOnFocus: false }
  );

  const profiles = data?.profiles ?? [];
  const rawSlots = data?.slots ?? [];
  const attendance = data?.attendance ?? [];
  const events = data?.events ?? [];

  const slots = rawSlots;
  const weeklySchedules = data?.weeklySchedules ?? [];

  // ─── weekly_schedule 조회/생성 ───
  const getOrCreateWeeklySchedule = async (slotDate: string): Promise<string | null> => {
    const supabase = createClient();
    const weekStart = format(startOfWeek(parseISO(slotDate), { weekStartsOn: 0 }), "yyyy-MM-dd");
    const existing = weeklySchedules.find((ws) => ws.week_start === weekStart);
    if (existing) return existing.id;

    const { data: dbExisting } = await supabase
      .from("weekly_schedules")
      .select("id")
      .eq("week_start", weekStart)
      .maybeSingle();
    if (dbExisting) return dbExisting.id;

    const { data: created, error } = await supabase
      .from("weekly_schedules")
      .insert({ week_start: weekStart, status: "confirmed", published_at: new Date().toISOString() })
      .select("id")
      .single();
    if (error) {
      logError({ message: "weekly_schedule 생성 실패", error, source: "admin/calendar" });
      return null;
    }
    return created.id;
  };

  // ─── 슬롯 저장 (DB 직접 반영 + 알림) ───
  const handleSaveSlot = async (formData: Partial<ScheduleSlot>, isNew: boolean) => {
    if (!formData.slot_date) return;
    const startMin = timeToMinutes(formData.start_time!);
    const endMin = timeToMinutes(formData.end_time!);
    if (startMin >= endMin) { toast.error("시작 시간이 종료 시간보다 늦어요"); return; }

    const sameDaySlots = slots.filter(
      (s) => s.profile_id === formData.profile_id && s.slot_date === formData.slot_date && s.status === "active" && s.id !== (formData.id ?? "")
    );
    const hasOverlap = sameDaySlots.some((s) => {
      const eStart = timeToMinutes(s.start_time);
      const eEnd = timeToMinutes(s.end_time);
      return startMin < eEnd && endMin > eStart;
    });
    if (hasOverlap) { toast.error("해당 시간대에 이미 근무가 있어요"); return; }

    const wsId = await getOrCreateWeeklySchedule(formData.slot_date);
    if (!wsId) return;

    const supabase = createClient();

    if (isNew) {
      const { error } = await supabase.from("schedule_slots").insert({
        weekly_schedule_id: wsId,
        profile_id: formData.profile_id!,
        slot_date: formData.slot_date!,
        start_time: formData.start_time!,
        end_time: formData.end_time!,
        store_id: formData.store_id!,
        position_keys: formData.position_keys || [],
        status: "active",
        notes: formData.notes || null,
      });
      if (error) { toast.error("근무 추가에 실패했어요", { description: error.message }); return; }

      await supabase.from("weekly_schedules")
        .update({ status: "confirmed", published_at: new Date().toISOString() })
        .eq("id", wsId);

      createNotification({
        profile_id: formData.profile_id!, target_role: "employee", type: "schedule_updated",
        title: "스케줄이 업데이트됐어요",
        content: `근무가 추가됐어요 (${formData.slot_date} ${formData.start_time}~${formData.end_time}).`,
        source_id: formData.slot_date,
        push_url: `/calendar?highlight=${formData.slot_date}`,
      });
      toast.success("근무를 추가했어요");
    } else {
      const { error } = await supabase.from("schedule_slots").update({
        profile_id: formData.profile_id,
        slot_date: formData.slot_date,
        start_time: formData.start_time,
        end_time: formData.end_time,
        store_id: formData.store_id,
        position_keys: formData.position_keys || [],
        notes: formData.notes || null,
      }).eq("id", formData.id);
      if (error) { toast.error("근무 수정에 실패했어요", { description: error.message }); return; }

      const origSlot = rawSlots.find((s) => s.id === formData.id);
      const affectedProfiles = new Set<string>();
      if (origSlot) affectedProfiles.add(origSlot.profile_id);
      if (formData.profile_id) affectedProfiles.add(formData.profile_id);

      await Promise.allSettled(
        Array.from(affectedProfiles).map((pid) =>
          createNotification({
            profile_id: pid, target_role: "employee", type: "schedule_updated",
            title: "스케줄이 업데이트됐어요",
            content: `근무가 변경됐어요 (${formData.slot_date} ${formData.start_time}~${formData.end_time}).`,
            source_id: formData.slot_date,
            push_url: `/calendar?highlight=${formData.slot_date}`,
          })
        )
      );
      toast.success("근무를 수정했어요");
    }
    setEditingSlot(null);
    setInfoSlot(null);
    mutate();
  };

  // ─── 슬롯 삭제 (DB 직접 반영 + 알림) ───
  const handleDeleteSlot = async (id: string) => {
    const supabase = createClient();
    const slot = rawSlots.find((s) => s.id === id);
    const { error } = await supabase.from("schedule_slots").update({ status: "cancelled" }).eq("id", id);
    if (error) { toast.error("근무 삭제에 실패했어요", { description: error.message }); return; }

    if (slot) {
      createNotification({
        profile_id: slot.profile_id, target_role: "employee", type: "schedule_updated",
        title: "스케줄이 업데이트됐어요",
        content: `근무가 삭제됐어요 (${slot.slot_date}).`,
        source_id: slot.slot_date,
        push_url: `/calendar?highlight=${slot.slot_date}`,
      });
    }
    toast.success("근무를 삭제했어요");
    setInfoSlot(null);
    setEditingSlot(null);
    mutate();
  };

  // ─── 주간 이전주 복사 (미리보기 모달) ───
  const handleCopyPrevWeek = async () => {
    if (viewType !== "week") return;
    const supabase = createClient();
    const prevWeekStart = format(subWeeks(startDate, 1), "yyyy-MM-dd");
    const { data: prevWs } = await supabase
      .from("weekly_schedules").select("id").eq("week_start", prevWeekStart).maybeSingle();
    if (!prevWs) { toast.error("이전 주 스케줄이 없어요"); return; }

    const { data: prevSlots } = await supabase
      .from("schedule_slots").select("*").eq("weekly_schedule_id", prevWs.id).neq("status", "cancelled");
    if (!prevSlots || prevSlots.length === 0) { toast.error("이전 주 슬롯이 없어요"); return; }

    const wsId = await getOrCreateWeeklySchedule(weekDates[1] || weekDates[0]);
    if (!wsId) return;

    const prevWeekDates = Array.from({ length: 7 }, (_, i) =>
      format(addDays(parseISO(prevWeekStart), i), "yyyy-MM-dd")
    );
    const existingSet = new Set(
      slots.filter((s) => s.status === "active").map((s) => `${s.profile_id}_${s.slot_date}`)
    );
    const previewSlots: ScheduleSlot[] = [];
    prevSlots.forEach((s: any) => {
      const idx = prevWeekDates.indexOf(s.slot_date);
      if (idx === -1) return;
      const targetDate = weekDates[idx];
      if (existingSet.has(`${s.profile_id}_${targetDate}`)) return;
      previewSlots.push({
        id: crypto.randomUUID(), weekly_schedule_id: wsId, profile_id: s.profile_id,
        slot_date: targetDate, start_time: s.start_time, end_time: s.end_time,
        store_id: s.store_id, position_keys: s.position_keys || [], status: "active", notes: s.notes || null,
      });
      existingSet.add(`${s.profile_id}_${targetDate}`);
    });
    if (previewSlots.length === 0) { toast.error("복사할 슬롯이 없어요"); return; }
    setCopyPreview({ slots: previewSlots, wsId });
  };

  // ─── 전주 복사 미리보기 → 최종 저장 ───
  const handleCopyPreviewSave = async (finalSlots: ScheduleSlot[]) => {
    if (finalSlots.length === 0) { setCopyPreview(null); return; }
    const supabase = createClient();
    const toInsert = finalSlots.map(({ id: _t, ...rest }) => rest);
    const { error } = await supabase.from("schedule_slots").insert(toInsert);
    if (error) { toast.error("복사에 실패했어요", { description: error.message }); return; }

    const wsId = finalSlots[0].weekly_schedule_id;
    await supabase.from("weekly_schedules")
      .update({ status: "confirmed", published_at: new Date().toISOString() })
      .eq("id", wsId);

    const affectedProfiles = new Set(finalSlots.map((s) => s.profile_id));
    const highlightDate = weekDates[0];
    await Promise.allSettled(
      Array.from(affectedProfiles).map((pid) =>
        createNotification({
          profile_id: pid, target_role: "employee", type: "schedule_updated",
          title: "스케줄이 업데이트됐어요",
          content: "이번 주 근무가 배정됐어요. 캘린더에서 확인해보세요.",
          source_id: highlightDate,
          push_url: `/calendar?highlight=${highlightDate}`,
        })
      )
    );
    toast.success(`${finalSlots.length}개 근무를 저장했어요`);
    setCopyPreview(null);
    mutate();
  };

  // ─── 레이어 토글 ───
  const toggleLayer = (key: keyof typeof layers) => {
    setLayers((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("admin_calendar_layers", JSON.stringify(next));
      return next;
    });
  };

  // ─── Month View ───────────────────────────────────────────────────────────
  const renderMonthView = () => {
    const monthStart = startOfMonth(baseDate);
    const monthEnd = endOfMonth(baseDate);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    const calDays = eachDayOfInterval({ start: calStart, end: calEnd });

    return (
      <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm overflow-hidden">
        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 bg-[#F9FAFB] border-b border-slate-100">
          {DAY_LABELS.map((d, i) => (
            <div
              key={d}
              className={`py-2 text-center text-[12px] font-bold ${
                i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-[#8B95A1]"
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* 날짜 셀 */}
        <div className="grid grid-cols-7" style={{ gridAutoRows: "84px" }}>
          {calDays.map((day, idx) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const isCurrentMonth = isSameMonth(day, baseDate);
            const isTodayDate = isToday(day);
            const isDayPast = isBefore(day, startOfDay(new Date()));
            const daySlots = layers.schedule
              ? slots.filter((s) => s.slot_date === dateStr && s.status === "active")
              : [];
            const dayEvents = layers.events
              ? events.filter((e) => e.start_date <= dateStr && e.end_date >= dateStr)
              : [];
            const dayAtt = layers.attendance
              ? attendance.filter((a) => a.date === dateStr)
              : [];

            // 과거/오늘: 실제 근태 집계 (슬롯+스케줄외 출근 모두 포함)
            const slotProfileIds = new Set(daySlots.map((s) => s.profile_id));
            const unscheduledPresent = dayAtt.filter((a) => !a.is_absent && a.clock_in && !slotProfileIds.has(a.profile_id));
            const presentCount = dayAtt.filter((a) => !a.is_absent && slotProfileIds.has(a.profile_id)).length + unscheduledPresent.length;
            const lateCount = dayAtt.filter((a) => !a.is_absent && (a.late_minutes ?? 0) > 0).length;
            const absentCount = isDayPast
              ? dayAtt.filter((a) => a.is_absent).length
              : 0;
            // 미래: 예정 인원 수
            const scheduledCount = daySlots.length;

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDay(dateStr)}
                className={`overflow-hidden p-1.5 border-b border-r border-slate-100 text-left transition-colors hover:bg-[#F9FAFB] ${
                  idx % 7 === 6 ? "border-r-0" : ""
                } ${!isCurrentMonth ? "bg-[#FAFAFA]" : ""}`}
              >
                {/* 날짜 숫자 */}
                <div className="mb-0.5">
                  <span
                    className={`text-[12px] font-bold w-6 h-6 inline-flex items-center justify-center rounded-full ${
                      isTodayDate
                        ? "bg-[#3182F6] text-white"
                        : idx % 7 === 0
                        ? "text-red-400"
                        : idx % 7 === 6
                        ? "text-blue-400"
                        : isCurrentMonth
                        ? "text-[#191F28]"
                        : "text-[#D1D6DB]"
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                </div>

                {/* 회사 일정 — 항상 고정 높이로 레이아웃 안정화 */}
                <div className="h-[18px] overflow-hidden mb-0.5">
                  {dayEvents.slice(0, 1).map((ev) => (
                    <div
                      key={ev.id}
                      className="text-[10px] font-bold px-1 py-0.5 rounded truncate"
                      style={{ backgroundColor: ev.color + "22", color: ev.color }}
                    >
                      {ev.title}
                    </div>
                  ))}
                </div>

                {/* 근태 요약 */}
                {layers.attendance && (
                  <div className="flex flex-col gap-0.5 mt-0.5">
                    {(isDayPast || isTodayDate) ? (
                      <>
                        {presentCount > 0 && <span className="text-[9px] font-bold text-[#00B761]">정상 {presentCount}</span>}
                        {lateCount > 0 && <span className="text-[9px] font-bold text-orange-500">지각 {lateCount}</span>}
                        {absentCount > 0 && <span className="text-[9px] font-bold text-red-500">결근 {absentCount}</span>}
                        {presentCount === 0 && absentCount === 0 && scheduledCount > 0 && (
                          <span className="text-[9px] text-[#8B95A1]">예정 {scheduledCount}</span>
                        )}
                      </>
                    ) : (
                      scheduledCount > 0 && (
                        <span className="text-[9px] text-[#8B95A1]">예정 {scheduledCount}</span>
                      )
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── Week View ────────────────────────────────────────────────────────────
  const renderWeekView = () => {
    if (profiles.length === 0) {
      return (
        <div className="bg-white rounded-[24px] border border-slate-100 p-12 text-center text-[#8B95A1]">
          직원이 없어요
        </div>
      );
    }

    return (
      <div ref={weekScrollRef} className="overflow-x-auto rounded-[20px] border border-slate-100 bg-white shadow-sm">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="bg-[#F9FAFB] border-b border-slate-100">
              <th className="w-[100px] px-4 py-3 text-left text-[12px] font-bold text-[#8B95A1] sticky left-0 z-20 bg-[#F9FAFB] border-r border-slate-100">
                직원
              </th>
              {weekDates.map((d, i) => {
                const ws = weeklySchedules.find(
                  (w) => w.week_start === format(startOfWeek(parseISO(d), { weekStartsOn: 0 }), "yyyy-MM-dd")
                );
                const isConfirmed = ws?.status === "confirmed";
                const isTodayDate = isToday(parseISO(d));
                return (
                  <th
                    key={d}
                    {...(isTodayDate ? { "data-today-col": true } : {})}
                    onClick={() => setSelectedDay(d)}
                    className={`px-2 py-3 text-center text-[12px] font-bold cursor-pointer hover:bg-[#F9FAFB] transition-colors ${
                      isTodayDate ? "bg-[#E8F3FF] hover:bg-[#DCE9FF]" : ""
                    }`}
                  >
                    <div
                      className={`flex items-center justify-center gap-1 ${
                        i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-[#8B95A1]"
                      }`}
                    >
                      {format(parseISO(d), "EEE", { locale: ko })}
                      {isConfirmed && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00B761]" />
                      )}
                    </div>
                    <div className="text-[11px] font-normal text-[#8B95A1]">{d.slice(5)}</div>

                    {/* 당일 회사 일정 — 항상 고정 높이로 레이아웃 안정화 */}
                    <div className="mt-1 h-[18px] overflow-hidden mx-1">
                      {layers.events && (() => {
                        const dayEvents = events.filter(
                          (e) => e.start_date <= d && e.end_date >= d
                        );
                        return dayEvents.slice(0, 1).map((ev) => (
                          <div
                            key={ev.id}
                            className="text-[9px] font-bold px-1 py-0.5 rounded truncate"
                            style={{ backgroundColor: ev.color + "22", color: ev.color }}
                          >
                            {ev.title}
                          </div>
                        ));
                      })()}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => (
              <tr key={profile.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3 sticky left-0 z-10 bg-white border-r border-slate-50">
                  <button
                    onClick={() => setViewProfileId(profile.id)}
                    className="flex items-center gap-2 hover:opacity-70 transition-opacity active:scale-[0.97]"
                  >
                    <AvatarDisplay userId={profile.id} avatarConfig={profile.avatar_config} size={28} />
                    <span className="text-[13px] font-bold text-[#191F28] truncate max-w-[60px]">
                      {profile.name}
                    </span>
                  </button>
                </td>

                {weekDates.map((d, i) => {
                  const daySlots = layers.schedule
                    ? slots.filter((s) => s.profile_id === profile.id && s.slot_date === d && s.status === "active")
                    : [];
                  const att = layers.attendance
                    ? attendance.find((a) => a.profile_id === profile.id && a.date === d)
                    : null;
                  const isTodayDate = isToday(parseISO(d));
                  const isDayPast = isBefore(parseISO(d), startOfDay(new Date()));

                  return (
                    <td
                      key={d}
                      className={`px-1 py-1 align-top ${isTodayDate ? "bg-[#F5F9FF]" : ""}`}
                    >
                      <div className="flex flex-col items-stretch gap-1 min-h-[54px]">
                        {daySlots.map((slot) => {
                          const positions = slot.position_keys?.length
                            ? slot.position_keys
                                .map((k) => positionsOfStore(slot.store_id).find((p) => p.position_key === k)?.label || k)
                                .join("·")
                            : null;
                          const isSubstituted = slot.status === "substituted";
                          const slotAtt = att;

                          // 이슈 #1: 슬롯 시작시간 기준으로 "지난 출근시간" 판단
                          const slotStartDt = new Date(`${d}T${slot.start_time}`);
                          const now = new Date();
                          const isPastScheduledStart = isDayPast || (isTodayDate && now >= slotStartDt);

                          let borderColor = "";
                          if (slotAtt && isPastScheduledStart) {
                            if (slotAtt.is_absent) borderColor = "#EF4444";
                            else if (slotAtt.late_minutes && slotAtt.late_minutes > 0) borderColor = "#F97316";
                            else borderColor = "#00B761";
                          }

                          const storeColor = byId[slot.store_id]?.color || "#8B95A1";
                          const activeBorderColor = borderColor || storeColor;

                          return (
                            <button
                              key={slot.id}
                              onClick={() => setInfoSlot(slot)}
                              className={`w-full text-left px-1.5 py-1 rounded-lg transition-all ${
                                isSubstituted ? "text-[#8B95A1] line-through" : "text-[#191F28]"
                              } hover:opacity-80 active:scale-[0.97] cursor-pointer`}
                              style={{
                                backgroundColor: isSubstituted ? "#F2F4F6" : storeColor + "18",
                                borderLeft: `3px solid ${isSubstituted ? "#D1D6DB" : activeBorderColor}`,
                              }}
                            >
                              <div
                                className="text-[11px] font-bold truncate leading-tight"
                                style={{ color: isSubstituted ? "#8B95A1" : storeColor }}
                              >
                                {byId[slot.store_id]?.label || "—"}
                                {positions && (
                                  <span className="text-[#8B95A1] ml-0.5 font-normal">·{positions}</span>
                                )}
                              </div>
                              <div className="text-[10px] text-[#4E5968] mt-0.5 leading-tight">
                                {slot.start_time.slice(0, 5)}~{slot.end_time.slice(0, 5)}
                              </div>
                              {/* 이슈 #2: 항상 고정 높이 div로 감싸 슬롯 높이 통일 */}
                              <div className="h-[12px] leading-none mt-0.5">
                                {slotAtt && slotAtt.clock_in && !slotAtt.is_absent ? (
                                  <span className="text-[9px] text-[#6B7684]">✓ {format(new Date(slotAtt.clock_in), "HH:mm")}</span>
                                ) : slotAtt && slotAtt.is_absent && isDayPast ? (
                                  <span className="text-[9px] text-[#EF4444]">✗ 결근</span>
                                ) : slotAtt && slotAtt.is_absent && isTodayDate && isPastScheduledStart ? (
                                  <span className="text-[9px] text-[#EF4444]">✗ 미출근</span>
                                ) : null}
                              </div>
                            </button>
                          );
                        })}

                        {/* 출근 기록은 있는데 스케줄 없는 경우 */}
                        {layers.attendance && daySlots.length === 0 && att && !att.is_absent && att.clock_in && (
                          <div className="flex-1 flex items-center justify-center">
                            <span className="text-[10px] text-green-500 font-bold px-1.5 py-1 bg-green-50 rounded-lg">
                              ✓ {format(new Date(att.clock_in), "HH:mm")}
                            </span>
                          </div>
                        )}

                        {/* 빈 셀: 클릭 시 근무 추가 */}
                        {daySlots.length === 0 && (
                          <button
                            onClick={() =>
                              setEditingSlot({ slot: null, defaultDate: d, defaultProfileId: profile.id })
                            }
                            className="flex-1 min-h-[40px] flex items-center justify-center rounded-lg text-[#D1D6DB] hover:text-[#3182F6] hover:bg-[#E8F3FF] transition-all"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  const navigate = (dir: -1 | 1) => {
    if (viewType === "month") {
      setBaseDate((d) => (dir === 1 ? addMonths(d, 1) : subMonths(d, 1)));
    } else {
      setBaseDate((d) => (dir === 1 ? addWeeks(d, 1) : subWeeks(d, 1)));
    }
  };

  const selectedDayData = selectedDay
    ? {
        slots: slots.filter((s) => s.slot_date === selectedDay && s.status === "active"),
        attendance: attendance.filter((a) => a.date === selectedDay),
        events: events.filter((e) => e.start_date <= selectedDay && e.end_date >= selectedDay),
      }
    : null;

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-[#191F28]">통합 캘린더</h1>
          <p className="text-[13px] text-[#8B95A1] mt-0.5">
            스케줄 · 근태 · 회사일정을 한 곳에서 관리해요
          </p>
        </div>
        <Link
          href="/admin/calendar/events"
          className="px-3 py-2 text-[13px] font-medium text-[#4E5968] bg-white border border-slate-200 rounded-xl hover:bg-[#F2F4F6] transition-all"
        >
          회사 일정 관리
        </Link>
      </div>

      {/* 컨트롤 바 */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* 뷰 전환 */}
        <div className="flex bg-[#F2F4F6] p-1 rounded-xl">
          <button
            onClick={() => setViewType("week")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-bold transition-all ${
              viewType === "week" ? "bg-white text-[#191F28] shadow-sm" : "text-[#8B95A1]"
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            주간
          </button>
          <button
            onClick={() => setViewType("month")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-bold transition-all ${
              viewType === "month" ? "bg-white text-[#191F28] shadow-sm" : "text-[#8B95A1]"
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            월간
          </button>
        </div>

        {/* 오늘 버튼 */}
        {(() => {
          const today = new Date();
          const isCurrentRange = viewType === "month"
            ? isSameMonth(baseDate, today)
            : startDate <= today && today <= endDate;
          return (
            <button
              onClick={() => {
                setBaseDate(new Date());
                setTimeout(scrollToToday, 150);
              }}
              disabled={isCurrentRange}
              className={`px-3 py-1.5 text-[13px] font-bold rounded-xl border transition-all ${
                isCurrentRange
                  ? "bg-[#F2F4F6] text-[#B0B8C1] border-transparent cursor-default"
                  : "bg-white text-[#3182F6] border-[#3182F6] hover:bg-[#E8F3FF]"
              }`}
            >
              오늘
            </button>
          );
        })()}

        {/* 근무지 필터 */}
        <select
          value={storeFilter}
          onChange={(e) => setStoreFilter(e.target.value)}
          className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-[13px] text-[#4E5968] font-medium focus:outline-none focus:border-[#3182F6]"
        >
          <option value="all">전체 근무지</option>
          {workplaces.map((w) => (
            <option key={w.id} value={w.id}>{w.label}</option>
          ))}
        </select>

        {/* 어드민 포함 토글 */}
        <button
          onClick={() => setShowAdmin((v) => {
            const next = !v;
            localStorage.setItem("calendar_showAdmin", String(next));
            return next;
          })}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold border transition-all ${
            showAdmin ? "bg-[#191F28] text-white border-[#191F28]" : "bg-white text-[#8B95A1] border-slate-200"
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          어드민 포함
        </button>

        {/* 레이어 토글 */}
        <div className="flex items-center gap-2 ml-auto">
          <Layers className="w-4 h-4 text-[#8B95A1]" />
          {[
            { key: "schedule" as const, label: "스케줄" },
            { key: "attendance" as const, label: "근태" },
            { key: "events" as const, label: "회사일정" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleLayer(key)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-bold border transition-all ${
                layers[key]
                  ? "bg-[#191F28] text-white border-[#191F28]"
                  : "bg-white text-[#8B95A1] border-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 네비게이션 */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F2F4F6] transition-all"
        >
          <ChevronLeft className="w-5 h-5 text-[#4E5968]" />
        </button>
        <h2 className="text-[16px] font-bold text-[#191F28]">
          {viewType === "month"
            ? baseDate.getFullYear() === new Date().getFullYear()
              ? format(baseDate, "M월", { locale: ko })
              : format(baseDate, "yyyy년 M월", { locale: ko })
            : (() => {
                const isCurrentYear = startDate.getFullYear() === new Date().getFullYear();
                const weekNum = getWeekOfMonth(startDate, { weekStartsOn: 0 });
                return isCurrentYear
                  ? `${format(startDate, "M월")} ${weekNum}주차`
                  : `${format(startDate, "yyyy년 M월")} ${weekNum}주차`;
              })()}
        </h2>
        <button
          onClick={() => navigate(1)}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F2F4F6] transition-all"
        >
          <ChevronRight className="w-5 h-5 text-[#4E5968]" />
        </button>
        {/* 주간 뷰 전주 복사 */}
        {viewType === "week" && (
          <button
            onClick={handleCopyPrevWeek}
            className="ml-auto px-3 py-1.5 text-[12px] font-bold text-[#4E5968] bg-white border border-slate-200 rounded-xl hover:bg-[#F2F4F6] transition-all"
          >
            전주 복사
          </button>
        )}
      </div>

      {/* 캘린더 */}
      {isLoading ? (
        <div className="bg-white rounded-[20px] border border-slate-100 p-20 text-center">
          <div className="cat-spinner mx-auto" />
        </div>
      ) : viewType === "month" ? (
        renderMonthView()
      ) : (
        renderWeekView()
      )}

      {/* 범례 */}
      {layers.attendance && (
        <div className="flex items-center gap-4 text-[11px] text-[#8B95A1] font-medium px-1">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#00B761]" />정상</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400" />지각</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" />결근</span>
          {weeklySchedules.some((w) => w.status === "confirmed") && (
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#00B761]" />확정된 주</span>
          )}
        </div>
      )}

      {/* 슬롯 편집 바텀시트 */}
      {editingSlot !== null && (
        <SlotBottomSheet
          slot={editingSlot.slot}
          profiles={profiles}
          onClose={() => setEditingSlot(null)}
          onSave={handleSaveSlot}
          onDelete={editingSlot.slot?.id ? handleDeleteSlot : undefined}
          defaultDate={editingSlot.defaultDate}
          defaultProfileId={editingSlot.defaultProfileId}
        />
      )}

      {/* 슬롯 정보 시트 (슬롯 클릭 → 정보 + 수정/삭제) */}
      {infoSlot && !editingSlot && (
        <SlotInfoSheet
          slot={infoSlot}
          profile={profiles.find((p) => p.id === infoSlot.profile_id)}
          attendance={attendance.find((a) => a.profile_id === infoSlot.profile_id && a.date === infoSlot.slot_date)}
          onClose={() => setInfoSlot(null)}
          onEdit={() => {
            setEditingSlot({ slot: infoSlot, defaultDate: infoSlot.slot_date, defaultProfileId: infoSlot.profile_id });
          }}
          onDelete={() => handleDeleteSlot(infoSlot.id)}
          onMutate={mutate}
        />
      )}

      {/* 직원 프로필 모달 (주간뷰 직원 셀 클릭) */}
      {viewProfileId && (
        <EmployeeProfileModal
          profileId={viewProfileId}
          onClose={() => setViewProfileId(null)}
        />
      )}

      {/* 전주 복사 미리보기 */}
      {copyPreview && (
        <CopyPreviewModal
          initialSlots={copyPreview.slots}
          profiles={profiles}
          onClose={() => setCopyPreview(null)}
          onSave={handleCopyPreviewSave}
        />
      )}

      {/* 날짜 상세 시트 (날짜 헤더 클릭 — 전체 직원) */}
      {selectedDay && selectedDayData && (
        <DaySheet
          dateStr={selectedDay}
          slots={selectedDayData.slots}
          attendance={selectedDayData.attendance}
          events={selectedDayData.events}
          profiles={profiles}
          onClose={() => setSelectedDay(null)}
          onEditSlot={(slot) => {
            setSelectedDay(null);
            setEditingSlot({ slot, defaultDate: slot.slot_date, defaultProfileId: slot.profile_id });
          }}
          onAddSlot={(date) => setEditingSlot({ slot: null, defaultDate: date })}
          onMutate={mutate}
        />
      )}
    </div>
  );
}
