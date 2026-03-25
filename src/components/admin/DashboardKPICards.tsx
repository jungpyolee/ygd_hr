"use client";

import { useRouter } from "next/navigation";

interface KPIData {
  total: number;
  attended: number;
  late: number;
  lateAvgMinutes: number;
  absent: number;
  scheduled: number;
  actionCount: number;
  overtimeCount: number;
  subCount: number;
  healthCertCount: number;
}

export default function DashboardKPICards({ data }: { data: KPIData }) {
  const router = useRouter();
  const rate = data.total > 0 ? Math.round((data.attended / data.total) * 100) : 0;

  const cards = [
    {
      label: "출근율",
      value: `${rate}%`,
      sub: `오늘 ${data.attended}/${data.total}명`,
      accent: rate >= 90 ? "#00B761" : rate >= 70 ? "#F59E0B" : "#F04438",
      onClick: () => router.push("/admin/attendance"),
    },
    {
      label: "지각",
      value: `${data.late}명`,
      sub: data.late > 0 ? `평균 +${data.lateAvgMinutes}분` : "모두 정시 출근",
      accent: data.late > 0 ? "#F04438" : "#00B761",
      onClick: () => router.push("/admin/attendance"),
    },
    {
      label: "미출근",
      value: `${data.absent}명`,
      sub: data.scheduled > 0 ? `예정 ${data.scheduled}명` : "모두 출근 완료",
      accent: data.absent > 0 ? "#F04438" : "#00B761",
      onClick: () => router.push("/admin/attendance"),
    },
    {
      label: "처리 필요",
      value: `${data.actionCount}건`,
      sub:
        data.actionCount > 0
          ? [
              data.overtimeCount > 0 && `추가근무 ${data.overtimeCount}`,
              data.subCount > 0 && `대타 ${data.subCount}`,
              data.healthCertCount > 0 && `보건증 ${data.healthCertCount}`,
            ]
              .filter(Boolean)
              .join(" · ") || "확인 필요"
          : "모두 완료",
      accent: data.actionCount > 0 ? "#3182F6" : "#00B761",
      onClick: () =>
        router.push(
          data.overtimeCount > 0
            ? "/admin/overtime"
            : data.subCount > 0
              ? "/admin/schedules/substitutes"
              : "/admin/employees?health=warning"
        ),
    },
  ];

  return (
    <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1 md:grid md:grid-cols-4 md:overflow-visible">
      {cards.map((card) => (
        <button
          key={card.label}
          onClick={card.onClick}
          className="flex-shrink-0 min-w-[140px] flex-1 bg-white rounded-[16px] border border-slate-100 p-3.5 text-left hover:shadow-sm transition-shadow"
          style={{ borderLeftColor: card.accent, borderLeftWidth: 4 }}
        >
          <p className="text-[12px] font-medium text-[#8B95A1] mb-1">
            {card.label}
          </p>
          <p className="text-[22px] font-bold text-[#191F28] leading-tight">
            {card.value}
          </p>
          <p className="text-[11px] text-[#8B95A1] mt-0.5">{card.sub}</p>
        </button>
      ))}
    </div>
  );
}
