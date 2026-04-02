"use client";

import useSWR from "swr";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  CalendarClock,
  UserPlus,
  Info,
  CalendarDays,
} from "lucide-react";

interface Notification {
  id: string;
  type: string;
  title: string;
  content: string;
  created_at: string;
}

function getNotiIcon(type: string) {
  switch (type) {
    case "onboarding":
      return <UserPlus className="w-3.5 h-3.5 text-blue-500" />;
    case "attendance_in":
      return <CalendarClock className="w-3.5 h-3.5 text-green-500" />;
    case "attendance_out":
      return <CalendarClock className="w-3.5 h-3.5 text-orange-500" />;
    case "substitute_requested":
      return <CalendarDays className="w-3.5 h-3.5 text-purple-500" />;
    case "health_cert_expiry":
      return <Info className="w-3.5 h-3.5 text-amber-500" />;
    default:
      return <Info className="w-3.5 h-3.5 text-slate-400" />;
  }
}

function getNotiRoute(type: string): string {
  switch (type) {
    case "onboarding":
    case "profile_update":
      return "/admin/employees";
    case "attendance_in":
    case "attendance_out":
      return "/admin/calendar";
    case "substitute_requested":
      return "/admin/schedules/substitutes";
    case "announcement":
      return "/admin/announcements";
    default:
      return "/admin";
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export default function DashboardActivityFeed() {
  const router = useRouter();

  const { data: notis = [], isLoading } = useSWR(
    "admin-recent-activity",
    async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("notifications")
        .select("id, type, title, content, created_at")
        .eq("target_role", "admin")
        .order("created_at", { ascending: false })
        .limit(5);
      return (data ?? []) as Notification[];
    },
    { dedupingInterval: 30_000, revalidateOnFocus: true }
  );

  if (isLoading) {
    return (
      <section>
        <h2 className="text-[15px] font-bold text-[#191F28] mb-3">
          최근 활동
        </h2>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-7 h-7 bg-[#F2F4F6] rounded-full" />
              <div className="flex-1">
                <div className="h-3 bg-[#F2F4F6] rounded w-3/4 mb-1.5" />
                <div className="h-2.5 bg-[#F2F4F6] rounded w-16" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (notis.length === 0) return null;

  return (
    <section>
      <h2 className="text-[15px] font-bold text-[#191F28] mb-3">최근 활동</h2>
      <div className="space-y-1">
        {notis.map((n) => (
          <button
            key={n.id}
            onClick={() => router.push(getNotiRoute(n.type))}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[14px] hover:bg-[#F2F4F6] transition-colors text-left"
          >
            <div className="w-7 h-7 rounded-full bg-[#F2F4F6] flex items-center justify-center shrink-0">
              {getNotiIcon(n.type)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-[#4E5968] truncate">{n.content}</p>
            </div>
            <span className="text-[11px] text-[#8B95A1] shrink-0">
              {timeAgo(n.created_at)}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
