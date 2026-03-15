"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { getDistance } from "@/lib/utils/distance";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// 부모에게서 받을 Props 정의
interface AttendanceCardProps {
  stores: any[];
  lastLog: any;
  locationState: any;
  radius: number;
  onSuccess: () => void; // 출퇴근 성공 시 부모 데이터를 새로고침하기 위함
}

export default function AttendanceCard({
  stores,
  lastLog,
  locationState,
  radius,
  onSuccess,
}: AttendanceCardProps) {
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleAttendance = async (type: "IN" | "OUT") => {
    if (stores.length === 0) return toast.error("매장 정보를 불러오고 있어요.");
    if (locationState.status !== "ready")
      return toast.error("위치 정보를 가져올 수 없어요.");

    setLoading(true);
    const { lat, lng } = locationState;

    const nearestStore = stores
      .map((s) => ({ ...s, distance: getDistance(lat, lng, s.lat, s.lng) }))
      .sort((a, b) => a.distance - b.distance)[0];

    if (nearestStore.distance > radius) {
      toast.error("매장 근처가 아니에요", {
        description: `${nearestStore.name}에서 약 ${Math.round(
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
      store_id: nearestStore.id,
      type,
      user_lat: lat,
      user_lng: lng,
      distance_m: nearestStore.distance,
    });

    if (error) {
      toast.error("기록에 실패했어요. 다시 시도해주세요.");
    } else {
      toast.success(
        `${nearestStore.name} ${type === "IN" ? "출근" : "퇴근"} 완료!`
      );
      onSuccess(); // 부모(page.tsx)의 데이터 리프레시 함수 호출
    }
    setLoading(false);
  };

  return (
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
            <div className="text-2xl font-bold text-[#191F28]">
              {lastLog?.type === "IN"
                ? `${lastLog.store} 근무 중`
                : "출근 전이에요"}
            </div>
          </div>
        </div>
        {lastLog && (
          <div className="text-right">
            <p className="text-xs text-[#8B95A1] font-medium">
              마지막 {lastLog.type === "IN" ? "출근" : "퇴근"}
            </p>
            <p className="text-sm font-bold text-[#4E5968]">
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
          className="h-16 rounded-2xl bg-[#3182F6] text-white font-bold text-lg hover:bg-[#1B64DA] disabled:bg-[#D1D6DB] transition-all"
        >
          {loading ? "위치 확인 중..." : "출근하기"}
        </Button>
        <Button
          onClick={() => handleAttendance("OUT")}
          disabled={loading || lastLog?.type !== "IN"}
          className={`h-16 rounded-2xl font-bold text-lg transition-all ${
            lastLog?.type === "IN" && !loading
              ? "bg-[#E8F3FF] text-[#3182F6] border-2 border-[#3182F6]/30"
              : "bg-[#F2F4F6] text-[#4E5968] disabled:opacity-50"
          }`}
        >
          퇴근하기
        </Button>
      </div>
    </section>
  );
}
