"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";

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
}

export default function AdminAttendanceCalendar() {
  const [viewType, setViewType] = useState<"week" | "month">("week");
  const [baseDate, setBaseDate] = useState<Date>(new Date()); // 달력 기준 날짜
  const [selectedDate, setSelectedDate] = useState<Date>(new Date()); // 클릭해서 상세를 볼 날짜

  const [logsByDate, setLogsByDate] = useState<Record<string, ProcessedLog[]>>(
    {}
  );
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    fetchLogsForCalendar(baseDate, viewType);
  }, [baseDate, viewType]);

  const fetchLogsForCalendar = async (date: Date, type: "week" | "month") => {
    setLoading(true);

    // 현재 달력에 보이는 시작일과 종료일 계산 (DB 조회 범위 최소화)
    let startDate, endDate;
    if (type === "week") {
      startDate = startOfWeek(date, { weekStartsOn: 0 }); // 일요일 시작
      endDate = endOfWeek(date, { weekStartsOn: 0 });
    } else {
      const monthStart = startOfMonth(date);
      startDate = startOfWeek(monthStart, { weekStartsOn: 0 });
      endDate = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 0 });
    }

    const startStr = startDate.toISOString();
    const endStr = new Date(new Date(endDate).setHours(23, 59, 59, 999)).toISOString();

    const { data, error } = await supabase
      .from("attendance_logs")
      .select(
        `id, profile_id, type, created_at, distance_m, attendance_type, reason, profiles (name, color_hex), stores (name)`
      )
      .gte("created_at", startStr)
      .lte("created_at", endStr)
      .order("created_at", { ascending: true });

    if (!error && data) {
      // 날짜별(YYYY-MM-DD)로 데이터 그룹핑
      const grouped: Record<string, Map<string, ProcessedLog>> = {};

      data.forEach((log: any) => {
        // KST 기준 날짜(YYYY-MM-DD) 문자열 추출
        const dateKey = format(new Date(log.created_at), "yyyy-MM-dd");
        if (!grouped[dateKey]) grouped[dateKey] = new Map();

        const pId = log.profile_id;
        if (!grouped[dateKey].has(pId)) {
          grouped[dateKey].set(pId, {
            profile_id: pId,
            name: log.profiles?.name || "알 수 없음",
            color_hex: log.profiles?.color_hex || "#8B95A1",
            store_name: log.stores?.name || "알 수 없음",
            clock_in: null,
            clock_out: null,
            distance_in: null,
            distance_out: null,
            attendance_type_in: "regular",
            attendance_type_out: "regular",
            reason_out: null,
          });
        }

        const userLog = grouped[dateKey].get(pId)!;
        if (log.type === "IN" && !userLog.clock_in) {
          userLog.clock_in = log.created_at;
          userLog.distance_in = log.distance_m ?? null;
          userLog.attendance_type_in = log.attendance_type || "regular";
        }
        if (log.type === "OUT") {
          userLog.clock_out = log.created_at;
          userLog.distance_out = log.distance_m ?? null;
          userLog.attendance_type_out = log.attendance_type || "regular";
          userLog.reason_out = log.reason ?? null;
        }
      });

      // Map을 Array로 변환하여 State 저장
      const finalData: Record<string, ProcessedLog[]> = {};
      Object.keys(grouped).forEach((key) => {
        finalData[key] = Array.from(grouped[key].values());
      });
      setLogsByDate(finalData);
    }
    setLoading(false);
  };

  // 🚀 추가: 배경색(Hex)의 밝기를 계산해서 검정/흰색 텍스트 중 잘 보이는 색을 반환하는 마법의 함수
  const getContrastYIQ = (hexcolor: string) => {
    const hex = hexcolor.replace("#", "");
    if (hex.length !== 6) return "#FFFFFF";
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    // 밝기가 128 이상이면(밝은색이면) 진한 회색 글씨, 어두우면 흰 글씨
    return yiq >= 128 ? "#191F28" : "#FFFFFF";
  };

  // interface ProcessedLog { ... }

  // 🚀 달력 그리기 로직
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

  // 이동 핸들러
  const handlePrev = () =>
    setBaseDate((prev) =>
      viewType === "week" ? subWeeks(prev, 1) : subMonths(prev, 1)
    );
  const handleNext = () =>
    setBaseDate((prev) =>
      viewType === "week" ? addWeeks(prev, 1) : addMonths(prev, 1)
    );
  const handleToday = () => {
    setBaseDate(new Date());
    setSelectedDate(new Date());
  };

  const selectedDateKey = format(selectedDate, "yyyy-MM-dd");
  const selectedLogs = logsByDate[selectedDateKey] || [];

  return (
    <div className="max-w-5xl animate-in fade-in duration-500 pb-20">
      {/* 🚀 1. 헤더 & 컨트롤 (모바일 반응형으로 개선) */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#191F28] mb-1">
            스마트 근태 캘린더
          </h1>
          <p className="text-[14px] text-[#8B95A1]">
            날짜를 선택해 직원들의 상세 출퇴근을 확인하세요.
          </p>
        </div>

        {/* 모바일에서는 위아래로 분리, PC에서는 옆으로 나란히 */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          {/* 주간/월간 토글 */}
          <div className="flex bg-[#F2F4F6] p-1 rounded-xl shrink-0">
            <button
              onClick={() => setViewType("week")}
              className={`flex-1 sm:flex-none flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-bold transition-all ${
                viewType === "week"
                  ? "bg-white text-[#191F28] shadow-sm"
                  : "text-[#8B95A1]"
              }`}
            >
              <LayoutGrid className="w-4 h-4" /> 주간
            </button>
            <button
              onClick={() => setViewType("month")}
              className={`flex-1 sm:flex-none flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-bold transition-all ${
                viewType === "month"
                  ? "bg-white text-[#191F28] shadow-sm"
                  : "text-[#8B95A1]"
              }`}
            >
              <CalendarDays className="w-4 h-4" /> 월간
            </button>
          </div>

          {/* 날짜 네비게이터 */}
          {/* 🚀 수정 1: 날짜 네비게이터 (w주차 -> getWeekOfMonth 사용) */}
          <div className="flex items-center justify-between sm:justify-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
            <button
              onClick={handlePrev}
              className="p-1.5 text-[#8B95A1] hover:bg-[#F2F4F6] rounded-lg"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="min-w-[100px] text-center font-bold text-[#191F28] text-[14px]">
              {/* 💡 format 'w' 대신 getWeekOfMonth()를 써서 이번 달의 주차를 구합니다. */}
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
        {/* 요일 헤더 */}
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

        {/* 날짜 그리드 */}
        <div className="grid grid-cols-7 relative">
          {loading && (
            <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-20 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-[#3182F6] border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {calendarDays.map((day, idx) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const dayLogs = logsByDate[dateStr] || [];
            const isSelected = isSameDay(day, selectedDate);
            const isCurrentMonth = isSameMonth(day, baseDate);

            // 🚀 수정 2: 구석 칸 테두리 잘림 방지 로직 (부모의 둥근 모서리와 동일한 둥글기 부여)
            const isBottomLeft = idx === calendarDays.length - 7;
            const isBottomRight = idx === calendarDays.length - 1;
            const cornerClass = isBottomLeft
              ? "rounded-bl-2xl"
              : isBottomRight
              ? "rounded-br-2xl"
              : "";

            return (
              <div
                key={dateStr}
                onClick={() => setSelectedDate(day)}
                // 💡 z-index(z-10)와 모서리 둥글기(cornerClass)를 추가해서 테두리가 완벽하게 보이게 합니다.
                className={`min-h-[85px] sm:min-h-[100px] p-1 sm:p-1.5 border-b border-r border-slate-50 cursor-pointer transition-colors flex flex-col items-center overflow-hidden relative ${cornerClass}
                  ${
                    isSelected
                      ? "bg-[#F0F6FF] ring-2 ring-[#3182F6] ring-inset z-10"
                      : "hover:bg-[#F9FAFB] z-0"
                  }
                  ${
                    !isCurrentMonth && viewType === "month"
                      ? "opacity-40 bg-slate-50"
                      : ""
                  }
                `}
              >
                {/* 날짜 숫자 */}
                <div className="mb-1 sm:mb-1.5 mt-0.5">
                  <span
                    className={`w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full text-[12px] sm:text-[13px] font-bold
                    ${
                      isToday(day)
                        ? "bg-[#3182F6] text-white"
                        : isSelected
                        ? "text-[#3182F6]"
                        : "text-[#4E5968]"
                    }
                  `}
                  >
                    {format(day, "d")}
                  </span>
                </div>

                {/* 🚀 이름표 뱃지 */}
                <div className="w-full flex flex-col gap-[2px] px-0.5 sm:px-1">
                  {dayLogs.slice(0, 3).map((log) => {
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

                  {dayLogs.length > 3 && (
                    <div className="w-full text-center rounded-[4px] py-[2px] sm:py-1 text-[9px] sm:text-[11px] font-bold bg-[#F2F4F6] text-[#6B7684]">
                      +{dayLogs.length - 3}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 🚀 선택된 날짜의 상세 기록 (하단 리스트) */}
      <div className="mt-8">
        <h3 className="text-[18px] font-bold text-[#191F28] mb-4 flex items-center gap-2">
          {format(selectedDate, "M월 d일 (EEE)", { locale: ko })} 출근 기록
          <span className="text-[#3182F6] bg-[#E8F3FF] px-2.5 py-0.5 rounded-full text-[13px] font-semibold">
            {selectedLogs.length}명
          </span>
        </h3>

        {selectedLogs.length === 0 ? (
          <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm py-16 text-center">
            <p className="text-[#8B95A1] text-[15px] font-medium">
              이 날은 출근 기록이 없어요.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {selectedLogs.map((log) => {
              const isWorking = !log.clock_out;
              const isAnomaly = isWorking && !isToday(selectedDate);

              // 💡 5년차 디테일: 총 근무 시간 자동 계산
              let durationText = "";
              if (log.clock_in && log.clock_out) {
                const diffMs =
                  new Date(log.clock_out).getTime() -
                  new Date(log.clock_in).getTime();
                const hours = Math.floor(diffMs / (1000 * 60 * 60));
                const minutes = Math.floor(
                  (diffMs % (1000 * 60 * 60)) / (1000 * 60)
                );
                durationText = `${hours}시간 ${
                  minutes > 0 ? `${minutes}분` : ""
                }`;
              }

              return (
                // 🚀 핵심: 밋밋한 리스트가 아닌 독립된 둥근 카드(Squircle) + 그림자 호버 효과
                <div
                  key={log.profile_id}
                  className="bg-white rounded-[20px] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-5 border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)] transition-all"
                >
                  {/* 1. 프로필 영역 */}
                  <div className="flex items-center gap-4">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-[16px] font-bold text-white shadow-sm shrink-0"
                      style={{ backgroundColor: log.color_hex }}
                    >
                      {log.name.charAt(0)}
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
                      </div>
                      <p className="text-[13px] font-medium text-[#8B95A1]">
                        {log.store_name}
                      </p>
                    </div>
                  </div>

                  {/* 2. 출퇴근 타임라인 영역 (토스식) */}
                  <div className="flex flex-col sm:items-end gap-2.5">
                    <div className="flex items-center gap-2.5 text-[15px] font-bold">
                      {/* 출근 블록 */}
                      <span className="text-[#333D4B] bg-[#F2F4F6] px-3.5 py-2 rounded-xl">
                        {log.clock_in
                          ? format(new Date(log.clock_in), "a h:mm", {
                              locale: ko,
                            })
                          : "-"}
                      </span>

                      {/* 진행 화살표 */}
                      <span className="text-[#D1D6DB] text-[12px]">▶</span>

                      {/* 퇴근 블록 (상태에 따라 색상 변화) */}
                      <span
                        className={`px-3.5 py-2 rounded-xl ${
                          log.clock_out
                            ? "bg-[#F2F4F6] text-[#333D4B]"
                            : isAnomaly
                            ? "bg-[#FFF4E6] text-[#D9480F]"
                            : "bg-[#E8F3FF] text-[#3182F6]"
                        }`}
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

                    {/* 3. 총 근무시간 요약 */}
                    {durationText && (
                      <p className="text-[12px] font-semibold text-[#8B95A1] flex items-center gap-1.5 pr-1">
                        <Clock className="w-3.5 h-3.5" />총{" "}
                        <span className="text-[#4E5968]">{durationText}</span>{" "}
                        근무했어요
                      </p>
                    )}

                    {/* 4. 거리 표시 (어드민 전용) */}
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

                    {/* 5. 출결 유형 뱃지 */}
                    {(log.attendance_type_in !== "regular" ||
                      log.attendance_type_out !== "regular") && (
                      <div className="flex gap-1.5 flex-wrap justify-end">
                        {log.attendance_type_in === "business_trip_in" && (
                          <span className="text-[11px] font-bold bg-[#FFF3BF] text-[#E67700] px-2 py-0.5 rounded-md">
                            ✈️ 출장출근
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
                      </div>
                    )}

                    {/* 6. 퇴근 사유 (원격/출장퇴근 시) */}
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
    </div>
  );
}
