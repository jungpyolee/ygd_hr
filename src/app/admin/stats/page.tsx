"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase";
import {
  format,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  isBefore,
  isToday,
  parseISO,
} from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Trophy, TrendingUp } from "lucide-react";
import AvatarDisplay from "@/components/AvatarDisplay";

// ─────────────────────────────────────────
// 타입
// ─────────────────────────────────────────
interface SlotRow {
  slot_date: string;
  start_time: string;
  profile_id: string;
  name: string;
  color_hex: string;
  avatar_config: any;
  checkin_time: string | null; // KST ISO
}

type AttendanceStatus = "normal" | "late_minor" | "late_major" | "absent" | "unconfirmed";

interface SlotResult extends SlotRow {
  status: AttendanceStatus;
  late_minutes: number;
}

interface EmployeeStat {
  profile_id: string;
  name: string;
  color_hex: string;
  avatar_config: any;
  total: number;
  normal: number;
  late_minor: number;
  late_major: number;
  absent: number;
  unconfirmed: number;
  rate: number; // 정상출근률 (%)
}

// ─────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────
const LATE_GRACE_MINUTES = 5; // 5분 이내는 정상

function calcStatus(row: SlotRow, today: Date): AttendanceStatus {
  const slotDate = parseISO(row.slot_date);
  const isPast = isBefore(slotDate, today) && !isToday(slotDate);
  const isTodaySlot = isToday(slotDate);

  if (!row.checkin_time) {
    if (isPast) return "absent";
    if (isTodaySlot) return "unconfirmed";
    return "unconfirmed"; // 미래
  }

  // 지각 계산 — start_time과 체크인 시각 비교 (분 단위)
  const [sh, sm] = row.start_time.split(":").map(Number);
  const checkin = new Date(row.checkin_time);
  const scheduled = new Date(checkin);
  scheduled.setHours(sh, sm, 0, 0);

  const diffMin = (checkin.getTime() - scheduled.getTime()) / 60000;

  if (diffMin <= LATE_GRACE_MINUTES) return "normal";
  if (diffMin <= 10) return "late_minor";
  return "late_major";
}

function calcLateMin(row: SlotRow): number {
  if (!row.checkin_time) return 0;
  const [sh, sm] = row.start_time.split(":").map(Number);
  const checkin = new Date(row.checkin_time);
  const scheduled = new Date(checkin);
  scheduled.setHours(sh, sm, 0, 0);
  return Math.max(0, Math.round((checkin.getTime() - scheduled.getTime()) / 60000));
}

function buildStats(slots: SlotResult[]): EmployeeStat[] {
  const map: Record<string, EmployeeStat> = {};

  for (const s of slots) {
    if (!map[s.profile_id]) {
      map[s.profile_id] = {
        profile_id: s.profile_id,
        name: s.name,
        color_hex: s.color_hex,
        avatar_config: s.avatar_config,
        total: 0,
        normal: 0,
        late_minor: 0,
        late_major: 0,
        absent: 0,
        unconfirmed: 0,
        rate: 0,
      };
    }
    const stat = map[s.profile_id];
    stat.total++;
    stat[s.status]++;
  }

  return Object.values(map)
    .map((stat) => {
      // 정상출근률 = 정상 / (전체 - 미확인) — 아직 안 온 날 제외
      const confirmed = stat.total - stat.unconfirmed;
      stat.rate = confirmed > 0 ? Math.round((stat.normal / confirmed) * 100) : 100;
      return stat;
    })
    .sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name));
}

// ─────────────────────────────────────────
// Fetcher
// ─────────────────────────────────────────
const supabase = createClient();

async function fetchSlots(monthStart: string, monthEnd: string): Promise<SlotRow[]> {
  const { data, error } = await supabase.rpc("get_attendance_stats", {
    p_start: monthStart,
    p_end: monthEnd,
  });

  if (error) {
    // RPC 없으면 직접 쿼리
    const { data: rows, error: err2 } = await supabase
      .from("schedule_slots")
      .select(
        `slot_date, start_time,
         profile_id,
         profiles!inner(name, color_hex, avatar_config),
         attendance_logs!left(type, created_at)`
      )
      .gte("slot_date", monthStart)
      .lte("slot_date", monthEnd)
      .eq("status", "active")
      .order("slot_date");

    if (err2 || !rows) return [];

    // 가공: 같은 날 IN 로그 중 가장 이른 것 선택
    return rows.map((r: any) => {
      const inLogs = (r.attendance_logs ?? []).filter((l: any) => l.type === "IN");
      inLogs.sort((a: any, b: any) => a.created_at.localeCompare(b.created_at));
      const earliest = inLogs[0] ?? null;
      return {
        slot_date: r.slot_date,
        start_time: r.start_time,
        profile_id: r.profile_id,
        name: r.profiles.name,
        color_hex: r.profiles.color_hex,
        avatar_config: r.profiles.avatar_config,
        checkin_time: earliest?.created_at ?? null,
      } satisfies SlotRow;
    });
  }

  return data ?? [];
}

// ─────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────
const STATUS_LABEL: Record<AttendanceStatus, string> = {
  normal: "정상",
  late_minor: "지각(경)",
  late_major: "지각",
  absent: "결근",
  unconfirmed: "미확인",
};

const STATUS_COLOR: Record<AttendanceStatus, string> = {
  normal: "bg-emerald-100 text-emerald-700",
  late_minor: "bg-amber-100 text-amber-700",
  late_major: "bg-orange-100 text-orange-700",
  absent: "bg-red-100 text-red-600",
  unconfirmed: "bg-slate-100 text-slate-400",
};

const TIER_INFO = (rate: number) => {
  if (rate >= 90) return { label: "💎 다이아", color: "text-[#1A4A8A]" };
  if (rate >= 75) return { label: "❇️ 플래티넘", color: "text-slate-500" };
  if (rate >= 60) return { label: "🥇 골드", color: "text-amber-600" };
  if (rate >= 45) return { label: "🥈 실버", color: "text-slate-400" };
  if (rate >= 30) return { label: "🥉 브론즈", color: "text-orange-400" };
  return { label: "⚙️ 아이언", color: "text-slate-400" };
};

export default function StatsPage() {
  const [baseDate, setBaseDate] = useState(new Date());
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);

  const monthStart = format(startOfMonth(baseDate), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(baseDate), "yyyy-MM-dd");

  const { data: rawSlots = [], isLoading } = useSWR(
    ["stats", monthStart, monthEnd],
    () => fetchSlots(monthStart, monthEnd),
    { revalidateOnFocus: false }
  );

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const slots: SlotResult[] = useMemo(
    () =>
      rawSlots.map((r) => ({
        ...r,
        status: calcStatus(r, today),
        late_minutes: calcLateMin(r),
      })),
    [rawSlots, today]
  );

  const stats = useMemo(() => buildStats(slots), [slots]);

  // 요약 카드 집계
  const summary = useMemo(() => {
    const past = slots.filter((s) => s.status !== "unconfirmed");
    return {
      total: past.length,
      normal: past.filter((s) => s.status === "normal").length,
      late: past.filter((s) => s.status === "late_minor" || s.status === "late_major").length,
      absent: past.filter((s) => s.status === "absent").length,
    };
  }, [slots]);

  // 선택된 직원 상세 슬롯
  const detailSlots = useMemo(
    () =>
      selectedProfile
        ? slots
            .filter((s) => s.profile_id === selectedProfile)
            .sort((a, b) => b.slot_date.localeCompare(a.slot_date))
        : [],
    [slots, selectedProfile]
  );

  const selectedStat = stats.find((s) => s.profile_id === selectedProfile);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#191F28]">근태 통계</h1>
        {/* 월 선택 */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBaseDate((d) => subMonths(d, 1))}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[#F2F4F6] transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-[#4E5968]" />
          </button>
          <span className="text-[15px] font-semibold text-[#191F28] min-w-[80px] text-center">
            {format(baseDate, "yyyy년 M월", { locale: ko })}
          </span>
          <button
            onClick={() => setBaseDate((d) => addMonths(d, 1))}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[#F2F4F6] transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-[#4E5968]" />
          </button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "확인된 스케줄", value: summary.total, color: "text-[#191F28]" },
          { label: "정상 출근", value: summary.normal, color: "text-emerald-600" },
          { label: "지각", value: summary.late, color: "text-amber-600" },
          { label: "결근", value: summary.absent, color: "text-red-500" },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-2xl p-4 border border-[#E5E8EB]">
            <p className="text-[12px] text-[#8B95A1] mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-5 items-start">
        {/* 리더보드 */}
        <div className="flex-1 bg-white rounded-2xl border border-[#E5E8EB] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5E8EB] flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            <h2 className="font-semibold text-[#191F28] text-[15px]">이번 달 리더보드</h2>
          </div>

          {isLoading ? (
            <div className="p-8 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-[#F2F4F6] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : stats.length === 0 ? (
            <div className="p-12 text-center text-[#8B95A1] text-[14px]">
              이번 달 스케줄이 없어요
            </div>
          ) : (
            <div className="divide-y divide-[#F2F4F6]">
              {stats.map((stat, idx) => {
                const tier = TIER_INFO(stat.rate);
                const isSelected = selectedProfile === stat.profile_id;
                return (
                  <button
                    key={stat.profile_id}
                    onClick={() =>
                      setSelectedProfile(isSelected ? null : stat.profile_id)
                    }
                    className={`w-full flex items-center gap-4 px-5 py-3.5 text-left transition-colors ${
                      isSelected ? "bg-[#E8F3FF]" : "hover:bg-[#F9FAFB]"
                    }`}
                  >
                    {/* 순위 */}
                    <span
                      className={`text-[13px] font-bold w-5 text-center shrink-0 ${
                        idx === 0
                          ? "text-amber-500"
                          : idx === 1
                          ? "text-slate-400"
                          : idx === 2
                          ? "text-orange-400"
                          : "text-[#8B95A1]"
                      }`}
                    >
                      {idx + 1}
                    </span>

                    {/* 아바타 */}
                    <AvatarDisplay
                      userId={stat.profile_id}
                      avatarConfig={stat.avatar_config}
                      size={32}
                    />

                    {/* 이름 + 티어 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-semibold text-[#191F28] truncate">
                          {stat.name}
                        </span>
                        <span className={`text-[11px] font-medium ${tier.color} hidden sm:block`}>
                          {tier.label}
                        </span>
                      </div>
                      {/* 진행률 바 */}
                      <div className="mt-1 h-1.5 bg-[#F2F4F6] rounded-full overflow-hidden w-full max-w-[120px]">
                        <div
                          className="h-full bg-[#3182F6] rounded-full transition-all"
                          style={{ width: `${stat.rate}%` }}
                        />
                      </div>
                    </div>

                    {/* 정상출근률 */}
                    <span className="text-[15px] font-bold text-[#191F28] shrink-0">
                      {stat.rate}%
                    </span>

                    {/* 요약 수치 */}
                    <div className="hidden sm:flex items-center gap-1.5 text-[12px] shrink-0">
                      <span className="text-emerald-600 font-medium">{stat.normal}정상</span>
                      {stat.late_minor + stat.late_major > 0 && (
                        <span className="text-amber-600 font-medium">
                          {stat.late_minor + stat.late_major}지각
                        </span>
                      )}
                      {stat.absent > 0 && (
                        <span className="text-red-500 font-medium">{stat.absent}결근</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 개인 상세 패널 */}
        {selectedProfile && selectedStat && (
          <div className="w-[300px] shrink-0 bg-white rounded-2xl border border-[#E5E8EB] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E5E8EB] flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#3182F6]" />
              <h2 className="font-semibold text-[#191F28] text-[15px]">
                {selectedStat.name} 상세
              </h2>
            </div>

            {/* 요약 수치 */}
            <div className="p-5 border-b border-[#F2F4F6]">
              <div className="flex items-end gap-2 mb-3">
                <span className="text-3xl font-bold text-[#191F28]">{selectedStat.rate}%</span>
                <span className={`text-[13px] font-medium pb-1 ${TIER_INFO(selectedStat.rate).color}`}>
                  {TIER_INFO(selectedStat.rate).label}
                </span>
              </div>
              <div className="h-2 bg-[#F2F4F6] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#3182F6] rounded-full transition-all"
                  style={{ width: `${selectedStat.rate}%` }}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4">
                {[
                  { label: "정상", val: selectedStat.normal, color: "text-emerald-600" },
                  { label: "지각", val: selectedStat.late_minor + selectedStat.late_major, color: "text-amber-600" },
                  { label: "결근", val: selectedStat.absent, color: "text-red-500" },
                  { label: "미확인", val: selectedStat.unconfirmed, color: "text-slate-400" },
                ].map((r) => (
                  <div key={r.label} className="bg-[#F9FAFB] rounded-xl p-3">
                    <p className="text-[11px] text-[#8B95A1]">{r.label}</p>
                    <p className={`text-xl font-bold ${r.color}`}>{r.val}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 날짜별 상세 */}
            <div className="max-h-[360px] overflow-y-auto">
              {detailSlots.map((s) => (
                <div
                  key={`${s.profile_id}-${s.slot_date}`}
                  className="flex items-center justify-between px-5 py-3 border-b border-[#F2F4F6] last:border-0"
                >
                  <span className="text-[13px] text-[#4E5968]">
                    {format(parseISO(s.slot_date), "M/d (EEE)", { locale: ko })}
                  </span>
                  <div className="flex items-center gap-2">
                    {s.checkin_time && (
                      <span className="text-[12px] text-[#8B95A1]">
                        {format(new Date(s.checkin_time), "HH:mm")}
                      </span>
                    )}
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[s.status]}`}
                    >
                      {STATUS_LABEL[s.status]}
                      {(s.status === "late_minor" || s.status === "late_major") &&
                        s.late_minutes > 0 &&
                        ` +${s.late_minutes}분`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
