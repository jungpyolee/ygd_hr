"use client";

import { useRouter } from "next/navigation";
import {
  Clock,
  Users,
  TimerIcon,
  CalendarDays,
  BarChart2,
  Megaphone,
} from "lucide-react";

interface AdminQuickNavProps {
  overtimeBadge?: number;
  healthCertBadge?: number;
}

export default function AdminQuickNav({
  overtimeBadge = 0,
  healthCertBadge = 0,
}: AdminQuickNavProps) {
  const router = useRouter();

  const tiles = [
    {
      label: "근태 기록",
      icon: <Clock className="w-5 h-5" />,
      iconBg: "#E8F3FF",
      iconColor: "#3182F6",
      badge: 0,
      href: "/admin/attendance",
    },
    {
      label: "직원 관리",
      icon: <Users className="w-5 h-5" />,
      iconBg: "#E6FAF0",
      iconColor: "#00B761",
      badge: healthCertBadge,
      href: "/admin/employees",
    },
    {
      label: "추가근무",
      icon: <TimerIcon className="w-5 h-5" />,
      iconBg: "#FFF7E6",
      iconColor: "#F59E0B",
      badge: overtimeBadge,
      href: "/admin/overtime",
    },
    {
      label: "통합 캘린더",
      icon: <CalendarDays className="w-5 h-5" />,
      iconBg: "#F3F0FF",
      iconColor: "#8B5CF6",
      badge: 0,
      href: "/admin/calendar",
    },
    {
      label: "근태 통계",
      icon: <BarChart2 className="w-5 h-5" />,
      iconBg: "#FFF0F0",
      iconColor: "#F04438",
      badge: 0,
      href: "/admin/stats",
    },
    {
      label: "공지사항",
      icon: <Megaphone className="w-5 h-5" />,
      iconBg: "#F2F4F6",
      iconColor: "#4E5968",
      badge: 0,
      href: "/admin/announcements",
    },
  ];

  return (
    <section>
      <h2 className="text-[15px] font-bold text-[#191F28] mb-3">빠른 이동</h2>
      <div className="grid grid-cols-3 gap-2.5">
        {tiles.map((tile) => (
          <button
            key={tile.label}
            onClick={() => router.push(tile.href)}
            className="relative flex flex-col items-center gap-2 py-4 bg-white rounded-[20px] border border-slate-100 hover:shadow-sm transition-shadow"
          >
            <div
              className="w-10 h-10 rounded-[14px] flex items-center justify-center"
              style={{ backgroundColor: tile.iconBg, color: tile.iconColor }}
            >
              {tile.icon}
            </div>
            <span className="text-[13px] font-medium text-[#4E5968]">
              {tile.label}
            </span>
            {tile.badge > 0 && (
              <span className="absolute top-2 right-2 min-w-[18px] h-[18px] px-1 bg-[#F04438] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {tile.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
