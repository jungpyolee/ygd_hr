"use client";

import useSWR from "swr";
import AvatarDisplay from "@/components/AvatarDisplay";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  format,
  addDays,
  differenceInCalendarDays,
  subDays,
  parseISO,
  startOfDay,
} from "date-fns";
import { useWorkplaces } from "@/lib/hooks/useWorkplaces";
import { ko } from "date-fns/locale";

import DashboardKPICards from "@/components/admin/DashboardKPICards";
import ActionRequiredBanner from "@/components/admin/ActionRequiredBanner";

import WeekScheduleStrip from "@/components/admin/WeekScheduleStrip";
import AdminQuickNav from "@/components/admin/AdminQuickNav";
import DashboardActivityFeed from "@/components/admin/DashboardActivityFeed";

interface TodayAttendanceItem {
  profile_id: string;
  name: string;
  color_hex: string;
  avatar_config?: any;
  start_time: string;
  end_time: string;
  store_id: string;
  clock_in_time: string | null;
  status: "attended" | "late" | "scheduled" | "absent";
  late_minutes: number;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { byId } = useWorkplaces();

  const todayText = new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date());

  // 오늘 출근 현황
  const { data: todayAttendance = [], isLoading: loadingAttendance } = useSWR(
    "admin-today-attendance",
    async () => {
      const supabase = createClient();
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const now = new Date();

      const weekAgo = format(addDays(new Date(), -7), "yyyy-MM-dd");
      const { data: wsData } = await supabase
        .from("weekly_schedules")
        .select("id")
        .eq("status", "confirmed")
        .gte("week_start", weekAgo);

      if (!wsData || wsData.length === 0) return [];
      const wsIds = wsData.map((ws: { id: string }) => ws.id);

      const { data: slotsData } = await supabase
        .from("schedule_slots")
        .select(
          "profile_id, start_time, end_time, store_id, profiles!profile_id(name, color_hex, avatar_config)"
        )
        .eq("slot_date", todayStr)
        .eq("status", "active")
        .in("weekly_schedule_id", wsIds);

      if (!slotsData || slotsData.length === 0) return [];

      const profileIds = [
        ...new Set(slotsData.map((s: any) => s.profile_id)),
      ];
      const dayStart = new Date(todayStr + "T00:00:00+09:00").toISOString();
      const dayEnd = new Date(todayStr + "T23:59:59+09:00").toISOString();

      const { data: logsData } = await supabase
        .from("attendance_logs")
        .select("profile_id, created_at")
        .eq("type", "IN")
        .in("profile_id", profileIds)
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd)
        .order("created_at", { ascending: true });

      const checkInMap = new Map<string, string>();
      (logsData || []).forEach((log: any) => {
        if (!checkInMap.has(log.profile_id))
          checkInMap.set(log.profile_id, log.created_at);
      });

      const items: TodayAttendanceItem[] = slotsData.map((slot: any) => {
        const clockIn = checkInMap.get(slot.profile_id) || null;
        const [sh, sm] = slot.start_time.split(":").map(Number);
        const slotStart = new Date(todayStr + "T00:00:00");
        slotStart.setHours(sh, sm, 0, 0);

        let status: TodayAttendanceItem["status"];
        let late_minutes = 0;

        if (clockIn) {
          const diff = Math.floor(
            (new Date(clockIn).getTime() - slotStart.getTime()) / 60000
          );
          if (diff > 10) {
            status = "late";
            late_minutes = diff;
          } else {
            status = "attended";
          }
        } else {
          status =
            now.getTime() - slotStart.getTime() >= 10 * 60 * 1000
              ? "absent"
              : "scheduled";
        }

        return {
          profile_id: slot.profile_id,
          name: slot.profiles?.name || "알 수 없음",
          color_hex: slot.profiles?.color_hex || "#8B95A1",
          avatar_config: slot.profiles?.avatar_config ?? null,
          start_time: slot.start_time,
          end_time: slot.end_time,
          store_id: slot.store_id,
          clock_in_time: clockIn,
          status,
          late_minutes,
        };
      });

      return items.sort((a, b) => a.start_time.localeCompare(b.start_time));
    },
    { dedupingInterval: 60_000, revalidateOnFocus: false }
  );

  // 처리 필요 건수 통합 (추가근무 + 대타 + 보건증)
  const { data: actionData } = useSWR(
    "admin-dashboard-actions",
    async () => {
      const supabase = createClient();
      const today = new Date();
      const todayStr = format(today, "yyyy-MM-dd");

      const [subResult, healthResult, overtimeCount, missedCheckoutCount] = await Promise.all([
        // 대타 미처리
        supabase
          .from("substitute_requests")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending"),
        // 보건증 만료/임박 (7일 이내)
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .not("health_cert_date", "is", null)
          .lte(
            "health_cert_date",
            format(addDays(today, 7), "yyyy-MM-dd")
          ),
        // 추가근무 미처리
        (async () => {
          const startDate = format(subDays(today, 29), "yyyy-MM-dd");
          const endDate = todayStr;
          const startStr = new Date(
            `${startDate}T00:00:00+09:00`
          ).toISOString();
          const endStr = new Date(
            `${endDate}T23:59:59.999+09:00`
          ).toISOString();

          const [
            { data: logs },
            { data: slots },
            { data: otRecords },
            { data: storeData },
          ] = await Promise.all([
            supabase
              .from("attendance_logs")
              .select("profile_id, type, created_at")
              .gte("created_at", startStr)
              .lte("created_at", endStr),
            supabase
              .from("schedule_slots")
              .select("profile_id, slot_date, start_time, end_time")
              .gte("slot_date", startDate)
              .lte("slot_date", endDate)
              .eq("status", "active"),
            supabase
              .from("overtime_requests")
              .select("profile_id, date")
              .gte("date", startDate)
              .lte("date", endDate)
              .in("status", ["approved", "dismissed"]),
            supabase
              .from("stores")
              .select("overtime_min_minutes, overtime_include_early")
              .order("display_order")
              .limit(1)
              .single(),
          ]);

          const minMinutes = storeData?.overtime_min_minutes ?? 10;
          const includeEarly = storeData?.overtime_include_early ?? false;

          const processedKeys = new Set(
            (otRecords ?? []).map((r: any) => `${r.date}_${r.profile_id}`)
          );

          const pairMap = new Map<
            string,
            { date: string; in: Date; out: Date | null }
          >();
          (logs ?? []).forEach((log: any) => {
            const d = format(new Date(log.created_at), "yyyy-MM-dd");
            const key = `${d}_${log.profile_id}`;
            if (log.type === "IN") {
              if (!pairMap.has(key))
                pairMap.set(key, {
                  date: d,
                  in: new Date(log.created_at),
                  out: null,
                });
            } else if (log.type === "OUT") {
              const p = pairMap.get(key);
              if (p) p.out = new Date(log.created_at);
            }
          });

          const slotMap = new Map<string, { start: string; end: string }>();
          (slots ?? []).forEach((slot: any) => {
            const key = `${slot.slot_date}_${slot.profile_id}`;
            const s = slot.start_time.slice(0, 5);
            const e = slot.end_time.slice(0, 5);
            const ex = slotMap.get(key);
            if (!ex) slotMap.set(key, { start: s, end: e });
            else
              slotMap.set(key, {
                start: s < ex.start ? s : ex.start,
                end: e > ex.end ? e : ex.end,
              });
          });

          let count = 0;
          pairMap.forEach((pair, key) => {
            if (!pair.out) return;
            if (processedKeys.has(key)) return;
            const slot = slotMap.get(key);
            if (slot) {
              const toM = (t: string) => {
                const [h, m] = t.split(":").map(Number);
                return h * 60 + m;
              };
              const lateOut = Math.max(
                0,
                toM(format(pair.out, "HH:mm")) - toM(slot.end)
              );
              const earlyIn = includeEarly
                ? Math.max(
                    0,
                    toM(slot.start) - toM(format(pair.in, "HH:mm"))
                  )
                : 0;
              if (lateOut + earlyIn >= minMinutes) count++;
            } else {
              count++;
            }
          });

          return count;
        })(),
        // 미퇴근 집계 (과거 전체 날짜 중 IN만 있고 OUT 없는 건)
        (async () => {
          const [{ data: inLogs }, { data: outLogs }] = await Promise.all([
            supabase
              .from("attendance_logs")
              .select("profile_id, created_at")
              .eq("type", "IN")
              .lt("created_at", `${todayStr}T00:00:00+09:00`),
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
          for (const log of inLogs ?? []) {
            const d = format(new Date(log.created_at), "yyyy-MM-dd");
            const key = `${(log as any).profile_id}|${d}`;
            if (!outSet.has(key)) seen.add(key);
          }
          return seen.size;
        })(),
      ]);

      return {
        overtimeCount: overtimeCount as number,
        subCount: subResult.count ?? 0,
        healthCertCount: healthResult.count ?? 0,
        missedCheckoutCount: missedCheckoutCount as number,
      };
    },
    { dedupingInterval: 120_000, revalidateOnFocus: true }
  );

  const overtimeCount = actionData?.overtimeCount ?? 0;
  const subCount = actionData?.subCount ?? 0;
  const healthCertCount = actionData?.healthCertCount ?? 0;
  const missedCheckoutCount = actionData?.missedCheckoutCount ?? 0;

  // KPI 계산
  const attendedCount = todayAttendance.filter(
    (i) => i.status === "attended" || i.status === "late"
  ).length;
  const lateItems = todayAttendance.filter((i) => i.status === "late");
  const absentCount = todayAttendance.filter(
    (i) => i.status === "absent"
  ).length;
  const scheduledCount = todayAttendance.filter(
    (i) => i.status === "scheduled"
  ).length;
  const lateAvgMinutes =
    lateItems.length > 0
      ? Math.round(
          lateItems.reduce((s, i) => s + i.late_minutes, 0) / lateItems.length
        )
      : 0;

  // 매장별 현재 근무 인원 (출근 완료 + 지각 포함)
  const workingByStore = todayAttendance
    .filter((i) => i.status === "attended" || i.status === "late")
    .reduce(
      (acc, item) => {
        acc[item.store_id] = (acc[item.store_id] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

  // 매장별 그룹핑
  const storeGroups = todayAttendance.reduce(
    (acc, item) => {
      if (!acc[item.store_id]) acc[item.store_id] = [];
      acc[item.store_id].push(item);
      return acc;
    },
    {} as Record<string, TodayAttendanceItem[]>
  );

  const statusConfig = (item: TodayAttendanceItem) =>
    ({
      attended: { text: "출근완료", color: "#00B761", bg: "#E6FAF0" },
      late: {
        text: `지각 +${item.late_minutes}분`,
        color: "#F59E0B",
        bg: "#FFF7E6",
      },
      scheduled: {
        text: `${item.start_time.slice(0, 5)} 예정`,
        color: "#8B95A1",
        bg: "#F2F4F6",
      },
      absent: { text: "미출근", color: "#F04438", bg: "#FFF0F0" },
    })[item.status];

  const statusDots = [
    { label: "출근", count: attendedCount, color: "#00B761" },
    { label: "지각", count: lateItems.length, color: "#F59E0B" },
    { label: "미출근", count: absentCount, color: "#F04438" },
    { label: "예정", count: scheduledCount, color: "#8B95A1" },
  ];

  return (
    <div className="max-w-3xl animate-in fade-in duration-500 pb-20">
      {/* 1. 헤더 */}
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-[#191F28] tracking-tight mb-1">
          대시보드
        </h1>
        <p className="text-[14px] text-[#8B95A1] font-medium">
          {todayText}
          {Object.keys(workingByStore).length > 0 && (
            <>
              {" · "}
              {Object.entries(workingByStore)
                .map(
                  ([storeId, cnt]) =>
                    `${byId[storeId]?.label || storeId} ${cnt}명`
                )
                .join(" · ")}{" "}
              근무 중
            </>
          )}
        </p>
      </header>

      {/* 2. 매장별 출근 현황 */}
      <section className="mb-5">
        {loadingAttendance ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="bg-white rounded-[28px] border border-slate-100 p-5 animate-pulse"
              >
                <div className="h-3 bg-[#F2F4F6] rounded w-16 mb-3" />
                <div className="h-7 bg-[#F2F4F6] rounded w-12 mb-2" />
                <div className="h-2.5 bg-[#F2F4F6] rounded w-24" />
              </div>
            ))}
          </div>
        ) : (
          <DashboardKPICards storeGroups={storeGroups} byId={byId} />
        )}
      </section>

      {/* 3. 처리 필요 배너 */}
      <section className="mb-5">
        <ActionRequiredBanner
          overtimeCount={overtimeCount}
          subCount={subCount}
          healthCertCount={healthCertCount}
          missedCheckoutCount={missedCheckoutCount}
        />
      </section>

      {/* 4. 오늘 출근 현황 */}
      <section className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-bold text-[#191F28]">
            오늘 출근 현황
          </h2>
          <div className="flex gap-3 text-[11px] font-medium">
            {statusDots.map((d) => (
              <span key={d.label} className="flex items-center gap-1">
                <span
                  className="w-1.5 h-1.5 rounded-full inline-block"
                  style={{ backgroundColor: d.color }}
                />
                <span style={{ color: d.color }}>
                  {d.label} {d.count}
                </span>
              </span>
            ))}
          </div>
        </div>

        {todayAttendance.length === 0 ? (
          <div className="bg-white rounded-[24px] border border-slate-100 p-10 text-center text-[#8B95A1] text-[14px]">
            오늘 확정된 스케줄이 없어요
          </div>
        ) : (
          <div className="bg-white rounded-[24px] border border-slate-100 overflow-hidden">
            {Object.entries(storeGroups).map(
              ([storeId, items], groupIdx) => (
                <div key={storeId}>
                  {/* 매장 서브헤더 */}
                  {Object.keys(storeGroups).length > 1 && (
                    <div
                      className={`px-4 py-2 bg-[#F9FAFB] flex items-center gap-2 ${groupIdx > 0 ? "border-t border-slate-100" : ""}`}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{
                          backgroundColor:
                            byId[storeId]?.color || "#8B95A1",
                        }}
                      />
                      <span
                        className="text-[12px] font-bold"
                        style={{
                          color: byId[storeId]?.color || "#8B95A1",
                        }}
                      >
                        {byId[storeId]?.label || storeId}
                      </span>
                      <span className="text-[11px] text-[#8B95A1]">
                        {items.length}명
                      </span>
                    </div>
                  )}
                  <div className="divide-y divide-slate-50">
                    {items.map((item) => {
                      const sc = statusConfig(item);
                      return (
                        <div
                          key={`${item.profile_id}_${item.start_time}`}
                          className="flex items-center justify-between px-4 py-3.5"
                        >
                          <div className="flex items-center gap-3">
                            <AvatarDisplay
                              userId={item.profile_id}
                              avatarConfig={item.avatar_config}
                              size={36}
                            />
                            <div>
                              <p className="text-[15px] font-bold text-[#191F28]">
                                {item.name}
                              </p>
                              <div className="flex items-center gap-1.5 text-[12px] text-[#8B95A1]">
                                {Object.keys(storeGroups).length <=
                                  1 && (
                                  <>
                                    <span
                                      style={{
                                        color:
                                          byId[item.store_id]?.color,
                                      }}
                                    >
                                      {byId[item.store_id]?.label ||
                                        item.store_id}
                                    </span>
                                    <span>·</span>
                                  </>
                                )}
                                <span>
                                  {item.start_time.slice(0, 5)}~
                                  {item.end_time.slice(0, 5)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {item.clock_in_time && (
                              <span
                                className="text-[13px] font-bold tabular-nums"
                                style={{ color: item.status === "late" ? "#F59E0B" : "#00B761" }}
                              >
                                {format(
                                  new Date(item.clock_in_time),
                                  "H:mm",
                                  { locale: ko }
                                )}
                              </span>
                            )}
                            <span
                              className="px-2.5 py-1 rounded-lg text-[12px] font-bold"
                              style={{
                                backgroundColor: sc.bg,
                                color: sc.color,
                              }}
                            >
                              {sc.text}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </section>

      {/* 이번 주 스케줄 */}
      <section className="mb-5">
        <WeekScheduleStrip />
      </section>

      {/* 7. 빠른 이동 */}
      <section className="mb-5">
        <AdminQuickNav
          overtimeBadge={overtimeCount}
          healthCertBadge={healthCertCount}
        />
      </section>

      {/* 8. 최근 활동 */}
      <DashboardActivityFeed />
    </div>
  );
}
