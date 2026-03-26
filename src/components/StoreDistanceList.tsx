"use client";

import { getDistance } from "@/lib/utils/distance";
import { Coffee, Factory } from "lucide-react";

interface StoreDistanceListProps {
  stores: any[];
  locationState: any;
  radius: number;
}

function getStoreDistanceText(store: any, locationState: any, radius: number): string {
  if (!store.is_gps_required) return "위치 무관";
  if (locationState.status === "idle" || locationState.status === "loading") return "";
  if (locationState.status === "ready")
    return formatDistance(getDistance(locationState.lat, locationState.lng, store.lat, store.lng), radius);
  if (locationState.status === "denied") return "위치 권한 없음";
  return "위치 알 수 없음";
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
          {locationState.status === "loading" && store.is_gps_required ? (
            <div className="h-3 w-16 bg-[#F2F4F6] rounded animate-pulse mt-1" />
          ) : (
            <p className="text-xs text-[#8B95A1] mt-1">
              {getStoreDistanceText(store, locationState, radius)}
            </p>
          )}
        </div>
      ))}

      {stores.length === 0 && (
        <>
          {[0, 1].map((i) => (
            <div key={i} className="bg-white rounded-[28px] p-5 border border-slate-100 shadow-sm animate-pulse">
              <div className="w-6 h-6 bg-[#F2F4F6] rounded-lg mb-3" />
              <div className="h-4 w-24 bg-[#F2F4F6] rounded" />
              <div className="h-3 w-16 bg-[#F2F4F6] rounded mt-2" />
            </div>
          ))}
        </>
      )}
    </div>
  );
}
