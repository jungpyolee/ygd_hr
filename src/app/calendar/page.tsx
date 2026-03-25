"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import AvatarDisplay from "@/components/AvatarDisplay";
import useSWR from "swr";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Users,
  CheckCircle2,
  X,
} from "lucide-react";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  isBefore,
  startOfToday,
  parseISO,
  differenceInMinutes,
} from "date-fns";
import { ko } from "date-fns/locale";
import { useWorkplaces } from "@/lib/hooks/useWorkplaces";
import { useRouter } from "next/navigation";

// ─── Types ───────────────────────────────────────────────────────────────────
interface MySlot {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  store_id: string;
  position_keys: string[];
  status: string;
  profile_id: string;
  weekly_schedule_id: string;
}

interface TeamSlot {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  store_id: string;
  position_keys: string[];
  status: string;
  profile_id: string;
  profile_name: string;
  profile_color: string;
  avatar_config?: any;
}

interface AttendanceLog {
  id: string;
  type: string;
  created_at: string;
  attendance_type: string;
}

interface CompanyEvent {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  event_type: string;
  color: string;
  store_id: string | null;
}

interface DayInfo {
  mySlots: MySlot[];
  teamSlots: TeamSlot[];
  attendance: { clock_in: Date | null; clock_out: Date | null; is_working: boolean };
  events: CompanyEvent[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}시간${m > 0 ? ` ${m}분` : ""}`;
}

// ─── DayDetailSheet ───────────────────────────────────────────────────────────
interface DayDetailSheetProps {
  dateStr: string;
  dayInfo: DayInfo;
  layers: LayerState;
  onClose: () => void;
  highlightDate?: string | null;
}

function DayDetailSheet({ dateStr, dayInfo, layers, onClose, highlightDate }: DayDetailSheetProps) {
  const { byId, positionsOfStore } = useWorkplaces();
  const dateLabel = format(parseISO(dateStr), "M월 d일 (EEEE)", { locale: ko });
  const { mySlots, teamSlots, attendance, events } = dayInfo;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-[28px] px-5 pt-6 pb-6 shadow-2xl animate-in zoom-in-95 fade-in-0 duration-200 max-h-[80vh] overflow-y-auto scrollbar-hide">
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-[17px] font-bold text-[#191F28]">{dateLabel}</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F4F6]">
            <X className="w-5 h-5 text-[#8B95A1]" />
          </button>
        </div>

        {/* 회사 일정 */}
        {layers.events && events.length > 0 && (
          <div className="mb-4 space-y-2">
            {events.map((ev) => (
              <div
                key={ev.id}
                className="px-3 py-2.5 rounded-xl"
                style={{ backgroundColor: ev.color + "22", borderLeft: `3px solid ${ev.color}` }}
              >
                <p className="text-[13px] font-bold" style={{ color: ev.color }}>
                  {ev.title}
                </p>
                {ev.description && (
                  <p className="text-[11px] text-[#8B95A1] mt-0.5">{ev.description}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 내 근무 */}
        {layers.mySchedule && mySlots.length > 0 && (
          <div className="mb-4">
            <h4 className="text-[12px] font-bold text-[#8B95A1] mb-2">내 근무</h4>
            <div className="space-y-2">
              {mySlots.map((slot) => {
                const store = byId[slot.store_id];
                const positions = slot.position_keys?.length
                  ? slot.position_keys
                      .map((k) => positionsOfStore(slot.store_id).find((p) => p.position_key === k)?.label || k)
                      .join(" · ")
                  : null;
                return (
                  <div
                    key={slot.id}
                    className={`p-3 rounded-2xl${highlightDate === dateStr ? " animate-slot-glow" : ""}`}
                    style={{ backgroundColor: (store?.color || "#3182F6") + "15", borderLeft: `3px solid ${store?.color || "#3182F6"}` }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5" style={{ color: store?.color || "#3182F6" }} />
                          <span className="text-[14px] font-bold" style={{ color: store?.color || "#3182F6" }}>
                            {store?.label || "근무지"}
                          </span>
                          {positions && (
                            <span className="text-[12px] text-[#8B95A1]">· {positions}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-1 text-[13px] text-[#4E5968]">
                          <Clock className="w-3.5 h-3.5" />
                          {slot.start_time.slice(0, 5)} — {slot.end_time.slice(0, 5)}
                        </div>
                      </div>
                      {attendance.clock_in && (
                        <CheckCircle2 className="w-5 h-5 text-[#00B761]" />
                      )}
                    </div>

                    {/* 실제 출퇴근 시간 */}
                    {layers.myAttendance && attendance.clock_in && (
                      <div className="mt-2 pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-3 text-[12px]">
                          <div className="flex items-center gap-1">
                            <span className="text-[#8B95A1]">출근</span>
                            <span className="font-bold text-[#4E5968]">
                              {format(attendance.clock_in, "HH:mm")}
                            </span>
                          </div>
                          {attendance.clock_out ? (
                            <>
                              <span className="text-[#D1D6DB]">→</span>
                              <div className="flex items-center gap-1">
                                <span className="text-[#8B95A1]">퇴근</span>
                                <span className="font-bold text-[#4E5968]">
                                  {format(attendance.clock_out, "HH:mm")}
                                </span>
                              </div>
                              <span className="text-[#3182F6] font-bold ml-auto">
                                {formatDuration(differenceInMinutes(attendance.clock_out, attendance.clock_in))}
                              </span>
                            </>
                          ) : (
                            <span className="text-[#3182F6] font-bold ml-auto">근무 중</span>
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

        {/* 근태만 있는 경우 (스케줄 없이 출근) */}
        {layers.myAttendance && mySlots.length === 0 && attendance.clock_in && (
          <div className="mb-4 p-3 rounded-2xl bg-green-50 border-l-[3px] border-green-400">
            <div className="flex items-center gap-2 text-[14px] font-bold text-green-700 mb-1">
              <CheckCircle2 className="w-4 h-4" />
              출근 기록
            </div>
            <div className="flex items-center gap-3 text-[12px]">
              <div className="flex items-center gap-1">
                <span className="text-[#8B95A1]">출근</span>
                <span className="font-bold text-[#4E5968]">{format(attendance.clock_in, "HH:mm")}</span>
              </div>
              {attendance.clock_out ? (
                <>
                  <span className="text-[#D1D6DB]">→</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[#8B95A1]">퇴근</span>
                    <span className="font-bold text-[#4E5968]">{format(attendance.clock_out, "HH:mm")}</span>
                  </div>
                  <span className="text-[#3182F6] font-bold ml-auto">
                    {formatDuration(differenceInMinutes(attendance.clock_out, attendance.clock_in))}
                  </span>
                </>
              ) : (
                <span className="text-[#3182F6] font-bold ml-auto">근무 중</span>
              )}
            </div>
          </div>
        )}

        {/* 팀 스케줄 */}
        {layers.team && teamSlots.length > 0 && (
          <div className="mb-4">
            <h4 className="text-[12px] font-bold text-[#8B95A1] mb-2">
              <Users className="w-3.5 h-3.5 inline mr-1" />
              같은 근무지 동료
            </h4>
            <div className="space-y-1.5">
              {teamSlots.map((slot) => {
                const store = byId[slot.store_id];
                return (
                  <div
                    key={slot.id}
                    className="flex items-center gap-2.5 p-2.5 bg-[#F9FAFB] rounded-xl"
                  >
                    <AvatarDisplay userId={slot.profile_id} avatarConfig={slot.avatar_config} size={28} />
                    <div className="flex-1 min-w-0">
                      <span className="text-[13px] font-bold text-[#333D4B]">{slot.profile_name}</span>
                      {store && (
                        <span className="text-[11px] ml-1.5" style={{ color: store.color }}>
                          {store.label}
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-[#8B95A1] font-medium shrink-0">
                      {slot.start_time.slice(0, 5)}~{slot.end_time.slice(0, 5)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {mySlots.length === 0 && teamSlots.length === 0 && events.length === 0 && !attendance.clock_in && (
          <div className="py-8 text-center text-[#8B95A1] text-[14px]">
            이 날에는 일정이 없어요
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Layer State ──────────────────────────────────────────────────────────────
interface LayerState {
  mySchedule: boolean;
  myAttendance: boolean;
  team: boolean;
  events: boolean;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function EmployeeCalendarPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { byId, workplaces } = useWorkplaces();

  const [baseDate, setBaseDate] = useState(new Date());
  const [layers, setLayers] = useState<LayerState>(() => {
    if (typeof window === "undefined") return { mySchedule: true, myAttendance: true, team: true, events: true };
    try {
      const stored = localStorage.getItem("calendar-layers");
      return stored ? { mySchedule: true, myAttendance: true, team: true, events: true, ...JSON.parse(stored) } : { mySchedule: true, myAttendance: true, team: true, events: true };
    } catch {
      return { mySchedule: true, myAttendance: true, team: true, events: true };
    }
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // 알림 클릭으로 진입 시 highlight 날짜
  const searchParams = useSearchParams();
  const [highlightDate, setHighlightDate] = useState<string | null>(null);
  useEffect(() => {
    const h = searchParams.get("highlight");
    if (h) {
      setHighlightDate(h);
      // highlight 날짜가 현재 월에 없으면 해당 월로 이동
      const hDate = parseISO(h);
      if (!isSameMonth(hDate, baseDate)) setBaseDate(hDate);
      // 일정 시간 후 glow 제거
      const timer = setTimeout(() => setHighlightDate(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const profileId = user?.id ?? null;

  const { startDate, endDate } = useMemo(() => {
    const monthStart = startOfMonth(baseDate);
    const monthEnd = endOfMonth(baseDate);
    return {
      startDate: startOfWeek(monthStart, { weekStartsOn: 0 }),
      endDate: endOfWeek(monthEnd, { weekStartsOn: 0 }),
    };
  }, [baseDate]);

  const rangeKey = `${format(startDate, "yyyy-MM-dd")}_${format(endDate, "yyyy-MM-dd")}`;

  const { data, isLoading } = useSWR(
    profileId ? ["employee-calendar", profileId, rangeKey] : null,
    async ([, uid, range]) => {
      const supabase = createClient();
      const [start, end] = range.split("_");

      // 1. 내 슬롯 — slot_date 직접 조회 (어드민 포함, 주 상태 무관)
      const { data: slotsData } = await supabase
        .from("schedule_slots")
        .select("*")
        .eq("profile_id", uid)
        .eq("status", "active")
        .gte("slot_date", start)
        .lte("slot_date", end);
      const mySlots: MySlot[] = (slotsData || []) as MySlot[];

      // 2. 내 근무지 파악
      const { data: myAssignments } = await supabase
        .from("employee_store_assignments")
        .select("store_id")
        .eq("profile_id", uid);
      let myStoreIds: string[] = (myAssignments || []).map((a: any) => a.store_id);
      // 어드민은 employee_store_assignments가 없을 수 있으므로 슬롯에서 추론
      if (myStoreIds.length === 0 && mySlots.length > 0) {
        myStoreIds = [...new Set(mySlots.map((s) => s.store_id))];
      }

      // 3. 팀 슬롯 — 확정된 주만
      const { data: confirmedWs } = await supabase
        .from("weekly_schedules")
        .select("id")
        .eq("status", "confirmed")
        .gte("week_start", start)
        .lte("week_start", end);
      const confirmedWsIds = (confirmedWs || []).map((ws: any) => ws.id);

      let teamSlots: TeamSlot[] = [];
      if (confirmedWsIds.length > 0 && myStoreIds.length > 0) {
        const { data: teamData } = await supabase
          .from("schedule_slots")
          .select("*, profiles!profile_id(name, color_hex, avatar_config)")
          .in("weekly_schedule_id", confirmedWsIds)
          .in("store_id", myStoreIds)
          .eq("status", "active")
          .neq("profile_id", uid);
        teamSlots = (teamData || []).map((s: any) => ({
          id: s.id,
          slot_date: s.slot_date,
          start_time: s.start_time,
          end_time: s.end_time,
          store_id: s.store_id,
          position_keys: s.position_keys,
          status: s.status,
          profile_id: s.profile_id,
          profile_name: s.profiles?.name || "알 수 없음",
          profile_color: s.profiles?.color_hex || "#8B95A1",
          avatar_config: s.profiles?.avatar_config ?? null,
        }));
      }

      // 4. 내 출퇴근 기록
      const startStr = new Date(`${start}T00:00:00+09:00`).toISOString();
      const endStr = new Date(`${end}T23:59:59.999+09:00`).toISOString();
      const { data: logsData } = await supabase
        .from("attendance_logs")
        .select("id, type, created_at, attendance_type")
        .eq("profile_id", uid)
        .gte("created_at", startStr)
        .lte("created_at", endStr)
        .order("created_at", { ascending: true });

      // 5. 회사 일정
      const { data: eventsData } = await supabase
        .from("company_events")
        .select("*")
        .or(`start_date.lte.${end},end_date.gte.${start}`);

      // 출퇴근 맵
      const attMap: Record<string, { clock_in: Date | null; clock_out: Date | null; is_working: boolean }> = {};
      (logsData || []).forEach((log: any) => {
        const dateKey = format(new Date(log.created_at), "yyyy-MM-dd");
        if (!attMap[dateKey]) attMap[dateKey] = { clock_in: null, clock_out: null, is_working: false };
        if (log.type === "IN" && !attMap[dateKey].clock_in) {
          attMap[dateKey].clock_in = new Date(log.created_at);
          attMap[dateKey].is_working = true;
        }
        if (log.type === "OUT" && !attMap[dateKey].clock_out) {
          attMap[dateKey].clock_out = new Date(log.created_at);
          attMap[dateKey].is_working = false;
        }
      });

      // 회사 일정: store_id null(전체) 또는 내 매장만 필터
      const filteredEvents = ((eventsData || []) as CompanyEvent[]).filter(
        (e) => e.store_id === null || myStoreIds.includes(e.store_id)
      );

      return {
        mySlots,
        teamSlots,
        attendance: attMap,
        events: filteredEvents,
        myStoreIds,
      };
    },
    { dedupingInterval: 60_000, revalidateOnFocus: true }
  );

  const mySlots = data?.mySlots ?? [];
  const teamSlots = data?.teamSlots ?? [];
  const attendance = data?.attendance ?? {};
  const events = data?.events ?? [];

  // 날짜별 데이터 집계
  const getDayInfo = (dateStr: string): DayInfo => ({
    mySlots: layers.mySchedule ? mySlots.filter((s) => s.slot_date === dateStr) : [],
    teamSlots: layers.team ? teamSlots.filter((s) => s.slot_date === dateStr) : [],
    attendance: attendance[dateStr] || { clock_in: null, clock_out: null, is_working: false },
    events: layers.events
      ? events.filter((e) => e.start_date <= dateStr && e.end_date >= dateStr)
      : [],
  });

  const toggleLayer = (key: keyof LayerState) => {
    setLayers((p) => {
      const next = { ...p, [key]: !p[key] };
      try { localStorage.setItem("calendar-layers", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const calDays = useMemo(() => {
    return eachDayOfInterval({ start: startDate, end: endDate });
  }, [startDate, endDate]);

  const selectedDayInfo = selectedDay ? getDayInfo(selectedDay) : null;
  const today = startOfToday();

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-24">
      {/* 헤더 */}
      <header className="sticky top-0 z-10 px-5 pt-5 pb-4 bg-[#F9FAFB]">
        <h1 className="text-[22px] font-bold text-[#191F28]">스케줄</h1>
      </header>

      {/* 레이어 토글 */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-2 overflow-x-auto scrollbar-hide">
        {[
          { key: "mySchedule" as const, label: "내 스케줄" },
          { key: "myAttendance" as const, label: "내 근무" },
          { key: "team" as const, label: "팀 스케줄" },
          { key: "events" as const, label: "회사일정" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => toggleLayer(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold border shrink-0 transition-all ${
              layers[key]
                ? "bg-[#191F28] text-white border-transparent"
                : "text-[#8B95A1] bg-white border-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 월 네비게이션 */}
      <div className="px-4 pb-3 flex items-center gap-3">
        <button
          onClick={() => setBaseDate((d) => subMonths(d, 1))}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F2F4F6] transition-all"
        >
          <ChevronLeft className="w-5 h-5 text-[#4E5968]" />
        </button>
        <h2 className="text-[16px] font-bold text-[#191F28] flex-1 text-center">
          {format(baseDate, "yyyy년 M월", { locale: ko })}
        </h2>
        <button
          onClick={() => setBaseDate((d) => addMonths(d, 1))}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F2F4F6] transition-all"
        >
          <ChevronRight className="w-5 h-5 text-[#4E5968]" />
        </button>
      </div>

      {/* 캘린더 */}
      <div className="px-4">
        <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm overflow-hidden">
          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 border-b border-slate-100">
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
          {isLoading ? (
            <div className="py-20 flex items-center justify-center">
              <div className="cat-spinner" />
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {calDays.map((day, idx) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const isCurrentMonth = isSameMonth(day, baseDate);
                const isTodayDate = isToday(day);
                const dayInfo = getDayInfo(dateStr);
                const hasMySlot = dayInfo.mySlots.length > 0;
                const hasTeam = dayInfo.teamSlots.length > 0;
                const hasEvent = dayInfo.events.length > 0;
                const att = attendance[dateStr];
                const worked = att?.clock_in != null;
                const done = att?.clock_out != null;
                // 결근: 과거 날짜 + 이번 달 + 스케줄 있음 + 출근 없음
                const isPastDay = isBefore(day, today);
                const isAbsent = hasMySlot && !worked && isPastDay && isCurrentMonth;

                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelectedDay(dateStr)}
                    className={`min-h-[72px] px-1 pt-1.5 pb-1 border-b border-r border-slate-100 flex flex-col transition-colors hover:bg-[#F9FAFB] active:bg-[#F2F4F6] ${
                      idx % 7 === 6 ? "border-r-0" : ""
                    } ${!isCurrentMonth ? "bg-[#FAFAFA]" : ""}`}
                  >
                    {/* 날짜 숫자 — 항상 최상단 중앙 */}
                    <div className="flex justify-center mb-0.5 shrink-0">
                      <span
                        className={`text-[11px] font-bold w-5 h-5 flex items-center justify-center rounded-full ${
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

                    {/* 회사 일정 뱃지 */}
                    {hasEvent && (
                      <div
                        className="text-[8px] font-bold px-1 py-0.5 rounded mb-0.5 truncate mx-0.5 leading-tight"
                        style={{
                          backgroundColor: dayInfo.events[0].color + "20",
                          color: dayInfo.events[0].color,
                        }}
                      >
                        {dayInfo.events[0].title}
                      </div>
                    )}

                    {/* 내 스케줄 / 근태 통합 블록 */}
                    {hasMySlot ? (
                      <div className="space-y-0.5">
                        {dayInfo.mySlots.map((slot) => {
                          const store = byId[slot.store_id];
                          const storeColor = store?.color || "#3182F6";
                          let bg: string, textCol: string, blockText: string;

                          const storeBgColor = store?.bg_color || storeColor + "20";
                          if (layers.myAttendance) {
                            if (done) {
                              // 퇴근 완료
                              bg = "#DCFCE7";
                              textCol = "#16A34A";
                              blockText = `✓ ${format(att!.clock_in!, "HH:mm")}`;
                            } else if (worked) {
                              // 출근 중
                              bg = storeColor + "30";
                              textCol = storeColor;
                              blockText = `↑ ${format(att!.clock_in!, "HH:mm")}`;
                            } else if (isAbsent) {
                              // 결근 (과거 날짜만)
                              bg = "#FEE2E2";
                              textCol = "#EF4444";
                              blockText = "결근";
                            } else {
                              // 예정 (미래 or 오늘)
                              bg = isCurrentMonth ? storeBgColor : storeColor + "12";
                              textCol = storeColor;
                              blockText = slot.start_time.slice(0, 5);
                            }
                          } else {
                            bg = isCurrentMonth ? storeBgColor : storeColor + "12";
                            textCol = storeColor;
                            blockText = slot.start_time.slice(0, 5);
                          }

                          const showBorder = !done && !isAbsent;
                          const isGlowing = highlightDate === dateStr;
                          return (
                            <div
                              key={slot.id}
                              className={`text-[9px] font-bold px-1 py-0.5 rounded truncate mx-0.5 leading-tight${isGlowing ? " animate-slot-glow" : ""}`}
                              style={{
                                backgroundColor: bg,
                                color: textCol,
                                borderLeft: showBorder ? `2px solid ${storeColor}` : undefined,
                              }}
                            >
                              {blockText}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* 스케줄 없이 출근한 경우 */
                      layers.myAttendance && worked && (
                        <div
                          className="text-[9px] font-bold px-1 py-0.5 rounded mx-0.5 leading-tight truncate"
                          style={{ backgroundColor: "#DCFCE7", color: "#16A34A" }}
                        >
                          {done
                            ? `✓ ${format(att!.clock_in!, "HH:mm")}`
                            : `↑ ${format(att!.clock_in!, "HH:mm")}`}
                        </div>
                      )
                    )}

                    {/* 팀 멤버 컬러 점 — 고정 높이로 정렬 일관성 유지 */}
                    <div className="h-3 flex items-center gap-0.5 mt-0.5 px-0.5">
                      {layers.team && hasTeam && (
                        <>
                          {dayInfo.teamSlots.slice(0, 3).map((ts) => (
                            <span
                              key={ts.id}
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: ts.profile_color || "#8B95A1" }}
                            />
                          ))}
                          {dayInfo.teamSlots.length > 3 && (
                            <span className="text-[7px] text-[#8B95A1] font-medium leading-none">
                              +{dayInfo.teamSlots.length - 3}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 범례 */}
      <div className="px-5 mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-[#8B95A1]">
        {layers.mySchedule && workplaces.length > 0 && (
          <span className="flex items-center gap-1.5 flex-wrap gap-y-1">
            {workplaces.map((wp) => (
              <span key={wp.id} className="flex items-center gap-1">
                <span
                  className="w-3 h-2 rounded-sm"
                  style={{ backgroundColor: wp.bg_color, borderLeft: `2px solid ${wp.color}` }}
                />
                <span style={{ color: wp.color }}>{wp.label}</span>
              </span>
            ))}
          </span>
        )}
        {layers.myAttendance && (
          <>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-2 rounded-sm bg-[#DCFCE7]" style={{ border: "1px solid #16A34A" }} />출근 완료
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-2 rounded-sm bg-[#FEE2E2]" style={{ border: "1px solid #EF4444" }} />결근
            </span>
          </>
        )}
        {layers.team && (
          <span className="flex items-center gap-1.5">
            <span className="flex gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#8B95A1]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#8B95A1]" />
            </span>
            팀 동료
          </span>
        )}
      </div>

      {/* 월별 요약 */}
      {!isLoading && (() => {
        const monthKey = format(baseDate, "yyyy-MM");
        const isThisMonth = monthKey === format(new Date(), "yyyy-MM");
        const monthSlots = mySlots.filter((s) => s.slot_date.slice(0, 7) === monthKey);
        const scheduledMins = monthSlots.reduce((sum, s) => {
          const [sh, sm] = s.start_time.split(":").map(Number);
          const [eh, em] = s.end_time.split(":").map(Number);
          return sum + (eh * 60 + em) - (sh * 60 + sm);
        }, 0);
        const workH = Math.floor(scheduledMins / 60);
        const workM = scheduledMins % 60;
        return (
          <div className="px-4 mt-4">
            <div className="bg-white rounded-[20px] border border-slate-100 p-4">
              <h3 className="text-[13px] font-bold text-[#8B95A1] mb-3">
                {isThisMonth ? "이번달 요약" : `${format(baseDate, "M")}월 요약`}
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <div className="text-[22px] font-bold text-[#191F28]">{monthSlots.length}</div>
                  <div className="text-[11px] text-[#8B95A1] mt-0.5">예정 근무</div>
                </div>
                <div className="text-center">
                  <div className="text-[22px] font-bold text-[#00B761]">
                    {Object.entries(attendance).filter(([d, a]) => d.slice(0, 7) === monthKey && a?.clock_in).length}
                  </div>
                  <div className="text-[11px] text-[#8B95A1] mt-0.5">출근 완료</div>
                </div>
                <div className="text-center">
                  <div className="text-[22px] font-bold text-[#3182F6]">{workH}</div>
                  <div className="text-[11px] text-[#8B95A1] mt-0.5">
                    {workM > 0 ? `시간 ${workM}분` : "시간"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 날짜 상세 시트 */}
      {selectedDay && selectedDayInfo && (
        <DayDetailSheet
          dateStr={selectedDay}
          dayInfo={selectedDayInfo}
          layers={layers}
          onClose={() => setSelectedDay(null)}
          highlightDate={highlightDate}
        />
      )}
    </div>
  );
}
