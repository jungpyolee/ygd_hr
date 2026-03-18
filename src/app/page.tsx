"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { AlertCircle, LogOut, UserCircle, LayoutDashboard, BookOpen, CalendarDays, MapPin, Clock, Bell, BellDot, CheckCircle, ArrowRightLeft, Info } from "lucide-react";
import dynamic from "next/dynamic";
import WeeklyWorkStats from "@/components/WeeklyWorkStats";
import OnboardingFunnel from "@/components/OnboardingFunnel";
import AttendanceCard from "@/components/AttendanceCard";
import StoreDistanceList from "@/components/StoreDistanceList";
import MyInfoModal from "@/components/MyInfoModal";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { useRouter } from "next/navigation";
import { useGeolocation } from "@/lib/hooks/useGeolocation";
import { format } from "date-fns";

interface TodaySlot {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  work_location: string;
  cafe_positions: string[];
  notes: string | null;
}

const LOCATION_LABELS: Record<string, string> = { cafe: "카페", factory: "공장", catering: "케이터링" };
const LOCATION_COLORS: Record<string, string> = { cafe: "#3182F6", factory: "#00B761", catering: "#F59E0B" };
const LOCATION_BG: Record<string, string> = { cafe: "#E8F3FF", factory: "#E6FAF0", catering: "#FFF7E6" };
const CAFE_POSITION_LABELS: Record<string, string> = { hall: "홀", kitchen: "주방", showroom: "쇼룸" };

const DynamicClock = dynamic(() => import("@/components/Clock"), {
  ssr: false,
});
const RADIUS_METER = 100;

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [stores, setStores] = useState<any[]>([]);
  const [lastLog, setLastLog] = useState<any>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [todaySlots, setTodaySlots] = useState<TodaySlot[]>([]);
  // 알림 관련 상태
  const [notis, setNotis] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNoti, setShowNoti] = useState(false);
  const notiRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const router = useRouter();

  // 위치 훅 — 5초 타임아웃, 45초 캐시(표시용), 권한 변경 감시 포함
  const { locationState, retry: retryLocation, fetchForAttendance } = useGeolocation();

  // 2. 전체 데이터 Fetch (온보딩 여부 포함)
  const fetchAllData = async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // 프로필 확인 (온보딩 탔는지 체크)
    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    if (!profileData?.name || !profileData?.phone) {
      setNeedsOnboarding(true);
    } else {
      setNeedsOnboarding(false);
      setProfile(profileData);
      fetchNotis(user.id);

      // 실시간 알림 구독
      supabase
        .channel(`employee-notifications-${user.id}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (payload) => {
          if (payload.new.profile_id === user.id) fetchNotis(user.id);
        })
        .subscribe();
    }

    // 매장 & 최근 로그 가져오기 (목동 매장 제외)
    const { data: storeData } = await supabase.from("stores").select("*");
    if (storeData) setStores(storeData.filter((s) => s.name !== "목동"));

    const { data: logData } = await supabase
      .from("attendance_logs")
      .select("type, created_at, attendance_type, stores!store_id(name)")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (logData) {
      const isTodayLog =
        new Date(logData.created_at).toDateString() ===
        new Date().toDateString();
      setLastLog({
        type: logData.type,
        attendance_type: logData.attendance_type || "regular",
        time: new Date(logData.created_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        date: isTodayLog
          ? "오늘"
          : new Date(logData.created_at).toLocaleDateString("ko-KR", {
              month: "long",
              day: "numeric",
            }),
        store:
          logData.attendance_type === "business_trip_in"
            ? "출장"
            : (logData.stores as any)?.name || "알 수 없음",
      });
    }

    // Fetch today's confirmed schedule slots
    if (user) {
      const todayStr = format(new Date(), "yyyy-MM-dd");
      // Get confirmed weekly schedules covering today
      const { data: wsData } = await supabase
        .from("weekly_schedules")
        .select("id")
        .eq("status", "confirmed");
      if (wsData && wsData.length > 0) {
        const wsIds = wsData.map((ws: { id: string }) => ws.id);
        const { data: slotsData } = await supabase
          .from("schedule_slots")
          .select("*")
          .eq("profile_id", user.id)
          .eq("slot_date", todayStr)
          .eq("status", "active")
          .in("weekly_schedule_id", wsIds);
        setTodaySlots((slotsData as TodaySlot[]) || []);
      }
    }

    setLoading(false);
  };

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
      await supabase.from("notifications").update({ is_read: true }).eq("id", noti.id);
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

  useEffect(() => {
    fetchAllData();
  }, []);

  // 💡 온보딩이 필요하면 아까 만든 퍼널만 딱 띄워줍니다!
  if (needsOnboarding) {
    return <OnboardingFunnel onComplete={fetchAllData} />;
  }

  if (loading)
    return (
      <div className="flex min-h-screen flex-col bg-[#F2F4F6] font-pretendard">
        <div className="h-[60px] bg-[#F2F4F6]/80" />
        <main className="flex-1 px-5 pb-10 space-y-4">
          <div className="py-6 px-1">
            <div className="h-8 w-36 bg-slate-200 animate-pulse rounded-lg mb-2" />
            <div className="h-6 w-20 bg-slate-200 animate-pulse rounded-lg" />
          </div>
          <div className="bg-white rounded-[28px] p-6 h-[180px] animate-pulse border border-slate-100" />
          <div className="bg-white rounded-[28px] p-6 h-[140px] animate-pulse border border-slate-100" />
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-[28px] p-5 h-[100px] animate-pulse border border-slate-100" />
            <div className="bg-white rounded-[28px] p-5 h-[100px] animate-pulse border border-slate-100" />
          </div>
        </main>
      </div>
    );

  return (
    <div className="flex min-h-screen flex-col bg-[#F2F4F6] font-pretendard">
      {/* Navbar 영역 */}
      <nav className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[#F2F4F6]/80 backdrop-blur-md">
        <span className="text-xl font-bold text-[#333D4B]">연경당 HR</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsEditModalOpen(true)}
            className="w-10 h-10 rounded-full border border-white bg-white shadow-sm flex items-center justify-center overflow-hidden"
            style={{ backgroundColor: profile?.color_hex }}
          >
            {profile?.color_hex ? (
              <span className="text-white font-bold text-sm">
                {profile.name.charAt(0)}
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
                    <div className="p-10 text-center text-[#8B95A1] text-[14px]">새 알림이 없어요</div>
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
                            <p className="text-[13px] font-bold text-[#191F28] mb-0.5">{n.title}</p>
                            <p className="text-[12px] text-[#4E5968] leading-snug line-clamp-2">{n.content}</p>
                            <p className="text-[11px] text-[#8B95A1] mt-1">
                              {new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(new Date(n.created_at))}
                            </p>
                          </div>
                          {!n.is_read && <div className="w-1.5 h-1.5 bg-[#3182F6] rounded-full mt-1.5 shrink-0" />}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {profile?.role === "admin" && (
            <button
              onClick={() => router.push("/admin")}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 rounded-full transition-all shadow-sm"
            >
              <LayoutDashboard className="w-3.5 h-3.5 text-[#4E5968]" />
              <span className="text-[13px] font-semibold text-[#4E5968]">
                어드민
              </span>
            </button>
          )}
          <button
            onClick={() => setIsLogoutConfirmOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 rounded-full transition-all shadow-sm"
          >
            <LogOut className="w-3.5 h-3.5 text-[#4E5968]" />
            <span className="text-[13px] font-semibold text-[#4E5968]">
              로그아웃
            </span>
          </button>
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

        {/* 💡 핵심: 출퇴근 로직을 전담하는 컴포넌트 삽입 */}
        <AttendanceCard
          stores={stores}
          lastLog={lastLog}
          locationState={locationState}
          radius={RADIUS_METER}
          onSuccess={fetchAllData}
          onRetryLocation={retryLocation}
          onFetchForAttendance={fetchForAttendance}
        />

        {/* 오늘 스케줄 위젯 */}
        {todaySlots.length > 0 && (
          <section className="bg-white rounded-[28px] p-5 border border-slate-100 shadow-sm space-y-3">
            <h3 className="text-[15px] font-bold text-[#191F28]">오늘 스케줄</h3>
            {todaySlots.map((slot) => (
              <div key={slot.id}>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[12px] font-bold"
                    style={{
                      backgroundColor: LOCATION_BG[slot.work_location] || "#F2F4F6",
                      color: LOCATION_COLORS[slot.work_location] || "#4E5968",
                    }}
                  >
                    <MapPin className="w-3 h-3" />
                    {LOCATION_LABELS[slot.work_location] || slot.work_location}
                  </span>
                  {slot.cafe_positions && slot.cafe_positions.length > 0 && (
                    <div className="flex gap-1">
                      {slot.cafe_positions.map((pos) => (
                        <span key={pos} className="px-2 py-0.5 bg-[#F2F4F6] text-[#4E5968] rounded-md text-[11px] font-bold">
                          {CAFE_POSITION_LABELS[pos] || pos}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[#191F28] font-bold text-[17px]">
                  <Clock className="w-4 h-4 text-[#8B95A1]" />
                  {slot.start_time.slice(0, 5)} ~ {slot.end_time.slice(0, 5)}
                </div>
                {slot.work_location === "catering" && (
                  <p className="text-[13px] text-[#F59E0B] font-medium mt-1">
                    출장출근으로 기록해주세요
                  </p>
                )}
              </div>
            ))}
          </section>
        )}

        <WeeklyWorkStats />

        <StoreDistanceList
          stores={stores}
          locationState={locationState}
          radius={RADIUS_METER}
        />

        {/* 스케줄 바로가기 */}
        <button
          onClick={() => router.push("/schedule")}
          className="w-full flex items-center gap-4 bg-white rounded-[28px] p-5 border border-slate-100 text-left active:scale-[0.98] transition-transform"
        >
          <div className="w-10 h-10 bg-[#E8F3FF] rounded-full flex items-center justify-center shrink-0">
            <CalendarDays className="w-5 h-5 text-[#3182F6]" />
          </div>
          <div>
            <p className="text-[15px] font-bold text-[#333D4B]">내 스케줄</p>
            <p className="text-sm text-[#6B7684]">이번 주 근무 일정을 확인해요</p>
          </div>
        </button>

        {/* 레시피 바로가기 */}
        <button
          onClick={() => router.push("/recipes")}
          className="w-full flex items-center gap-4 bg-white rounded-[28px] p-5 border border-slate-100 text-left active:scale-[0.98] transition-transform"
        >
          <div className="w-10 h-10 bg-[#E8F3FF] rounded-full flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5 text-[#3182F6]" />
          </div>
          <div>
            <p className="text-[15px] font-bold text-[#333D4B]">레시피 보기</p>
            <p className="text-sm text-[#6B7684]">음료 레시피를 확인해요</p>
          </div>
        </button>

        {/* 헬퍼 메시지 */}
        <section className="flex items-center justify-between bg-white rounded-[28px] p-5 border border-slate-100 mt-4">
          <div className="flex gap-4 items-center">
            <div className="w-10 h-10 bg-[#F2F4F6] rounded-full flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-[#4E5968]" />
            </div>
            <div>
              <p className="text-[15px] font-bold text-[#333D4B]">
                기록이 안 되나요?
              </p>
              <p className="text-sm text-[#6B7684]">
                Wi-Fi를 켜면 위치가 더 정확해요.
              </p>
            </div>
          </div>
        </section>
      </main>
      <MyInfoModal
        isOpen={isEditModalOpen}
        profile={profile}
        onClose={() => setIsEditModalOpen(false)}
        onUpdate={fetchAllData}
      />
      <ConfirmDialog
        isOpen={isLogoutConfirmOpen}
        title="로그아웃할까요?"
        confirmLabel="로그아웃할게요"
        cancelLabel="취소"
        onConfirm={async () => {
          await supabase.auth.signOut();
          window.location.href = "/login";
        }}
        onCancel={() => setIsLogoutConfirmOpen(false)}
      />
    </div>
  );
}
