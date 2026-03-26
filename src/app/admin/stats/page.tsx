"use client";

import { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase";
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
} from "date-fns";
import { ko } from "date-fns/locale";
import {
  ChevronDown,
  ChevronUp,
  BarChart3,
  LogOut,
  ChevronRight,
} from "lucide-react";
import AvatarDisplay from "@/components/AvatarDisplay";
import { toast } from "sonner";
import { createNotification } from "@/lib/notifications";

// ─────────────────────────────────────────
// 타입
// ─────────────────────────────────────────
interface ProfileRow {
  id: string;
  name: string;
  color_hex: string;
  avatar_config: any;
}

interface SlotRecord {
  profile_id: string;
  slot_date: string;
  start_time: string;
}

interface LogRecord {
  profile_id: string;
  created_at: string;
}

interface EmployeeStats {
  totalSlots: number;
  attended: number;
  lateCnt: number;
  absentCnt: number;
  workingNow: number;
  fulfillRate: number;
}

interface TodayStatus {
  slotTime: string | null;
  checkinTime: string | null;
  isLate: boolean;
}

type Period = "this_month" | "last_month" | "all";
type SortKey = "rate" | "name";
type Tab = "stats" | "missed";

interface MissedCheckout {
  profile_id: string;
  log_date: string;
  clock_in: string;
  name: string;
  color_hex: string;
  avatar_config: any;
}

const LATE_GRACE_MINUTES = 5;
const LATE_MAJOR_THRESHOLD = 10;

// ─────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────
function getDateRange(period: Period): { start: string; end: string } {
  const now = new Date();
  if (period === "this_month") {
    return {
      start: format(startOfMonth(now), "yyyy-MM-dd"),
      end: format(endOfMonth(now), "yyyy-MM-dd"),
    };
  }
  if (period === "last_month") {
    const last = subMonths(now, 1);
    return {
      start: format(startOfMonth(last), "yyyy-MM-dd"),
      end: format(endOfMonth(last), "yyyy-MM-dd"),
    };
  }
  return { start: "2020-01-01", end: format(endOfMonth(now), "yyyy-MM-dd") };
}

function getRateColor(rate: number): string {
  if (rate >= 90) return "text-emerald-600";
  if (rate >= 70) return "text-amber-500";
  return "text-red-500";
}

function classifyCheckin(slotStartTime: string, checkinIso: string): "normal" | "late_minor" | "late_major" {
  const [sh, sm] = slotStartTime.split(":").map(Number);
  const checkin = new Date(checkinIso);
  const scheduled = new Date(checkin);
  scheduled.setHours(sh, sm, 0, 0);
  const diffMin = (checkin.getTime() - scheduled.getTime()) / 60000;
  if (diffMin <= LATE_GRACE_MINUTES) return "normal";
  if (diffMin <= LATE_MAJOR_THRESHOLD) return "late_minor";
  return "late_major";
}

// ─────────────────────────────────────────
// Fetcher
// ─────────────────────────────────────────
const supabase = createClient();

async function fetchProfiles(): Promise<ProfileRow[]> {
  const { data } = await supabase
    .from("profiles")
    .select("id, name, color_hex, avatar_config")
    .neq("role", "admin")
    .order("name");
  return (data ?? []) as ProfileRow[];
}

async function fetchAttendanceStats(
  startDate: string,
  endDate: string,
): Promise<{ slots: SlotRecord[]; logs: LogRecord[] }> {
  const [{ data: rawSlots }, { data: rawLogs }] = await Promise.all([
    supabase
      .from("schedule_slots")
      .select("profile_id, slot_date, start_time, weekly_schedules!inner(status)")
      .gte("slot_date", startDate)
      .lte("slot_date", endDate)
      .eq("status", "active")
      .eq("weekly_schedules.status", "confirmed"),
    supabase
      .from("attendance_logs")
      .select("profile_id, created_at")
      .eq("type", "IN")
      .gte("created_at", `${startDate}T00:00:00+09:00`)
      .lte("created_at", `${endDate}T23:59:59+09:00`),
  ]);
  return {
    slots: ((rawSlots ?? []) as any[]).map((s) => ({
      profile_id: s.profile_id,
      slot_date: s.slot_date,
      start_time: s.start_time,
    })),
    logs: (rawLogs ?? []) as LogRecord[],
  };
}

async function fetchMissedCheckouts(): Promise<MissedCheckout[]> {
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const [{ data: inLogs }, { data: outLogs }] = await Promise.all([
    supabase
      .from("attendance_logs")
      .select("profile_id, created_at, profiles!profile_id(name, color_hex, avatar_config)")
      .eq("type", "IN")
      .lt("created_at", `${todayStr}T00:00:00+09:00`)
      .order("created_at", { ascending: false }),
    supabase
      .from("attendance_logs")
      .select("profile_id, created_at")
      .eq("type", "OUT")
      .lt("created_at", `${todayStr}T00:00:00+09:00`),
  ]);

  const outSet = new Set<string>();
  for (const log of outLogs ?? []) {
    const d = format(new Date(log.created_at), "yyyy-MM-dd");
    outSet.add(`${(log as any).profile_id}|${d}`);
  }

  const seen = new Set<string>();
  const result: MissedCheckout[] = [];
  for (const log of (inLogs ?? []) as any[]) {
    const d = format(new Date(log.created_at), "yyyy-MM-dd");
    const key = `${log.profile_id}|${d}`;
    if (!outSet.has(key) && !seen.has(key)) {
      seen.add(key);
      result.push({
        profile_id: log.profile_id,
        log_date: d,
        clock_in: log.created_at,
        name: log.profiles?.name ?? "",
        color_hex: log.profiles?.color_hex ?? "#3182F6",
        avatar_config: log.profiles?.avatar_config,
      });
    }
  }
  return result;
}

// ─────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────
export default function StatsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("stats");
  const [period, setPeriod] = useState<Period>("this_month");
  const [sortKey, setSortKey] = useState<SortKey>("rate");
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "missed") setActiveTab("missed");
  }, []);

  const { start, end } = getDateRange(period);
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const {
    data: profiles = [],
    isLoading: profilesLoading,
  } = useSWR("admin-profiles", fetchProfiles, {
    revalidateOnFocus: false,
  });

  const { data: statsData, isLoading: statsLoading } = useSWR(
    ["admin-stats", start, end],
    () => fetchAttendanceStats(start, end),
    { revalidateOnFocus: false },
  );

  const { data: missedCheckouts = [], isLoading: missedLoading, mutate: mutateMissed } = useSWR(
    activeTab === "missed" ? "admin-missed-checkouts" : null,
    fetchMissedCheckouts,
    { revalidateOnFocus: false },
  );

  const [manualOutTarget, setManualOutTarget] = useState<MissedCheckout | null>(null);
  const [manualOutTime, setManualOutTime] = useState("");
  const [manualOutSubmitting, setManualOutSubmitting] = useState(false);

  const handleManualOut = async () => {
    if (!manualOutTarget || !manualOutTime) return;
    setManualOutSubmitting(true);
    const client = createClient();
    const clockOutDate = new Date(`${manualOutTarget.log_date}T${manualOutTime}:00`);

    const { error } = await client.from("attendance_logs").insert({
      profile_id: manualOutTarget.profile_id,
      type: "OUT",
      attendance_type: "fallback_out",
      created_at: clockOutDate.toISOString(),
      reason: "관리자 수동 처리",
    });

    if (error) {
      toast.error("퇴근 처리에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } else {
      toast.success(`${manualOutTarget.name}님 퇴근 처리가 완료됐어요.`);
      await createNotification({
        profile_id: manualOutTarget.profile_id,
        target_role: "employee",
        type: "attendance_fallback_out",
        title: "퇴근 처리 완료",
        content: "관리자가 퇴근 처리했어요.",
        source_id: manualOutTarget.profile_id,
      });
      setManualOutTarget(null);
      mutateMissed();
    }
    setManualOutSubmitting(false);
  };

  const isLoading = profilesLoading || statsLoading;

  // 직원별 통계 계산
  const { statsMap, todayMap } = useMemo(() => {
    const map = new Map<string, EmployeeStats>();
    const tMap = new Map<string, TodayStatus>();
    if (!statsData) return { statsMap: map, todayMap: tMap };

    const { slots, logs } = statsData;

    const logsByDateProfile = new Map<string, string>();
    for (const l of logs) {
      const logDate = format(new Date(l.created_at), "yyyy-MM-dd");
      const key = `${logDate}|${l.profile_id}`;
      if (!logsByDateProfile.has(key)) {
        logsByDateProfile.set(key, l.created_at);
      }
    }

    const perProfile = new Map<string, { attended: number; lateCnt: number; absentCnt: number; workingNow: number; totalSlots: number }>();

    for (const slot of slots) {
      const pid = slot.profile_id;
      if (!perProfile.has(pid)) {
        perProfile.set(pid, { attended: 0, lateCnt: 0, absentCnt: 0, workingNow: 0, totalSlots: 0 });
      }
      const stats = perProfile.get(pid)!;

      if (slot.slot_date > todayStr) continue;

      stats.totalSlots++;
      const logKey = `${slot.slot_date}|${pid}`;
      const inLog = logsByDateProfile.get(logKey);

      if (slot.slot_date < todayStr) {
        if (!inLog) {
          stats.absentCnt++;
        } else {
          const cls = classifyCheckin(slot.start_time, inLog);
          if (cls === "normal") stats.attended++;
          else stats.lateCnt++;
        }
      } else {
        if (inLog) {
          stats.workingNow++;
          const cls = classifyCheckin(slot.start_time, inLog);
          if (cls !== "normal") stats.lateCnt++;
        }
      }

      if (slot.slot_date === todayStr) {
        tMap.set(pid, {
          slotTime: slot.start_time?.slice(0, 5) ?? null,
          checkinTime: inLog ? format(new Date(inLog), "HH:mm") : null,
          isLate: inLog ? classifyCheckin(slot.start_time, inLog) !== "normal" : false,
        });
      }
    }

    for (const [pid, s] of perProfile) {
      const totalFulfilled = s.attended + s.lateCnt + s.workingNow;
      const fulfillRate = s.totalSlots > 0 ? Math.round((totalFulfilled / s.totalSlots) * 100) : 0;
      map.set(pid, { ...s, fulfillRate });
    }

    return { statsMap: map, todayMap: tMap };
  }, [statsData, todayStr]);

  // 요약 통계
  const summary = useMemo(() => {
    let totalRate = 0;
    let rateCount = 0;
    let totalLate = 0;
    let totalAbsent = 0;
    let totalWorkingNow = 0;

    for (const p of profiles) {
      const s = statsMap.get(p.id);
      if (s && s.totalSlots > 0) {
        totalRate += s.fulfillRate;
        rateCount++;
      }
      totalLate += s?.lateCnt ?? 0;
      totalAbsent += s?.absentCnt ?? 0;
      totalWorkingNow += s?.workingNow ?? 0;
    }

    return {
      avgRate: rateCount > 0 ? Math.round(totalRate / rateCount) : 0,
      totalLate,
      totalAbsent,
      totalWorkingNow,
    };
  }, [profiles, statsMap]);

  // 정렬
  const sortedProfiles = useMemo(() => {
    return [...profiles].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name, "ko");
      const ra = statsMap.get(a.id)?.fulfillRate ?? 0;
      const rb = statsMap.get(b.id)?.fulfillRate ?? 0;
      return rb - ra;
    });
  }, [profiles, statsMap, sortKey]);

  const periodLabels: Record<Period, string> = {
    this_month: "이번 달",
    last_month: "지난 달",
    all: "전체",
  };

  const sortLabels: Record<SortKey, string> = {
    rate: "이행률순",
    name: "이름순",
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#191F28]">근태 통계</h1>
      </div>

      {/* 탭 */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab("stats")}
          className={`px-4 py-2 text-[13px] font-semibold rounded-xl transition-colors ${
            activeTab === "stats"
              ? "bg-[#191F28] text-white"
              : "bg-white text-[#4E5968] border border-[#E5E8EB] hover:bg-[#F9FAFB]"
          }`}
        >
          통계
        </button>
        <button
          onClick={() => setActiveTab("missed")}
          className={`flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold rounded-xl transition-colors ${
            activeTab === "missed"
              ? "bg-[#191F28] text-white"
              : "bg-white text-[#4E5968] border border-[#E5E8EB] hover:bg-[#F9FAFB]"
          }`}
        >
          <LogOut className="w-3.5 h-3.5" />
          미퇴근
          {missedCheckouts.length > 0 && activeTab !== "missed" && (
            <span className="text-[11px] font-bold text-white bg-[#F04438] px-1.5 py-0.5 rounded-full leading-none">
              {missedCheckouts.length}
            </span>
          )}
        </button>
      </div>

      {/* 미퇴근 탭 */}
      {activeTab === "missed" && (
        <div className="bg-white rounded-2xl border border-[#E5E8EB] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5E8EB] flex items-center gap-2">
            <LogOut className="w-4 h-4 text-[#3182F6]" />
            <h2 className="font-semibold text-[#191F28] text-[15px]">미퇴근 처리 필요</h2>
            {missedCheckouts.length > 0 && (
              <span className="text-[11px] font-bold text-white bg-[#F04438] px-2 py-0.5 rounded-full">
                {missedCheckouts.length}건
              </span>
            )}
          </div>

          {missedLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-14 bg-[#F2F4F6] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : missedCheckouts.length === 0 ? (
            <div className="p-12 text-center text-[#8B95A1] text-[14px]">
              미퇴근 기록이 없어요
            </div>
          ) : (
            <div className="divide-y divide-[#F2F4F6]">
              {missedCheckouts.map((item) => (
                <button
                  key={`${item.profile_id}|${item.log_date}`}
                  onClick={() => {
                    setManualOutTarget(item);
                    setManualOutTime(item.clock_in ? format(new Date(item.clock_in), "HH:mm") : "");
                  }}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-[#F9FAFB] transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <AvatarDisplay
                      userId={item.profile_id}
                      avatarConfig={item.avatar_config}
                      size={36}
                    />
                    <div>
                      <p className="text-[14px] font-semibold text-[#191F28]">{item.name}</p>
                      <p className="text-[12px] text-[#8B95A1] mt-0.5">
                        {format(new Date(item.log_date + "T00:00:00"), "M월 d일 (EEE)", { locale: ko })}
                        {" · "}
                        {format(new Date(item.clock_in), "HH:mm")} 출근
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[12px] font-semibold text-[#3182F6]">처리하기</span>
                    <ChevronRight className="w-4 h-4 text-[#D1D6DB]" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "stats" && (
      <>

      {/* 기간 선택 */}
      <div className="flex gap-2">
        {(["this_month", "last_month", "all"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-2 text-[13px] font-semibold rounded-xl transition-colors ${
              period === p
                ? "bg-[#191F28] text-white"
                : "bg-white text-[#4E5968] border border-[#E5E8EB] hover:bg-[#F9FAFB]"
            }`}
          >
            {periodLabels[p]}
          </button>
        ))}
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "평균 이행률",
            value: `${summary.avgRate}%`,
            color: getRateColor(summary.avgRate),
          },
          {
            label: "총 지각",
            value: `${summary.totalLate}건`,
            color: "text-amber-500",
          },
          {
            label: "총 결근",
            value: `${summary.totalAbsent}건`,
            color: "text-red-500",
          },
          {
            label: "오늘 출근",
            value: `${summary.totalWorkingNow}명`,
            color: "text-[#3182F6]",
          },
        ].map((c) => (
          <div
            key={c.label}
            className="bg-white rounded-2xl p-4 border border-[#E5E8EB]"
          >
            <p className="text-[12px] text-[#8B95A1] mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* 직원별 현황 */}
      <div className="bg-white rounded-2xl border border-[#E5E8EB] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E5E8EB] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#3182F6]" />
            <h2 className="font-semibold text-[#191F28] text-[15px]">
              직원별 현황
            </h2>
          </div>
          <div className="flex gap-1">
            {(["rate", "name"] as SortKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setSortKey(k)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors ${
                  sortKey === k
                    ? "bg-[#191F28] text-white"
                    : "text-[#8B95A1] hover:bg-[#F2F4F6]"
                }`}
              >
                {sortLabels[k]}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-14 bg-[#F2F4F6] rounded-xl animate-pulse"
              />
            ))}
          </div>
        ) : sortedProfiles.length === 0 ? (
          <div className="p-12 text-center text-[#8B95A1] text-[14px]">
            등록된 직원이 없어요
          </div>
        ) : (
          <div className="divide-y divide-[#F2F4F6]">
            {sortedProfiles.map((p) => {
              const s = statsMap.get(p.id);
              const isExpanded = expandedProfile === p.id;
              const todayStatus = todayMap.get(p.id);

              return (
                <div key={p.id}>
                  <button
                    onClick={() =>
                      setExpandedProfile(isExpanded ? null : p.id)
                    }
                    className={`w-full text-left px-5 py-3.5 transition-colors ${
                      isExpanded ? "bg-[#E8F3FF]" : "hover:bg-[#F9FAFB]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <AvatarDisplay
                        userId={p.id}
                        avatarConfig={p.avatar_config}
                        size={36}
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] font-semibold text-[#191F28] truncate">
                            {p.name}
                          </span>
                          {s && s.workingNow > 0 && (
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3182F6] opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#3182F6]" />
                            </span>
                          )}
                        </div>

                        {s && s.totalSlots > 0 ? (
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-[#8B95A1]">
                            <span>출근 {s.attended + s.workingNow}</span>
                            <span className="text-[#D1D6DB]">|</span>
                            <span
                              className={
                                s.lateCnt > 0 ? "text-amber-500" : ""
                              }
                            >
                              지각 {s.lateCnt}
                            </span>
                            <span className="text-[#D1D6DB]">|</span>
                            <span
                              className={
                                s.absentCnt > 0 ? "text-red-500" : ""
                              }
                            >
                              결근 {s.absentCnt}
                            </span>
                          </div>
                        ) : (
                          <p className="text-[11px] text-[#D1D6DB] mt-1">
                            이 기간에 예정된 근무가 없어요
                          </p>
                        )}
                      </div>

                      {/* 이행률 */}
                      <div className="shrink-0 text-right w-14">
                        <span className={`text-[16px] font-bold ${s && s.totalSlots > 0 ? getRateColor(s.fulfillRate) : "text-[#D1D6DB]"}`}>
                          {s && s.totalSlots > 0 ? `${s.fulfillRate}%` : "-"}
                        </span>
                      </div>

                      <div className="shrink-0 ml-1">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-[#8B95A1]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[#8B95A1]" />
                        )}
                      </div>
                    </div>
                  </button>

                  {/* 아코디언 */}
                  {isExpanded && (
                    <div className="bg-[#F9FAFB] border-t border-[#E5E8EB]">
                      <div className="px-5 py-3">
                        <div className="flex items-center gap-2 text-[12px]">
                          <span className="font-semibold text-[#4E5968]">오늘</span>
                          {todayStatus?.slotTime ? (
                            <>
                              <span className="text-[#8B95A1]">{todayStatus.slotTime}~</span>
                              <span className="text-[#D1D6DB]">|</span>
                              {todayStatus.checkinTime ? (
                                <span className={todayStatus.isLate ? "text-amber-500" : "text-emerald-600"}>
                                  {todayStatus.checkinTime} 출근 {todayStatus.isLate ? "(지각)" : ""}
                                </span>
                              ) : (
                                <span className="text-[#8B95A1]">아직 출근 전</span>
                              )}
                            </>
                          ) : (
                            <span className="text-[#D1D6DB]">스케줄 없음</span>
                          )}
                        </div>
                      </div>

                      {s && s.totalSlots > 0 && (
                        <div className="px-5 pb-3 grid grid-cols-4 gap-2">
                          <div className="bg-white rounded-xl p-2.5 text-center">
                            <p className="text-[11px] text-[#8B95A1]">출근</p>
                            <p className="text-[15px] font-bold text-[#191F28]">{s.attended + s.workingNow}</p>
                          </div>
                          <div className="bg-white rounded-xl p-2.5 text-center">
                            <p className="text-[11px] text-[#8B95A1]">지각</p>
                            <p className={`text-[15px] font-bold ${s.lateCnt > 0 ? "text-amber-500" : "text-[#191F28]"}`}>{s.lateCnt}</p>
                          </div>
                          <div className="bg-white rounded-xl p-2.5 text-center">
                            <p className="text-[11px] text-[#8B95A1]">결근</p>
                            <p className={`text-[15px] font-bold ${s.absentCnt > 0 ? "text-red-500" : "text-[#191F28]"}`}>{s.absentCnt}</p>
                          </div>
                          <div className="bg-white rounded-xl p-2.5 text-center">
                            <p className="text-[11px] text-[#8B95A1]">이행률</p>
                            <p className={`text-[15px] font-bold ${getRateColor(s.fulfillRate)}`}>{s.fulfillRate}%</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      </> /* activeTab === "stats" */
      )}

      {/* 수동 퇴근 처리 모달 */}
      {manualOutTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setManualOutTarget(null)}
          />
          <div className="relative bg-white rounded-[24px] w-full max-w-sm p-6 shadow-xl">
            <h3 className="text-[17px] font-bold text-[#191F28] mb-5">수동 퇴근 처리</h3>

            <div className="flex items-center gap-3 bg-[#F9FAFB] rounded-[16px] p-3.5 mb-5">
              <AvatarDisplay
                userId={manualOutTarget.profile_id}
                avatarConfig={manualOutTarget.avatar_config}
                size={40}
              />
              <div>
                <p className="text-[15px] font-bold text-[#191F28]">{manualOutTarget.name}</p>
                <p className="text-[12px] text-[#8B95A1]">
                  {format(new Date(manualOutTarget.log_date + "T00:00:00"), "M월 d일 (EEE)", { locale: ko })}
                  {" · "}
                  {format(new Date(manualOutTarget.clock_in), "HH:mm")} 출근
                </p>
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-[13px] font-semibold text-[#4E5968] mb-2">
                퇴근 시간
              </label>
              <input
                type="time"
                value={manualOutTime}
                onChange={(e) => setManualOutTime(e.target.value)}
                className="w-full border border-[#E5E8EB] rounded-[12px] px-4 py-3 text-[16px] font-bold text-[#191F28] focus:outline-none focus:border-[#3182F6] focus:ring-2 focus:ring-[#3182F6]/20"
              />
            </div>

            <div className="flex gap-2">
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
