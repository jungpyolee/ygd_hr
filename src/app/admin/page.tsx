"use client";

import { useEffect, useState } from "react";
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
import { ko } from "date-fns/locale"; // 🚀 locale 상단 고정
import { toast } from "sonner";

interface DashboardDetails {
  workingNow: any[];
  pendingDocs: any[];
  anomalies: any[];
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [stats, setStats] = useState({
    workingNow: 0,
    totalToday: 0,
    pendingDocs: 0,
    anomalies: 0,
  });
  const [details, setDetails] = useState<DashboardDetails>({
    workingNow: [],
    pendingDocs: [],
    anomalies: [],
  });
  const [loading, setLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const todayText = new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date());

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    const todayStr = format(new Date(), "yyyy-MM-dd");

    // 1. 모든 직원의 마지막 근태 기록 + 프로필 조인
    const { data: latestLogs } = await supabase
      .from("attendance_logs")
      .select(`profile_id, type, created_at, profiles(name, phone, color_hex)`)
      .order("created_at", { ascending: false });

    // 2. 전체 직원 서류 정보
    const { data: profiles } = await supabase.from("profiles").select("*");

    if (latestLogs && profiles) {
      // 유저별 최신 기록 1개만 남기기 (중복 제거)
      const latestMap = new Map();
      latestLogs.forEach((log) => {
        if (!latestMap.has(log.profile_id)) latestMap.set(log.profile_id, log);
      });
      const userLastActions = Array.from(latestMap.values());

      // 🚀 [현재 근무 중 명단]
      const workingList = userLastActions.filter(
        (log) =>
          log.type === "IN" &&
          format(new Date(log.created_at), "yyyy-MM-dd") === todayStr
      );

      // 🚀 [기록 이상 명단] (마지막이 IN인데 오늘이 아님)
      const anomalyList = userLastActions.filter(
        (log) =>
          log.type === "IN" &&
          format(new Date(log.created_at), "yyyy-MM-dd") !== todayStr
      );

      // 🚀 [서류 미비 명단]
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

      setStats({
        workingNow: workingList.length,
        totalToday: new Set(
          latestLogs
            .filter(
              (l) =>
                format(new Date(l.created_at), "yyyy-MM-dd") === todayStr &&
                l.type === "IN"
            )
            .map((l) => l.profile_id)
        ).size,
        pendingDocs: docsList.length,
        anomalies: anomalyList.length,
      });

      setDetails({
        workingNow: workingList,
        pendingDocs: docsList,
        anomalies: anomalyList,
      });
    }
    setLoading(false);
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
                      {profile.name.charAt(0)}
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
                            { locale: ko }
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
