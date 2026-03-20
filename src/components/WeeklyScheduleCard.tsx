"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import { startOfWeek, addDays, format } from "date-fns";
import { CalendarDays, ChevronRight } from "lucide-react";
import Link from "next/link";

const LOCATION_COLORS: Record<string, string> = {
  cafe: "#3182F6",
  factory: "#00B761",
  catering: "#F59E0B",
};

export interface ScheduleSlot {
  slot_date: string;
  start_time: string;
  end_time: string;
  work_location: string;
}

interface Props {
  slots?: ScheduleSlot[];
  loading?: boolean;
}

export default function WeeklyScheduleCard({ slots: propSlots, loading: propLoading }: Props = {}) {
  const supabase = useMemo(() => createClient(), []);
  const [slots, setSlots] = useState<ScheduleSlot[]>(propSlots ?? []);
  const [loading, setLoading] = useState(propLoading ?? true);

  const weekDays = ["월", "화", "수", "목", "금", "토", "일"];
  const todayIndex = (new Date().getDay() + 6) % 7;

  // propSlots가 바뀌면 동기화
  useEffect(() => {
    if (propSlots !== undefined) {
      setSlots(propSlots);
      setLoading(false);
    }
  }, [propSlots]);

  useEffect(() => {
    // props로 데이터가 제공된 경우 내부 fetch 스킵
    if (propSlots !== undefined) return;

    const fetchWeeklySchedule = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const weekStartSun = startOfWeek(new Date(), { weekStartsOn: 0 });
      const weekEndSun = addDays(weekStartSun, 6);
      const weekStartStr = format(weekStartSun, "yyyy-MM-dd");
      const weekEndStr = format(weekEndSun, "yyyy-MM-dd");

      const { data: slotsData } = await supabase
        .from("schedule_slots")
        .select("slot_date, start_time, end_time, work_location, weekly_schedules!inner(status)")
        .eq("profile_id", user.id)
        .eq("status", "active")
        .eq("weekly_schedules.status", "confirmed")
        .gte("slot_date", weekStartStr)
        .lte("slot_date", weekEndStr)
        .order("slot_date");

      setSlots(
        ((slotsData ?? []) as Array<ScheduleSlot & { weekly_schedules: unknown }>).map(
          ({ weekly_schedules: _ws, ...rest }) => rest as ScheduleSlot
        )
      );
      setLoading(false);
    };

    fetchWeeklySchedule();
  }, [supabase, propSlots]);

  const slotsByDay = useMemo(() => {
    const map: Record<number, ScheduleSlot[]> = {};
    slots.forEach((slot) => {
      const date = new Date(slot.slot_date + "T00:00:00");
      const dayIdx = (date.getDay() + 6) % 7;
      if (!map[dayIdx]) map[dayIdx] = [];
      map[dayIdx].push(slot);
    });
    return map;
  }, [slots]);

  if (loading) {
    return (
      <section className="bg-white rounded-[28px] p-6 shadow-sm border border-slate-100">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-5 h-5 bg-slate-100 animate-pulse rounded" />
          <div className="h-5 w-28 bg-slate-100 animate-pulse rounded" />
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div className="h-3 w-4 bg-slate-100 animate-pulse rounded" />
              <div className="h-16 w-full bg-slate-100 animate-pulse rounded-xl" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-[28px] p-6 shadow-sm border border-slate-100">
      <Link href="/schedule" className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-[#3182F6]" />
          <h3 className="font-bold text-[#191F28]">이번 주 스케줄</h3>
        </div>
        <ChevronRight className="w-5 h-5 text-[#D1D6DB]" />
      </Link>

      {slots.length === 0 ? (
        <div className="text-center py-3">
          <p className="text-[14px] text-[#8B95A1]">확정된 스케줄이 없어요</p>
          <p className="text-[12px] text-[#B0B8C1] mt-1">
            관리자가 스케줄을 확정하면 여기서 볼 수 있어요
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1.5">
          {weekDays.map((label, idx) => {
            const daySlots = slotsByDay[idx] || [];
            const isToday = idx === todayIndex;

            return (
              <div key={label} className="flex flex-col items-center gap-1.5">
                <span
                  className={`text-[11px] font-bold ${
                    isToday ? "text-[#3182F6]" : "text-[#8B95A1]"
                  }`}
                >
                  {label}
                </span>
                <div
                  className={`w-full min-h-[64px] rounded-[12px] flex flex-col items-center justify-center gap-1 px-1 py-2 ${
                    isToday
                      ? "bg-[#E8F3FF]"
                      : daySlots.length > 0
                      ? "bg-[#F2F4F6]"
                      : "bg-[#F9FAFB]"
                  }`}
                >
                  {daySlots.length === 0 ? (
                    <span className="text-[11px] text-[#D1D6DB] font-bold">
                      -
                    </span>
                  ) : (
                    daySlots.map((slot, si) => (
                      <div key={si} className="w-full text-center">
                        <div
                          className="w-2 h-2 rounded-full mx-auto mb-0.5"
                          style={{
                            backgroundColor:
                              LOCATION_COLORS[slot.work_location] || "#8B95A1",
                          }}
                        />
                        <p
                          className={`text-[9px] font-bold leading-tight ${
                            isToday ? "text-[#3182F6]" : "text-[#333D4B]"
                          }`}
                        >
                          {slot.start_time.slice(0, 5)}
                        </p>
                        <p
                          className={`text-[9px] leading-tight ${
                            isToday ? "text-[#3182F6]/70" : "text-[#8B95A1]"
                          }`}
                        >
                          ~{slot.end_time.slice(0, 5)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
