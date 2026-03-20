"use client";

import { useState } from "react";
import useSWR from "swr";
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
  LayoutTemplate,
} from "lucide-react";
import {
  format,
  addWeeks,
  subWeeks,
  startOfWeek,
  addDays,
  parseISO,
} from "date-fns";
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
  confirmed_dates: string[];
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

function getWeekDates(weekStart: Date): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    format(addDays(weekStart, i), "yyyy-MM-dd"),
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
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = async () => {
    if (
      !form.profile_id ||
      !form.slot_date ||
      !form.start_time ||
      !form.end_time ||
      !form.work_location
    ) {
      toast.error("모든 필드를 입력해주세요.");
      return;
    }
    // 시간 순서 검사
    if (timeToMinutes(form.start_time) >= timeToMinutes(form.end_time)) {
      toast.error("시작 시간이 종료 시간보다 늦어요", {
        description: "시간을 다시 확인해주세요.",
      });
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
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md bg-white rounded-t-[28px] px-5 pt-8 pb-10 shadow-2xl animate-in slide-in-from-bottom-4 duration-250 max-h-[85vh] overflow-y-auto scrollbar-hide">
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-9 h-1 bg-[#D1D6DB] rounded-full" />
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-[18px] font-bold text-[#191F28]">
            {isNew ? "근무 슬롯 추가" : "근무 슬롯 수정"}
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F4F6]"
          >
            <X className="w-5 h-5 text-[#8B95A1]" />
          </button>
        </div>

        <div className="space-y-4">
          {/* 직원 선택 */}
          <div>
            <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">
              직원
            </label>
            <select
              value={form.profile_id || ""}
              onChange={(e) =>
                setForm((p) => ({ ...p, profile_id: e.target.value }))
              }
              className="w-full px-3 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6]"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* 날짜 선택 */}
          <div>
            <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">
              날짜
            </label>
            <select
              value={form.slot_date || ""}
              onChange={(e) =>
                setForm((p) => ({ ...p, slot_date: e.target.value }))
              }
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
              <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">
                시작 시간
              </label>
              <select
                value={form.start_time || "09:00"}
                onChange={(e) =>
                  setForm((p) => ({ ...p, start_time: e.target.value }))
                }
                className="w-full px-3 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6]"
              >
                {START_TIMES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">
                종료 시간
              </label>
              <select
                value={form.end_time || "18:00"}
                onChange={(e) =>
                  setForm((p) => ({ ...p, end_time: e.target.value }))
                }
                className="w-full px-3 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6]"
              >
                {END_TIMES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 근무 장소 */}
          <div>
            <label className="block text-[12px] font-medium text-[#8B95A1] mb-2">
              근무 장소
            </label>
            <div className="flex gap-2">
              {(["cafe", "factory", "catering"] as const).map((loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() =>
                    setForm((p) => ({
                      ...p,
                      work_location: loc,
                      cafe_positions: loc !== "cafe" ? [] : p.cafe_positions,
                    }))
                  }
                  className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold transition-all ${form.work_location === loc ? "text-white" : "bg-[#F2F4F6] text-[#4E5968]"}`}
                  style={
                    form.work_location === loc
                      ? { backgroundColor: LOCATION_COLORS[loc] }
                      : {}
                  }
                >
                  {LOCATION_LABELS[loc]}
                </button>
              ))}
            </div>
          </div>

          {/* 카페 포지션 */}
          {form.work_location === "cafe" && (
            <div>
              <label className="block text-[12px] font-medium text-[#8B95A1] mb-2">
                카페 포지션
              </label>
              <div className="flex gap-2">
                {(["hall", "kitchen", "showroom"] as const).map((pos) => {
                  const sel = (form.cafe_positions || []).includes(pos);
                  return (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => {
                        const cur = form.cafe_positions || [];
                        setForm((p) => ({
                          ...p,
                          cafe_positions: sel
                            ? cur.filter((v) => v !== pos)
                            : [...cur, pos],
                        }));
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
            <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">
              메모 (선택)
            </label>
            <input
              type="text"
              value={form.notes || ""}
              onChange={(e) =>
                setForm((p) => ({ ...p, notes: e.target.value }))
              }
              placeholder="특이사항을 입력해요"
              maxLength={200}
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
            {saving ? "저장하는 중이에요" : "저장하기"}
          </button>
          {!isNew &&
            onDelete &&
            (confirmDelete ? (
              <div className="bg-[#FFF5F5] rounded-2xl p-4 space-y-3">
                <p className="text-[14px] font-bold text-[#E03131] text-center">
                  정말 삭제할까요?
                </p>
                <p className="text-[13px] text-[#8B95A1] text-center">
                  삭제하면 복구할 수 없어요.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 py-2.5 bg-white border border-slate-200 text-[#4E5968] rounded-xl text-[14px] font-bold"
                  >
                    취소하기
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 py-2.5 bg-[#E03131] text-white rounded-xl text-[14px] font-bold disabled:opacity-50"
                  >
                    {deleting ? "삭제하는 중이에요" : "삭제하기"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full h-14 bg-[#FFEBEB] text-[#E03131] rounded-2xl font-bold text-[16px] active:scale-[0.98] transition-all"
              >
                이 슬롯 삭제하기
              </button>
            ))}
          <button
            onClick={onClose}
            className="w-full h-14 bg-[#F2F4F6] text-[#4E5968] rounded-2xl font-bold text-[16px] active:scale-[0.98] transition-all"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

// --------------- Daily Attendance Types ---------------
interface DailyAttLog {
  profile_id: string;
  clock_in: string | null;
  clock_out: string | null;
}

interface AttLogRow {
  profile_id: string;
  type: "IN" | "OUT";
  created_at: string;
}

// --------------- Main Page ---------------
export default function AdminSchedulesPage() {
  const [tab, setTab] = useState<"weekly" | "daily">("weekly");
  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 0 }),
  );
  const [dailyDate, setDailyDate] = useState<Date>(new Date());
  const [confirmingDay, setConfirmingDay] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [copying, setCopying] = useState(false);
  const [fillingDefaults, setFillingDefaults] = useState(false);

  // Bottom sheet state
  const [editSlot, setEditSlot] = useState<{
    slot: Partial<ScheduleSlot> | null;
    defaultDate?: string;
    defaultProfileId?: string;
  } | null>(null);

  const weekDates = getWeekDates(weekStart);
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const dailyDateStr = format(dailyDate, "yyyy-MM-dd");

  // 주간 데이터 (profiles + weeklySchedule + slots)
  const {
    data: weeklyData,
    isLoading: weeklyLoading,
    mutate: mutateWeekly,
  } = useSWR(
    tab === "weekly" ? ["admin-schedules-weekly", weekStartStr] : null,
    async ([, wss]) => {
      const supabase = createClient();
      const { data: pData } = await supabase
        .from("profiles")
        .select("id, name, color_hex")
        .order("name");

      const { data: wsData } = await supabase
        .from("weekly_schedules")
        .select("*")
        .eq("week_start", wss)
        .maybeSingle();

      let slotData: ScheduleSlot[] = [];
      if (wsData) {
        const { data: sd } = await supabase
          .from("schedule_slots")
          .select("*")
          .eq("weekly_schedule_id", wsData.id)
          .neq("status", "cancelled");
        if (sd) slotData = sd as ScheduleSlot[];
      }

      return {
        profiles: (pData as Profile[]) ?? [],
        weeklySchedule: (wsData as WeeklySchedule) ?? null,
        slots: slotData,
      };
    },
    { dedupingInterval: 30_000, revalidateOnFocus: false }
  );

  // 대기중 대타 요청 수
  const { data: pendingSubCount = 0 } = useSWR(
    "admin-schedules-pending-sub-count",
    async () => {
      const supabase = createClient();
      const { count } = await supabase
        .from("substitute_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      return count ?? 0;
    },
    { dedupingInterval: 30_000, revalidateOnFocus: false }
  );

  // 일간 슬롯
  const {
    data: dailySlotsResult,
    isLoading: dailySlotsLoading,
    mutate: mutateDailySlots,
  } = useSWR(
    tab === "daily" ? ["admin-schedules-daily-slots", dailyDateStr] : null,
    async ([, dds]) => {
      const supabase = createClient();
      const dailyWeekStartStr = format(
        startOfWeek(new Date(dds + "T00:00:00"), { weekStartsOn: 0 }),
        "yyyy-MM-dd",
      );
      const [{ data: slotData }, { data: wsData }, { data: pData }] = await Promise.all([
        supabase
          .from("schedule_slots")
          .select("*")
          .eq("slot_date", dds)
          .neq("status", "cancelled"),
        supabase
          .from("weekly_schedules")
          .select("*")
          .eq("week_start", dailyWeekStartStr)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("id, name, color_hex")
          .order("name"),
      ]);
      return {
        dailySlotsData: (slotData as ScheduleSlot[]) || [],
        dailyWeeklySchedule: (wsData as WeeklySchedule) ?? null,
        dailyProfiles: (pData as Profile[]) ?? [],
      };
    },
    { dedupingInterval: 30_000, revalidateOnFocus: false }
  );

  // 일간 출근 현황
  const {
    data: dailyAttLogs = [],
    isLoading: dailyAttLoading,
    mutate: mutateDailyAtt,
  } = useSWR(
    tab === "daily" ? ["admin-schedules-daily-attendance", dailyDateStr] : null,
    async ([, dds]) => {
      const supabase = createClient();
      const start = new Date(dds + "T00:00:00+09:00").toISOString();
      const end = new Date(dds + "T23:59:59+09:00").toISOString();

      const { data } = await supabase
        .from("attendance_logs")
        .select("profile_id, type, created_at")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: true });

      if (!data) return [];
      const map = new Map<string, DailyAttLog>();
      (data as AttLogRow[]).forEach((log) => {
        if (!map.has(log.profile_id)) {
          map.set(log.profile_id, {
            profile_id: log.profile_id,
            clock_in: null,
            clock_out: null,
          });
        }
        const entry = map.get(log.profile_id)!;
        if (log.type === "IN" && !entry.clock_in) entry.clock_in = log.created_at;
        if (log.type === "OUT") entry.clock_out = log.created_at;
      });
      return Array.from(map.values());
    },
    { dedupingInterval: 30_000, revalidateOnFocus: false }
  );

  // 파생 값
  const profiles = tab === "daily"
    ? (dailySlotsResult?.dailyProfiles ?? [])
    : (weeklyData?.profiles ?? []);
  const weeklySchedule = weeklyData?.weeklySchedule ?? null;
  const slots = weeklyData?.slots ?? [];
  const dailySlotsData = dailySlotsResult?.dailySlotsData ?? [];
  const dailyWeeklySchedule = dailySlotsResult?.dailyWeeklySchedule ?? null;
  const loading = tab === "weekly" ? weeklyLoading : dailySlotsLoading || dailyAttLoading;

  // 해당 날짜가 확정된 상태인지 — 주간 전체 확정 OR 일간 confirmed_dates 포함
  const isDayConfirmedState = (slotDate: string): boolean => {
    if (weeklySchedule?.status === "confirmed") return true;
    if (weeklySchedule?.confirmed_dates?.includes(slotDate)) return true;
    if (dailyWeeklySchedule?.confirmed_dates?.includes(slotDate)) return true;
    return false;
  };

  const getOrCreateWeeklySchedule = async (): Promise<string | null> => {
    const supabase = createClient();
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
    if (error) {
      toast.error("주차 생성에 실패했어요", { description: error.message });
      return null;
    }
    return created.id;
  };

  const handleSaveSlot = async (
    data: Partial<ScheduleSlot>,
    isNew: boolean,
  ) => {
    const supabase = createClient();
    // 1. 시간 순서 검사 (bottom sheet에서도 하지만 이중 방어)
    const startMin = timeToMinutes(data.start_time!);
    const endMin = timeToMinutes(data.end_time!);
    if (startMin >= endMin) {
      toast.error("시작 시간이 종료 시간보다 늦어요", {
        description: "시간을 다시 확인해주세요.",
      });
      return;
    }

    // 2. 같은 직원·날짜 기존 슬롯 조회
    const { data: dbSameDay } = await supabase
      .from("schedule_slots")
      .select("id, start_time, end_time")
      .eq("profile_id", data.profile_id!)
      .eq("slot_date", data.slot_date!)
      .eq("status", "active")
      .neq("id", data.id ?? "00000000-0000-0000-0000-000000000000");

    // 신규 추가 시: 이미 슬롯이 있으면 차단 (하루 1슬롯 제한)
    if (isNew && (dbSameDay || []).length > 0) {
      toast.error("이미 해당 날짜에 근무가 있어요", {
        description: "하루에 근무는 하나만 추가할 수 있어요.",
      });
      return;
    }

    // 수정 시: 시간 겹침 검사
    const hasOverlap = (dbSameDay || []).some((s) => {
      const sStart = timeToMinutes(s.start_time);
      const sEnd = timeToMinutes(s.end_time);
      return startMin < sEnd && endMin > sStart;
    });
    if (hasOverlap) {
      toast.error("겹치는 근무가 있어요", {
        description: "같은 날 다른 근무 시간과 겹쳐요.",
      });
      return;
    }

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
      if (error) {
        toast.error("추가에 실패했어요", { description: error.message });
        return;
      }
      if (isDayConfirmedState(data.slot_date!) && data.profile_id) {
        const slotDateLabel = format(new Date(data.slot_date! + "T00:00:00"), "M월 d일", { locale: ko });
        await supabase.from("notifications").insert({
          profile_id: data.profile_id,
          target_role: "employee",
          type: "schedule_updated",
          title: "스케줄이 변경됐어요",
          content: `${slotDateLabel} 근무 일정이 추가됐어요. 확인해보세요.`,
          source_id: wsId,
        });
      }
      toast.success("근무 슬롯을 추가했어요");
    } else {
      const { error } = await supabase
        .from("schedule_slots")
        .update({
          profile_id: data.profile_id,
          slot_date: data.slot_date,
          start_time: data.start_time,
          end_time: data.end_time,
          work_location: data.work_location,
          cafe_positions: data.cafe_positions || [],
          notes: data.notes || null,
        })
        .eq("id", data.id!);
      if (error) {
        toast.error("수정에 실패했어요", { description: error.message });
        return;
      }
      if (isDayConfirmedState(data.slot_date!) && data.profile_id) {
        const slotDateLabel = data.slot_date
          ? format(new Date(data.slot_date + "T00:00:00"), "M월 d일", { locale: ko })
          : "";
        const sourceId = weeklySchedule?.id ?? dailyWeeklySchedule?.id ?? wsId;
        await supabase.from("notifications").insert({
          profile_id: data.profile_id,
          target_role: "employee",
          type: "schedule_updated",
          title: "스케줄이 변경됐어요",
          content: `${slotDateLabel} 근무 일정이 수정됐어요. 확인해보세요.`,
          source_id: sourceId,
        });
      }
      toast.success("근무 슬롯을 수정했어요");
    }
    setEditSlot(null);
    mutateWeekly();
    mutateDailySlots();
  };

  const handleDeleteSlot = async (id: string) => {
    const supabase = createClient();
    const deletingSlot =
      slots.find((s) => s.id === id) ??
      dailySlotsData.find((s) => s.id === id);
    const { error } = await supabase
      .from("schedule_slots")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) {
      toast.error("삭제에 실패했어요");
      return;
    }
    if (isDayConfirmedState(deletingSlot?.slot_date ?? "") && deletingSlot) {
      const slotDateLabel = format(
        new Date(deletingSlot.slot_date + "T00:00:00"),
        "M월 d일",
        { locale: ko },
      );
      const sourceId = weeklySchedule?.id ?? dailyWeeklySchedule?.id ?? "";
      await supabase.from("notifications").insert({
        profile_id: deletingSlot.profile_id,
        target_role: "employee",
        type: "schedule_updated",
        title: "스케줄이 변경됐어요",
        content: `${slotDateLabel} 근무가 삭제됐어요. 확인해보세요.`,
        source_id: sourceId,
      });
    }
    toast.success("슬롯을 삭제했어요");
    setEditSlot(null);
    mutateWeekly();
    mutateDailySlots();
  };

  const handleCopyPrevWeek = async () => {
    const supabase = createClient();
    setCopying(true);
    const prevWeekStart = format(subWeeks(weekStart, 1), "yyyy-MM-dd");
    const { data: prevWs } = await supabase
      .from("weekly_schedules")
      .select("id")
      .eq("week_start", prevWeekStart)
      .maybeSingle();

    if (!prevWs) {
      toast.error("이전 주 스케줄이 없어요");
      setCopying(false);
      return;
    }

    const { data: prevSlots } = await supabase
      .from("schedule_slots")
      .select("*")
      .eq("weekly_schedule_id", prevWs.id)
      .neq("status", "cancelled");

    if (!prevSlots || prevSlots.length === 0) {
      toast.error("이전 주 슬롯이 없어요");
      setCopying(false);
      return;
    }

    const wsId = await getOrCreateWeeklySchedule();
    if (!wsId) {
      setCopying(false);
      return;
    }

    // 현재 주 기존 슬롯 확인 (중복 방지)
    const { data: existingSlots } = await supabase
      .from("schedule_slots")
      .select("profile_id, slot_date")
      .eq("weekly_schedule_id", wsId)
      .neq("status", "cancelled");
    const existingSet = new Set(
      (existingSlots || []).map(
        (s: { profile_id: string; slot_date: string }) =>
          `${s.profile_id}_${s.slot_date}`,
      ),
    );

    const prevWeekDates = getWeekDates(subWeeks(weekStart, 1));
    const newSlots = prevSlots
      .map((s: ScheduleSlot) => {
        const dayIndex = prevWeekDates.indexOf(s.slot_date);
        if (dayIndex === -1) return null;
        return {
          weekly_schedule_id: wsId,
          profile_id: s.profile_id,
          slot_date: weekDates[dayIndex],
          start_time: s.start_time,
          end_time: s.end_time,
          work_location: s.work_location,
          cafe_positions: s.cafe_positions,
          notes: s.notes,
          status: "active",
        };
      })
      .filter(
        (s): s is NonNullable<typeof s> =>
          s !== null && !existingSet.has(`${s.profile_id}_${s.slot_date}`),
      );

    if (newSlots.length === 0) {
      toast.error("복사할 슬롯이 없어요", {
        description: "이미 이번 주에 동일한 슬롯이 있어요.",
      });
      setCopying(false);
      return;
    }

    const { error } = await supabase.from("schedule_slots").insert(newSlots);
    if (error) {
      toast.error("복사에 실패했어요", { description: error.message });
    } else {
      toast.success(`${newSlots.length}개 슬롯을 복사했어요`);
      mutateWeekly();
    }
    setCopying(false);
  };

  const handleFillDefaults = async () => {
    const supabase = createClient();
    setFillingDefaults(true);

    // 1. Fetch all active work_defaults
    const { data: defaults } = await supabase
      .from("work_defaults")
      .select("*")
      .eq("is_active", true);

    if (!defaults || defaults.length === 0) {
      toast.error("기본 패턴이 없어요", {
        description: "직원 관리에서 기본 패턴을 먼저 등록해주세요.",
      });
      setFillingDefaults(false);
      return;
    }

    // 2. Get or create weekly schedule
    const wsId = await getOrCreateWeeklySchedule();
    if (!wsId) {
      setFillingDefaults(false);
      return;
    }

    // 3. Fetch existing active slots for this week to check duplicates
    const { data: existingSlots } = await supabase
      .from("schedule_slots")
      .select("profile_id, slot_date, work_location")
      .eq("weekly_schedule_id", wsId)
      .neq("status", "cancelled");

    const existingSet = new Set(
      (existingSlots || []).map(
        (s: { profile_id: string; slot_date: string; work_location: string }) =>
          `${s.profile_id}_${s.slot_date}_${s.work_location}`,
      ),
    );

    // 4. Calculate target date for each work_default based on day_of_week
    // weekDates is an array indexed 0=Sunday, 1=Monday...6=Saturday (startOfWeek Sunday)
    const newSlots: Array<{
      weekly_schedule_id: string;
      profile_id: string;
      slot_date: string;
      start_time: string;
      end_time: string;
      work_location: string;
      cafe_positions: string[];
      status: string;
    }> = [];

    for (const wd of defaults) {
      const dow = wd.day_of_week;
      if (typeof dow !== "number" || dow < 0 || dow > 6) continue;
      const targetDate = weekDates[dow]; // 0=일,1=월...6=토
      const key = `${wd.profile_id}_${targetDate}_${wd.work_location}`;
      if (existingSet.has(key)) continue; // skip duplicate

      newSlots.push({
        weekly_schedule_id: wsId,
        profile_id: wd.profile_id,
        slot_date: targetDate,
        start_time: wd.start_time,
        end_time: wd.end_time,
        work_location: wd.work_location,
        cafe_positions: wd.cafe_positions || [],
        status: "active",
      });
    }

    if (newSlots.length === 0) {
      toast.error("추가할 슬롯이 없어요", {
        description: "이미 모든 기본 패턴이 반영되어 있어요.",
      });
      setFillingDefaults(false);
      return;
    }

    const { error } = await supabase.from("schedule_slots").insert(newSlots);
    if (error) {
      toast.error("기본 패턴 채우기에 실패했어요", {
        description: error.message,
      });
    } else {
      toast.success(`${newSlots.length}개 슬롯을 기본 패턴으로 채웠어요`);
      mutateWeekly();
    }
    setFillingDefaults(false);
  };

  const handleConfirmSchedule = async () => {
    const supabase = createClient();
    if (weeklySchedule?.status === "confirmed") {
      toast.error("이미 확정된 스케줄이에요", {
        description: "직원들에게 이미 알림이 전송됐어요.",
      });
      return;
    }
    setConfirming(true);
    const wsId = await getOrCreateWeeklySchedule();
    if (!wsId) {
      setConfirming(false);
      return;
    }

    const { error } = await supabase
      .from("weekly_schedules")
      .update({
        status: "confirmed",
        published_at: new Date().toISOString(),
        confirmed_dates: weekDates,  // 주 확정 시 해당 주 전체 날짜 확정
      })
      .eq("id", wsId)
      .eq("status", "draft");

    if (error) {
      toast.error("확정에 실패했어요", { description: error.message });
      setConfirming(false);
      return;
    }

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
    mutateWeekly();
    setConfirming(false);
  };

  const handleConfirmDay = async () => {
    const supabase = createClient();
    const dateStr = format(dailyDate, "yyyy-MM-dd");
    if (dailyWeeklySchedule?.confirmed_dates?.includes(dateStr)) {
      toast.error("이미 확정된 날이에요");
      return;
    }
    setConfirmingDay(true);
    const dailyWeekStartStr = format(
      startOfWeek(dailyDate, { weekStartsOn: 0 }),
      "yyyy-MM-dd",
    );

    let wsId = dailyWeeklySchedule?.id ?? null;
    if (!wsId) {
      const { data: existing } = await supabase
        .from("weekly_schedules")
        .select("id")
        .eq("week_start", dailyWeekStartStr)
        .maybeSingle();
      if (existing) {
        wsId = existing.id;
      } else {
        const { data: created, error: createErr } = await supabase
          .from("weekly_schedules")
          .insert({ week_start: dailyWeekStartStr, status: "draft" })
          .select("id")
          .single();
        if (createErr) {
          toast.error("확정에 실패했어요", { description: createErr.message });
          setConfirmingDay(false);
          return;
        }
        wsId = created.id;
      }
    }

    const currentConfirmed = dailyWeeklySchedule?.confirmed_dates ?? [];
    const { error } = await supabase
      .from("weekly_schedules")
      .update({ confirmed_dates: [...currentConfirmed, dateStr] })
      .eq("id", wsId!);

    if (error) {
      toast.error("확정에 실패했어요", { description: error.message });
      setConfirmingDay(false);
      return;
    }

    const affectedProfileIds = [
      ...new Set(dailySlotsData.map((s) => s.profile_id)),
    ];
    if (affectedProfileIds.length > 0) {
      const notifications = affectedProfileIds.map((pid) => ({
        profile_id: pid,
        target_role: "employee" as const,
        type: "schedule_published",
        title: "스케줄이 확정됐어요",
        content: `${format(dailyDate, "M월 d일", { locale: ko })} 스케줄이 확정됐어요. 확인해보세요.`,
        source_id: wsId!,
      }));
      await supabase.from("notifications").insert(notifications);
    }

    toast.success(`${format(dailyDate, "M월 d일", { locale: ko })} 스케줄을 확정했어요`);
    mutateDailySlots();
    mutateWeekly();
    setConfirmingDay(false);
  };

  // --------------- Weekly Grid View ---------------
  const renderWeeklyGrid = () => {
    if (profiles.length === 0)
      return (
        <div className="bg-white rounded-[24px] border border-slate-100 p-12 text-center text-[#8B95A1]">
          직원이 없어요
        </div>
      );

    return (
      <div className="overflow-x-auto rounded-[20px] border border-slate-100 bg-white shadow-sm">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="bg-[#F9FAFB] border-b border-slate-100">
              <th className="w-[100px] px-4 py-3 text-left text-[12px] font-bold text-[#8B95A1] sticky left-0 z-20 bg-[#F9FAFB] border-r border-slate-100">
                직원
              </th>
              {weekDates.map((d) => {
                const isDayConfirmed =
                  weeklySchedule?.confirmed_dates?.includes(d) ?? false;
                return (
                  <th
                    key={d}
                    className="px-2 py-3 text-center text-[12px] font-bold text-[#8B95A1]"
                  >
                    <div className="flex items-center justify-center gap-1">
                      {format(parseISO(d), "EEE", { locale: ko })}
                      {isDayConfirmed && (
                        <Check className="w-3 h-3 text-[#00B761]" />
                      )}
                    </div>
                    <div className="text-[11px] font-normal">{d.slice(5)}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => (
              <tr
                key={profile.id}
                className="border-b border-slate-50 last:border-0"
              >
                <td className="px-4 py-3 sticky left-0 z-10 bg-white border-r border-slate-50">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0"
                      style={{
                        backgroundColor: profile.color_hex || "#8B95A1",
                      }}
                    >
                      {profile.name.charAt(0)}
                    </div>
                    <span className="text-[13px] font-bold text-[#191F28] truncate max-w-[60px]">
                      {profile.name}
                    </span>
                  </div>
                </td>
                {weekDates.map((d) => {
                  const daySlots = slots.filter(
                    (s) => s.profile_id === profile.id && s.slot_date === d,
                  );
                  return (
                    // align-middle: 슬롯이 있어 행이 길어져도 + 버튼이 셀 중앙에 위치
                    <td key={d} className="px-1 py-2 align-middle">
                      <div className="flex flex-col items-stretch gap-1">
                        {daySlots.map((slot) => {
                          const isSubstituted = slot.status === "substituted";
                          return (
                            <button
                              key={slot.id}
                              onClick={() => setEditSlot({ slot })}
                              className={`w-full text-left px-2 py-1.5 rounded-lg text-[12px] font-bold transition-all hover:opacity-80 active:scale-[0.97] ${isSubstituted ? "text-[#8B95A1] line-through" : "text-white"}`}
                              style={{
                                backgroundColor: isSubstituted
                                  ? "#F2F4F6"
                                  : LOCATION_COLORS[slot.work_location],
                              }}
                            >
                              <div>{LOCATION_LABELS[slot.work_location]}</div>
                              {slot.cafe_positions && slot.cafe_positions.length > 0 && (
                                <div className="flex gap-0.5 flex-wrap mt-0.5">
                                  {slot.cafe_positions.map((pos) => (
                                    <span
                                      key={pos}
                                      className="px-1 py-0.5 bg-white/20 rounded text-[10px] font-bold leading-none"
                                    >
                                      {CAFE_POSITION_LABELS[pos] || pos}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div className="opacity-90">
                                {slot.start_time.slice(0, 5)}~
                                {slot.end_time.slice(0, 5)}
                              </div>
                            </button>
                          );
                        })}
                        {daySlots.length === 0 && (
                          <button
                            onClick={() =>
                              setEditSlot({
                                slot: null,
                                defaultDate: d,
                                defaultProfileId: profile.id,
                              })
                            }
                            className="w-full flex items-center justify-center py-1 rounded-lg text-[#D1D6DB] hover:text-[#3182F6] hover:bg-[#E8F3FF] transition-all"
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

  // --------------- Daily Timeline View ---------------
  const renderDailyView = () => {
    const dateStr = format(dailyDate, "yyyy-MM-dd");
    const hourStart = 7;
    const hourEnd = 22;
    const hours = Array.from(
      { length: hourEnd - hourStart + 1 },
      (_, i) => hourStart + i,
    );
    const daySlots = dailySlotsData;

    const isDayConfirmed =
      dailyWeeklySchedule?.confirmed_dates?.includes(dateStr) ?? false;

    return (
      <div className="space-y-3">
        {/* 일간 확정 상태 */}
        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
              isDayConfirmed
                ? "bg-[#E6FAF0] text-[#00B761]"
                : "bg-[#FFF3BF] text-[#E67700]"
            }`}
          >
            {isDayConfirmed ? "확정됨" : "미확정"}
          </span>
        </div>
      <div className="overflow-x-auto rounded-[20px] border border-slate-100 bg-white shadow-sm">
        <div className="min-w-[700px]">
          {/* 헤더 행 */}
          <div className="flex bg-[#F9FAFB] border-b border-slate-100">
            <div className="w-[80px] shrink-0 sticky left-0 z-20 bg-[#F9FAFB] border-r border-slate-100" />
            {hours.map((h) => (
              <div
                key={h}
                className="flex-1 text-center text-[11px] font-bold text-[#8B95A1] border-l border-slate-100 py-2"
              >
                {h}시
              </div>
            ))}
          </div>

          {profiles.map((profile) => {
            const empSlots = daySlots.filter(
              (s) => s.profile_id === profile.id,
            );
            return (
              <div
                key={profile.id}
                className="flex border-t border-slate-100 relative"
                style={{ height: "72px" }}
              >
                {/* 직원명 — sticky */}
                <div className="w-[80px] shrink-0 px-2 flex items-center gap-2 sticky left-0 z-10 bg-white border-r border-slate-50">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                    style={{ backgroundColor: profile.color_hex || "#8B95A1" }}
                  >
                    {profile.name.charAt(0)}
                  </div>
                  <span className="text-[12px] font-bold text-[#191F28] truncate">
                    {profile.name}
                  </span>
                </div>
                <div className="flex-1 relative h-[72px]">
                  <div className="absolute inset-0 flex">
                    {hours.map((h) => (
                      <div
                        key={h}
                        className="flex-1 border-l border-slate-50 cursor-pointer hover:bg-[#F9FAFB] transition-colors"
                        onClick={() =>
                          setEditSlot({
                            slot: null,
                            defaultDate: dateStr,
                            defaultProfileId: profile.id,
                          })
                        }
                      />
                    ))}
                  </div>
                  {empSlots.map((slot) => {
                    const totalHours = hourEnd - hourStart;
                    const startH =
                      parseInt(slot.start_time.split(":")[0]) +
                      parseInt(slot.start_time.split(":")[1]) / 60;
                    const endH =
                      parseInt(slot.end_time.split(":")[0]) +
                      parseInt(slot.end_time.split(":")[1]) / 60;
                    const leftPct = ((startH - hourStart) / totalHours) * 100;
                    const widthPct = ((endH - startH) / totalHours) * 100;
                    return (
                      <button
                        key={slot.id}
                        onClick={() => setEditSlot({ slot })}
                        className="absolute rounded-lg text-white text-[11px] font-bold px-2 flex items-center overflow-hidden hover:opacity-80 transition-all"
                        style={{
                          top: "6px",
                          height: "26px",
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          backgroundColor: LOCATION_COLORS[slot.work_location],
                          minWidth: "4px",
                        }}
                      >
                        <span className="truncate">
                          {slot.cafe_positions && slot.cafe_positions.length > 0
                            ? slot.cafe_positions.map((p) => CAFE_POSITION_LABELS[p] || p).join("·") + " "
                            : ""}
                          {slot.start_time.slice(0, 5)}~
                          {slot.end_time.slice(0, 5)}
                        </span>
                      </button>
                    );
                  })}
                  {/* 근태 레이어 */}
                  {(() => {
                    const attLog = dailyAttLogs.find(
                      (a) => a.profile_id === profile.id,
                    );
                    if (empSlots.length === 0) return null;
                    const firstSlot = empSlots[0];
                    const isPast =
                      dailyDate < new Date(new Date().setHours(0, 0, 0, 0));

                    if (!attLog?.clock_in && isPast) {
                      return (
                        <div
                          className="absolute flex items-center px-2 rounded-md text-[10px] font-bold text-[#E03131]"
                          style={{
                            bottom: "6px",
                            height: "22px",
                            left: "4px",
                            right: "4px",
                            backgroundColor: "#FFF5F5",
                            border: "1px solid #FFCDD2",
                          }}
                        >
                          미출근
                        </div>
                      );
                    }
                    if (!attLog?.clock_in) return null;

                    const clockInDate = new Date(attLog.clock_in);
                    const clockOutDate = attLog.clock_out
                      ? new Date(attLog.clock_out)
                      : new Date();
                    const totalHours = hourEnd - hourStart;
                    const inH =
                      clockInDate.getHours() + clockInDate.getMinutes() / 60;
                    const outH =
                      clockOutDate.getHours() + clockOutDate.getMinutes() / 60;
                    const attLeftPct = Math.max(
                      0,
                      ((inH - hourStart) / totalHours) * 100,
                    );
                    const attWidthPct = Math.max(
                      0.5,
                      Math.min(
                        100 - attLeftPct,
                        ((outH - inH) / totalHours) * 100,
                      ),
                    );

                    const [sh, sm] = firstSlot.start_time
                      .split(":")
                      .map(Number);
                    const schedStart = new Date(
                      `${dateStr}T${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}:00`,
                    );
                    const lateMin = Math.floor(
                      (clockInDate.getTime() - schedStart.getTime()) / 60000,
                    );
                    const isLate = lateMin > 10;

                    return (
                      <div
                        className="absolute flex items-center px-1.5 rounded-md text-[10px] font-bold text-white overflow-hidden"
                        style={{
                          bottom: "6px",
                          height: "22px",
                          left: `${attLeftPct}%`,
                          width: `${attWidthPct}%`,
                          backgroundColor: isLate ? "#F59E0B" : "#00B761",
                          minWidth: "4px",
                        }}
                      >
                        {attWidthPct > 5 && (
                          <span className="truncate">
                            {isLate ? `+${lateMin}분` : ""}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })}

          {/* 인원 행 */}
          <div className="flex border-t-2 border-slate-200 bg-[#F9FAFB]">
            <div className="w-[80px] shrink-0 px-2 py-2 text-[11px] font-bold text-[#8B95A1] sticky left-0 z-10 bg-[#F9FAFB] border-r border-slate-100">
              인원
            </div>
            {hours.map((h) => {
              const count = dailySlotsData.filter(
                (s) =>
                  timeToMinutes(s.start_time) < (h + 1) * 60 &&
                  timeToMinutes(s.end_time) > h * 60,
              ).length;
              return (
                <div
                  key={h}
                  className="flex-1 border-l border-slate-100 text-center py-2"
                >
                  <span
                    className={`text-[12px] font-bold ${count > 0 ? "text-[#3182F6]" : "text-[#D1D6DB]"}`}
                  >
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
          <h1 className="text-2xl font-bold text-[#191F28] mb-1">
            스케줄 관리
          </h1>
          <p className="text-[14px] text-[#8B95A1]">
            직원 근무 일정을 한눈에 관리해요.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* 대체근무 관리 — pending 뱃지 */}
          <Link
            href="/admin/schedules/substitutes"
            className="relative flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-[#4E5968] rounded-xl text-[13px] font-bold hover:bg-[#F2F4F6] transition-all"
          >
            <ArrowRightLeft className="w-4 h-4" />
            대체근무 관리
            {pendingSubCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                {pendingSubCount > 9 ? "9+" : pendingSubCount}
              </span>
            )}
          </Link>
          {tab === "weekly" ? (
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
              {weeklySchedule?.status === "confirmed"
                ? "확정됨"
                : confirming
                  ? "확정하는 중이에요"
                  : "주 확정하기"}
            </button>
          ) : (() => {
            const dateStr = format(dailyDate, "yyyy-MM-dd");
            const isDayConfirmed =
              dailyWeeklySchedule?.confirmed_dates?.includes(dateStr) ?? false;
            return (
              <button
                onClick={handleConfirmDay}
                disabled={confirmingDay || isDayConfirmed}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all disabled:opacity-50 ${
                  isDayConfirmed
                    ? "bg-[#E6FAF0] text-[#00B761] border border-[#00B761]"
                    : "bg-[#3182F6] text-white hover:bg-[#1B64DA]"
                }`}
              >
                <Check className="w-4 h-4" />
                {isDayConfirmed
                  ? "확정됨"
                  : confirmingDay
                    ? "확정하는 중이에요"
                    : "이 날 확정하기"}
              </button>
            );
          })()}
        </div>
      </div>

      {/* 날짜 네비게이터 — 주간/일간 공통 위치 */}
      <div className="relative flex items-center justify-center gap-2 mb-4">
        <button
          onClick={() =>
            tab === "weekly"
              ? setWeekStart((w) => subWeeks(w, 1))
              : setDailyDate((d) => {
                  const nd = new Date(d);
                  nd.setDate(nd.getDate() - 1);
                  return nd;
                })
          }
          aria-label="이전"
          className="p-2 rounded-full hover:bg-[#F2F4F6] text-[#8B95A1] min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="font-bold text-[#191F28] text-[15px] min-w-[200px] text-center">
          {tab === "weekly"
            ? `${format(weekStart, "yyyy년 M월 d일", { locale: ko })} ~ ${format(addDays(weekStart, 6), "M월 d일", { locale: ko })}`
            : format(dailyDate, "M월 d일 (EEE)", { locale: ko })}
        </span>
        <button
          onClick={() =>
            tab === "weekly"
              ? setWeekStart((w) => addWeeks(w, 1))
              : setDailyDate((d) => {
                  const nd = new Date(d);
                  nd.setDate(nd.getDate() + 1);
                  return nd;
                })
          }
          aria-label="다음"
          className="p-2 rounded-full hover:bg-[#F2F4F6] text-[#8B95A1] min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        {tab === "weekly" && (
          <div className="absolute right-0">
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                !weeklySchedule
                  ? "invisible"
                  : weeklySchedule.status === "confirmed"
                    ? "bg-[#E6FAF0] text-[#00B761]"
                    : "bg-[#FFF3BF] text-[#E67700]"
              }`}
            >
              {weeklySchedule?.status === "confirmed" ? "확정" : "초안"}
            </span>
          </div>
        )}
      </div>

      {/* Tab switcher + 이전 주 복사 (주간 탭일 때만) */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex bg-[#F2F4F6] p-1 rounded-xl">
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
        {tab === "weekly" && (
          <>
            <button
              onClick={handleCopyPrevWeek}
              disabled={copying}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-[#4E5968] rounded-xl text-[13px] font-bold hover:bg-[#F2F4F6] transition-all disabled:opacity-50"
              title="이전 주 복사"
            >
              <Copy className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {copying ? "복사 중이에요" : "이전 주 복사"}
              </span>
            </button>
            <button
              onClick={handleFillDefaults}
              disabled={fillingDefaults}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-[#4E5968] rounded-xl text-[13px] font-bold hover:bg-[#F2F4F6] transition-all disabled:opacity-50"
              title="기본 패턴으로 채우기"
            >
              <LayoutTemplate className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {fillingDefaults ? "채우는 중이에요" : "기본 패턴 채우기"}
              </span>
            </button>
          </>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="overflow-x-auto rounded-[20px] border border-slate-100 bg-white shadow-sm">
          <div className="min-w-[700px] p-4 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex gap-2">
                <div className="w-[100px] h-8 bg-[#F2F4F6] rounded-lg animate-pulse" />
                {[1, 2, 3, 4, 5, 6, 7].map((j) => (
                  <div
                    key={j}
                    className="flex-1 h-8 bg-[#F2F4F6] rounded-lg animate-pulse"
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : tab === "weekly" ? (
        renderWeeklyGrid()
      ) : (
        renderDailyView()
      )}

      {/* Slot bottom sheet */}
      {editSlot !== null && (
        <SlotBottomSheet
          key={editSlot.slot?.id ?? "new"}
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
