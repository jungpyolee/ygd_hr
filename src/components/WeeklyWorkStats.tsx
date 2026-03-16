"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import { startOfWeek, differenceInMinutes } from "date-fns";
import { TrendingUp, ChevronRight } from "lucide-react";
import Link from "next/link";

export default function WeeklyWorkStats() {
  const [weeklyMinutes, setWeeklyMinutes] = useState(0);
  const [dailyMinutes, setDailyMinutes] = useState<number[]>(
    new Array(7).fill(0)
  );
  const [loading, setLoading] = useState(true);
  // useMemo로 안정화: 매 렌더링마다 새 인스턴스 생성 방지
  const supabase = useMemo(() => createClient(), []);

  const weekDays = ["월", "화", "수", "목", "금", "토", "일"];
  // todayIndex를 effect 외부에서 계산 후 의존 배열에서 제거
  const todayIndex = (new Date().getDay() + 6) % 7; // 월(0)~일(6) 변환

  useEffect(() => {
    const fetchWeeklyStats = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const start = startOfWeek(new Date(), { weekStartsOn: 1 });

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
      const dailyMins = new Array(7).fill(0);
      let lastInTime: Date | null = null;

      logs?.forEach((log) => {
        const logTime = new Date(log.created_at);
        const dayIndex = (logTime.getDay() + 6) % 7;

        if (log.type === "IN") {
          lastInTime = logTime;
        } else if (log.type === "OUT" && lastInTime) {
          const duration = differenceInMinutes(logTime, lastInTime);
          totalMins += duration;
          dailyMins[dayIndex] += duration;
          lastInTime = null;
        }
      });

      // 현재 진행 중인 근무 시간 반영
      if (lastInTime) {
        const currentDuration = differenceInMinutes(new Date(), lastInTime);
        totalMins += currentDuration;
        dailyMins[todayIndex] += currentDuration;
      }

      setWeeklyMinutes(totalMins);
      setDailyMinutes([...dailyMins]);
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
      <Link href="/attendances">
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

          {/* 요일별 바 그래프 영역 */}
          <div className="flex gap-2 items-end h-24 px-1">
            {weekDays.map((label, index) => {
              const isToday = index === todayIndex;
              const mins = dailyMinutes[index];
              const maxMins = Math.max(...dailyMinutes, 60);
              // 8시간(480분) 기준 퍼센트 계산
              // 데이터가 있으면 최소 20% 높이 보장, 없으면 10%
              const heightPercent = loading
                ? 15
                : mins > 0
                ? Math.max(20, (mins / maxMins) * 100) // 8시간 대신 maxMins 기준
                : 10;

              return (
                <div
                  key={label}
                  className="flex flex-col items-center justify-end h-full gap-2"
                >
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className={`w-3 rounded-t-full transition-all duration-700 ease-out ${
                      isToday
                        ? "bg-[#3182F6]"
                        : mins > 0
                        ? "bg-[#3182F6] opacity-30"
                        : "bg-[#F2F4F6]"
                    }`}
                  />
                  <span
                    className={`text-[10px] font-medium transition-colors duration-300 ${
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
      </Link>
    </section>
  );
}
