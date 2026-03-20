"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Users,
  UserCheck,
  Clock,
  ArrowRight,
  FileWarning,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Phone,
  Edit2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

interface DashboardDetails {
  workingNow: any[];
  pendingDocs: any[];
  anomalies: any[];
}

interface TodayAttendanceItem {
  profile_id: string;
  name: string;
  color_hex: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  work_location: string;
  clock_in_time: string | null; // ISO string
  status: "attended" | "late" | "scheduled" | "absent";
  late_minutes: number;
}

const LOCATION_LABELS: Record<string, string> = {
  cafe: "카페",
  factory: "공장",
  catering: "케이터링",
};
const LOCATION_COLORS: Record<string, string> = {
  cafe: "#3182F6",
  factory: "#00B761",
  catering: "#F59E0B",
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const todayText = new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date());

  const { data: dashboardData } = useSWR(
    "admin-dashboard",
    async () => {
      const supabase = createClient();
      const todayStr = format(new Date(), "yyyy-MM-dd");

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data: latestLogs } = await supabase
        .from("attendance_logs")
        .select(
          `profile_id, type, created_at, profiles(name, phone, color_hex)`,
        )
        .gte("created_at", thirtyDaysAgo.toISOString())
        .order("created_at", { ascending: false });

      const { data: profiles } = await supabase.from("profiles").select("*");

      if (!latestLogs || !profiles) {
        return {
          stats: { workingNow: 0, totalToday: 0, pendingDocs: 0, anomalies: 0 },
          details: { workingNow: [], pendingDocs: [], anomalies: [] },
        };
      }

      const latestMap = new Map();
      latestLogs.forEach((log) => {
        if (!latestMap.has(log.profile_id)) latestMap.set(log.profile_id, log);
      });
      const userLastActions = Array.from(latestMap.values());

      const workingList = userLastActions.filter(
        (log) =>
          log.type === "IN" &&
          format(new Date(log.created_at), "yyyy-MM-dd") === todayStr,
      );

      const anomalyList = userLastActions.filter(
        (log) =>
          log.type === "IN" &&
          format(new Date(log.created_at), "yyyy-MM-dd") !== todayStr,
      );

      const now = new Date();
      const docsList = profiles.filter((p) => {
        const hasMissingFile =
          !p.employment_contract_url ||
          !p.bank_account_copy_url ||
          !p.resident_register_url;
        const isHealthExpired =
          p.health_cert_date && new Date(p.health_cert_date) < now;
        return hasMissingFile || isHealthExpired;
      });

      return {
        stats: {
          workingNow: workingList.length,
          totalToday: new Set(
            latestLogs
              .filter(
                (l) =>
                  format(new Date(l.created_at), "yyyy-MM-dd") === todayStr &&
                  l.type === "IN",
              )
              .map((l) => l.profile_id),
          ).size,
          pendingDocs: docsList.length,
          anomalies: anomalyList.length,
        },
        details: {
          workingNow: workingList,
          pendingDocs: docsList,
          anomalies: anomalyList,
        },
      };
    },
    { dedupingInterval: 30_000, revalidateOnFocus: true },
  );

  const { data: todayAttendance } = useSWR(
    "admin-today-attendance",
    async () => {
      const supabase = createClient();
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const now = new Date();

      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const { data: wsData } = await supabase
        .from("weekly_schedules")
        .select("id")
        .eq("status", "confirmed")
        .gte("week_start", format(weekAgo, "yyyy-MM-dd"));

      if (!wsData || wsData.length === 0) return [];
      const wsIds = wsData.map((ws: { id: string }) => ws.id);

      const { data: slotsData } = await supabase
        .from("schedule_slots")
        .select(`*, profiles!profile_id(name, color_hex)`)
        .eq("slot_date", todayStr)
        .eq("status", "active")
        .in("weekly_schedule_id", wsIds);

      if (!slotsData || slotsData.length === 0) return [];

      const profileIds = [...new Set(slotsData.map((s: any) => s.profile_id))];
      const dayStart = new Date(todayStr + "T00:00:00").toISOString();
      const dayEnd = new Date(todayStr + "T23:59:59").toISOString();

      const { data: logsData } = await supabase
        .from("attendance_logs")
        .select("profile_id, created_at, type")
        .eq("type", "IN")
        .in("profile_id", profileIds)
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd)
        .order("created_at", { ascending: true });

      const checkInMap = new Map<string, string>();
      (logsData || []).forEach((log: any) => {
        if (!checkInMap.has(log.profile_id)) {
          checkInMap.set(log.profile_id, log.created_at);
        }
      });

      const items: TodayAttendanceItem[] = slotsData.map((slot: any) => {
        const clockIn = checkInMap.get(slot.profile_id) || null;
        const [sh, sm] = slot.start_time.split(":").map(Number);
        const slotStart = new Date(todayStr + "T00:00:00");
        slotStart.setHours(sh, sm, 0, 0);

        let status: TodayAttendanceItem["status"];
        let late_minutes = 0;

        if (clockIn) {
          const clockInDate = new Date(clockIn);
          const diff = Math.floor(
            (clockInDate.getTime() - slotStart.getTime()) / 60000,
          );
          if (diff > 10) {
            status = "late";
            late_minutes = diff;
          } else {
            status = "attended";
          }
        } else {
          const msSinceStart = now.getTime() - slotStart.getTime();
          if (msSinceStart >= 10 * 60 * 1000) {
            status = "absent";
          } else {
            status = "scheduled";
          }
        }

        return {
          profile_id: slot.profile_id,
          name: slot.profiles?.name || "알 수 없음",
          color_hex: slot.profiles?.color_hex || "#8B95A1",
          slot_date: slot.slot_date,
          start_time: slot.start_time,
          end_time: slot.end_time,
          work_location: slot.work_location,
          clock_in_time: clockIn,
          status,
          late_minutes,
        };
      });

      return items;
    },
    { dedupingInterval: 30_000, revalidateOnFocus: true },
  );

  const stats = dashboardData?.stats ?? {
    workingNow: 0,
    totalToday: 0,
    pendingDocs: 0,
    anomalies: 0,
  };
  const details = dashboardData?.details ?? {
    workingNow: [],
    pendingDocs: [],
    anomalies: [],
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  // 🚀 상세 명단 렌더링 (카드 바로 아래에 꽂아넣을 UI)
  const renderDetailPanel = (type: "working" | "docs" | "anomalies") => {
    const list =
      type === "working"
        ? details.workingNow
        : type === "docs"
          ? details.pendingDocs
          : details.anomalies;

    return (
      <div className="mt-3 bg-white rounded-[24px] border border-slate-100 shadow-xl overflow-hidden animate-in slide-in-from-top-2 duration-300 z-10">
        <div className="p-5 pb-2 flex justify-between items-center border-b border-slate-50">
          <h3 className="text-[15px] font-bold text-[#191F28]">
            {type === "working" && "현재 근무 중인 직원"}
            {type === "docs" && "서류 보완이 필요한 직원"}
            {type === "anomalies" && "퇴근 기록이 누락된 직원"}
          </h3>
          <span className="text-[12px] font-bold text-[#3182F6]">
            {list.length}명
          </span>
        </div>

        <div className="divide-y divide-slate-50 max-h-[350px] overflow-y-auto scrollbar-hide">
          {list.length === 0 ? (
            <div className="p-10 text-center text-[#8B95A1] text-[13px]">
              해당하는 직원이 없어요
            </div>
          ) : (
            list.map((item: any) => {
              const profile = type === "docs" ? item : item.profiles;

              // 💡 서류 미비 사유 디테일 계산
              const missingDocs = [];
              if (type === "docs") {
                if (!item.employment_contract_url) missingDocs.push("계약서");
                if (!item.bank_account_copy_url) missingDocs.push("통장");
                if (!item.resident_register_url) missingDocs.push("등본");
                if (
                  item.health_cert_date &&
                  new Date(item.health_cert_date) < new Date()
                )
                  missingDocs.push("보건증만료");
              }

              return (
                <div
                  key={item.id || item.profile_id}
                  className="p-4 flex items-center justify-between hover:bg-[#F9FAFB] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-[14px] shrink-0"
                      style={{
                        backgroundColor: profile.color_hex || "#8B95A1",
                      }}
                    >
                      {profile.name?.charat(0)}
                    </div>
                    <div>
                      <p className="text-[15px] font-bold text-[#191F28]">
                        {profile.name}
                      </p>
                      <p className="text-[11px] font-medium text-[#8B95A1] leading-relaxed">
                        {type === "working" &&
                          `${format(new Date(item.created_at), "a h:mm", {
                            locale: ko,
                          })} 출근`}
                        {type === "anomalies" &&
                          `${format(
                            new Date(item.created_at),
                            "M월 d일 a h:mm",
                            { locale: ko },
                          )} 출근 후 미퇴근`}
                        {type === "docs" && (
                          <span className="text-[#D9480F]">
                            미비: {missingDocs.join(", ")}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {profile.phone && (
                      <a
                        href={`tel:${profile.phone}`}
                        className="p-2.5 bg-[#F2F4F6] text-[#4E5968] rounded-full hover:bg-[#E5E8EB]"
                      >
                        <Phone className="w-4 h-4" />
                      </a>
                    )}
                    <button
                      onClick={() => router.push(`/admin/employees`)}
                      className="p-2.5 bg-[#E8F3FF] text-[#3182F6] rounded-full hover:bg-[#D0E5FF]"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl animate-in fade-in duration-500 pb-20">
      <header className="mb-10">
        <h1 className="text-3xl font-bold text-[#191F28] tracking-tight mb-2">
          사장님, 확인해주세요!
        </h1>
        <p className="text-[16px] text-[#8B95A1] font-medium">
          {todayText} · 항목을 탭해서 상세 명단을 확인하세요.
        </p>
      </header>

      {/* 🚀 지표 카드 섹션 (개별 아코디언 구조) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10 items-start">
        {/* 1. 현재 근무 중 */}
        <div className="flex flex-col">
          <button
            onClick={() => toggleSection("working")}
            className={`text-left bg-white rounded-[24px] p-6 border transition-all ${
              expandedSection === "working"
                ? "ring-2 ring-[#3182F6] border-transparent shadow-lg scale-[1.02]"
                : "border-slate-100 shadow-sm hover:border-slate-200"
            }`}
          >
            <div className="flex justify-between items-start mb-4">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  expandedSection === "working"
                    ? "bg-[#3182F6] text-white"
                    : "bg-[#E8F3FF] text-[#3182F6]"
                }`}
              >
                <UserCheck className="w-5 h-5" />
              </div>
              {expandedSection === "working" ? (
                <ChevronUp className="w-5 h-5 text-[#8B95A1]" />
              ) : (
                <ChevronDown className="w-5 h-5 text-[#8B95A1]" />
              )}
            </div>
            <p className="text-[14px] font-bold text-[#4E5968] mb-1">
              현재 근무 중
            </p>
            <h2 className="text-3xl font-bold text-[#191F28]">
              {stats.workingNow}
              <span className="text-[16px] text-[#8B95A1] font-medium ml-1">
                명
              </span>
            </h2>
          </button>
          {expandedSection === "working" && renderDetailPanel("working")}
        </div>

        {/* 2. 오늘 총 출근 (클릭 없음) */}
        <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm">
          <div className="w-10 h-10 rounded-full bg-[#F2F4F6] flex items-center justify-center mb-4 text-[#4E5968]">
            <Users className="w-5 h-5" />
          </div>
          <p className="text-[14px] font-bold text-[#4E5968] mb-1">
            오늘 총 출근
          </p>
          <h2 className="text-3xl font-bold text-[#191F28]">
            {stats.totalToday}
            <span className="text-[16px] text-[#8B95A1] font-medium ml-1">
              명
            </span>
          </h2>
        </div>

        {/* 3. 서류 미비/만료 */}
        <div className="flex flex-col">
          <button
            onClick={() => toggleSection("docs")}
            className={`text-left bg-white rounded-[24px] p-6 border transition-all ${
              expandedSection === "docs"
                ? "ring-2 ring-[#D9480F] border-transparent shadow-lg scale-[1.02]"
                : "border-slate-100 shadow-sm hover:border-slate-200"
            }`}
          >
            <div className="flex justify-between items-start mb-4">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  expandedSection === "docs"
                    ? "bg-[#D9480F] text-white"
                    : "bg-[#FFF4E6] text-[#F08C00]"
                }`}
              >
                <FileWarning className="w-5 h-5" />
              </div>
              {expandedSection === "docs" ? (
                <ChevronUp className="w-5 h-5 text-[#8B95A1]" />
              ) : (
                <ChevronDown className="w-5 h-5 text-[#8B95A1]" />
              )}
            </div>
            <p className="text-[14px] font-bold text-[#4E5968] mb-1">
              서류 미비/만료
            </p>
            <h2
              className={`text-3xl font-bold ${
                stats.pendingDocs > 0 ? "text-[#D9480F]" : ""
              }`}
            >
              {stats.pendingDocs}
              <span className="text-[16px] text-[#8B95A1] font-medium ml-1">
                명
              </span>
            </h2>
          </button>
          {expandedSection === "docs" && renderDetailPanel("docs")}
        </div>

        {/* 4. 기록 이상 */}
        <div className="flex flex-col">
          <button
            onClick={() => toggleSection("anomalies")}
            className={`text-left bg-white rounded-[24px] p-6 border transition-all ${
              expandedSection === "anomalies"
                ? "ring-2 ring-[#F04438] border-transparent shadow-lg scale-[1.02]"
                : "border-slate-100 shadow-sm hover:border-slate-200"
            }`}
          >
            <div className="flex justify-between items-start mb-4">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  expandedSection === "anomalies"
                    ? "bg-[#F04438] text-white"
                    : "bg-[#FFF0F0] text-[#F04438]"
                }`}
              >
                <AlertCircle className="w-5 h-5" />
              </div>
              {expandedSection === "anomalies" ? (
                <ChevronUp className="w-5 h-5 text-[#8B95A1]" />
              ) : (
                <ChevronDown className="w-5 h-5 text-[#8B95A1]" />
              )}
            </div>
            <p className="text-[14px] font-bold text-[#4E5968] mb-1">
              기록 이상
            </p>
            <h2
              className={`text-3xl font-bold ${
                stats.anomalies > 0 ? "text-[#F04438]" : ""
              }`}
            >
              {stats.anomalies}
              <span className="text-[16px] text-[#8B95A1] font-medium ml-1">
                건
              </span>
            </h2>
          </button>
          {expandedSection === "anomalies" && renderDetailPanel("anomalies")}
        </div>
      </div>

      {/* 오늘 출근 현황 섹션 */}
      {(todayAttendance ?? []).length > 0 && (
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[18px] font-bold text-[#191F28]">
              오늘 출근 현황
            </h2>
            <div className="flex gap-2 text-[12px] font-medium text-[#8B95A1]">
              {Object.entries(
                (todayAttendance ?? []).reduce(
                  (acc, item) => {
                    acc[item.work_location] =
                      (acc[item.work_location] || 0) + 1;
                    return acc;
                  },
                  {} as Record<string, number>,
                ),
              ).map(([loc, cnt]) => (
                <span key={loc} style={{ color: LOCATION_COLORS[loc] }}>
                  {LOCATION_LABELS[loc]} {cnt}명
                </span>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-[24px] border border-slate-100 overflow-hidden divide-y divide-slate-50">
            {(todayAttendance ?? []).map((item) => {
              const statusConfig = {
                attended: {
                  icon: "✅",
                  text: "출근완료",
                  color: "#00B761",
                  bg: "#E6FAF0",
                },
                late: {
                  icon: "⚠️",
                  text: `지각 (+${item.late_minutes}분)`,
                  color: "#F59E0B",
                  bg: "#FFF7E6",
                },
                scheduled: {
                  icon: "⏳",
                  text: `${item.start_time.slice(0, 5)} 예정`,
                  color: "#8B95A1",
                  bg: "#F2F4F6",
                },
                absent: {
                  icon: "❌",
                  text: "미출근",
                  color: "#F04438",
                  bg: "#FFF0F0",
                },
              }[item.status];

              return (
                <div
                  key={`${item.profile_id}_${item.start_time}`}
                  className="flex items-center justify-between p-4"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-bold text-white shrink-0"
                      style={{ backgroundColor: item.color_hex }}
                    >
                      {item.name?.charat(0)}
                    </div>
                    <div>
                      <p className="text-[15px] font-bold text-[#191F28]">
                        {item.name}
                      </p>
                      <div className="flex items-center gap-1.5 text-[12px] text-[#8B95A1]">
                        <span
                          style={{ color: LOCATION_COLORS[item.work_location] }}
                        >
                          {LOCATION_LABELS[item.work_location] ||
                            item.work_location}
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
                    <span
                      className="px-2.5 py-1 rounded-lg text-[12px] font-bold"
                      style={{
                        backgroundColor: statusConfig.bg,
                        color: statusConfig.color,
                      }}
                    >
                      {statusConfig.icon} {statusConfig.text}
                    </span>
                    {item.clock_in_time && (
                      <span className="text-[12px] text-[#8B95A1] font-medium">
                        {format(new Date(item.clock_in_time), "H:mm", {
                          locale: ko,
                        })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 바로가기 메뉴 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={() => router.push("/admin/attendance")}
          className="group flex items-center justify-between p-7 bg-white rounded-[28px] border border-slate-100 shadow-sm hover:shadow-md transition-all"
        >
          <div className="flex items-center gap-4 text-left">
            <div className="w-12 h-12 rounded-2xl bg-[#F2F4F6] flex items-center justify-center group-hover:bg-[#E8F3FF]">
              <Clock className="w-6 h-6 text-[#4E5968] group-hover:text-[#3182F6]" />
            </div>
            <div>
              <p className="text-[17px] font-bold text-[#191F28]">
                근태 기록 확인
              </p>
              <p className="text-[13px] text-[#8B95A1]">
                전체 출퇴근 타임라인 보기
              </p>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-[#D1D6DB] group-hover:text-[#3182F6]" />
        </button>

        <button
          onClick={() => router.push("/admin/employees")}
          className="group flex items-center justify-between p-7 bg-white rounded-[28px] border border-slate-100 shadow-sm hover:shadow-md transition-all"
        >
          <div className="flex items-center gap-4 text-left">
            <div className="w-12 h-12 rounded-2xl bg-[#F2F4F6] flex items-center justify-center group-hover:bg-[#E8F3FF]">
              <Users className="w-6 h-6 text-[#4E5968] group-hover:text-[#3182F6]" />
            </div>
            <div>
              <p className="text-[17px] font-bold text-[#191F28]">
                전체 직원 관리
              </p>
              <p className="text-[13px] text-[#8B95A1]">
                인사 정보 및 서류 관리
              </p>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-[#D1D6DB] group-hover:text-[#3182F6]" />
        </button>
      </div>
    </div>
  );
}
