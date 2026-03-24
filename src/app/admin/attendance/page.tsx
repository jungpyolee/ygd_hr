"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase";
import {
  format,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  getWeekOfMonth,
  isBefore,
  startOfDay,
} from "date-fns";
import { ko } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  AlertCircle,
  LayoutGrid,
  CalendarDays,
  MapPin,
  PenLine,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkplaces } from "@/lib/hooks/useWorkplaces";
import { createNotification } from "@/lib/notifications";

interface ProcessedLog {
  profile_id: string;
  name: string;
  color_hex: string;
  store_name: string;
  clock_in: string | null;
  clock_out: string | null;
  distance_in: number | null;
  distance_out: number | null;
  attendance_type_in: string;
  attendance_type_out: string;
  reason_out: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  scheduled_location: string | null;
  late_minutes: number | null;
  is_absent: boolean;
  early_leave_minutes: number | null;
}


export default function AdminAttendanceCalendar() {
  const { byId } = useWorkplaces();
  const [viewType, setViewType] = useState<"week" | "month">("week");
  const [baseDate, setBaseDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [manualOutTarget, setManualOutTarget] = useState<{
    log: ProcessedLog;
    dateKey: string;
  } | null>(null);
  const [manualOutTime, setManualOutTime] = useState("");
  const [manualOutSubmitting, setManualOutSubmitting] = useState(false);

  const { startDate, endDate } = useMemo(() => {
    if (viewType === "week") {
      return {
        startDate: startOfWeek(baseDate, { weekStartsOn: 0 }),
        endDate: endOfWeek(baseDate, { weekStartsOn: 0 }),
      };
    } else {
      const monthStart = startOfMonth(baseDate);
      return {
        startDate: startOfWeek(monthStart, { weekStartsOn: 0 }),
        endDate: endOfWeek(endOfMonth(monthStart), { weekStartsOn: 0 }),
      };
    }
  }, [viewType, baseDate]);

  const rangeKey = `${format(startDate, "yyyy-MM-dd")}_${format(endDate, "yyyy-MM-dd")}`;

  const {
    data: logsByDate = {},
    isLoading: loading,
    error: attendanceError,
    mutate,
  } = useSWR(
    ["admin-attendance", rangeKey],
    async ([, range]) => {
      const supabase = createClient();
      const [start, end] = range.split("_");

      // [1] schedule_slots 먼저 조회 (status=active, substituted 제외)
      const { data: slotsData } = await supabase
        .from("schedule_slots")
        .select(
          "profile_id, slot_date, start_time, end_time, store_id, profiles!profile_id(name, color_hex)",
        )
        .eq("status", "active")
        .gte("slot_date", start)
        .lte("slot_date", end);

      // [2] 슬롯 기반 base 맵 생성 (is_absent=true 기본값)
      const grouped: Record<string, Map<string, ProcessedLog>> = {};

      (slotsData || []).forEach((slot: any) => {
        const slotDateStr = slot.slot_date;
        if (!grouped[slotDateStr]) grouped[slotDateStr] = new Map();
        const pId = slot.profile_id;
        if (!grouped[slotDateStr].has(pId)) {
          grouped[slotDateStr].set(pId, {
            profile_id: pId,
            name: slot.profiles?.name || "알 수 없음",
            color_hex: slot.profiles?.color_hex || "#8B95A1",
            store_name: "—",
            clock_in: null,
            clock_out: null,
            distance_in: null,
            distance_out: null,
            attendance_type_in: "regular",
            attendance_type_out: "regular",
            reason_out: null,
            scheduled_start: slot.start_time,
            scheduled_end: slot.end_time,
            scheduled_location: slot.store_id,
            late_minutes: null,
            is_absent: true,
            early_leave_minutes: null,
          });
        }
      });

      // [3] attendance_logs 조회
      // KST(UTC+9) 자정 기준으로 변환 — new Date("yyyy-MM-dd")는 UTC 자정이므로
      // 오전 9시 이전 KST 출근 로그가 누락되는 버그 방지
      const startStr = new Date(`${start}T00:00:00+09:00`).toISOString();
      const endStr = new Date(`${end}T23:59:59.999+09:00`).toISOString();

      const { data, error } = await supabase
        .from("attendance_logs")
        .select(
          `id, profile_id, type, created_at, distance_m, attendance_type, reason, profiles(name, color_hex), check_in_store:stores!check_in_store_id(name)`,
        )
        .gte("created_at", startStr)
        .lte("created_at", endStr)
        .order("created_at", { ascending: true });

      if (error) throw error;

      if (data) {
        // [4] 출근 기록으로 base 맵 덮어쓰기 → is_absent=false
        data.forEach((log: any) => {
          const dateKey = format(new Date(log.created_at), "yyyy-MM-dd");
          if (!grouped[dateKey]) grouped[dateKey] = new Map();
          const pId = log.profile_id;

          if (!grouped[dateKey].has(pId)) {
            grouped[dateKey].set(pId, {
              profile_id: pId,
              name: log.profiles?.name || "알 수 없음",
              color_hex: log.profiles?.color_hex || "#8B95A1",
              store_name: log.check_in_store?.name || "알 수 없음",
              clock_in: null,
              clock_out: null,
              distance_in: null,
              distance_out: null,
              attendance_type_in: "regular",
              attendance_type_out: "regular",
              reason_out: null,
              scheduled_start: null,
              scheduled_end: null,
              scheduled_location: null,
              late_minutes: null,
              is_absent: false,
              early_leave_minutes: null,
            });
          }

          const userLog = grouped[dateKey].get(pId)!;

          if (log.type === "IN" && !userLog.clock_in) {
            userLog.clock_in = log.created_at;
            userLog.distance_in = log.distance_m ?? null;
            userLog.attendance_type_in = log.attendance_type || "regular";
            userLog.store_name = log.check_in_store?.name || "알 수 없음";
            userLog.is_absent = false;

            if (userLog.scheduled_start) {
              const [sh, sm] = userLog.scheduled_start.split(":").map(Number);
              const clockInDate = new Date(log.created_at);
              const schedStart = new Date(
                `${dateKey}T${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}:00`,
              );
              const diffMin = Math.floor(
                (clockInDate.getTime() - schedStart.getTime()) / 60000,
              );
              userLog.late_minutes = diffMin > 10 ? diffMin : null;
            }
          }
          if (log.type === "OUT") {
            userLog.clock_out = log.created_at;
            userLog.distance_out = log.distance_m ?? null;
            userLog.attendance_type_out = log.attendance_type || "regular";
            userLog.reason_out = log.reason ?? null;

            if (userLog.scheduled_end && userLog.clock_out) {
              const [eh, em] = userLog.scheduled_end.split(":").map(Number);
              const clockOutDate = new Date(userLog.clock_out);
              const schedEnd = new Date(
                `${dateKey}T${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}:00`,
              );
              const diff = Math.floor(
                (schedEnd.getTime() - clockOutDate.getTime()) / 60000,
              );
              userLog.early_leave_minutes = diff > 10 ? diff : null;
            }
          }
        });
      }

      const finalData: Record<string, ProcessedLog[]> = {};
      Object.keys(grouped).forEach((key) => {
        finalData[key] = Array.from(grouped[key].values());
      });
      return finalData;
    },
    { dedupingInterval: 60_000, revalidateOnFocus: false },
  );

  const getContrastYIQ = (hexcolor: string) => {
    const hex = hexcolor.replace("#", "");
    if (hex.length !== 6) return "#FFFFFF";
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? "#191F28" : "#FFFFFF";
  };

  const getCalendarDays = () => {
    if (viewType === "week") {
      return eachDayOfInterval({
        start: startOfWeek(baseDate, { weekStartsOn: 0 }),
        end: endOfWeek(baseDate, { weekStartsOn: 0 }),
      });
    } else {
      const monthStart = startOfMonth(baseDate);
      return eachDayOfInterval({
        start: startOfWeek(monthStart, { weekStartsOn: 0 }),
        end: endOfWeek(endOfMonth(monthStart), { weekStartsOn: 0 }),
      });
    }
  };
  const calendarDays = getCalendarDays();

  const handlePrev = () =>
    setBaseDate((prev) =>
      viewType === "week" ? subWeeks(prev, 1) : subMonths(prev, 1),
    );
  const handleNext = () =>
    setBaseDate((prev) =>
      viewType === "week" ? addWeeks(prev, 1) : addMonths(prev, 1),
    );
  const handleToday = () => {
    setBaseDate(new Date());
    setSelectedDate(new Date());
  };

  const openManualOut = (log: ProcessedLog, dateKey: string) => {
    const defaultTime = log.scheduled_end
      ? log.scheduled_end.slice(0, 5)
      : "18:00";
    setManualOutTime(defaultTime);
    setManualOutTarget({ log, dateKey });
  };

  const handleManualOut = async () => {
    if (!manualOutTarget || !manualOutTime) return;
    setManualOutSubmitting(true);
    const supabase = createClient();
    const { log, dateKey } = manualOutTarget;
    const clockOutDate = new Date(`${dateKey}T${manualOutTime}:00`);

    const { error } = await supabase.from("attendance_logs").insert({
      profile_id: log.profile_id,
      type: "OUT",
      attendance_type: "fallback_out",
      created_at: clockOutDate.toISOString(),
      reason: "관리자 수동 처리",
    });

    if (error) {
      toast.error("퇴근 처리에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } else {
      toast.success(`${log.name}님 퇴근 처리가 완료됐어요.`);
      await createNotification({
        profile_id: log.profile_id,
        target_role: "employee",
        type: "attendance_fallback_out",
        title: "퇴근 처리 완료",
        content: "관리자가 퇴근 처리했어요.",
        source_id: log.profile_id,
      });
      setManualOutTarget(null);
      mutate();
    }
    setManualOutSubmitting(false);
  };

  const selectedDateKey = format(selectedDate, "yyyy-MM-dd");
  const selectedLogs = logsByDate[selectedDateKey] || [];
  const presentCount = selectedLogs.filter((l) => !l.is_absent).length;
  const absentCount = selectedLogs.filter(
    (l) => l.is_absent && isBefore(selectedDate, startOfDay(new Date())),
  ).length;

  if (attendanceError)
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-[15px] font-semibold text-[#8B95A1]">근태 데이터를 불러오지 못했어요</p>
        <button
          onClick={() => mutate()}
          className="text-[14px] text-[#3182F6] font-medium"
        >
          다시 시도하기
        </button>
      </div>
    );

  return (
    <div className="max-w-5xl animate-in fade-in duration-500 pb-20">
      {/* 헤더 & 컨트롤 */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#191F28] mb-1">
            스마트 근태 캘린더
          </h1>
          <p className="text-[14px] text-[#8B95A1]">
            날짜를 선택해 직원들의 상세 출퇴근을 확인하세요.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          <div className="flex bg-[#F2F4F6] p-1 rounded-xl shrink-0">
            <button
              onClick={() => setViewType("week")}
              className={`flex-1 sm:flex-none flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-bold transition-all ${viewType === "week" ? "bg-white text-[#191F28] shadow-sm" : "text-[#8B95A1]"}`}
            >
              <LayoutGrid className="w-4 h-4" /> 주간
            </button>
            <button
              onClick={() => setViewType("month")}
              className={`flex-1 sm:flex-none flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-bold transition-all ${viewType === "month" ? "bg-white text-[#191F28] shadow-sm" : "text-[#8B95A1]"}`}
            >
              <CalendarDays className="w-4 h-4" /> 월간
            </button>
          </div>

          <div className="flex items-center justify-between sm:justify-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
            <button
              onClick={handlePrev}
              className="p-1.5 text-[#8B95A1] hover:bg-[#F2F4F6] rounded-lg"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="min-w-[100px] text-center font-bold text-[#191F28] text-[14px]">
              {viewType === "month"
                ? format(baseDate, "yyyy년 M월")
                : `${format(baseDate, "M월")} ${getWeekOfMonth(baseDate)}주차`}
            </span>
            <button
              onClick={handleNext}
              className="p-1.5 text-[#8B95A1] hover:bg-[#F2F4F6] rounded-lg"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={handleToday}
              className="ml-1 px-2.5 py-1.5 text-[12px] font-bold text-[#3182F6] bg-[#E8F3FF] rounded-lg shrink-0"
            >
              오늘
            </button>
          </div>
        </div>
      </div>

      {/* 캘린더 영역 */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-8 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-100 bg-[#F9FAFB]">
          {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
            <div
              key={day}
              className="py-2.5 sm:py-3 text-center text-[12px] sm:text-[13px] font-semibold text-[#8B95A1]"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 relative">
          {loading && (
            <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-20 flex items-center justify-center">
              <div className="cat-spinner-lg" />
            </div>
          )}
          {calendarDays.map((day, idx) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const dayLogs = logsByDate[dateStr] || [];
            const isSelected = isSameDay(day, selectedDate);
            const isCurrentMonth = isSameMonth(day, baseDate);
            const isDayPast = isBefore(day, startOfDay(new Date()));

            const isBottomLeft = idx === calendarDays.length - 7;
            const isBottomRight = idx === calendarDays.length - 1;
            const cornerClass = isBottomLeft
              ? "rounded-bl-2xl"
              : isBottomRight
                ? "rounded-br-2xl"
                : "";

            // 달력 뱃지: 출근자 + 과거 결근자만 표시 (미래 결근 제외)
            const visibleLogs = dayLogs.filter(
              (l) => !l.is_absent || isDayPast,
            );

            return (
              <div
                key={dateStr}
                onClick={() => setSelectedDate(day)}
                className={`min-h-[85px] sm:min-h-[100px] p-1 sm:p-1.5 border-b border-r border-slate-50 cursor-pointer transition-colors flex flex-col items-center overflow-hidden relative ${cornerClass}
                  ${isSelected ? "bg-[#F0F6FF] ring-2 ring-[#3182F6] ring-inset z-10" : "hover:bg-[#F9FAFB] z-0"}
                  ${!isCurrentMonth && viewType === "month" ? "opacity-40 bg-slate-50" : ""}
                `}
              >
                <div className="mb-1 sm:mb-1.5 mt-0.5">
                  <span
                    className={`w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full text-[12px] sm:text-[13px] font-bold ${isToday(day) ? "bg-[#3182F6] text-white" : isSelected ? "text-[#3182F6]" : "text-[#4E5968]"}`}
                  >
                    {format(day, "d")}
                  </span>
                </div>

                <div className="w-full flex flex-col gap-[2px] px-0.5 sm:px-1">
                  {visibleLogs.slice(0, 3).map((log) => {
                    if (log.is_absent) {
                      return (
                        <div
                          key={log.profile_id}
                          className="w-full truncate text-center rounded-[4px] px-1 py-[3px] sm:py-1 text-[9px] sm:text-[11px] font-bold border border-[#FFCDD2] text-[#E03131] bg-white"
                        >
                          {log.name}
                        </div>
                      );
                    }
                    const textColor = getContrastYIQ(log.color_hex);
                    return (
                      <div
                        key={log.profile_id}
                        className="w-full truncate text-center rounded-[4px] px-1 py-[3px] sm:py-1 text-[9px] sm:text-[11px] font-bold shadow-sm"
                        style={{
                          backgroundColor: log.color_hex,
                          color: textColor,
                        }}
                      >
                        {log.name}
                      </div>
                    );
                  })}

                  {visibleLogs.length > 3 && (
                    <div className="w-full text-center rounded-[4px] py-[2px] sm:py-1 text-[9px] sm:text-[11px] font-bold bg-[#F2F4F6] text-[#6B7684]">
                      +{visibleLogs.length - 3}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 선택된 날짜 상세 기록 */}
      <div className="mt-8">
        <h3 className="text-[18px] font-bold text-[#191F28] mb-4 flex items-center gap-2 flex-wrap">
          {format(selectedDate, "M월 d일 (EEE)", { locale: ko })} 출근 기록
          <span className="text-[#3182F6] bg-[#E8F3FF] px-2.5 py-0.5 rounded-full text-[13px] font-semibold">
            출근 {presentCount}명
          </span>
          {absentCount > 0 && (
            <span className="text-[#E03131] bg-[#FFEBEB] px-2.5 py-0.5 rounded-full text-[13px] font-semibold">
              미출근 {absentCount}명
            </span>
          )}
        </h3>

        {selectedLogs.length === 0 ? (
          <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm py-16 text-center">
            <p className="text-[#8B95A1] text-[15px] font-medium">
              이 날은 근무 예정이 없어요.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {selectedLogs.map((log) => {
              // 결근 카드 (과거 날짜만)
              if (log.is_absent) {
                if (!isBefore(selectedDate, startOfDay(new Date())))
                  return null;
                return (
                  <div
                    key={log.profile_id}
                    className="bg-[#FFF5F5] rounded-[20px] p-5 flex items-center gap-4 border-2 border-[#FFCDD2]"
                  >
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-[16px] font-bold text-white shadow-sm shrink-0"
                      style={{ backgroundColor: log.color_hex }}
                    >
                      {log.name?.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-[16px] font-bold text-[#191F28]">
                          {log.name}
                        </p>
                        <span className="text-[11px] font-bold bg-[#FFCDD2] text-[#E03131] px-2 py-0.5 rounded-md">
                          미출근
                        </span>
                      </div>
                      {log.scheduled_start && (
                        <p className="text-[13px] text-[#8B95A1]">
                          예정: {log.scheduled_start.slice(0, 5)} ~{" "}
                          {log.scheduled_end?.slice(0, 5)}
                          {log.scheduled_location && (
                            <span className="ml-1">
                              (
                              {byId[log.scheduled_location]?.label ??
                                log.scheduled_location}
                              )
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                );
              }

              // 출근 카드 (기존)
              const isWorking = !log.clock_out;
              const isAnomaly = isWorking && !isToday(selectedDate);
              const canManualOut = isWorking;

              let durationText = "";
              if (log.clock_in && log.clock_out) {
                const diffMs =
                  new Date(log.clock_out).getTime() -
                  new Date(log.clock_in).getTime();
                const hours = Math.floor(diffMs / (1000 * 60 * 60));
                const minutes = Math.floor(
                  (diffMs % (1000 * 60 * 60)) / (1000 * 60),
                );
                durationText = `${hours}시간 ${minutes > 0 ? `${minutes}분` : ""}`;
              }

              return (
                <div
                  key={log.profile_id}
                  className="bg-white rounded-[20px] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-5 border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)] transition-all"
                >
                  {/* 프로필 */}
                  <div className="flex items-center gap-4">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-[16px] font-bold text-white shadow-sm shrink-0"
                      style={{ backgroundColor: log.color_hex }}
                    >
                      {log.name?.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-[16px] font-bold text-[#191F28]">
                          {log.name}
                        </p>
                        {isAnomaly && (
                          <span className="flex items-center gap-1 bg-[#FFF4E6] text-[#D9480F] text-[11px] font-bold px-2 py-0.5 rounded-md">
                            <AlertCircle className="w-3 h-3" /> 미퇴근
                          </span>
                        )}
                        {canManualOut && (
                          <button
                            onClick={() => openManualOut(log, selectedDateKey)}
                            className="flex items-center gap-1 bg-[#F3F0FF] text-[#7950F2] text-[11px] font-bold px-2 py-0.5 rounded-md hover:bg-[#E9DFFF] transition-colors"
                          >
                            <PenLine className="w-3 h-3" /> 퇴근 처리
                          </button>
                        )}
                      </div>
                      <p className="text-[13px] font-medium text-[#8B95A1]">
                        {log.store_name}
                      </p>
                    </div>
                  </div>

                  {/* 스케줄 정보 */}
                  {log.scheduled_start && (
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] text-[#8B95A1] font-medium">
                        스케줄:
                      </span>
                      <span
                        className="text-[12px] font-bold"
                        style={{
                          color: log.scheduled_location
                            ? byId[log.scheduled_location]?.color || "#4E5968"
                            : "#4E5968",
                        }}
                      >
                        {log.scheduled_location
                          ? byId[log.scheduled_location]?.label || log.scheduled_location
                          : ""}
                      </span>
                      <span className="text-[12px] text-[#4E5968] font-medium">
                        {log.scheduled_start.slice(0, 5)}~
                        {log.scheduled_end?.slice(0, 5)}
                      </span>
                      {log.late_minutes !== null && log.late_minutes > 0 && (
                        <span className="text-[11px] font-bold bg-[#FFF7E6] text-[#F59E0B] px-2 py-0.5 rounded-md">
                          +{log.late_minutes}분 지각
                        </span>
                      )}
                      {log.early_leave_minutes !== null &&
                        log.early_leave_minutes > 0 && (
                          <span className="text-[11px] font-bold bg-[#FFF4E6] text-[#D9480F] px-2 py-0.5 rounded-md">
                            -{log.early_leave_minutes}분 조기퇴근
                          </span>
                        )}
                    </div>
                  )}

                  {/* 출퇴근 타임라인 */}
                  <div className="flex flex-col sm:items-end gap-2.5">
                    <div className="flex items-center gap-2.5 text-[15px] font-bold">
                      <span className="text-[#333D4B] bg-[#F2F4F6] px-3.5 py-2 rounded-xl">
                        {log.clock_in
                          ? format(new Date(log.clock_in), "a h:mm", {
                              locale: ko,
                            })
                          : "-"}
                      </span>
                      <span className="text-[#D1D6DB] text-[12px]">▶</span>
                      <span
                        className={`px-3.5 py-2 rounded-xl ${log.clock_out ? "bg-[#F2F4F6] text-[#333D4B]" : isAnomaly ? "bg-[#FFF4E6] text-[#D9480F]" : "bg-[#E8F3FF] text-[#3182F6]"}`}
                      >
                        {log.clock_out
                          ? format(new Date(log.clock_out), "a h:mm", {
                              locale: ko,
                            })
                          : isAnomaly
                            ? "기록없음"
                            : "근무 중"}
                      </span>
                    </div>

                    {durationText && (
                      <p className="text-[12px] font-semibold text-[#8B95A1] flex items-center gap-1.5 pr-1">
                        <Clock className="w-3.5 h-3.5" />총{" "}
                        <span className="text-[#4E5968]">{durationText}</span>{" "}
                        근무했어요
                      </p>
                    )}

                    {(log.distance_in != null || log.distance_out != null) && (
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {log.distance_in != null && (
                          <span className="flex items-center gap-1 text-[11px] text-[#8B95A1]">
                            <MapPin className="w-3 h-3" />
                            출근 {Math.round(log.distance_in)}m
                          </span>
                        )}
                        {log.distance_out != null && (
                          <span className="flex items-center gap-1 text-[11px] text-[#8B95A1]">
                            <MapPin className="w-3 h-3" />
                            퇴근 {Math.round(log.distance_out)}m
                          </span>
                        )}
                      </div>
                    )}

                    {(log.attendance_type_in !== "regular" ||
                      log.attendance_type_out !== "regular") && (
                      <div className="flex gap-1.5 flex-wrap justify-end">
                        {log.attendance_type_in === "business_trip_in" && (
                          <span className="text-[11px] font-bold bg-[#FFF3BF] text-[#E67700] px-2 py-0.5 rounded-md">
                            ✈️ 출장출근
                          </span>
                        )}
                        {log.attendance_type_in === "fallback_in" && (
                          <span className="text-[11px] font-bold bg-[#F3F0FF] text-[#7950F2] px-2 py-0.5 rounded-md">
                            ⚠️ 수동출근
                          </span>
                        )}
                        {log.attendance_type_out === "remote_out" && (
                          <span className="text-[11px] font-bold bg-[#FFE3E3] text-[#C92A2A] px-2 py-0.5 rounded-md">
                            📍 원격퇴근
                          </span>
                        )}
                        {log.attendance_type_out === "business_trip_out" && (
                          <span className="text-[11px] font-bold bg-[#FFF3BF] text-[#E67700] px-2 py-0.5 rounded-md">
                            ✈️ 출장퇴근
                          </span>
                        )}
                        {log.attendance_type_out === "fallback_out" && (
                          <span className="text-[11px] font-bold bg-[#F3F0FF] text-[#7950F2] px-2 py-0.5 rounded-md">
                            ⚠️ 수동퇴근
                          </span>
                        )}
                      </div>
                    )}

                    {log.reason_out && (
                      <p className="text-[11px] text-[#8B95A1] text-right pr-1">
                        사유:{" "}
                        <span className="text-[#4E5968] font-medium">
                          {log.reason_out}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 수동 퇴근 처리 모달 */}
      {manualOutTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setManualOutTarget(null)}
          />
          <div className="relative bg-white rounded-[24px] shadow-xl w-full max-w-sm p-6 flex flex-col gap-5">
            {/* 헤더 */}
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-bold text-[#191F28]">
                퇴근 시간 수동 입력
              </h2>
              <button
                onClick={() => setManualOutTarget(null)}
                className="p-1.5 text-[#8B95A1] hover:bg-[#F2F4F6] rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 직원 정보 */}
            <div className="flex items-center gap-3 bg-[#F9FAFB] rounded-[16px] p-3.5">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-[14px] font-bold text-white shrink-0"
                style={{ backgroundColor: manualOutTarget.log.color_hex }}
              >
                {manualOutTarget.log.name?.charAt(0)}
              </div>
              <div>
                <p className="text-[15px] font-bold text-[#191F28]">
                  {manualOutTarget.log.name}
                </p>
                <p className="text-[12px] text-[#8B95A1]">
                  {format(selectedDate, "M월 d일 (EEE)", { locale: ko })}
                  {manualOutTarget.log.scheduled_end && (
                    <span className="ml-1.5">
                      · 예정 퇴근{" "}
                      {manualOutTarget.log.scheduled_end.slice(0, 5)}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* 시간 입력 */}
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-semibold text-[#4E5968]">
                퇴근 시간
              </label>
              <input
                type="time"
                value={manualOutTime}
                onChange={(e) => setManualOutTime(e.target.value)}
                className="w-full border border-[#E5E8EB] rounded-[12px] px-4 py-3 text-[16px] font-bold text-[#191F28] focus:outline-none focus:border-[#3182F6] focus:ring-2 focus:ring-[#3182F6]/20"
              />
            </div>

            {/* 버튼 */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setManualOutTarget(null)}
                className="flex-1 py-3 rounded-[12px] text-[15px] font-bold text-[#4E5968] bg-[#F2F4F6] hover:bg-[#E5E8EB] transition-colors"
              >
                취소하기
              </button>
              <button
                onClick={handleManualOut}
                disabled={!manualOutTime || manualOutSubmitting}
                className="flex-1 py-3 rounded-[12px] text-[15px] font-bold text-white bg-[#3182F6] hover:bg-[#1B6EE6] disabled:opacity-50 transition-colors"
              >
                {manualOutSubmitting ? "처리 중..." : "처리하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
