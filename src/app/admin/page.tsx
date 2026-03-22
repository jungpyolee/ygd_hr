"use client";

import useSWR from "swr";
import {
  Phone,
  Edit2,
  AlertCircle,
  ArrowRight,
  Clock,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { format, addDays, differenceInDays } from "date-fns";
import { useWorkplaces } from "@/lib/hooks/useWorkplaces";
import { ko } from "date-fns/locale";

interface TodayAttendanceItem {
  profile_id: string;
  name: string;
  color_hex: string;
  start_time: string;
  end_time: string;
  work_location: string;
  clock_in_time: string | null;
  status: "attended" | "late" | "scheduled" | "absent";
  late_minutes: number;
}

interface HealthCertItem {
  id: string;
  name: string;
  color_hex: string | null;
  phone: string | null;
  health_cert_date: string;
  days_left: number;
}


export default function AdminDashboardPage() {
  const router = useRouter();
  const { byKey } = useWorkplaces();

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
          "profile_id, start_time, end_time, work_location, profiles!profile_id(name, color_hex)",
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
          start_time: slot.start_time,
          end_time: slot.end_time,
          work_location: slot.work_location,
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
        .select("id, name, color_hex, phone, health_cert_date")
        .not("health_cert_date", "is", null)
        .gte("health_cert_date", today)
        .lte("health_cert_date", thirtyDaysLater)
        .order("health_cert_date", { ascending: true });

      return ((data ?? []) as HealthCertItem[]).map((p) => ({
        ...p,
        days_left: differenceInDays(new Date(p.health_cert_date), new Date()),
      }));
    },
    { dedupingInterval: 300_000, revalidateOnFocus: false },
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
                  acc[item.work_location] = (acc[item.work_location] || 0) + 1;
                  return acc;
                },
                {} as Record<string, number>,
              ),
            ).map(([loc, cnt]) => (
              <span key={loc} style={{ color: byKey[loc]?.color }}>
                {byKey[loc]?.label || loc} {cnt}명
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
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-bold text-white shrink-0"
                      style={{ backgroundColor: item.color_hex }}
                    >
                      {item.name?.charAt(0)}
                    </div>
                    <div>
                      <p className="text-[15px] font-bold text-[#191F28]">
                        {item.name}
                      </p>
                      <div className="flex items-center gap-1.5 text-[12px] text-[#8B95A1]">
                        <span
                          style={{ color: byKey[item.work_location]?.color }}
                        >
                          {byKey[item.work_location]?.label || item.work_location}
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
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-bold text-white shrink-0"
                    style={{ backgroundColor: emp.color_hex || "#8B95A1" }}
                  >
                    {emp.name.charAt(0)}
                  </div>
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
