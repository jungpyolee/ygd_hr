"use client";

import { useMemo } from "react";
import { startOfWeek, addDays, format } from "date-fns";
import { CalendarDays, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useWorkplaces } from "@/lib/hooks/useWorkplaces";

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

export interface ScheduleSlot {
  slot_date: string;
  start_time: string;
  end_time: string;
  work_location: string;
}

interface Props {
  slots: ScheduleSlot[];
}

export default function WeeklyScheduleCard({ slots }: Props) {
  const { byKey } = useWorkplaces();
  const todayIdx = (new Date().getDay() + 6) % 7; // 0=월 ~ 6=일
  const weekStartSun = startOfWeek(new Date(), { weekStartsOn: 0 });
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStartSun, i + 1));

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

  const upcomingSlots = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return slots
      .filter((s) => new Date(s.slot_date + "T00:00:00") >= today)
      .slice(0, 3);
  }, [slots]);

  return (
    <Link href="/schedule" className="block active:scale-[0.99] transition-transform">
      <section className="bg-white rounded-[28px] p-5 shadow-sm border border-slate-100">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-[#3182F6]" />
            <h3 className="font-bold text-[#191F28]">이번 주 스케줄</h3>
          </div>
          <ChevronRight className="w-5 h-5 text-[#D1D6DB]" />
        </div>

        {/* 날짜 스트립 — 시간 텍스트 없이 도트만 표시해 overflow 방지 */}
        <div className="grid grid-cols-7 gap-1">
          {DAY_LABELS.map((label, idx) => {
            const daySlots = slotsByDay[idx] || [];
            const isToday = idx === todayIdx;
            return (
              <div key={label} className="flex flex-col items-center gap-1">
                <span
                  className={`text-[11px] font-semibold ${
                    isToday ? "text-[#3182F6]" : "text-[#8B95A1]"
                  }`}
                >
                  {label}
                </span>
                {/* 날짜 원형 — 오늘은 파란 원 */}
                <div
                  className={`w-8 h-8 flex items-center justify-center rounded-full text-[13px] font-bold ${
                    isToday ? "bg-[#3182F6] text-white" : "text-[#191F28]"
                  }`}
                >
                  {format(weekDates[idx], "d")}
                </div>
                {/* 위치 컬러 도트 (최대 2개) */}
                <div className="flex flex-col items-center gap-0.5 h-4 justify-center">
                  {daySlots.slice(0, 2).map((slot, si) => (
                    <div
                      key={si}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        backgroundColor: byKey[slot.work_location]?.color || "#8B95A1",
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* 구분선 + 스케줄 리스트 */}
        <div className="mt-4 pt-4 border-t border-[#F2F4F6]">
          {slots.length === 0 ? (
            <div className="text-center py-2">
              <p className="text-[13px] text-[#8B95A1]">확정된 스케줄이 없어요</p>
              <p className="text-[12px] text-[#B0B8C1] mt-0.5">
                관리자가 스케줄을 확정하면 여기서 볼 수 있어요
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {upcomingSlots.map((slot, i) => {
                const date = new Date(slot.slot_date + "T00:00:00");
                const dayIdx = (date.getDay() + 6) % 7;
                const isToday = dayIdx === todayIdx;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span
                      className={`text-[12px] font-bold w-11 shrink-0 ${
                        isToday ? "text-[#3182F6]" : "text-[#8B95A1]"
                      }`}
                    >
                      {isToday ? "오늘" : `${DAY_LABELS[dayIdx]}요일`}
                    </span>
                    <div
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: byKey[slot.work_location]?.color || "#8B95A1",
                      }}
                    />
                    <span className="flex-1 text-[13px] font-semibold text-[#191F28] tabular-nums">
                      {slot.start_time.slice(0, 5)} ~ {slot.end_time.slice(0, 5)}
                    </span>
                    <span
                      className="text-[11px] font-bold px-2.5 py-0.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: byKey[slot.work_location]?.bg_color || "#F2F4F6",
                        color: byKey[slot.work_location]?.color || "#4E5968",
                      }}
                    >
                      {byKey[slot.work_location]?.label || slot.work_location}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </Link>
  );
}
