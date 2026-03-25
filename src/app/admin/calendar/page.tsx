"use client";

import { useState, useRef, useMemo } from "react";
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
  Save,
  Eye,
  Layers,
  CalendarDays,
  LayoutGrid,
  AlertTriangle,
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
  onDelete?: (id: string) => Promise<void>;
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
              onDelete(slot!.id!).finally(() => setDeleting(false));
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

// ─── DaySheet (날짜 상세 바텀시트) ───────────────────────────────────────────
interface DaySheetProps {
  dateStr: string;
  slots: ScheduleSlot[];
  attendance: AttendanceEntry[];
  events: CompanyEvent[];
  profiles: Profile[];
  mode: "view" | "edit";
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
  mode,
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
          {att.attendance_type_out === "remote_out" && <span className="text-[10px] font-bold bg-[#FFE3E3] text-[#C92A2A] px-1.5 py-0.5 rounded-md">원격퇴근</span>}
          {att.attendance_type_out === "business_trip_out" && <span className="text-[10px] font-bold bg-[#FFF3BF] text-[#E67700] px-1.5 py-0.5 rounded-md">출장퇴근</span>}
          {att.attendance_type_out === "fallback_out" && <span className="text-[10px] font-bold bg-[#F3F0FF] text-[#7950F2] px-1.5 py-0.5 rounded-md">수동퇴근</span>}
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
            if (mode === "edit") {
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
            }
            return renderAttCard(att, slot) ?? (
              <div key={slot.id} className="bg-white p-4 border border-slate-100 rounded-[18px] flex items-center justify-between">
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

        {mode === "edit" && (
          <button
            onClick={() => { onAddSlot(dateStr); onClose(); }}
            className="w-full mt-4 py-3 border-2 border-dashed border-[#E5E8EB] rounded-2xl text-[14px] font-medium text-[#8B95A1] hover:border-[#3182F6] hover:text-[#3182F6] transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            근무 추가하기
          </button>
        )}
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
  const [mode, setMode] = useState<"view" | "edit">("view");
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
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlotInfo, setSelectedSlotInfo] = useState<{ profileId: string; dateStr: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAdmin, setShowAdmin] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("calendar_showAdmin") === "true";
    }
    return false;
  });
  const [viewProfileId, setViewProfileId] = useState<string | null>(null);

  // 수정 세션 동안 변경된 weekly_schedule IDs 추적
  const editSessionRef = useRef<Set<string>>(new Set());

  const { workplaces, byId, positionsOfStore } = useWorkplaces();

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
  const slots = data?.slots ?? [];
  const attendance = data?.attendance ?? [];
  const events = data?.events ?? [];
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
      .insert({ week_start: weekStart, status: "draft" })
      .select("id")
      .single();
    if (error) {
      logError({ message: "weekly_schedule 생성 실패", error, source: "admin/calendar" });
      return null;
    }
    return created.id;
  };

  // ─── 수정 모드 진입 ───
  const handleEnterEdit = () => {
    editSessionRef.current = new Set();
    setMode("edit");
  };

  // ─── 저장하기 (확정 + 알림) ───
  const handleSave = async () => {
    const modifiedIds = Array.from(editSessionRef.current);
    if (modifiedIds.length === 0) {
      setMode("view");
      toast.success("변경 없이 조회 모드로 돌아왔어요");
      return;
    }

    setSaving(true);
    const supabase = createClient();

    try {
      // 1. 수정된 주차 확정
      await supabase
        .from("weekly_schedules")
        .update({ status: "confirmed", published_at: new Date().toISOString() })
        .in("id", modifiedIds);

      // 2. 영향받는 직원 조회
      const { data: affectedSlots } = await supabase
        .from("schedule_slots")
        .select("profile_id")
        .in("weekly_schedule_id", modifiedIds)
        .eq("status", "active");

      const uniqueProfileIds = [...new Set((affectedSlots || []).map((s: any) => s.profile_id))];

      // 3. 각 직원에게 알림
      if (uniqueProfileIds.length > 0) {
        const notifications = uniqueProfileIds.map((profileId) => ({
          profile_id: profileId,
          target_role: "employee",
          type: "schedule_updated",
          title: "스케줄이 업데이트됐어요",
          content: "새로운 근무 스케줄이 등록됐어요. 캘린더에서 확인해보세요.",
        }));
        await supabase.from("notifications").insert(notifications);
        toast.success(`${uniqueProfileIds.length}명에게 스케줄 알림을 보냈어요`);
      } else {
        toast.success("스케줄을 저장했어요");
      }
    } catch (err) {
      logError({ message: "스케줄 저장 실패", error: err, source: "admin/calendar/handleSave" });
      toast.error("저장에 실패했어요", { description: "잠시 후 다시 시도해주세요." });
    }

    setSaving(false);
    setMode("view");
    mutate();
  };

  // ─── 취소 ───
  const handleCancel = () => {
    setMode("view");
    mutate();
  };

  // ─── 슬롯 저장 ───
  const handleSaveSlot = async (formData: Partial<ScheduleSlot>, isNew: boolean) => {
    const supabase = createClient();

    if (!formData.slot_date) return;

    const startMin = timeToMinutes(formData.start_time!);
    const endMin = timeToMinutes(formData.end_time!);
    if (startMin >= endMin) {
      toast.error("시작 시간이 종료 시간보다 늦어요");
      return;
    }

    // 중복 검사
    const { data: sameDay } = await supabase
      .from("schedule_slots")
      .select("id, start_time, end_time")
      .eq("profile_id", formData.profile_id!)
      .eq("slot_date", formData.slot_date)
      .eq("status", "active")
      .neq("id", formData.id ?? "00000000-0000-0000-0000-000000000000");

    if (isNew && (sameDay || []).length > 0) {
      toast.error("이미 해당 날짜에 근무가 있어요");
      return;
    }

    const wsId = await getOrCreateWeeklySchedule(formData.slot_date);
    if (!wsId) return;

    if (isNew) {
      const { error } = await supabase.from("schedule_slots").insert({
        weekly_schedule_id: wsId,
        profile_id: formData.profile_id,
        slot_date: formData.slot_date,
        start_time: formData.start_time,
        end_time: formData.end_time,
        store_id: formData.store_id,
        position_keys: formData.position_keys || [],
        notes: formData.notes || null,
        status: "active",
      });
      if (error) {
        logError({ message: "슬롯 추가 실패", error, source: "admin/calendar" });
        toast.error("추가에 실패했어요", { description: error.message });
        return;
      }
      toast.success("근무를 추가했어요");
    } else {
      const { error } = await supabase
        .from("schedule_slots")
        .update({
          profile_id: formData.profile_id,
          slot_date: formData.slot_date,
          start_time: formData.start_time,
          end_time: formData.end_time,
          store_id: formData.store_id,
          position_keys: formData.position_keys || [],
          notes: formData.notes || null,
        })
        .eq("id", formData.id!);
      if (error) {
        logError({ message: "슬롯 수정 실패", error, source: "admin/calendar" });
        toast.error("수정에 실패했어요", { description: error.message });
        return;
      }
      toast.success("근무를 수정했어요");
    }

    editSessionRef.current.add(wsId);
    setEditingSlot(null);
    mutate();
  };

  // ─── 슬롯 삭제 ───
  const handleDeleteSlot = async (id: string) => {
    const supabase = createClient();
    const targetSlot = slots.find((s) => s.id === id);
    const { error } = await supabase
      .from("schedule_slots")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) {
      toast.error("삭제에 실패했어요");
      return;
    }
    if (targetSlot) editSessionRef.current.add(targetSlot.weekly_schedule_id);
    toast.success("근무를 삭제했어요");
    setEditingSlot(null);
    mutate();
  };

  // ─── 주간 이전주 복사 ───
  const handleCopyPrevWeek = async () => {
    if (viewType !== "week") return;
    const supabase = createClient();
    const prevWeekStart = format(subWeeks(startDate, 1), "yyyy-MM-dd");
    const { data: prevWs } = await supabase
      .from("weekly_schedules")
      .select("id")
      .eq("week_start", prevWeekStart)
      .maybeSingle();
    if (!prevWs) { toast.error("이전 주 스케줄이 없어요"); return; }

    const { data: prevSlots } = await supabase
      .from("schedule_slots")
      .select("*")
      .eq("weekly_schedule_id", prevWs.id)
      .neq("status", "cancelled");

    if (!prevSlots || prevSlots.length === 0) { toast.error("이전 주 슬롯이 없어요"); return; }

    const weekStart = format(startDate, "yyyy-MM-dd");
    const wsId = await getOrCreateWeeklySchedule(weekDates[1] || weekDates[0]);
    if (!wsId) return;

    const prevWeekDates = Array.from({ length: 7 }, (_, i) =>
      format(addDays(parseISO(prevWeekStart), i), "yyyy-MM-dd")
    );

    const { data: existingSlots } = await supabase
      .from("schedule_slots")
      .select("profile_id, slot_date")
      .eq("weekly_schedule_id", wsId)
      .neq("status", "cancelled");
    const existingSet = new Set(
      (existingSlots || []).map((s: any) => `${s.profile_id}_${s.slot_date}`)
    );

    const newSlots = prevSlots
      .map((s: any) => {
        const idx = prevWeekDates.indexOf(s.slot_date);
        if (idx === -1) return null;
        const targetDate = weekDates[idx];
        if (existingSet.has(`${s.profile_id}_${targetDate}`)) return null;
        return {
          weekly_schedule_id: wsId,
          profile_id: s.profile_id,
          slot_date: targetDate,
          start_time: s.start_time,
          end_time: s.end_time,
          store_id: s.store_id,
          position_keys: s.position_keys,
          notes: s.notes,
          status: "active",
        };
      })
      .filter(Boolean);

    if (newSlots.length === 0) { toast.error("복사할 슬롯이 없어요"); return; }

    const { error } = await supabase.from("schedule_slots").insert(newSlots);
    if (error) { toast.error("복사에 실패했어요"); return; }
    editSessionRef.current.add(wsId);
    toast.success(`${newSlots.length}개 근무를 복사했어요`);
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
      <div className="overflow-x-auto rounded-[20px] border border-slate-100 bg-white shadow-sm">
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
                              onClick={() =>
                                mode === "edit"
                                  ? setEditingSlot({ slot, defaultDate: d, defaultProfileId: profile.id })
                                  : setSelectedSlotInfo({ profileId: profile.id, dateStr: d })
                              }
                              className={`w-full text-left px-1.5 py-1 rounded-lg transition-all ${
                                isSubstituted ? "text-[#8B95A1] line-through" : "text-[#191F28]"
                              } ${mode === "edit" ? "hover:opacity-80 active:scale-[0.97]" : "hover:opacity-80 active:scale-[0.97] cursor-pointer"}`}
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

                        {/* 수정 모드: 빈 셀 + 버튼 */}
                        {mode === "edit" && daySlots.length === 0 && (
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
        <div className="flex items-center gap-2">
          <Link
            href="/admin/calendar/events"
            className="px-3 py-2 text-[13px] font-medium text-[#4E5968] bg-white border border-slate-200 rounded-xl hover:bg-[#F2F4F6] transition-all"
          >
            회사 일정 관리
          </Link>
          {mode === "view" ? (
            <button
              onClick={handleEnterEdit}
              className="flex items-center gap-2 px-4 py-2 bg-[#3182F6] text-white text-[14px] font-bold rounded-xl hover:bg-blue-600 transition-all active:scale-[0.97]"
            >
              <Pencil className="w-4 h-4" />
              수정하기
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-[14px] font-bold text-[#4E5968] bg-white border border-slate-200 rounded-xl hover:bg-[#F2F4F6] transition-all"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-[#00B761] text-white text-[14px] font-bold rounded-xl hover:bg-green-600 transition-all active:scale-[0.97] disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? "저장 중..." : "저장하기"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 수정 모드 배너 */}
      {mode === "edit" && (
        <div className="flex items-center gap-2 px-4 py-3 bg-orange-50 border border-orange-200 rounded-2xl">
          <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
          <p className="text-[13px] text-orange-700 font-medium">
            수정 모드예요 — 저장하기를 누르면 변경된 스케줄이 확정되고 직원에게 알림이 가요
          </p>
        </div>
      )}

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
              onClick={() => setBaseDate(new Date())}
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
        {mode === "edit" && viewType === "week" && (
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
      {editingSlot !== null && mode === "edit" && (
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

      {/* 직원 프로필 모달 (주간뷰 직원 셀 클릭) */}
      {viewProfileId && (
        <EmployeeProfileModal
          profileId={viewProfileId}
          onClose={() => setViewProfileId(null)}
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
          mode={mode}
          onClose={() => setSelectedDay(null)}
          onEditSlot={(slot) => {
            setSelectedDay(null);
            setEditingSlot({ slot, defaultDate: slot.slot_date, defaultProfileId: slot.profile_id });
          }}
          onAddSlot={(date) => setEditingSlot({ slot: null, defaultDate: date })}
          onMutate={mutate}
        />
      )}

      {/* 슬롯 상세 시트 (슬롯 클릭 — 개인 1명) */}
      {selectedSlotInfo && !selectedDay && (
        <DaySheet
          dateStr={selectedSlotInfo.dateStr}
          slots={slots.filter((s) => s.slot_date === selectedSlotInfo.dateStr && s.status === "active")}
          attendance={attendance.filter((a) => a.date === selectedSlotInfo.dateStr)}
          events={[]}
          profiles={profiles}
          mode="view"
          onClose={() => setSelectedSlotInfo(null)}
          onEditSlot={() => {}}
          onAddSlot={() => {}}
          onMutate={mutate}
          filterProfileId={selectedSlotInfo.profileId}
        />
      )}
    </div>
  );
}
