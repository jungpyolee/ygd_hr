"use client";

import useSWR from "swr";
import AvatarDisplay from "@/components/AvatarDisplay";
import {
  Phone,
  Edit2,
  AlertCircle,
  ArrowRight,
  Clock,
  Users,
  TimerIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { format, addDays, differenceInCalendarDays, subDays, parseISO, startOfDay } from "date-fns";
import { useWorkplaces } from "@/lib/hooks/useWorkplaces";
import { ko } from "date-fns/locale";

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

interface HealthCertItem {
  id: string;
  name: string;
  color_hex: string | null;
  avatar_config?: any;
  phone: string | null;
  health_cert_date: string;
  days_left: number;
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
  const { data: todayAttendance = [] } = useSWR(
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
          "profile_id, start_time, end_time, store_id, profiles!profile_id(name, color_hex, avatar_config)",
        )
        .eq("slot_date", todayStr)
        .eq("status", "active")
        .in("weekly_schedule_id", wsIds);

      if (!slotsData || slotsData.length === 0) return [];

      const profileIds = [...new Set(slotsData.map((s: any) => s.profile_id))];
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
            (new Date(clockIn).getTime() - slotStart.getTime()) / 60000,
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
    { dedupingInterval: 60_000, revalidateOnFocus: false },
  );

  // 보건증 만료 30일 이내
  const { data: expiringHealthCerts = [] } = useSWR(
    "admin-health-cert-expiry",
    async () => {
      const supabase = createClient();
      const today = format(new Date(), "yyyy-MM-dd");
      const thirtyDaysLater = format(addDays(new Date(), 30), "yyyy-MM-dd");

      const { data } = await supabase
        .from("profiles")
        .select("id, name, color_hex, avatar_config, phone, health_cert_date")
        .not("health_cert_date", "is", null)
        .gte("health_cert_date", today)
        .lte("health_cert_date", thirtyDaysLater)
        .order("health_cert_date", { ascending: true });

      return ((data ?? []) as HealthCertItem[]).map((p) => ({
        ...p,
        days_left: differenceInCalendarDays(parseISO(p.health_cert_date), startOfDay(new Date())),
      }));
    },
    { dedupingInterval: 300_000, revalidateOnFocus: false },
  );

  // 추가근무 미처리 건수 (date-profile_id 별로 approved/dismissed 없는 것)
  const { data: pendingOvertimeCount = 0 } = useSWR(
    "admin-pending-overtime-count",
    async () => {
      const supabase = createClient();
      const today = new Date();
      const startDate = format(subDays(today, 29), "yyyy-MM-dd");
      const endDate = format(today, "yyyy-MM-dd");
      const startStr = new Date(`${startDate}T00:00:00+09:00`).toISOString();
      const endStr = new Date(`${endDate}T23:59:59.999+09:00`).toISOString();

      const [{ data: logs }, { data: slots }, { data: otRecords }, { data: storeData }] =
        await Promise.all([
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

      // processed 키 세트
      const processedKeys = new Set(
        (otRecords ?? []).map((r: any) => `${r.date}_${r.profile_id}`)
      );

      // 출퇴근 쌍
      const pairMap = new Map<string, { date: string; in: Date; out: Date | null }>();
      (logs ?? []).forEach((log: any) => {
        const d = format(new Date(log.created_at), "yyyy-MM-dd");
        const key = `${d}_${log.profile_id}`;
        if (log.type === "IN") {
          if (!pairMap.has(key))
            pairMap.set(key, { date: d, in: new Date(log.created_at), out: null });
        } else if (log.type === "OUT") {
          const p = pairMap.get(key);
          if (p) p.out = new Date(log.created_at);
        }
      });

      // 슬롯 맵
      const slotMap = new Map<string, { start: string; end: string }>();
      (slots ?? []).forEach((slot: any) => {
        const key = `${slot.slot_date}_${slot.profile_id}`;
        const s = slot.start_time.slice(0, 5);
        const e = slot.end_time.slice(0, 5);
        const ex = slotMap.get(key);
        if (!ex) slotMap.set(key, { start: s, end: e });
        else slotMap.set(key, { start: s < ex.start ? s : ex.start, end: e > ex.end ? e : ex.end });
      });

      let count = 0;
      pairMap.forEach((pair, key) => {
        if (!pair.out) return;
        if (processedKeys.has(key)) return;
        const slot = slotMap.get(key);
        if (slot) {
          const toM = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
          const lateOut = Math.max(0, toM(format(pair.out, "HH:mm")) - toM(slot.end));
          const earlyIn = includeEarly
            ? Math.max(0, toM(slot.start) - toM(format(pair.in, "HH:mm")))
            : 0;
          if (lateOut + earlyIn >= minMinutes) count++;
        } else {
          count++; // 스케줄 없음 케이스
        }
      });

      return count;
    },
    { dedupingInterval: 120_000, revalidateOnFocus: true }
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

  return (
    <div className="max-w-3xl animate-in fade-in duration-500 pb-20">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-[#191F28] tracking-tight mb-1">
          대시보드
        </h1>
        <p className="text-[15px] text-[#8B95A1] font-medium">{todayText}</p>
      </header>

      {/* 오늘 출근 현황 */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[17px] font-bold text-[#191F28]">
            오늘 출근 현황
          </h2>
          <div className="flex gap-2.5 text-[12px] font-medium">
            {Object.entries(
              todayAttendance.reduce(
                (acc, item) => {
                  acc[item.store_id] = (acc[item.store_id] || 0) + 1;
                  return acc;
                },
                {} as Record<string, number>,
              ),
            ).map(([storeId, cnt]) => (
              <span key={storeId} style={{ color: byId[storeId]?.color }}>
                {byId[storeId]?.label || storeId} {cnt}명
              </span>
            ))}
          </div>
        </div>

        {todayAttendance.length === 0 ? (
          <div className="bg-white rounded-[24px] border border-slate-100 p-10 text-center text-[#8B95A1] text-[14px]">
            오늘 확정된 스케줄이 없어요
          </div>
        ) : (
          <div className="bg-white rounded-[24px] border border-slate-100 overflow-hidden divide-y divide-slate-50">
            {todayAttendance.map((item) => {
              const sc = statusConfig(item);
              return (
                <div
                  key={`${item.profile_id}_${item.start_time}`}
                  className="flex items-center justify-between px-4 py-3.5"
                >
                  <div className="flex items-center gap-3">
                    <AvatarDisplay userId={item.profile_id} avatarConfig={item.avatar_config} size={36} />
                    <div>
                      <p className="text-[15px] font-bold text-[#191F28]">
                        {item.name}
                      </p>
                      <div className="flex items-center gap-1.5 text-[12px] text-[#8B95A1]">
                        <span
                          style={{ color: byId[item.store_id]?.color }}
                        >
                          {byId[item.store_id]?.label || item.store_id}
                        </span>
                        <span>·</span>
                        <span>
                          {item.start_time.slice(0, 5)}~
                          {item.end_time.slice(0, 5)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.clock_in_time && (
                      <span className="text-[12px] text-[#8B95A1] font-medium">
                        {format(new Date(item.clock_in_time), "H:mm", {
                          locale: ko,
                        })}
                      </span>
                    )}
                    <span
                      className="px-2.5 py-1 rounded-lg text-[12px] font-bold"
                      style={{ backgroundColor: sc.bg, color: sc.color }}
                    >
                      {sc.text}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 보건증 만료 임박 */}
      {expiringHealthCerts.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-[#F59E0B]" />
            <h2 className="text-[17px] font-bold text-[#191F28]">
              보건증 만료 임박
            </h2>
            <span className="text-[12px] font-bold text-[#F59E0B] bg-[#FFF7E6] px-2 py-0.5 rounded-full">
              {expiringHealthCerts.length}명
            </span>
          </div>
          <div className="bg-white rounded-[24px] border border-[#FFE8A3] overflow-hidden divide-y divide-slate-50">
            {expiringHealthCerts.map((emp) => (
              <div
                key={emp.id}
                className="flex items-center justify-between px-4 py-3.5"
              >
                <div className="flex items-center gap-3">
                  <AvatarDisplay userId={emp.id} avatarConfig={emp.avatar_config} size={36} />
                  <div>
                    <p className="text-[15px] font-bold text-[#191F28]">
                      {emp.name}
                    </p>
                    <p className="text-[12px] text-[#8B95A1]">
                      {format(new Date(emp.health_cert_date), "M월 d일")} 만료
                      {" · "}
                      <span
                        className={
                          emp.days_left <= 7
                            ? "text-[#F04438] font-bold"
                            : "text-[#F59E0B] font-bold"
                        }
                      >
                        {emp.days_left === 0
                          ? "오늘 만료"
                          : `${emp.days_left}일 후`}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {emp.phone && (
                    <a
                      href={`tel:${emp.phone}`}
                      className="p-2.5 bg-[#F2F4F6] text-[#4E5968] rounded-full hover:bg-[#E5E8EB]"
                    >
                      <Phone className="w-4 h-4" />
                    </a>
                  )}
                  <button
                    onClick={() => router.push("/admin/employees")}
                    className="p-2.5 bg-[#E8F3FF] text-[#3182F6] rounded-full hover:bg-[#D0E5FF]"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 바로가기 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <button
          onClick={() => router.push("/admin/attendance")}
          className="group flex items-center justify-between p-6 bg-white rounded-[24px] border border-slate-100 shadow-sm hover:shadow-md transition-all"
        >
          <div className="flex items-center gap-4 text-left">
            <div className="w-11 h-11 rounded-2xl bg-[#F2F4F6] flex items-center justify-center group-hover:bg-[#E8F3FF]">
              <Clock className="w-5 h-5 text-[#4E5968] group-hover:text-[#3182F6]" />
            </div>
            <div>
              <p className="text-[16px] font-bold text-[#191F28]">근태 기록</p>
              <p className="text-[12px] text-[#8B95A1]">전체 출퇴근 타임라인</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-[#D1D6DB] group-hover:text-[#3182F6]" />
        </button>

        <button
          onClick={() => router.push("/admin/employees")}
          className="group flex items-center justify-between p-6 bg-white rounded-[24px] border border-slate-100 shadow-sm hover:shadow-md transition-all"
        >
          <div className="flex items-center gap-4 text-left">
            <div className="w-11 h-11 rounded-2xl bg-[#F2F4F6] flex items-center justify-center group-hover:bg-[#E8F3FF]">
              <Users className="w-5 h-5 text-[#4E5968] group-hover:text-[#3182F6]" />
            </div>
            <div>
              <p className="text-[16px] font-bold text-[#191F28]">직원 관리</p>
              <p className="text-[12px] text-[#8B95A1]">인사 정보 및 서류</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-[#D1D6DB] group-hover:text-[#3182F6]" />
        </button>

        <button
          onClick={() => router.push("/admin/overtime")}
          className="group flex items-center justify-between p-6 bg-white rounded-[24px] border border-slate-100 shadow-sm hover:shadow-md transition-all"
        >
          <div className="flex items-center gap-4 text-left">
            <div className="relative w-11 h-11 rounded-2xl bg-[#F2F4F6] flex items-center justify-center group-hover:bg-[#E8F3FF]">
              <TimerIcon className="w-5 h-5 text-[#4E5968] group-hover:text-[#3182F6]" />
              {pendingOvertimeCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[#F59E0B] text-white text-[11px] font-bold rounded-full flex items-center justify-center">
                  {pendingOvertimeCount}
                </span>
              )}
            </div>
            <div>
              <p className="text-[16px] font-bold text-[#191F28]">추가근무 관리</p>
              <p className="text-[12px] text-[#8B95A1]">
                {pendingOvertimeCount > 0
                  ? `확인 필요 ${pendingOvertimeCount}건`
                  : "모두 확인 완료"}
              </p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-[#D1D6DB] group-hover:text-[#3182F6]" />
        </button>
      </div>

      {/* 테스트용 게임 진입 */}
      <div className="mt-6">
        <button
          onClick={() => router.push("/game")}
          className="w-full flex items-center justify-between p-4 bg-[#1a1a2e] rounded-[20px]"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🐱</span>
            <div className="text-left">
              <p className="text-white text-[14px] font-bold">냥냥 서바이벌</p>
              <p className="text-white/40 text-[11px]">테스트 전용</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-white/30" />
        </button>
      </div>
    </div>
  );
}
