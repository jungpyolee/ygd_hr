"use client";

import { useRouter } from "next/navigation";
import { TimerIcon, UserCheck, ShieldAlert, LogOut, ClipboardEdit, ChevronRight } from "lucide-react";

interface ActionItem {
  key: string;
  label: string;
  count: number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  href: string;
}

interface ActionRequiredBannerProps {
  overtimeCount: number;
  subCount: number;
  healthCertCount: number;
  missedCheckoutCount: number;
  adjustmentCount?: number;
}

export default function ActionRequiredBanner({
  overtimeCount,
  subCount,
  healthCertCount,
  missedCheckoutCount,
  adjustmentCount = 0,
}: ActionRequiredBannerProps) {
  const router = useRouter();

  const items: ActionItem[] = [
    {
      key: "overtime",
      label: "추가근무 확인",
      count: overtimeCount,
      icon: <TimerIcon className="w-4 h-4" />,
      color: "#F59E0B",
      bgColor: "#FFF7E6",
      href: "/admin/overtime",
    },
    {
      key: "substitute",
      label: "대타 요청 승인",
      count: subCount,
      icon: <UserCheck className="w-4 h-4" />,
      color: "#8B5CF6",
      bgColor: "#F3F0FF",
      href: "/admin/schedules/substitutes",
    },
    {
      key: "health",
      label: "보건증 만료/임박",
      count: healthCertCount,
      icon: <ShieldAlert className="w-4 h-4" />,
      color: "#F04438",
      bgColor: "#FFF0F0",
      href: "/admin/employees?health=warning",
    },
    {
      key: "adjustment",
      label: "근태 조정 신청",
      count: adjustmentCount,
      icon: <ClipboardEdit className="w-4 h-4" />,
      color: "#06B6D4",
      bgColor: "#ECFEFF",
      href: "/admin/adjustments",
    },
    {
      key: "missed_checkout",
      label: "미퇴근 처리",
      count: missedCheckoutCount,
      icon: <LogOut className="w-4 h-4" />,
      color: "#3182F6",
      bgColor: "#E8F3FF",
      href: "/admin/stats?tab=missed",
    },
  ].filter((item) => item.count > 0);

  if (items.length === 0) return null;

  const totalCount = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <section className="bg-white rounded-[24px] border border-slate-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-50 flex items-center gap-2">
        <h2 className="text-[15px] font-bold text-[#191F28]">
          처리가 필요해요
        </h2>
        <span className="text-[11px] font-bold text-white bg-[#F04438] px-2 py-0.5 rounded-full">
          {totalCount}
        </span>
      </div>
      <div className="divide-y divide-slate-50">
        {items.map((item) => (
          <button
            key={item.key}
            onClick={() => router.push(item.href)}
            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-[#F9FAFB] transition-colors"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                style={{ backgroundColor: item.bgColor, color: item.color }}
              >
                {item.icon}
              </div>
              <span className="text-[14px] font-medium text-[#191F28]">
                {item.label}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-[12px] font-bold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: item.bgColor, color: item.color }}
              >
                {item.count}건
              </span>
              <ChevronRight className="w-4 h-4 text-[#D1D6DB]" />
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
