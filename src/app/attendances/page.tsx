"use client";

import { useState } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  parseISO,
} from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronLeft, Clock, Timer, CalendarDays, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import AdjustmentModal from "@/components/AdjustmentModal";

interface DayRecord {
  date: string; // "yyyy-MM-dd"
  actualIn: Date | null;
  actualOut: Date | null;
  scheduledMinutes: number; // 인정 시간 (스케줄 기준)
  overtimeMinutes: number;  // 승인된 추가근무
  scheduleStart: string | null; // "HH:mm"
  scheduleEnd: string | null;   // "HH:mm"
  needsAdjustment: boolean;
  adjustmentStatus: "pending" | "approved" | null;
}

type ViewType = "weekly" | "monthly" | "custom";

export default function AttendancesPage() {
  const router = useRouter();
  const [viewType, setViewType] = useState<ViewType>("monthly");
  const today = format(new Date(), "yyyy-MM-dd");
  const [customStart, setCustomStart] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(today);
  const { user } = useAuth();

  const swrKey = user
    ? ["attendance-schedule", viewType, user.id, customStart, customEnd]
    : null;

  const { data, isLoading: loading } = useSWR(
    swrKey,
    async ([, vt, userId, csStart, csEnd]) => {
      const supabase = createClient();
      const now = new Date();

      let periodStart: Date;
      let periodEnd: Date;

      if (vt === "weekly") {
        periodStart = startOfWeek(now, { weekStartsOn: 1 });
        periodEnd = endOfWeek(now, { weekStartsOn: 1 });
      } else if (vt === "monthly") {
        periodStart = startOfMonth(now);
        periodEnd = endOfMonth(now);
      } else {
        periodStart = parseISO(csStart as string);
        periodEnd = parseISO(csEnd as string);
      }

      const startStr = format(periodStart, "yyyy-MM-dd");
      const endStr = vt === "custom"
        ? format(periodEnd, "yyyy-MM-dd")
        : format(now, "yyyy-MM-dd"); // 퀵 설정은 오늘까지만

      const logStartTs = new Date(`${startStr}T00:00:00+09:00`).toISOString();
      const logEndTs = new Date(`${endStr}T23:59:59.999+09:00`).toISOString();

      // 1. 출근 기록 (IN) — 날짜별 첫 출근 시간
      const { data: inLogs } = await supabase
        .from("attendance_logs")
        .select("id, created_at")
        .eq("profile_id", userId)
        .eq("type", "IN")
        .gte("created_at", logStartTs)
        .lte("created_at", logEndTs)
        .order("created_at", { ascending: true });

      // 2. 퇴근 기록 (OUT) — 날짜별 마지막 퇴근 시간
      const { data: outLogs } = await supabase
        .from("attendance_logs")
        .select("created_at")
        .eq("profile_id", userId)
        .eq("type", "OUT")
        .gte("created_at", logStartTs)
        .lte("created_at", logEndTs)
        .order("created_at", { ascending: true });

      // 날짜별 첫 IN / 마지막 OUT 매핑
      const inByDate = new Map<string, Date>();
      const outByDate = new Map<string, Date>();

      (inLogs ?? []).forEach((l: any) => {
        const d = format(new Date(l.created_at), "yyyy-MM-dd");
        if (!inByDate.has(d)) inByDate.set(d, new Date(l.created_at));
      });
      (outLogs ?? []).forEach((l: any) => {
        const d = format(new Date(l.created_at), "yyyy-MM-dd");
        outByDate.set(d, new Date(l.created_at)); // 마지막으로 덮어쓰기
      });

      // 3. 스케줄 슬롯 조회
      // week_start는 최대 6일 일찍 시작할 수 있으므로 버퍼 적용
      const schedStartDate = new Date(periodStart);
      schedStartDate.setDate(schedStartDate.getDate() - 6);
      const schedStartStr = format(schedStartDate, "yyyy-MM-dd");

      const { data: wsData } = await supabase
        .from("weekly_schedules")
        .select("id")
        .eq("status", "confirmed")
        .gte("week_start", schedStartStr)
        .lte("week_start", endStr);

      const slotsByDate = new Map<string, { minutes: number; start: string | null; end: string | null }>();
      if (wsData && wsData.length > 0) {
        const wsIds = wsData.map((w: any) => w.id);
        const { data: slots } = await supabase
          .from("schedule_slots")
          .select("slot_date, start_time, end_time")
          .eq("profile_id", userId)
          .eq("status", "active")
          .in("weekly_schedule_id", wsIds)
          .gte("slot_date", startStr)
          .lte("slot_date", endStr);

        (slots ?? []).forEach((slot: any) => {
          const [sh, sm] = slot.start_time.split(":").map(Number);
          const [eh, em] = slot.end_time.split(":").map(Number);
          const mins = (eh * 60 + em) - (sh * 60 + sm);
          const existing = slotsByDate.get(slot.slot_date);
          if (!existing) {
            slotsByDate.set(slot.slot_date, {
              minutes: mins,
              start: slot.start_time.slice(0, 5),
              end: slot.end_time.slice(0, 5),
            });
          } else {
            // 복수 슬롯: 시간 합산, 시작은 더 이른 것, 종료는 더 늦은 것
            slotsByDate.set(slot.slot_date, {
              minutes: existing.minutes + mins,
              start: existing.start && slot.start_time < existing.start ? slot.start_time.slice(0, 5) : existing.start,
              end: existing.end && slot.end_time > existing.end ? slot.end_time.slice(0, 5) : existing.end,
            });
          }
        });
      }

      // 4. 승인된 추가근무
      const { data: overtimes } = await supabase
        .from("overtime_requests")
        .select("date, minutes")
        .eq("profile_id", userId)
        .eq("status", "approved")
        .gte("date", startStr)
        .lte("date", endStr);

      const overtimeByDate = new Map<string, number>();
      (overtimes ?? []).forEach((ot: any) => {
        overtimeByDate.set(ot.date, (overtimeByDate.get(ot.date) ?? 0) + ot.minutes);
      });

      // 5. 조정 요청 조회
      const { data: adjustments } = await supabase
        .from("attendance_adjustments")
        .select("target_date, adjustment_type, status, requested_time")
        .eq("profile_id", userId)
        .gte("target_date", startStr)
        .lte("target_date", endStr);

      const adjustmentsByDate = new Map<string, { type: string; status: string; requested_time: string | null }[]>();
      (adjustments ?? []).forEach((adj: any) => {
        const list = adjustmentsByDate.get(adj.target_date) ?? [];
        list.push({ type: adj.adjustment_type, status: adj.status, requested_time: adj.requested_time });
        adjustmentsByDate.set(adj.target_date, list);
      });

      // 5. 날짜별 레코드 생성 (출근한 날 + 스케줄은 있지만 미출근인 날 포함)
      const records: DayRecord[] = [];
      let totalMinutes = 0;
      let totalOvertimeMinutes = 0;

      // 출근한 날 + 스케줄만 있고 미출근인 날 합산
      const allDates = new Set([...inByDate.keys(), ...slotsByDate.keys()]);
      const today = format(new Date(), "yyyy-MM-dd");

      Array.from(allDates)
        .filter((d) => d <= today)
        .sort((a, b) => b.localeCompare(a)) // 최신순
        .forEach((date) => {
          const actualIn = inByDate.get(date);
          const slot = slotsByDate.get(date);

          // 승인된 조정 반영: missed_checkin 승인 시 출근한 것으로 취급
          const dateAdjs = adjustmentsByDate.get(date) ?? [];
          const hasApprovedCheckin = dateAdjs.some(
            (a) => a.type === "missed_checkin" && a.status === "approved",
          );
          const effectiveIn = actualIn || hasApprovedCheckin;
          const scheduledMins = effectiveIn ? (slot?.minutes ?? 0) : 0;
          const overtimeMins = overtimeByDate.get(date) ?? 0;
          totalMinutes += scheduledMins + overtimeMins;
          totalOvertimeMinutes += overtimeMins;

          // 조정 필요 여부 판단 (타입별로 이미 처리된 건 제외, 4월부터 적용)
          if (date < "2026-04-01") {
            records.push({
              date,
              actualIn: actualIn ?? null as any,
              actualOut: outByDate.get(date) ?? null,
              scheduledMinutes: scheduledMins,
              overtimeMinutes: overtimeMins,
              scheduleStart: slot?.start ?? null,
              scheduleEnd: slot?.end ?? null,
              needsAdjustment: false,
              adjustmentStatus: null,
            });
            return;
          }
          let needsAdjustment = false;
          const adjs = adjustmentsByDate.get(date) ?? [];
          const adjTypes = new Set(
            adjs.filter((a) => a.status === "pending" || a.status === "approved" || a.status === "dismissed")
              .map((a) => a.type),
          );
          const hasPendingOrApproved = adjs.some(
            (a) => a.status === "pending" || a.status === "approved",
          );

          if (slot) {
            if (!actualIn && !adjTypes.has("missed_checkin")) {
              needsAdjustment = true;
            } else if (actualIn) {
              const schedStartMs = new Date(`${date}T${slot.start}:00+09:00`).getTime();
              const actualInMs = actualIn.getTime();
              if (actualInMs - schedStartMs > 10 * 60 * 1000 && !adjTypes.has("late_checkin")) {
                needsAdjustment = true;
              }
            }
            const actualOut = outByDate.get(date);
            if (actualIn && !actualOut && !adjTypes.has("missed_checkout")) {
              needsAdjustment = true;
            } else if (actualOut && slot.end) {
              const schedEndMs = new Date(`${date}T${slot.end}:00+09:00`).getTime();
              if (schedEndMs - actualOut.getTime() > 10 * 60 * 1000 && !adjTypes.has("early_checkout")) {
                needsAdjustment = true;
              }
            }
          }

          records.push({
            date,
            actualIn: actualIn ?? null as any,
            actualOut: outByDate.get(date) ?? null,
            scheduledMinutes: scheduledMins,
            overtimeMinutes: overtimeMins,
            scheduleStart: slot?.start ?? null,
            scheduleEnd: slot?.end ?? null,
            needsAdjustment,
            adjustmentStatus: hasPendingOrApproved
              ? adjs.find((a) => a.status === "pending")
                ? "pending"
                : "approved"
              : null,
          });
        });

      return {
        records,
        summary: {
          days: new Set([
            ...inByDate.keys(),
            ...(adjustments ?? [])
              .filter((a: any) => a.adjustment_type === "missed_checkin" && a.status === "approved")
              .map((a: any) => a.target_date),
          ]).size,
          totalMinutes,
          overtimeMinutes: totalOvertimeMinutes,
        },
      };
    },
    { dedupingInterval: 30_000, revalidateOnFocus: true }
  );

  const { mutate } = useSWR(swrKey ? swrKey : null, { revalidateOnFocus: false });
  const [adjustTarget, setAdjustTarget] = useState<DayRecord | null>(null);

  function buildIssues(rec: DayRecord) {
    const issues: { type: string; label: string }[] = [];
    if (!rec.actualIn && rec.scheduleStart) {
      issues.push({ type: "missed_checkin", label: "출근 미체크" });
    } else if (rec.actualIn && rec.scheduleStart) {
      const schedMs = new Date(`${rec.date}T${rec.scheduleStart}:00+09:00`).getTime();
      const lateMins = Math.floor((rec.actualIn.getTime() - schedMs) / 60000);
      if (lateMins > 10) {
        const h = Math.floor(lateMins / 60);
        const m = lateMins % 60;
        issues.push({ type: "late_checkin", label: `출근 ${h > 0 ? `${h}시간 ` : ""}${m}분 지연` });
      }
    }
    if (!rec.actualOut && rec.scheduleEnd) {
      issues.push({ type: "missed_checkout", label: "퇴근 미체크" });
    } else if (rec.actualOut && rec.scheduleEnd) {
      const schedMs = new Date(`${rec.date}T${rec.scheduleEnd}:00+09:00`).getTime();
      const earlyMins = Math.floor((schedMs - rec.actualOut.getTime()) / 60000);
      if (earlyMins > 10) {
        const h = Math.floor(earlyMins / 60);
        const m = earlyMins % 60;
        issues.push({ type: "early_checkout", label: `퇴근 ${h > 0 ? `${h}시간 ` : ""}${m}분 일찍` });
      }
    }
    if (issues.length === 0) {
      issues.push({ type: "other", label: "기타" });
    }
    return issues;
  }

  const records = data?.records ?? [];
  const summary = data?.summary ?? { days: 0, totalMinutes: 0, overtimeMinutes: 0 };
  const totalHours = Math.floor(summary.totalMinutes / 60);
  const totalMins = summary.totalMinutes % 60;
  const otHours = Math.floor(summary.overtimeMinutes / 60);
  const otMins = summary.overtimeMinutes % 60;

  const periodLabel =
    viewType === "weekly" ? "이번 주" :
    viewType === "monthly" ? "이번 달" :
    `${customStart} ~ ${customEnd}`;

  return (
    <div className="min-h-screen bg-[#F2F4F6] font-pretendard pb-10">
      {/* 헤더 */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md px-5 h-14 flex items-center gap-3 border-b border-[#E5E8EB]">
        <button onClick={() => router.back()} className="p-2 -ml-2">
          <ChevronLeft className="w-6 h-6 text-[#191F28]" />
        </button>
        <h1 className="text-[17px] font-bold text-[#191F28]">근무 기록</h1>
      </header>

      {/* 탭 스위처 */}
      <div className="p-4 pb-2">
        <div className="flex bg-white p-1 rounded-2xl border border-[#E5E8EB] gap-1">
          <button
            onClick={() => setViewType("weekly")}
            className={`flex-1 py-2.5 text-[14px] font-bold rounded-xl transition-all ${
              viewType === "weekly" ? "bg-[#3182F6] text-white" : "text-[#8B95A1]"
            }`}
          >
            이번 주
          </button>
          <button
            onClick={() => setViewType("monthly")}
            className={`flex-1 py-2.5 text-[14px] font-bold rounded-xl transition-all ${
              viewType === "monthly" ? "bg-[#3182F6] text-white" : "text-[#8B95A1]"
            }`}
          >
            이번 달
          </button>
          <button
            onClick={() => setViewType("custom")}
            className={`flex-1 py-2.5 text-[13px] font-bold rounded-xl transition-all flex items-center justify-center gap-1 ${
              viewType === "custom" ? "bg-[#3182F6] text-white" : "text-[#8B95A1]"
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            직접 설정
          </button>
        </div>

        {/* 기간 직접 설정 */}
        {viewType === "custom" && (
          <div className="mt-3 flex items-center gap-2 bg-white rounded-2xl border border-[#E5E8EB] px-4 py-3">
            <input
              type="date"
              value={customStart}
              max={customEnd}
              onChange={(e) => setCustomStart(e.target.value)}
              className="flex-1 text-[14px] font-semibold text-[#191F28] bg-transparent outline-none"
            />
            <span className="text-[13px] text-[#8B95A1] font-medium">~</span>
            <input
              type="date"
              value={customEnd}
              min={customStart}
              max={today}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="flex-1 text-[14px] font-semibold text-[#191F28] bg-transparent outline-none"
            />
          </div>
        )}
      </div>

      {/* 요약 카드 */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-[28px] p-6 border border-slate-100">
          <p className="text-[13px] font-semibold text-[#8B95A1] mb-3">
            {periodLabel} · 스케줄 기준
          </p>
          {loading ? (
            <div className="h-10 flex items-center">
              <div className="h-3 w-3 rounded-full bg-[#3182F6] animate-bounce mr-1" style={{ animationDelay: "0ms" }} />
              <div className="h-3 w-3 rounded-full bg-[#3182F6] animate-bounce mr-1" style={{ animationDelay: "150ms" }} />
              <div className="h-3 w-3 rounded-full bg-[#3182F6] animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-end gap-6">
                <div>
                  <p className="text-[12px] text-[#8B95A1] mb-0.5">출근 일수</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-[32px] font-bold text-[#191F28] tabular-nums leading-none">{summary.days}</span>
                    <span className="text-[16px] font-semibold text-[#4E5968]">일</span>
                  </div>
                </div>
                <div className="w-px h-10 bg-[#E5E8EB]" />
                <div>
                  <p className="text-[12px] text-[#8B95A1] mb-0.5">총 근무 시간</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-[32px] font-bold text-[#191F28] tabular-nums leading-none">{totalHours}</span>
                    <span className="text-[16px] font-semibold text-[#4E5968]">시간</span>
                    <span className="text-[24px] font-bold text-[#191F28] tabular-nums leading-none ml-1">{totalMins}</span>
                    <span className="text-[16px] font-semibold text-[#4E5968]">분</span>
                  </div>
                </div>
              </div>
              {summary.overtimeMinutes > 0 && (
                <div className="flex items-center gap-1.5 bg-[#E8F3FF] rounded-[10px] px-3 py-2 w-fit">
                  <Timer className="w-3.5 h-3.5 text-[#3182F6]" />
                  <span className="text-[12px] font-bold text-[#3182F6]">
                    추가근무 +{otHours}시간{otMins > 0 ? ` ${otMins}분` : ""} 포함
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 상세 내역 */}
      <div className="px-4 space-y-3">
        <p className="text-[13px] font-bold text-[#8B95A1] px-1">상세 내역</p>
        {loading ? (
          <div className="py-16 flex flex-col items-center gap-4">
            <style>{`
              @keyframes catRunFrames2 {
                from { background-position: 0 0; }
                to   { background-position: 0 -432px; }
              }
              @keyframes catWalkLR2 {
                0%   { transform: translateX(-32px) scaleX(1);  }
                48%  { transform: translateX(32px)  scaleX(1);  }
                50%  { transform: translateX(32px)  scaleX(-1); }
                98%  { transform: translateX(-32px) scaleX(-1); }
                100% { transform: translateX(-32px) scaleX(1);  }
              }
              .cat-walk { animation: catWalkLR2 2.4s linear infinite; }
              .cat-sprite {
                width: 72px; height: 72px;
                background-image: url('/game/WhiteCatRun.png');
                background-size: 72px 432px;
                background-repeat: no-repeat;
                image-rendering: pixelated;
                animation: catRunFrames2 0.6s steps(6) infinite;
              }
            `}</style>
            <div className="cat-walk">
              <div className="cat-sprite" />
            </div>
            <p className="text-[13px] text-[#8B95A1]">근무 기록 불러오는 중...</p>
          </div>
        ) : records.length > 0 ? (
          records.map((rec) => {
            const recognizedMins = rec.scheduledMinutes + rec.overtimeMinutes;
            const recH = Math.floor(recognizedMins / 60);
            const recM = recognizedMins % 60;
            const isWorking = rec.actualIn && !rec.actualOut && rec.date === format(new Date(), "yyyy-MM-dd");
            const hasSchedule = rec.scheduleStart && rec.scheduleEnd;
            const noRecord = !rec.actualIn;

            return (
              <div
                key={rec.date}
                className="bg-white rounded-[20px] px-5 py-4 border border-slate-100"
              >
                {/* 날짜 + 인정시간 */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${noRecord ? "bg-[#FFF0F0]" : isWorking ? "bg-[#E8F3FF]" : "bg-[#F2F4F6]"}`}>
                      <Clock className={`w-4 h-4 ${noRecord ? "text-[#F04438]" : isWorking ? "text-[#3182F6]" : "text-[#B0B8C1]"}`} />
                    </div>
                    <p className="text-[14px] font-bold text-[#191F28]">
                      {format(new Date(rec.date + "T00:00:00"), "M월 d일 (eeee)", { locale: ko })}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {noRecord ? (
                      <span className="text-[13px] font-bold text-[#F04438]">미체크</span>
                    ) : isWorking ? (
                      <span className="text-[13px] font-bold text-[#3182F6]">진행 중</span>
                    ) : recognizedMins > 0 ? (
                      <div>
                        <p className="text-[14px] font-bold text-[#4E5968]">
                          {recH > 0 ? `${recH}시간 ` : ""}{recM > 0 ? `${recM}분` : recH === 0 ? "0분" : ""}
                        </p>
                        {rec.overtimeMinutes > 0 && (
                          <p className="text-[11px] font-bold text-[#3182F6] mt-0.5">
                            +추가 {Math.floor(rec.overtimeMinutes / 60) > 0 ? `${Math.floor(rec.overtimeMinutes / 60)}h ` : ""}{rec.overtimeMinutes % 60 > 0 ? `${rec.overtimeMinutes % 60}m` : ""}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-[13px] text-[#B0B8C1]">스케줄 없음</p>
                    )}
                  </div>
                </div>

                {/* 시간 상세 */}
                <div className="space-y-1.5 pl-10">
                  {hasSchedule && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-[#8B95A1] w-10 shrink-0">스케줄</span>
                      <span className="text-[13px] font-semibold text-[#4E5968]">
                        {rec.scheduleStart} — {rec.scheduleEnd}
                      </span>
                    </div>
                  )}
                  {rec.actualIn && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-[#8B95A1] w-10 shrink-0">실제</span>
                      <span className={`text-[13px] font-bold ${isWorking ? "text-[#3182F6]" : "text-[#191F28]"}`}>
                        {format(rec.actualIn, "HH:mm")} — {rec.actualOut ? format(rec.actualOut, "HH:mm") : "근무 중"}
                      </span>
                    </div>
                  )}
                </div>

                {/* 조정 상태 — 복수 상태 동시 표시 가능 */}
                <div className="mt-3 ml-10 flex flex-wrap items-center gap-2">
                  {rec.adjustmentStatus === "pending" && (
                    <div className="flex items-center gap-1.5 text-[12px] font-bold text-[#F59E0B]">
                      <AlertCircle className="w-3.5 h-3.5" />
                      심사 중
                    </div>
                  )}
                  {!rec.needsAdjustment && rec.adjustmentStatus === "approved" && (
                    <div className="flex items-center gap-1.5 text-[12px] font-bold text-[#22C55E]">
                      <AlertCircle className="w-3.5 h-3.5" />
                      조정 완료
                    </div>
                  )}
                  {rec.needsAdjustment && (
                    <button
                      onClick={() => setAdjustTarget(rec)}
                      className="px-3.5 py-1.5 bg-[#FFF7E6] text-[#F59E0B] rounded-full text-[12px] font-bold active:scale-95 transition-transform"
                    >
                      조정 신청하기
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-16 text-center bg-white rounded-[24px] border border-dashed border-slate-200">
            <p className="text-[14px] text-[#8B95A1]">기록된 근무 내역이 없어요</p>
          </div>
        )}
      </div>

      {/* 조정 신청 모달 */}
      {adjustTarget && user && (
        <AdjustmentModal
          targetDate={adjustTarget.date}
          profileId={user.id}
          scheduleStart={adjustTarget.scheduleStart}
          scheduleEnd={adjustTarget.scheduleEnd}
          actualIn={adjustTarget.actualIn ? format(adjustTarget.actualIn, "HH:mm") : null}
          actualOut={adjustTarget.actualOut ? format(adjustTarget.actualOut, "HH:mm") : null}
          issues={buildIssues(adjustTarget)}
          onClose={() => setAdjustTarget(null)}
          onSuccess={() => mutate()}
        />
      )}
    </div>
  );
}
