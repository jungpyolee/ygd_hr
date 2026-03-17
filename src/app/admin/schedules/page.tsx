"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Check,
  Copy,
  ArrowRightLeft,
} from "lucide-react";
import { format, addWeeks, subWeeks, startOfWeek, addDays } from "date-fns";
import { ko } from "date-fns/locale";
import Link from "next/link";

// --------------- Types ---------------
interface Profile {
  id: string;
  name: string;
  color_hex: string;
}

interface ScheduleSlot {
  id: string;
  weekly_schedule_id: string;
  profile_id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  work_location: string;
  cafe_positions: string[];
  status: string;
  notes: string | null;
}

interface WeeklySchedule {
  id: string;
  week_start: string;
  status: string;
}

// --------------- Helpers ---------------
const LOCATION_COLORS: Record<string, string> = {
  cafe: "#3182F6",
  factory: "#00B761",
  catering: "#F59E0B",
};
const LOCATION_LABELS: Record<string, string> = {
  cafe: "카페",
  factory: "공장",
  catering: "케이터링",
};
const CAFE_POSITION_LABELS: Record<string, string> = {
  hall: "홀",
  kitchen: "주방",
  showroom: "쇼룸",
};
const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

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

function getWeekDates(weekStart: Date): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    format(addDays(weekStart, i), "yyyy-MM-dd")
  );
}

// --------------- SlotBottomSheet ---------------
interface SlotBottomSheetProps {
  slot: Partial<ScheduleSlot> | null;
  profiles: Profile[];
  weekDates: string[];
  onClose: () => void;
  onSave: (data: Partial<ScheduleSlot>, isNew: boolean) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  defaultDate?: string;
  defaultProfileId?: string;
}

function SlotBottomSheet({
  slot,
  profiles,
  weekDates,
  onClose,
  onSave,
  onDelete,
  defaultDate,
  defaultProfileId,
}: SlotBottomSheetProps) {
  const isNew = !slot?.id;
  const [form, setForm] = useState<Partial<ScheduleSlot>>({
    profile_id: defaultProfileId || profiles[0]?.id || "",
    slot_date: defaultDate || weekDates[0] || "",
    start_time: "09:00",
    end_time: "18:00",
    work_location: "cafe",
    cafe_positions: [],
    notes: "",
    ...slot,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    if (!form.profile_id || !form.slot_date || !form.start_time || !form.end_time || !form.work_location) {
      toast.error("모든 필드를 입력해주세요.");
      return;
    }
    setSaving(true);
    await onSave(form, isNew);
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!slot?.id || !onDelete) return;
    setDeleting(true);
    await onDelete(slot.id);
    setDeleting(false);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-t-[28px] px-5 pt-8 pb-10 shadow-2xl animate-in slide-in-from-bottom-4 duration-250 max-h-[85vh] overflow-y-auto scrollbar-hide">
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-9 h-1 bg-[#D1D6DB] rounded-full" />
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-[18px] font-bold text-[#191F28]">
            {isNew ? "근무 슬롯 추가" : "근무 슬롯 수정"}
          </h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F4F6]">
            <X className="w-5 h-5 text-[#8B95A1]" />
          </button>
        </div>

        <div className="space-y-4">
          {/* 직원 선택 */}
          <div>
            <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">직원</label>
            <select
              value={form.profile_id || ""}
              onChange={(e) => setForm((p) => ({ ...p, profile_id: e.target.value }))}
              className="w-full px-3 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6]"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* 날짜 선택 */}
          <div>
            <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">날짜</label>
            <select
              value={form.slot_date || ""}
              onChange={(e) => setForm((p) => ({ ...p, slot_date: e.target.value }))}
              className="w-full px-3 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6]"
            >
              {weekDates.map((d, i) => (
                <option key={d} value={d}>
                  {DAY_LABELS[i % 7]}요일 ({d})
                </option>
              ))}
            </select>
          </div>

          {/* 시간 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">시작 시간</label>
              <select
                value={form.start_time || "09:00"}
                onChange={(e) => setForm((p) => ({ ...p, start_time: e.target.value }))}
                className="w-full px-3 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6]"
              >
                {START_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">종료 시간</label>
              <select
                value={form.end_time || "18:00"}
                onChange={(e) => setForm((p) => ({ ...p, end_time: e.target.value }))}
                className="w-full px-3 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6]"
              >
                {END_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* 근무 장소 */}
          <div>
            <label className="block text-[12px] font-medium text-[#8B95A1] mb-2">근무 장소</label>
            <div className="flex gap-2">
              {(["cafe", "factory", "catering"] as const).map((loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, work_location: loc, cafe_positions: loc !== "cafe" ? [] : p.cafe_positions }))}
                  className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold transition-all ${form.work_location === loc ? "text-white" : "bg-[#F2F4F6] text-[#4E5968]"}`}
                  style={form.work_location === loc ? { backgroundColor: LOCATION_COLORS[loc] } : {}}
                >
                  {LOCATION_LABELS[loc]}
                </button>
              ))}
            </div>
          </div>

          {/* 카페 포지션 */}
          {form.work_location === "cafe" && (
            <div>
              <label className="block text-[12px] font-medium text-[#8B95A1] mb-2">카페 포지션</label>
              <div className="flex gap-2">
                {(["hall", "kitchen", "showroom"] as const).map((pos) => {
                  const sel = (form.cafe_positions || []).includes(pos);
                  return (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => {
                        const cur = form.cafe_positions || [];
                        setForm((p) => ({ ...p, cafe_positions: sel ? cur.filter((v) => v !== pos) : [...cur, pos] }));
                      }}
                      className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold transition-all ${sel ? "bg-[#E8F3FF] text-[#3182F6] border border-[#3182F6]" : "bg-[#F2F4F6] text-[#4E5968]"}`}
                    >
                      {CAFE_POSITION_LABELS[pos]}
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

        <div className="flex flex-col gap-2.5 mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-14 bg-[#3182F6] text-white rounded-2xl font-bold text-[16px] disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            {saving ? "저장 중..." : "저장하기"}
          </button>
          {!isNew && onDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="w-full h-14 bg-[#FFEBEB] text-[#E03131] rounded-2xl font-bold text-[16px] disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              {deleting ? "삭제 중..." : "이 슬롯 삭제하기"}
            </button>
          )}
          <button onClick={onClose} className="w-full h-14 bg-[#F2F4F6] text-[#4E5968] rounded-2xl font-bold text-[16px] active:scale-[0.98] transition-all">
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

// --------------- Main Page ---------------
export default function AdminSchedulesPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<"weekly" | "daily">("weekly");
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [dailyDate, setDailyDate] = useState<Date>(new Date());
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklySchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [copying, setCopying] = useState(false);

  // Bottom sheet state
  const [editSlot, setEditSlot] = useState<{ slot: Partial<ScheduleSlot> | null; defaultDate?: string; defaultProfileId?: string } | null>(null);

  const weekDates = getWeekDates(weekStart);
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekEndStr = weekDates[6];

  const fetchAll = useCallback(async () => {
    setLoading(true);
    // Profiles
    const { data: pData } = await supabase.from("profiles").select("id, name, color_hex").order("name");
    if (pData) setProfiles(pData);

    // Weekly schedule
    const { data: wsData } = await supabase
      .from("weekly_schedules")
      .select("*")
      .eq("week_start", weekStartStr)
      .maybeSingle();
    setWeeklySchedule(wsData);

    // Slots for this week
    if (wsData) {
      const { data: slotData } = await supabase
        .from("schedule_slots")
        .select("*")
        .eq("weekly_schedule_id", wsData.id)
        .neq("status", "cancelled");
      if (slotData) setSlots(slotData as ScheduleSlot[]);
    } else {
      setSlots([]);
    }
    setLoading(false);
  }, [weekStartStr]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Get or create weekly schedule
  const getOrCreateWeeklySchedule = async (): Promise<string | null> => {
    if (weeklySchedule) return weeklySchedule.id;
    const { data: existing } = await supabase
      .from("weekly_schedules")
      .select("id")
      .eq("week_start", weekStartStr)
      .maybeSingle();
    if (existing) return existing.id;

    const { data: created, error } = await supabase
      .from("weekly_schedules")
      .insert({ week_start: weekStartStr, status: "draft" })
      .select("id")
      .single();
    if (error) { toast.error("주차 생성에 실패했어요", { description: error.message }); return null; }
    return created.id;
  };

  const handleSaveSlot = async (data: Partial<ScheduleSlot>, isNew: boolean) => {
    const wsId = await getOrCreateWeeklySchedule();
    if (!wsId) return;

    if (isNew) {
      const { error } = await supabase.from("schedule_slots").insert({
        weekly_schedule_id: wsId,
        profile_id: data.profile_id,
        slot_date: data.slot_date,
        start_time: data.start_time,
        end_time: data.end_time,
        work_location: data.work_location,
        cafe_positions: data.cafe_positions || [],
        notes: data.notes || null,
        status: "active",
      });
      if (error) { toast.error("추가에 실패했어요", { description: error.message }); return; }
      toast.success("근무 슬롯을 추가했어요");
    } else {
      const { error } = await supabase.from("schedule_slots").update({
        profile_id: data.profile_id,
        slot_date: data.slot_date,
        start_time: data.start_time,
        end_time: data.end_time,
        work_location: data.work_location,
        cafe_positions: data.cafe_positions || [],
        notes: data.notes || null,
      }).eq("id", data.id!);
      if (error) { toast.error("수정에 실패했어요", { description: error.message }); return; }
      toast.success("근무 슬롯을 수정했어요");
    }
    setEditSlot(null);
    fetchAll();
  };

  const handleDeleteSlot = async (id: string) => {
    const { error } = await supabase.from("schedule_slots").update({ status: "cancelled" }).eq("id", id);
    if (error) { toast.error("삭제에 실패했어요"); return; }
    toast.success("슬롯을 삭제했어요");
    setEditSlot(null);
    fetchAll();
  };

  const handleCopyPrevWeek = async () => {
    setCopying(true);
    const prevWeekStart = format(subWeeks(weekStart, 1), "yyyy-MM-dd");
    const { data: prevWs } = await supabase
      .from("weekly_schedules")
      .select("id")
      .eq("week_start", prevWeekStart)
      .maybeSingle();

    if (!prevWs) { toast.error("이전 주 스케줄이 없어요"); setCopying(false); return; }

    const { data: prevSlots } = await supabase
      .from("schedule_slots")
      .select("*")
      .eq("weekly_schedule_id", prevWs.id)
      .neq("status", "cancelled");

    if (!prevSlots || prevSlots.length === 0) { toast.error("이전 주 슬롯이 없어요"); setCopying(false); return; }

    const wsId = await getOrCreateWeeklySchedule();
    if (!wsId) { setCopying(false); return; }

    // Map previous week dates to current week dates
    const prevWeekDates = getWeekDates(subWeeks(weekStart, 1));
    const newSlots = prevSlots.map((s: ScheduleSlot) => {
      const dayIndex = prevWeekDates.indexOf(s.slot_date);
      const newDate = dayIndex >= 0 ? weekDates[dayIndex] : weekDates[0];
      return {
        weekly_schedule_id: wsId,
        profile_id: s.profile_id,
        slot_date: newDate,
        start_time: s.start_time,
        end_time: s.end_time,
        work_location: s.work_location,
        cafe_positions: s.cafe_positions,
        notes: s.notes,
        status: "active",
      };
    });

    const { error } = await supabase.from("schedule_slots").insert(newSlots);
    if (error) { toast.error("복사에 실패했어요", { description: error.message }); }
    else { toast.success(`${newSlots.length}개 슬롯을 복사했어요`); fetchAll(); }
    setCopying(false);
  };

  const handleConfirmSchedule = async () => {
    setConfirming(true);
    const wsId = await getOrCreateWeeklySchedule();
    if (!wsId) { setConfirming(false); return; }

    const { error } = await supabase
      .from("weekly_schedules")
      .update({ status: "confirmed", published_at: new Date().toISOString() })
      .eq("id", wsId);

    if (error) { toast.error("확정에 실패했어요", { description: error.message }); setConfirming(false); return; }

    // Send notifications to affected employees
    const affectedProfileIds = [...new Set(slots.map((s) => s.profile_id))];
    if (affectedProfileIds.length > 0) {
      const notifications = affectedProfileIds.map((pid) => ({
        profile_id: pid,
        target_role: "employee" as const,
        type: "schedule_published",
        title: "스케줄이 확정됐어요",
        content: `${format(weekStart, "M월 d일", { locale: ko })} 주차 스케줄이 확정됐어요. 확인해보세요.`,
        source_id: wsId,
      }));
      await supabase.from("notifications").insert(notifications);
    }

    toast.success("스케줄을 확정했어요");
    fetchAll();
    setConfirming(false);
  };

  // --------------- Weekly Grid View ---------------
  const renderWeeklyGrid = () => {
    if (profiles.length === 0) return (
      <div className="bg-white rounded-[24px] border border-slate-100 p-12 text-center text-[#8B95A1]">
        직원이 없어요
      </div>
    );

    return (
      <div className="overflow-x-auto rounded-[20px] border border-slate-100 bg-white shadow-sm">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="bg-[#F9FAFB] border-b border-slate-100">
              <th className="w-[100px] px-4 py-3 text-left text-[12px] font-bold text-[#8B95A1]">직원</th>
              {weekDates.map((d, i) => (
                <th key={d} className="px-2 py-3 text-center text-[12px] font-bold text-[#8B95A1]">
                  <div>{DAY_LABELS[i]}</div>
                  <div className="text-[11px] font-normal">{d.slice(5)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => (
              <tr key={profile.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0"
                      style={{ backgroundColor: profile.color_hex || "#8B95A1" }}
                    >
                      {profile.name.charAt(0)}
                    </div>
                    <span className="text-[13px] font-bold text-[#191F28] truncate max-w-[60px]">{profile.name}</span>
                  </div>
                </td>
                {weekDates.map((d) => {
                  const daySlots = slots.filter((s) => s.profile_id === profile.id && s.slot_date === d);
                  return (
                    <td key={d} className="px-1 py-2 align-top">
                      <div className="space-y-1">
                        {daySlots.map((slot) => (
                          <button
                            key={slot.id}
                            onClick={() => setEditSlot({ slot })}
                            className="w-full text-left px-2 py-1.5 rounded-lg text-white text-[11px] font-bold transition-all hover:opacity-80 active:scale-[0.97]"
                            style={{ backgroundColor: LOCATION_COLORS[slot.work_location] }}
                          >
                            <div>{LOCATION_LABELS[slot.work_location]}</div>
                            <div className="opacity-90">{slot.start_time.slice(0, 5)}~{slot.end_time.slice(0, 5)}</div>
                          </button>
                        ))}
                        <button
                          onClick={() => setEditSlot({ slot: null, defaultDate: d, defaultProfileId: profile.id })}
                          className="w-full flex items-center justify-center py-1 rounded-lg text-[#D1D6DB] hover:text-[#3182F6] hover:bg-[#E8F3FF] transition-all"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
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

  // --------------- Daily Timeline View ---------------
  const renderDailyView = () => {
    const dateStr = format(dailyDate, "yyyy-MM-dd");
    const hourStart = 7;
    const hourEnd = 22;
    const hours = Array.from({ length: hourEnd - hourStart + 1 }, (_, i) => hourStart + i);

    // Find weekly schedule containing this date
    const daySlots = slots.filter((s) => s.slot_date === dateStr);

    return (
      <div>
        {/* Date navigator */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <button
            onClick={() => setDailyDate((d) => { const nd = new Date(d); nd.setDate(nd.getDate() - 1); return nd; })}
            className="p-2 rounded-full hover:bg-[#F2F4F6] text-[#8B95A1]"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="font-bold text-[#191F28] text-[15px]">
            {format(dailyDate, "M월 d일 (EEE)", { locale: ko })}
          </span>
          <button
            onClick={() => setDailyDate((d) => { const nd = new Date(d); nd.setDate(nd.getDate() + 1); return nd; })}
            className="p-2 rounded-full hover:bg-[#F2F4F6] text-[#8B95A1]"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Time header */}
            <div className="flex">
              <div className="w-[80px] shrink-0" />
              {hours.map((h) => (
                <div key={h} className="flex-1 text-center text-[11px] font-bold text-[#8B95A1] border-l border-slate-100 py-1">
                  {h}시
                </div>
              ))}
            </div>

            {/* Employee rows */}
            {profiles.map((profile) => {
              const empSlots = daySlots.filter((s) => s.profile_id === profile.id);
              return (
                <div key={profile.id} className="flex items-center border-t border-slate-100 min-h-[52px] relative">
                  <div className="w-[80px] shrink-0 px-2 flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                      style={{ backgroundColor: profile.color_hex || "#8B95A1" }}
                    >
                      {profile.name.charAt(0)}
                    </div>
                    <span className="text-[12px] font-bold text-[#191F28] truncate">{profile.name}</span>
                  </div>
                  <div className="flex-1 relative h-[52px]">
                    {/* Background grid */}
                    <div className="absolute inset-0 flex">
                      {hours.map((h) => (
                        <div
                          key={h}
                          className="flex-1 border-l border-slate-50 cursor-pointer hover:bg-[#F9FAFB] transition-colors"
                          onClick={() => setEditSlot({
                            slot: null,
                            defaultDate: dateStr,
                            defaultProfileId: profile.id,
                          })}
                        />
                      ))}
                    </div>

                    {/* Slot bars */}
                    {empSlots.map((slot) => {
                      const totalHours = hourEnd - hourStart;
                      const startH = parseInt(slot.start_time.split(":")[0]) + parseInt(slot.start_time.split(":")[1]) / 60;
                      const endH = parseInt(slot.end_time.split(":")[0]) + parseInt(slot.end_time.split(":")[1]) / 60;
                      const leftPct = ((startH - hourStart) / totalHours) * 100;
                      const widthPct = ((endH - startH) / totalHours) * 100;
                      return (
                        <button
                          key={slot.id}
                          onClick={() => setEditSlot({ slot })}
                          className="absolute top-2 bottom-2 rounded-lg text-white text-[11px] font-bold px-2 flex items-center overflow-hidden hover:opacity-80 transition-all"
                          style={{
                            left: `${leftPct}%`,
                            width: `${widthPct}%`,
                            backgroundColor: LOCATION_COLORS[slot.work_location],
                          }}
                        >
                          <span className="truncate">
                            {slot.start_time.slice(0, 5)}~{slot.end_time.slice(0, 5)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Hourly headcount row */}
            <div className="flex border-t-2 border-slate-200 bg-[#F9FAFB]">
              <div className="w-[80px] shrink-0 px-2 py-2 text-[11px] font-bold text-[#8B95A1]">인원</div>
              {hours.map((h) => {
                const count = slots.filter((s) => {
                  if (s.slot_date !== dateStr) return false;
                  const start = parseInt(s.start_time.split(":")[0]);
                  const end = parseInt(s.end_time.split(":")[0]);
                  return h >= start && h < end;
                }).length;
                return (
                  <div key={h} className="flex-1 border-l border-slate-100 text-center py-2">
                    <span className={`text-[12px] font-bold ${count > 0 ? "text-[#3182F6]" : "text-[#D1D6DB]"}`}>
                      {count > 0 ? count : "-"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#191F28] mb-1">스케줄 관리</h1>
          <p className="text-[14px] text-[#8B95A1]">
            직원 근무 일정을 관리하고 확정해요.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/schedules/substitutes"
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-[#4E5968] rounded-xl text-[13px] font-bold hover:bg-[#F2F4F6] transition-all"
          >
            <ArrowRightLeft className="w-4 h-4" />
            대체근무 관리
          </Link>
          <button
            onClick={handleCopyPrevWeek}
            disabled={copying}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-[#4E5968] rounded-xl text-[13px] font-bold hover:bg-[#F2F4F6] transition-all disabled:opacity-50"
          >
            <Copy className="w-4 h-4" />
            {copying ? "복사 중..." : "이전 주 복사"}
          </button>
          <button
            onClick={handleConfirmSchedule}
            disabled={confirming || weeklySchedule?.status === "confirmed"}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all disabled:opacity-50 ${
              weeklySchedule?.status === "confirmed"
                ? "bg-[#E6FAF0] text-[#00B761] border border-[#00B761]"
                : "bg-[#3182F6] text-white hover:bg-[#1B64DA]"
            }`}
          >
            <Check className="w-4 h-4" />
            {weeklySchedule?.status === "confirmed" ? "확정됨" : confirming ? "확정 중..." : "스케줄 확정하기"}
          </button>
        </div>
      </div>

      {/* Week Navigator */}
      {tab === "weekly" && (
        <div className="flex items-center justify-center gap-2 mb-4">
          <button
            onClick={() => setWeekStart((w) => subWeeks(w, 1))}
            className="p-2 rounded-full hover:bg-[#F2F4F6] text-[#8B95A1]"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="font-bold text-[#191F28] text-[15px]">
            {format(weekStart, "yyyy년 M월 d일", { locale: ko })} ~{" "}
            {format(addDays(weekStart, 6), "M월 d일", { locale: ko })}
          </span>
          <button
            onClick={() => setWeekStart((w) => addWeeks(w, 1))}
            className="p-2 rounded-full hover:bg-[#F2F4F6] text-[#8B95A1]"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          {/* Status badge */}
          {weeklySchedule && (
            <span className={`ml-2 px-2 py-0.5 rounded-full text-[11px] font-bold ${
              weeklySchedule.status === "confirmed" ? "bg-[#E6FAF0] text-[#00B761]" : "bg-[#FFF3BF] text-[#E67700]"
            }`}>
              {weeklySchedule.status === "confirmed" ? "확정" : "초안"}
            </span>
          )}
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex bg-[#F2F4F6] p-1 rounded-xl w-fit mb-4">
        {(["weekly", "daily"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-[13px] font-bold transition-all ${tab === t ? "bg-white text-[#191F28] shadow-sm" : "text-[#8B95A1]"}`}
          >
            {t === "weekly" ? "주간" : "일간"}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="w-8 h-8 border-4 border-[#3182F6] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === "weekly" ? renderWeeklyGrid() : renderDailyView()}

      {/* Slot bottom sheet */}
      {editSlot !== null && (
        <SlotBottomSheet
          slot={editSlot.slot}
          profiles={profiles}
          weekDates={weekDates}
          defaultDate={editSlot.defaultDate}
          defaultProfileId={editSlot.defaultProfileId}
          onClose={() => setEditSlot(null)}
          onSave={handleSaveSlot}
          onDelete={editSlot.slot?.id ? handleDeleteSlot : undefined}
        />
      )}
    </div>
  );
}
