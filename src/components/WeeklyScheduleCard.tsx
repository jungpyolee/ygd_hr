"use client";

import { useState, useMemo } from "react";
import { startOfWeek, addDays, format } from "date-fns";
import { CalendarDays } from "lucide-react";
import { useWorkplaces } from "@/lib/hooks/useWorkplaces";

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

export interface ScheduleSlot {
  slot_date: string;
  start_time: string;
  end_time: string;
  store_id: string;
}

interface Props {
  slots: ScheduleSlot[];
}

export default function WeeklyScheduleCard({ slots }: Props) {
  const { byId } = useWorkplaces();
  const todayIdx = (new Date().getDay() + 6) % 7; // 0=월 ~ 6=일
  const weekStartSun = startOfWeek(new Date(), { weekStartsOn: 0 });
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStartSun, i + 1));

  const [selectedDay, setSelectedDay] = useState(todayIdx);

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

  const selectedSlots = slotsByDay[selectedDay] || [];
  const selectedDate = weekDates[selectedDay];

  return (
    <section className="bg-white rounded-[28px] p-5 shadow-sm border border-slate-100">
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays className="w-5 h-5 text-[#3182F6]" />
        <h3 className="font-bold text-[#191F28]">이번 주 스케줄</h3>
      </div>

      {/* 요일 탭 */}
      <div className="grid grid-cols-7 gap-1">
        {DAY_LABELS.map((label, idx) => {
          const daySlots = slotsByDay[idx] || [];
          const isToday = idx === todayIdx;
          const isSelected = idx === selectedDay;
          return (
            <button
              key={label}
              onClick={() => setSelectedDay(idx)}
              className="flex flex-col items-center gap-1 py-1 rounded-xl transition-colors active:bg-[#F2F4F6]"
            >
              <span
                className={`text-[11px] font-semibold ${
                  isSelected ? "text-[#3182F6]" : isToday ? "text-[#3182F6]" : "text-[#8B95A1]"
                }`}
              >
                {label}
              </span>
              <div
                className={`w-8 h-8 flex items-center justify-center rounded-full text-[13px] font-bold transition-colors ${
                  isSelected
                    ? "bg-[#3182F6] text-white"
                    : isToday
                    ? "bg-[#E8F3FF] text-[#3182F6]"
                    : "text-[#191F28]"
                }`}
              >
                {format(weekDates[idx], "d")}
              </div>
              {/* 근무 있음 도트 */}
              <div className="h-1.5 flex items-center justify-center">
                {daySlots.length > 0 && (
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor: isSelected
                        ? byId[daySlots[0].store_id]?.color || "#3182F6"
                        : byId[daySlots[0].store_id]?.color || "#8B95A1",
                    }}
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 선택된 날 상세 */}
      <div className="mt-3 pt-3 border-t border-[#F2F4F6]">
        <p className="text-[12px] font-semibold text-[#8B95A1] mb-2">
          {selectedDay === todayIdx ? "오늘" : `${DAY_LABELS[selectedDay]}요일`}{" "}
          {format(selectedDate, "M/d")}
        </p>
        {selectedSlots.length === 0 ? (
          <p className="text-[13px] text-[#B0B8C1] py-1">근무 없어요</p>
        ) : (
          <div className="space-y-2">
            {selectedSlots.map((slot, i) => (
              <div key={i} className="flex items-center gap-3">
                <div
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: byId[slot.store_id]?.color || "#8B95A1" }}
                />
                <span className="flex-1 text-[13px] font-semibold text-[#191F28] tabular-nums">
                  {slot.start_time.slice(0, 5)} ~ {slot.end_time.slice(0, 5)}
                </span>
                <span
                  className="text-[11px] font-bold px-2.5 py-0.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: byId[slot.store_id]?.bg_color || "#F2F4F6",
                    color: byId[slot.store_id]?.color || "#4E5968",
                  }}
                >
                  {byId[slot.store_id]?.label || slot.store_id}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
