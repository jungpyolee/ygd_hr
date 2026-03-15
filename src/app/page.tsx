"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { AlertCircle, LogOut, UserCircle, LayoutDashboard } from "lucide-react";
import dynamic from "next/dynamic";
import WeeklyWorkStats from "@/components/WeeklyWorkStats";
import OnboardingFunnel from "@/components/OnboardingFunnel";
import AttendanceCard from "@/components/AttendanceCard"; // 방금 만든 컴포넌트
import StoreDistanceList from "@/components/StoreDistanceList";
import MyInfoModal from "@/components/MyInfoModal"; // 🚀 컴포넌트 임포트
import { useRouter } from "next/navigation";

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
  const [locationState, setLocationState] = useState<any>({
    status: "loading",
  });
  const [isEditModalOpen, setIsEditModalOpen] = useState(false); // 🚀 모달 열림 상태만 관리
  const supabase = createClient();
  const router = useRouter();
  // 1. 위치 정보 구독
  useEffect(() => {
    if (!navigator.geolocation)
      return setLocationState({ status: "unavailable" });
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setLocationState({
          status: "ready",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      () => setLocationState({ status: "unavailable" }),
      { enableHighAccuracy: true }
    );
  }, []);

  // 2. 전체 데이터 Fetch (온보딩 여부 포함)
  const fetchAllData = async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

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
    }

    // 매장 & 최근 로그 가져오기
    const { data: storeData } = await supabase.from("stores").select("*");
    if (storeData) setStores(storeData);

    const { data: logData } = await supabase
      .from("attendance_logs")
      .select("type, created_at, stores(name)")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (logData) {
      const isToday =
        new Date(logData.created_at).toDateString() ===
        new Date().toDateString();
      setLastLog({
        type: logData.type,
        time: new Date(logData.created_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        date: isToday
          ? "오늘"
          : new Date(logData.created_at).toLocaleDateString("ko-KR", {
              month: "long",
              day: "numeric",
            }),
        store: (logData.stores as any)?.name || "알 수 없음",
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // 💡 온보딩이 필요하면 아까 만든 퍼널만 딱 띄워줍니다!
  if (needsOnboarding) {
    return <OnboardingFunnel onComplete={fetchAllData} />;
  }

  if (loading)
    return (
      <div className="min-h-screen bg-[#F2F4F6] flex items-center justify-center">
        로딩 중...
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
            onClick={async () => {
              if (confirm("로그아웃 하시겠어요?")) {
                await supabase.auth.signOut();
                window.location.href = "/login";
              }
            }}
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
          onSuccess={fetchAllData} // 출퇴근 완료 시 데이터 새로고침
        />

        <WeeklyWorkStats />

        <StoreDistanceList
          stores={stores}
          locationState={locationState}
          radius={RADIUS_METER}
        />

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
    </div>
  );
}
