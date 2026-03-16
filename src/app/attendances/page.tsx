"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import {
  format,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  differenceInMinutes,
} from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronLeft, Calendar, Clock, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";

// 타입 정의
interface WorkSession {
  id: string;
  in: Date;
  out: Date | null;
  duration: number; // minutes
}

export default function AttendancesPage() {
  const router = useRouter();
  const [viewType, setViewType] = useState<"weekly" | "monthly">("weekly");
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    fetchLogs();
  }, [viewType]);

  const fetchLogs = async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // 1. 범위 설정
    const now = new Date();
    const start =
      viewType === "weekly"
        ? startOfWeek(now, { weekStartsOn: 1 })
        : startOfMonth(now);

    const { data: logs, error } = await supabase
      .from("attendance_logs")
      .select("*")
      .eq("profile_id", user.id)
      .gte("created_at", start.toISOString())
      .order("created_at", { ascending: true });

    if (error || !logs) {
      setLoading(false);
      return;
    }

    // 2. IN-OUT 페어링 가공
    const paired: WorkSession[] = [];
    let tempIn: any = null;

    logs.forEach((log) => {
      if (log.type === "IN") {
        tempIn = log;
      } else if (log.type === "OUT" && tempIn) {
        const inTime = new Date(tempIn.created_at);
        const outTime = new Date(log.created_at);
        paired.push({
          id: tempIn.id,
          in: inTime,
          out: outTime,
          duration: differenceInMinutes(outTime, inTime),
        });
        tempIn = null;
      }
    });

    if (tempIn) {
      // 현재 근무 중 처리
      paired.push({
        id: tempIn.id,
        in: new Date(tempIn.created_at),
        out: null,
        duration: differenceInMinutes(new Date(), new Date(tempIn.created_at)),
      });
    }

    setSessions(paired.reverse()); // 최신순
    setLoading(false);
  };

  // 총 근무 시간 계산
  const totalMinutes = sessions.reduce((acc, cur) => acc + cur.duration, 0);
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMins = totalMinutes % 60;

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-10">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md px-4 h-14 flex items-center justify-between border-b border-slate-100">
        <button onClick={() => router.back()} className="p-2 -ml-2">
          <ChevronLeft className="w-6 h-6 text-[#191F28]" />
        </button>
        <h1 className="text-lg font-bold text-[#191F28]">근무 기록</h1>
        <div className="w-10" /> {/* center 정렬용 여백 */}
      </header>

      {/* Tab Switcher (Toss Style) */}
      <div className="p-4">
        <div className="flex bg-[#EEEFf1] p-1 rounded-xl">
          <button
            onClick={() => setViewType("weekly")}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
              viewType === "weekly"
                ? "bg-white text-[#191F28] shadow-sm"
                : "text-[#8B95A1]"
            }`}
          >
            주간
          </button>
          <button
            onClick={() => setViewType("monthly")}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
              viewType === "monthly"
                ? "bg-white text-[#191F28] shadow-sm"
                : "text-[#8B95A1]"
            }`}
          >
            월간
          </button>
        </div>
      </div>

      {/* Summary Stat Card */}
      <div className="px-4 mb-6">
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          <p className="text-sm font-medium text-[#8B95A1] mb-1">
            {viewType === "weekly" ? "이번 주 총 근무" : "이번 달 총 근무"}
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-[#191F28]">
              {totalHours}
            </span>
            <span className="text-xl font-bold text-[#191F28]">시간</span>
            <span className="text-3xl font-bold text-[#191F28] ml-2">
              {remainingMins}
            </span>
            <span className="text-xl font-bold text-[#191F28]">분</span>
          </div>
        </div>
      </div>

      {/* History List */}
      <div className="px-4 space-y-3">
        <h2 className="text-sm font-bold text-[#8B95A1] px-2 mb-2">
          상세 내역
        </h2>
        {loading ? (
          <div className="py-20 text-center text-slate-400">
            데이터를 분석 중이에요...
          </div>
        ) : sessions.length > 0 ? (
          sessions.map((session) => (
            <div
              key={session.id}
              className="bg-white rounded-2xl p-4 flex justify-between items-center shadow-sm border border-slate-50"
            >
              <div className="flex gap-4 items-center">
                <div className="w-10 h-10 bg-[#F2F4F6] rounded-full flex items-center justify-center">
                  <Clock
                    className={`w-5 h-5 ${
                      session.out ? "text-[#B0B8C1]" : "text-[#3182F6]"
                    }`}
                  />
                </div>
                <div>
                  <p className="text-[13px] text-[#8B95A1] font-medium">
                    {format(session.in, "M월 d일 (eeee)", { locale: ko })}
                  </p>
                  <p className="text-base font-bold text-[#333D4B]">
                    {format(session.in, "HH:mm")} —{" "}
                    {session.out ? format(session.out, "HH:mm") : "근무 중"}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p
                  className={`font-bold ${
                    session.out ? "text-[#4E5968]" : "text-[#3182F6]"
                  }`}
                >
                  {session.out
                    ? `${Math.floor(session.duration / 60)}시간 ${session.duration % 60}분`
                    : "진행 중"}
                </p>
                <ChevronRight className="inline-block w-4 h-4 text-[#D1D6DB] ml-1" />
              </div>
            </div>
          ))
        ) : (
          <div className="py-20 text-center bg-white rounded-3xl border border-dashed border-slate-200">
            <p className="text-slate-400">기록된 근무 내역이 없어요 ☕️</p>
          </div>
        )}
      </div>
    </div>
  );
}
