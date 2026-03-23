"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import useSWR from "swr";
import {
  MapPin,
  Bell,
  BellDot,
  CheckCircle,
  ArrowRightLeft,
  Info,
  ChevronRight,
  CalendarDays,
} from "lucide-react";
import dynamic from "next/dynamic";
import OnboardingFunnel from "@/components/OnboardingFunnel";
import AttendanceCard from "@/components/AttendanceCard";
import { useRouter } from "next/navigation";
import { useGeolocation } from "@/lib/hooks/useGeolocation";
import { differenceInMinutes, startOfMonth, format } from "date-fns";
import type { TodaySlot, RawLogData } from "@/app/page";
import PushPromptModal from "@/components/PushPromptModal";
import { useWorkplaces } from "@/lib/hooks/useWorkplaces";

const DynamicClock = dynamic(() => import("@/components/Clock"), {
  ssr: false,
});
const RADIUS_METER = 100;

interface HomeClientProps {
  profile: any | null;
  needsOnboarding: boolean;
  stores: any[];
  logData: RawLogData | null;
  todaySlots: TodaySlot[];
}

export default function HomeClient({
  profile,
  needsOnboarding,
  stores,
  logData,
  todaySlots,
}: HomeClientProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { byId, positionsOfStore } = useWorkplaces();

  const [notis, setNotis] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNoti, setShowNoti] = useState(false);
  const notiRef = useRef<HTMLDivElement>(null);

  // 알림 SWR
  const { data: notisData } = useSWR(
    profile?.id ? ["home-notis", profile.id] : null,
    async ([, profileId]) => {
      const supabase = createClient();
      const { data } = await supabase
        .from("notifications")
        .select("id, title, content, type, source_id, is_read, created_at")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(15);
      return data ?? [];
    },
    { dedupingInterval: 30_000, revalidateOnFocus: false },
  );

  // 이번 달 근무 요약 SWR
  const { data: monthStats } = useSWR(
    profile?.id ? ["month-stats", profile.id] : null,
    async ([, profileId]) => {
      const supabase = createClient();
      const start = startOfMonth(new Date());
      const { data: logs } = await supabase
        .from("attendance_logs")
        .select("type, created_at")
        .eq("profile_id", profileId)
        .gte("created_at", start.toISOString())
        .order("created_at", { ascending: true });

      if (!logs) return { days: 0, hours: 0, minutes: 0 };

      const workDays = new Set<string>();
      let totalMinutes = 0;
      let tempIn: any = null;

      logs.forEach((log) => {
        if (log.type === "IN") {
          tempIn = log;
          workDays.add(format(new Date(log.created_at), "yyyy-MM-dd"));
        } else if (log.type === "OUT" && tempIn) {
          totalMinutes += differenceInMinutes(
            new Date(log.created_at),
            new Date(tempIn.created_at),
          );
          tempIn = null;
        }
      });

      return {
        days: workDays.size,
        hours: Math.floor(totalMinutes / 60),
        minutes: totalMinutes % 60,
      };
    },
    { dedupingInterval: 60_000 },
  );

  // SWR 결과로 알림 state 초기화
  useEffect(() => {
    if (notisData) {
      setNotis(notisData);
      setUnreadCount(notisData.filter((n) => !n.is_read).length);
    }
  }, [notisData]);

  // 클라이언트에서 타임존 변환
  const lastLog = useMemo(() => {
    if (!logData) return null;
    const createdAt = new Date(logData.created_at);
    const isToday = createdAt.toDateString() === new Date().toDateString();
    return {
      type: logData.type,
      attendance_type: logData.attendance_type,
      time: createdAt.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      date: isToday
        ? "오늘"
        : createdAt.toLocaleDateString("ko-KR", {
            month: "long",
            day: "numeric",
          }),
      store:
        logData.attendance_type === "business_trip_in"
          ? "출장"
          : (logData.store_name ?? "알 수 없음"),
    };
  }, [logData]);

  const {
    locationState,
    retry: retryLocation,
    fetchForAttendance,
  } = useGeolocation();

  // 외부 클릭 시 알림창 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notiRef.current && !notiRef.current.contains(e.target as Node)) {
        setShowNoti(false);
      }
    };
    if (showNoti) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showNoti]);

  // 실시간 알림 구독
  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`employee-notifications-${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `profile_id=eq.${profile.id}`,
        },
        (payload) => {
          if (payload.new) {
            setNotis((prev) => {
              const updated = [payload.new as any, ...prev].slice(0, 15);
              setUnreadCount(updated.filter((n) => !n.is_read).length);
              return updated;
            });
          }
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("[Realtime] employee-notifications 구독 실패:", status);
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, supabase]);

  const markAllRead = async (userId: string) => {
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("profile_id", userId)
      .eq("is_read", false);
    setNotis((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const handleNotiClick = async (noti: any, userId: string) => {
    if (!noti.is_read) {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", noti.id);
      setNotis((prev) =>
        prev.map((n) => (n.id === noti.id ? { ...n, is_read: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    setShowNoti(false);
    switch (noti.type) {
      case "substitute_approved":
        router.push(`/schedule?request_id=${noti.source_id}`);
        break;
      case "recipe":
        if (noti.source_id) router.push(`/recipes/${noti.source_id}`);
        break;
      case "announcement":
        if (noti.source_id) router.push(`/announcements/${noti.source_id}`);
        else router.push("/store");
        break;
      default:
        break;
    }
  };

  if (needsOnboarding) {
    return <OnboardingFunnel onComplete={() => router.refresh()} />;
  }

  const currentMonth = format(new Date(), "M월");

  return (
    <div className="flex min-h-screen flex-col bg-[#F2F4F6] font-pretendard">
      <PushPromptModal />

      {/* Navbar */}
      <nav className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[#F2F4F6]/80 backdrop-blur-md">
        <span className="text-xl font-bold text-[#333D4B]">연경당 HR</span>
        <div className="relative" ref={notiRef}>
          <button
            onClick={() => setShowNoti(!showNoti)}
            className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center relative"
          >
            {unreadCount > 0 ? (
              <BellDot className="w-5 h-5 text-[#3182F6]" />
            ) : (
              <Bell className="w-5 h-5 text-[#4E5968]" />
            )}
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
            )}
          </button>

          {showNoti && (
            <div className="absolute right-0 mt-3 w-[300px] bg-white rounded-[24px] shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200 z-[120]">
              <div className="p-4 border-b border-slate-50 flex justify-between items-center">
                <h3 className="font-bold text-[#191F28] text-[15px]">알림</h3>
                {unreadCount > 0 && (
                  <button
                    onClick={() => profile && markAllRead(profile.id)}
                    className="text-[12px] font-bold text-[#3182F6] flex items-center gap-1 hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors"
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> 모두 읽음
                  </button>
                )}
              </div>
              <div className="max-h-[360px] overflow-y-auto scrollbar-hide">
                {notis.length === 0 ? (
                  <div className="p-10 text-center text-[#8B95A1] text-[14px]">
                    새 알림이 없어요
                  </div>
                ) : (
                  notis.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => profile && handleNotiClick(n, profile.id)}
                      className={`w-full text-left p-4 border-b border-slate-50 last:border-0 hover:bg-[#F9FAFB] transition-colors ${!n.is_read ? "bg-[#F2F8FF]/60" : ""}`}
                    >
                      <div className="flex gap-3 items-start">
                        <div className="mt-0.5">
                          {n.type === "substitute_approved" ? (
                            <ArrowRightLeft className="w-4 h-4 text-purple-500" />
                          ) : (
                            <Info className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-bold text-[#191F28] mb-0.5">
                            {n.title}
                          </p>
                          <p className="text-[12px] text-[#4E5968] leading-snug line-clamp-2">
                            {n.content}
                          </p>
                          <p className="text-[11px] text-[#8B95A1] mt-1">
                            {new Intl.DateTimeFormat("ko-KR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            }).format(new Date(n.created_at))}
                          </p>
                        </div>
                        {!n.is_read && (
                          <div className="w-1.5 h-1.5 bg-[#3182F6] rounded-full mt-1.5 shrink-0" />
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </nav>

      <main className="flex-1 px-5 pb-24 space-y-4">
        {/* 헤더 인사말 */}
        <section className="py-4 px-1 flex justify-between items-end">
          <h1 className="text-2xl font-bold text-[#191F28] leading-tight">
            반가워요,
            <br />
            {profile?.name}님
          </h1>
          <DynamicClock />
        </section>

        <AttendanceCard
          stores={stores}
          lastLog={lastLog}
          locationState={locationState}
          radius={RADIUS_METER}
          todaySlots={todaySlots}
          onSuccess={() => router.refresh()}
          onRetryLocation={retryLocation}
          onFetchForAttendance={fetchForAttendance}
        />

        {/* 오늘 스케줄 */}
        {todaySlots.length > 0 && (
          <button
            onClick={() => router.push("/schedule")}
            className="w-full text-left bg-white rounded-[28px] p-5 border border-slate-100 shadow-sm active:scale-[0.99] transition-transform"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[15px] font-bold text-[#191F28]">
                오늘 스케줄
              </h3>
              <ChevronRight className="w-4 h-4 text-[#D1D6DB]" />
            </div>
            <div className="space-y-3">
              {todaySlots.map((slot) => (
                <div key={slot.id} className="flex items-start gap-3">
                  <div
                    className="w-1 rounded-full self-stretch min-h-[44px] shrink-0"
                    style={{
                      backgroundColor: byId[slot.store_id]?.color || "#8B95A1",
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      <span
                        className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[12px] font-bold shrink-0"
                        style={{
                          backgroundColor:
                            byId[slot.store_id]?.bg_color || "#F2F4F6",
                          color: byId[slot.store_id]?.color || "#4E5968",
                        }}
                      >
                        <MapPin className="w-3 h-3" />
                        {byId[slot.store_id]?.label || slot.store_id}
                      </span>
                      {slot.position_keys?.map((pos) => (
                        <span
                          key={pos}
                          className="px-2 py-0.5 bg-[#F2F4F6] text-[#4E5968] rounded-full text-[11px] font-bold"
                        >
                          {positionsOfStore(slot.store_id).find(
                            (p) => p.position_key === pos,
                          )?.label || pos}
                        </span>
                      ))}
                    </div>
                    <p className="text-[18px] font-bold text-[#191F28] tabular-nums leading-tight">
                      {slot.start_time.slice(0, 5)} ~{" "}
                      {slot.end_time.slice(0, 5)}
                    </p>
                    {byId[slot.store_id]?.is_gps_required === false && (
                      <p className="text-[12px] text-[#F59E0B] font-medium mt-1">
                        출장출근으로 기록해주세요
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </button>
        )}

        {/* 캘린더 진입 버튼 */}
        <button
          onClick={() => router.push("/calendar")}
          className="w-full flex items-center justify-between bg-white rounded-[24px] px-5 py-4 border border-slate-100 shadow-sm active:scale-[0.99] transition-transform"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#E8F3FF] rounded-full flex items-center justify-center shrink-0">
              <CalendarDays className="w-5 h-5 text-[#3182F6]" />
            </div>
            <div className="text-left">
              <p className="text-[15px] font-bold text-[#191F28]">통합 캘린더</p>
              <p className="text-[12px] text-[#8B95A1]">내 스케줄 · 팀 · 회사 일정을 한눈에</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-[#D1D6DB] shrink-0" />
        </button>

        {/* 이번 달 근무 요약 */}
        <button
          onClick={() => router.push("/attendances")}
          className="w-full text-left bg-white rounded-[28px] p-5 border border-slate-100 shadow-sm active:scale-[0.99] transition-transform"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#E8F3FF] rounded-full flex items-center justify-center">
                <CalendarDays className="w-4 h-4 text-[#3182F6]" />
              </div>
              <h3 className="text-[15px] font-bold text-[#191F28]">
                {currentMonth} 근무 요약
              </h3>
            </div>
            <ChevronRight className="w-4 h-4 text-[#D1D6DB]" />
          </div>
          {monthStats ? (
            <div className="flex items-end gap-6">
              <div>
                <p className="text-[12px] text-[#8B95A1] mb-0.5">출근 일수</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-[28px] font-bold text-[#191F28] tabular-nums leading-none">
                    {monthStats.days}
                  </span>
                  <span className="text-[14px] font-semibold text-[#4E5968]">일</span>
                </div>
              </div>
              <div className="w-px h-10 bg-[#E5E8EB]" />
              <div>
                <p className="text-[12px] text-[#8B95A1] mb-0.5">총 근무 시간</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-[28px] font-bold text-[#191F28] tabular-nums leading-none">
                    {monthStats.hours}
                  </span>
                  <span className="text-[14px] font-semibold text-[#4E5968]">시간</span>
                  <span className="text-[20px] font-bold text-[#191F28] tabular-nums leading-none ml-1">
                    {monthStats.minutes}
                  </span>
                  <span className="text-[14px] font-semibold text-[#4E5968]">분</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-10 bg-[#F2F4F6] rounded-xl animate-pulse" />
          )}
        </button>
      </main>
    </div>
  );
}
