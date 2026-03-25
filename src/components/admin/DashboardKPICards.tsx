"use client";

interface AttendanceItem {
  status: "attended" | "late" | "absent" | "scheduled";
  store_id: string;
  late_minutes: number;
}

interface WorkLocation {
  id: string;
  label: string;
  color: string;
}

interface Props {
  storeGroups: Record<string, AttendanceItem[]>;
  byId: Record<string, WorkLocation | undefined>;
}

export default function DashboardKPICards({ storeGroups, byId }: Props) {
  const storeEntries = Object.entries(storeGroups).sort((a, b) => {
    const la = byId[a[0]]?.label || "";
    const lb = byId[b[0]]?.label || "";
    return la.localeCompare(lb);
  });

  if (storeEntries.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {storeEntries.map(([storeId, items]) => {
        const store = byId[storeId];
        const total = items.length;
        const attended = items.filter((i) => i.status === "attended" || i.status === "late").length;
        const late = items.filter((i) => i.status === "late").length;
        const lateAvg = late > 0
          ? Math.round(items.filter((i) => i.status === "late").reduce((s, i) => s + i.late_minutes, 0) / late)
          : 0;
        const rate = total > 0 ? Math.round((attended / total) * 100) : 0;
        const rateColor = rate >= 90 ? "#00B761" : rate >= 70 ? "#F59E0B" : "#F04438";

        return (
          <div
            key={storeId}
            className="bg-white rounded-[28px] border border-slate-100 p-5"
          >
            {/* 매장명 */}
            <div className="flex items-center gap-2 mb-3">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: store?.color || "#8B95A1" }}
              />
              <span className="text-[14px] font-bold text-[#191F28]">
                {store?.label || storeId}
              </span>
            </div>

            {/* 출근율 + 상세 */}
            <div className="flex items-end justify-between">
              <div>
                <p
                  className="text-[28px] font-bold leading-tight"
                  style={{ color: rateColor }}
                >
                  {rate}%
                </p>
                <p className="text-[12px] text-[#8B95A1] mt-1">
                  출근 {attended}/{total}명
                </p>
              </div>
              <div className="text-right">
                {late > 0 ? (
                  <div>
                    <p className="text-[14px] font-bold text-[#F59E0B]">{late}명 지각</p>
                    <p className="text-[11px] text-[#8B95A1]">평균 +{lateAvg}분</p>
                  </div>
                ) : (
                  <p className="text-[12px] text-[#00B761] font-medium">정시 출근</p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
