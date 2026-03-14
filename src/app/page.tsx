"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { getDistance } from "@/lib/utils/distance";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Calendar, Coffee, Factory, AlertCircle, User } from "lucide-react";
import dynamic from "next/dynamic";
import WeeklyWorkStats from "@/components/WeeklyWorkStats";

const DynamicClock = dynamic(() => import("@/components/Clock"), {
  ssr: false,
  loading: () => (
    <div className="text-right animate-pulse text-[#D1D6DB]">
      시간 읽는 중...
    </div>
  ),
});

interface Store {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface LastLog {
  type: string;
  time: string;
  date: string;
  store: string;
}

const RADIUS_METER = 100;

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [lastLog, setLastLog] = useState<LastLog | null>(null);
  const [userName, setUserName] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [stores, setStores] = useState<Store[]>([]);
  const supabase = createClient();

  const fetchInitialData = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setUserName(user.email?.split("@")[0] || "멤버");

    // 1. 실제 매장 정보 가져오기 (DB 연동)
    const { data: storeData, error: storeError } = await supabase
      .from("stores")
      .select("*");
    console.log("storeData", storeData);
    if (storeData) setStores(storeData);
    if (storeError) {
      toast.error("매장 정보를 불러오는 중에 오류가 발생했어요");
      console.error("storeError", storeError);
    }

    // 2. 최근 로그 가져오기 (JOIN 활용)
    const { data: logData } = await supabase
      .from("attendance_logs")
      .select("type, created_at, stores(name)")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(); // .single() 대신 이걸 사용하세요!
    if (logData) {
      const createdAt = new Date(logData.created_at);
      const now = new Date();

      // 오늘인지 확인 (날짜 비교)
      const isToday = createdAt.toDateString() === now.toDateString();

      setLastLog({
        type: logData.type,
        time: createdAt.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        // 오늘이면 "오늘", 아니면 "M월 d일 (요일)" 표시
        date: isToday
          ? "오늘"
          : createdAt.toLocaleDateString("ko-KR", {
              month: "long",
              day: "numeric",
              weekday: "short",
            }),
        store: (logData.stores as any)?.name || "알 수 없음",
      });
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    fetchInitialData();
    console.log("stores", stores);
    console.log("lastLog", lastLog);
    return () => clearInterval(timer);
  }, []);

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 11) return "좋은 아침이에요";
    if (hour < 14) return "맛있는 점심 드셨나요?";
    if (hour < 18) return "조금만 더 힘내세요";
    return "오늘 하루도 고생 많으셨어요";
  };

  const handleAttendance = async (type: "IN" | "OUT") => {
    // 1. 매장 정보 체크
    const targetStores = stores.length > 0 ? stores : []; // DB 데이터 우선 사용
    if (targetStores.length === 0) {
      toast.error("매장 정보를 불러오고 있어요. 잠시만 기다려주세요.");
      return;
    }

    setLoading(true);

    if (!navigator.geolocation) {
      toast.error("위치 정보를 가져올 수 없어요");
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        // 2. DB에서 가져온 매장들 중 가장 가까운 곳 계산
        const nearestStore = targetStores
          .map((s) => ({
            ...s,
            distance: getDistance(latitude, longitude, s.lat, s.lng),
          }))
          .sort((a, b) => a.distance - b.distance)[0];

        if (nearestStore.distance > RADIUS_METER) {
          toast.error("매장 근처가 아니에요", {
            description: `${nearestStore.name}에서 ${Math.round(
              nearestStore.distance
            )}m 거리에 있어요.`,
          });
          setLoading(false);
          return;
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { error } = await supabase.from("attendance_logs").insert({
          profile_id: user?.id,
          store_id: nearestStore.id, // DB UUID 직접 연동
          type,
          user_lat: latitude,
          user_lng: longitude,
          distance_m: nearestStore.distance,
        });

        if (error) {
          toast.error("기록에 실패했어요. 다시 시도해주세요.");
        } else {
          setLastLog({
            type: type,
            time: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            date: new Date().toLocaleDateString("ko-KR", {
              month: "long",
              day: "numeric",
              weekday: "short",
            }),
            store: nearestStore.name,
          });
          toast.success(
            `${nearestStore.name} ${
              type === "IN" ? "출근" : "퇴근"
            }을 완료했어요`
          );
          fetchInitialData(); // 전체 데이터 리프레시
        }
        setLoading(false);
      },
      () => {
        toast.error("위치 권한을 허용해주세요");
        setLoading(false);
      },
      { enableHighAccuracy: true }
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#F2F4F6] font-pretendard">
      <nav className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[#F2F4F6]/80 backdrop-blur-md">
        <span className="text-xl font-bold text-[#333D4B]">연경당 HR</span>
        <div className="flex gap-4">
          <Calendar className="w-6 h-6 text-[#4E5968]" />
          <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm">
            <User className="w-5 h-5 text-slate-400" />
          </div>
        </div>
      </nav>

      <main className="flex-1 px-5 pb-10 space-y-4">
        <section className="py-6 px-1 flex justify-between items-end">
          <h1 className="text-2xl font-bold text-[#191F28] leading-tight">
            {getGreeting()}
            <br />
            {userName ? `${userName}님` : ""}
          </h1>
          <DynamicClock />
        </section>

        <section className="bg-white rounded-[28px] p-6 shadow-sm border border-slate-100">
          <div className="flex justify-between items-start mb-8">
            <div className="space-y-1">
              <span className="text-sm font-medium text-[#4E5968]">
                현재 근무 상태
              </span>
              <div className="flex items-center gap-2">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    lastLog?.type === "IN"
                      ? "bg-[#3182F6] animate-pulse"
                      : "bg-[#D1D6DB]"
                  }`}
                />
                <div className="text-2xl font-bold text-[#191F28] ">
                  {/* Loading 중일때 skeleton 처리 */}
                  {loading || !lastLog ? (
                    <div className="w-20 h-8 bg-slate-100 animate-pulse rounded-2xl" />
                  ) : lastLog?.type === "IN" ? (
                    `${lastLog.store} 근무 중`
                  ) : (
                    "출근 전이에요"
                  )}
                </div>
              </div>
            </div>
            {lastLog && (
              <div className="text-right">
                <p className="text-xs text-[#8B95A1] font-medium">
                  마지막 {lastLog.type === "IN" ? "출근" : "퇴근"}
                </p>
                <p className="text-sm font-bold text-[#4E5968]">
                  {/* 날짜와 시간을 함께 표시 */}
                  <span className="text-[12px] font-normal mr-1">
                    {lastLog.date}
                  </span>
                  {lastLog.time}
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3">
            <Button
              onClick={() => handleAttendance("IN")}
              disabled={loading || lastLog?.type === "IN"}
              className="h-16 rounded-2xl bg-[#3182F6] text-white font-bold text-lg hover:bg-[#1B64DA] disabled:bg-[#D1D6DB] transition-all active:scale-[0.98]"
            >
              {loading ? "위치 확인 중..." : "출근하기"}
            </Button>
            <Button
              onClick={() => handleAttendance("OUT")}
              disabled={loading || lastLog?.type !== "IN"}
              className="h-16 rounded-2xl bg-[#F2F4F6] text-[#4E5968] font-bold text-lg hover:bg-[#E5E8EB] disabled:opacity-50 transition-all active:scale-[0.98]"
            >
              퇴근하기
            </Button>
          </div>
        </section>

        <WeeklyWorkStats />

        {/* 4. 사업장 퀵 인포 (DB 연동) */}
        <div className="grid grid-cols-2 gap-4">
          {stores.map((store) => (
            <div
              key={store.id}
              className="bg-white rounded-[28px] p-5 border border-slate-100"
            >
              {store.name.includes("카페") ? (
                <Coffee className="w-6 h-6 text-orange-400 mb-3" />
              ) : (
                <Factory className="w-6 h-6 text-blue-400 mb-3" />
              )}
              <p className="text-[15px] font-bold text-[#191F28]">
                {store.name}
              </p>
              <p className="text-xs text-[#8B95A1] mt-1">반경 100m 이내</p>
            </div>
          ))}
          {stores.length === 0 && (
            <div className="col-span-2 text-center py-4 text-slate-400 text-sm">
              매장 정보를 불러오는 중입니다...
            </div>
          )}
        </div>

        <section className="flex items-center justify-between bg-white rounded-[28px] p-5 border border-slate-100">
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

        <Button
          variant="ghost"
          className="w-full text-[#8B95A1] font-medium py-8"
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = "/login";
          }}
        >
          로그아웃 할게요
        </Button>
      </main>
    </div>
  );
}
