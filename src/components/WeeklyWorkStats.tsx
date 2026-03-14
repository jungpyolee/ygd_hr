"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { startOfWeek, differenceInMinutes } from "date-fns";
import { TrendingUp, ChevronRight } from "lucide-react";

export default function WeeklyWorkStats() {
  const [weeklyMinutes, setWeeklyMinutes] = useState(0);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const weekDays = ["월", "화", "수", "목", "금", "토", "일"];
  // getDay()는 일(0)~토(6)이므로, 월(0)~일(6) 체계로 변환
  const todayIndex = (new Date().getDay() + 6) % 7;

  useEffect(() => {
    const fetchWeeklyStats = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const start = startOfWeek(new Date(), { weekStartsOn: 1 }); // 월요일 시작

      const { data: logs, error } = await supabase
        .from("attendance_logs")
        .select("type, created_at")
        .eq("profile_id", user.id)
        .gte("created_at", start.toISOString())
        .order("created_at", { ascending: true });

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }

      let totalMins = 0;
      let lastInTime: Date | null = null;

      logs?.forEach((log) => {
        const logTime = new Date(log.created_at);
        if (log.type === "IN") {
          lastInTime = logTime;
        } else if (log.type === "OUT" && lastInTime) {
          totalMins += differenceInMinutes(logTime, lastInTime);
          lastInTime = null;
        }
      });

      // 현재 진행 중인 근무 시간 합산
      if (lastInTime) {
        totalMins += differenceInMinutes(new Date(), lastInTime);
      }

      setWeeklyMinutes(totalMins);
      setLoading(false);
    };

    fetchWeeklyStats();
  }, [supabase]);

  const formatWorkTime = (totalMinutes: number) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}시간 ${minutes}분`;
  };

  return (
    <section className="bg-white rounded-[28px] p-6 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-[#3182F6]" />
          <h3 className="font-bold text-[#191F28]">이번 주 근무</h3>
        </div>
        <ChevronRight className="w-5 h-5 text-[#D1D6DB]" />
      </div>

      <div className="flex justify-between items-end">
        <div className="space-y-1">
          {loading ? (
            <div className="h-9 w-32 bg-slate-100 animate-pulse rounded-lg" />
          ) : (
            <p className="text-3xl font-bold text-[#191F28]">
              {formatWorkTime(weeklyMinutes)}
            </p>
          )}
          <p className="text-sm text-[#8B95A1]">
            월요일부터 지금까지 일한 시간이에요
          </p>
        </div>

        {/* Toss 스타일 바 그래프 (Placeholder) */}
        <div className="flex gap-2 items-end h-16 px-1">
          {weekDays.map((label, index) => {
            const isToday = index === todayIndex;
            const isPast = index < todayIndex;

            return (
              <div key={label} className="flex flex-col items-center gap-2">
                {/* 바 그래프 */}
                <div
                  style={{ height: isToday ? "60%" : isPast ? "30%" : "15%" }}
                  className={`w-2.5 rounded-t-full transition-all duration-500 ${
                    isToday
                      ? "bg-[#3182F6]"
                      : isPast
                      ? "bg-[#E8F3FF]"
                      : "bg-[#F2F4F6]"
                  }`}
                />
                {/* 요일 라벨 (Toss UX: 작은 디테일) */}
                <span
                  className={`text-[10px] font-medium ${
                    isToday ? "text-[#3182F6]" : "text-[#B0B8C1]"
                  }`}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
