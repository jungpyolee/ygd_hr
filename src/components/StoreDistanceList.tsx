"use client";

import { getDistance } from "@/lib/utils/distance";
import { Coffee, Factory } from "lucide-react";

interface StoreDistanceListProps {
  stores: any[];
  locationState: any;
  radius: number;
}

// 거리 포맷팅 함수 (100m 이내, 약 500m, 약 1.2km 등)
function formatDistance(meters: number, radius: number): string {
  if (meters <= radius) return `${radius}m 이내`;
  if (meters < 1000) return `약 ${Math.round(meters)}m`;
  return `약 ${(meters / 1000).toFixed(1)}km`;
}

export default function StoreDistanceList({
  stores,
  locationState,
  radius,
}: StoreDistanceListProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {stores.map((store) => (
        <div
          key={store.id}
          className="bg-white rounded-[28px] p-5 border border-slate-100 shadow-sm"
        >
          {store.name.includes("카페") ? (
            <Coffee className="w-6 h-6 text-orange-400 mb-3" />
          ) : (
            <Factory className="w-6 h-6 text-blue-400 mb-3" />
          )}
          <p className="text-[15px] font-bold text-[#191F28]">{store.name}</p>
          <p className="text-xs text-[#8B95A1] mt-1">
            {locationState.status === "loading"
              ? "위치 확인 중..."
              : locationState.status === "unavailable"
              ? "위치 알 수 없음"
              : formatDistance(
                  getDistance(
                    locationState.lat,
                    locationState.lng,
                    store.lat,
                    store.lng
                  ),
                  radius
                )}
          </p>
        </div>
      ))}

      {/* 매장 데이터가 아직 없을 때의 스켈레톤/안내 UI */}
      {stores.length === 0 && (
        <div className="col-span-2 text-center py-8 text-slate-400 text-sm bg-white rounded-[28px] border border-slate-100 border-dashed">
          매장 위치 정보를 불러오는 중이에요...
        </div>
      )}
    </div>
  );
}
