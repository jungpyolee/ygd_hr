"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import {
  UserCircle,
  BookOpen,
  MapPin,
  Bell,
  BellDot,
  CheckCircle,
  ArrowRightLeft,
  Info,
  Megaphone,
  ChevronRight,
} from "lucide-react";
import dynamic from "next/dynamic";
import WeeklyScheduleCard, {
  type ScheduleSlot,
} from "@/components/WeeklyScheduleCard";
import OnboardingFunnel from "@/components/OnboardingFunnel";
import AttendanceCard from "@/components/AttendanceCard";
import MyInfoModal from "@/components/MyInfoModal";
import { useRouter } from "next/navigation";
import { useGeolocation } from "@/lib/hooks/useGeolocation";
import type { Announcement } from "@/types/announcement";
import type { TodaySlot, RawLogData } from "@/app/page";

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
const LOCATION_BG: Record<string, string> = {
  cafe: "#E8F3FF",
  factory: "#E6FAF0",
  catering: "#FFF7E6",
};
const CAFE_POSITION_LABELS: Record<string, string> = {
  hall: "홀",
  kitchen: "주방",
  showroom: "쇼룸",
};

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
  weeklySlots: ScheduleSlot[];
  announcements: Announcement[];
  announcementReadIds: string[];
  initialNotis: any[];
}

export default function HomeClient({
  profile,
  needsOnboarding,
  stores,
  logData,
  todaySlots,
  weeklySlots,
  announcements,
  announcementReadIds,
  initialNotis,
}: HomeClientProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [showGuideRedDot, setShowGuideRedDot] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [notis, setNotis] = useState<any[]>(initialNotis);
  const [unreadCount, setUnreadCount] = useState(
    initialNotis.filter((n) => !n.is_read).length,
  );
  const [showNoti, setShowNoti] = useState(false);
  const notiRef = useRef<HTMLDivElement>(null);

  const announcementReadSet = useMemo(
    () => new Set(announcementReadIds),
    [announcementReadIds],
  );

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

  useEffect(() => {
    const seen = localStorage.getItem("guide_seen_version");
    setShowGuideRedDot(seen !== "v1.0.1");
  }, []);

  const fetchNotis = async (userId: string) => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("profile_id", userId)
      .order("created_at", { ascending: false })
      .limit(15);
    if (data) {
      setNotis(data);
      setUnreadCount(data.filter((n: any) => !n.is_read).length);
    }
  };

  const markAllRead = async (userId: string) => {
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("profile_id", userId)
      .eq("is_read", false);
    setUnreadCount(0);
    fetchNotis(userId);
  };

  const handleNotiClick = async (noti: any, userId: string) => {
    if (!noti.is_read) {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", noti.id);
      fetchNotis(userId);
    }
    setShowNoti(false);
    switch (noti.type) {
      case "substitute_approved":
        router.push(`/schedule?request_id=${noti.source_id}`);
        break;
      case "substitute_rejected":
      case "substitute_filled":
        router.push("/schedule");
        break;
      case "schedule_updated":
        router.push("/schedule");
        break;
      case "recipe_comment":
      case "recipe_reply":
      case "recipe_mention":
        if (noti.source_id) router.push(`/recipes/${noti.source_id}`);
        break;
      case "announcement":
        if (noti.source_id) router.push(`/announcements/${noti.source_id}`);
        else router.push("/announcements");
        break;
      default:
        break;
    }
  };

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
        () => fetchNotis(profile.id),
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

  if (needsOnboarding) {
    return <OnboardingFunnel onComplete={() => router.refresh()} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F2F4F6] font-pretendard">
      {/* Navbar */}
      <nav className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[#F2F4F6]/80 backdrop-blur-md">
        <span className="text-xl font-bold text-[#333D4B]">연경당 HR</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/guide")}
            className="h-8 px-3 rounded-full bg-white shadow-sm flex items-center justify-center gap-1.5 text-[13px] font-bold text-[#4E5968] hover:text-[#3182F6] hover:bg-[#E8F3FF] transition-colors"
          >
            이용 가이드
            {showGuideRedDot && (
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full shrink-0" />
            )}
          </button>
          <button
            onClick={() => setIsEditModalOpen(true)}
            className="w-10 h-10 rounded-full border border-white bg-white shadow-sm flex items-center justify-center overflow-hidden"
            style={{ backgroundColor: profile?.color_hex }}
          >
            {profile?.color_hex ? (
              <span className="text-white font-bold text-sm">
                {profile.name?.charAt(0)}
              </span>
            ) : (
              <UserCircle className="w-6 h-6 text-[#8B95A1]" />
            )}
          </button>

          {/* 알림 벨 */}
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
                        onClick={() =>
                          profile && handleNotiClick(n, profile.id)
                        }
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
        </div>
      </nav>

      <main className="flex-1 px-5 pb-10 space-y-4">
        {/* 헤더 인사말 */}
        <section className="py-6 px-1 flex justify-between items-end">
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
                  {/* 위치 컬러 바 */}
                  <div
                    className="w-1 rounded-full self-stretch min-h-[44px] shrink-0"
                    style={{
                      backgroundColor:
                        LOCATION_COLORS[slot.work_location] || "#8B95A1",
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    {/* 위치 배지 + 포지션 배지 */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      <span
                        className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[12px] font-bold shrink-0"
                        style={{
                          backgroundColor:
                            LOCATION_BG[slot.work_location] || "#F2F4F6",
                          color:
                            LOCATION_COLORS[slot.work_location] || "#4E5968",
                        }}
                      >
                        <MapPin className="w-3 h-3" />
                        {LOCATION_LABELS[slot.work_location] ||
                          slot.work_location}
                      </span>
                      {slot.cafe_positions?.map((pos) => (
                        <span
                          key={pos}
                          className="px-2 py-0.5 bg-[#F2F4F6] text-[#4E5968] rounded-full text-[11px] font-bold"
                        >
                          {CAFE_POSITION_LABELS[pos] || pos}
                        </span>
                      ))}
                    </div>
                    {/* 시간 */}
                    <p className="text-[18px] font-bold text-[#191F28] tabular-nums leading-tight">
                      {slot.start_time.slice(0, 5)} ~{" "}
                      {slot.end_time.slice(0, 5)}
                    </p>
                    {slot.work_location === "catering" && (
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

        {/* 공지사항 + 레시피 2열 그리드 */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => router.push("/announcements")}
            className="flex flex-col bg-white rounded-[24px] p-4 border border-slate-100 text-left active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-9 h-9 bg-[#FFF7E6] rounded-full flex items-center justify-center shrink-0">
                <Megaphone className="w-4 h-4 text-[#F59E0B]" />
              </div>
              {announcements.filter((a) => !announcementReadSet.has(a.id))
                .length > 0 && (
                <span className="text-[10px] font-bold text-white bg-red-400 rounded-full px-1.5 py-0.5 leading-none">
                  {
                    announcements.filter((a) => !announcementReadSet.has(a.id))
                      .length
                  }
                </span>
              )}
            </div>
            <p className="text-[14px] font-bold text-[#333D4B]">공지사항</p>
            <p className="text-[12px] text-[#8B95A1] mt-0.5 line-clamp-1">
              {announcements[0]?.title ?? "새 공지가 없어요"}
            </p>
          </button>

          <button
            onClick={() => router.push("/recipes")}
            className="flex flex-col bg-white rounded-[24px] p-4 border border-slate-100 text-left active:scale-[0.98] transition-transform"
          >
            <div className="w-9 h-9 bg-[#E8F3FF] rounded-full flex items-center justify-center mb-2">
              <BookOpen className="w-4 h-4 text-[#3182F6]" />
            </div>
            <p className="text-[14px] font-bold text-[#333D4B]">레시피 보기</p>
            <p className="text-[12px] text-[#8B95A1] mt-0.5">
              음료 레시피를 확인해요
            </p>
          </button>
        </div>

        <WeeklyScheduleCard slots={weeklySlots} />
      </main>

      <MyInfoModal
        isOpen={isEditModalOpen}
        profile={profile}
        onClose={() => setIsEditModalOpen(false)}
        onUpdate={() => router.refresh()}
      />
    </div>
  );
}
