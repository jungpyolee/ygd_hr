"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Megaphone, Pin, ChevronRight } from "lucide-react";
import type { Announcement } from "@/types/announcement";

export default function AnnouncementBanner() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [items, setItems] = useState<Announcement[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const [{ data: announcements }, { data: reads }] = await Promise.all([
        supabase
          .from("announcements")
          .select("id, title, is_pinned, created_at, content")
          .order("is_pinned", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(3),
        user
          ? supabase
              .from("announcement_reads")
              .select("announcement_id")
              .eq("profile_id", user.id)
          : Promise.resolve({ data: [] }),
      ]);

      setItems((announcements as Announcement[]) ?? []);
      setReadIds(new Set((reads ?? []).map((r: any) => r.announcement_id)));
      setLoading(false);
    };
    fetchData();
  }, []);

  const unreadCount = items.filter((i) => !readIds.has(i.id)).length;

  return (
    <div className="bg-white rounded-[20px] border border-slate-100 overflow-hidden">
      {/* 헤더 */}
      <button
        onClick={() => router.push("/announcements")}
        className="w-full flex items-center justify-between px-5 py-4 border-b border-[#F2F4F6]"
      >
        <div className="flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-[#8B95A1]" />
          <span className="text-[14px] font-bold text-[#191F28]">공지사항</span>
          {unreadCount > 0 && (
            <span className="text-[11px] font-bold text-white bg-red-400 rounded-full px-1.5 py-0.5 leading-none">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-[12px] text-[#8B95A1]">
          전체 보기
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
      </button>

      {/* 공지 목록 */}
      {loading ? (
        <div className="px-5 py-4 space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-5 bg-slate-100 animate-pulse rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="px-5 py-5 text-center">
          <p className="text-[13px] text-[#B0B8C1]">등록된 공지가 없어요.</p>
        </div>
      ) : (
        <div className="divide-y divide-[#F2F4F6]">
          {items.map((item) => {
            const isRead = readIds.has(item.id);
            return (
              <button
                key={item.id}
                onClick={() => router.push(`/announcements/${item.id}`)}
                className="w-full flex items-center gap-2.5 px-5 py-3.5 text-left hover:bg-[#F9FAFB] transition-colors"
              >
                {item.is_pinned && (
                  <Pin className="w-3 h-3 text-[#3182F6] shrink-0" />
                )}
                {!item.is_pinned && !isRead && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                )}
                {!item.is_pinned && isRead && (
                  <span className="w-1.5 h-1.5 shrink-0" />
                )}
                <span
                  className={`text-[13px] truncate ${
                    isRead ? "text-[#B0B8C1]" : "font-semibold text-[#191F28]"
                  }`}
                >
                  {item.title}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
