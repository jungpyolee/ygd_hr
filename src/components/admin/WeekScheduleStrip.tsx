"use client";

import useSWR from "swr";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  format,
  startOfWeek,
  addDays,
  isSameDay,
} from "date-fns";
import { ko } from "date-fns/locale";

interface DayData {
  date: Date;
  dateStr: string;
  dayLabel: string;
  dateNum: number;
  count: number;
  isToday: boolean;
}

export default function WeekScheduleStrip() {
  const router = useRouter();
  const today = new Date();

  const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // 월요일 시작
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const { data: countMap = {}, isLoading } = useSWR(
    "admin-week-schedule",
    async () => {
      const supabase = createClient();
      const startStr = format(weekDates[0], "yyyy-MM-dd");
      const endStr = format(weekDates[6], "yyyy-MM-dd");

      // confirmed 스케줄의 ID 목록
      const { data: wsData } = await supabase
        .from("weekly_schedules")
        .select("id")
        .eq("status", "confirmed")
        .gte("week_start", format(addDays(weekDates[0], -7), "yyyy-MM-dd"));

      if (!wsData || wsData.length === 0) return {};
      const wsIds = wsData.map((ws: { id: string }) => ws.id);

      const { data: slots } = await supabase
        .from("schedule_slots")
        .select("slot_date, profile_id")
        .eq("status", "active")
        .in("weekly_schedule_id", wsIds)
        .gte("slot_date", startStr)
        .lte("slot_date", endStr);

      // 날짜별 고유 profile_id 수 계산
      const map: Record<string, Set<string>> = {};
      (slots ?? []).forEach((s: any) => {
        if (!map[s.slot_date]) map[s.slot_date] = new Set();
        map[s.slot_date].add(s.profile_id);
      });

      const result: Record<string, number> = {};
      Object.entries(map).forEach(([date, set]) => {
        result[date] = set.size;
      });
      return result;
    },
    { dedupingInterval: 300_000, revalidateOnFocus: false }
  );

  const days: DayData[] = weekDates.map((date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return {
      date,
      dateStr,
      dayLabel: format(date, "EEE", { locale: ko }),
      dateNum: date.getDate(),
      count: countMap[dateStr] ?? 0,
      isToday: isSameDay(date, today),
    };
  });

  return (
    <section className="bg-white rounded-[24px] border border-slate-100 p-4">
      <h2 className="text-[15px] font-bold text-[#191F28] mb-3">
        이번 주 스케줄
      </h2>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => (
          <button
            key={day.dateStr}
            onClick={() =>
              router.push(`/admin/calendar?date=${day.dateStr}`)
            }
            className={`flex flex-col items-center py-2 rounded-[12px] transition-colors ${
              day.isToday
                ? "bg-[#E8F3FF] ring-2 ring-[#3182F6]"
                : "hover:bg-[#F2F4F6]"
            }`}
          >
            <span
              className={`text-[11px] font-medium mb-0.5 ${
                day.isToday ? "text-[#3182F6]" : "text-[#8B95A1]"
              }`}
            >
              {day.dayLabel}
            </span>
            <span
              className={`text-[15px] font-bold mb-1 ${
                day.isToday ? "text-[#3182F6]" : "text-[#191F28]"
              }`}
            >
              {day.dateNum}
            </span>
            {isLoading ? (
              <div className="w-5 h-3 bg-[#F2F4F6] rounded animate-pulse" />
            ) : (
              <span
                className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
                  day.count === 0
                    ? "text-[#F04438] bg-[#FFF0F0]"
                    : "text-[#4E5968] bg-[#F2F4F6]"
                }`}
              >
                {day.count}명
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
