"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { ChevronLeft, Megaphone, Pin } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import type { Announcement } from "@/types/announcement";

export default function AnnouncementsPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const [{ data: items }, { data: reads }] = await Promise.all([
        supabase
          .from("announcements")
          .select("*")
          .order("is_pinned", { ascending: false })
          .order("created_at", { ascending: false }),
        user
          ? supabase
              .from("announcement_reads")
              .select("announcement_id")
              .eq("profile_id", user.id)
          : Promise.resolve({ data: [] }),
      ]);

      setAnnouncements((items as Announcement[]) ?? []);
      setReadIds(new Set((reads ?? []).map((r: { announcement_id: string }) => r.announcement_id)));
      setLoading(false);
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-[#F2F4F6] font-pretendard">
        <div className="h-14 bg-white border-b border-[#E5E8EB]" />
        <div className="px-5 pt-5 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-white animate-pulse rounded-[20px]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F2F4F6] font-pretendard">
      <header className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 bg-white/80 backdrop-blur-md border-b border-[#E5E8EB]">
        <button
          onClick={() => router.back()}
          aria-label="뒤로가기"
          className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-[#F2F4F6] transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-[#191F28]" />
        </button>
        <h1 className="text-[17px] font-bold text-[#191F28]">공지사항</h1>
      </header>

      <main className="flex-1 px-5 py-5 space-y-3 pb-10">
        {announcements.length === 0 ? (
          <div className="bg-white rounded-[20px] p-10 border border-slate-100 flex flex-col items-center gap-3 mt-4">
            <Megaphone className="w-10 h-10 text-[#D1D6DB]" />
            <p className="text-[14px] text-[#8B95A1]">등록된 공지가 없어요.</p>
          </div>
        ) : (
          announcements.map((item) => {
            const isRead = readIds.has(item.id);
            return (
              <button
                key={item.id}
                onClick={() => router.push(`/announcements/${item.id}`)}
                className="w-full text-left bg-white rounded-[20px] px-5 py-4 border border-slate-100 flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {item.is_pinned && (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-[#3182F6]">
                        <Pin className="w-3 h-3" />
                        고정
                      </span>
                    )}
                    {!isRead && (
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                    )}
                  </div>
                  <p className={`text-[14px] font-bold truncate ${isRead ? "text-[#8B95A1]" : "text-[#191F28]"}`}>
                    {item.title}
                  </p>
                  <p className="text-[12px] text-[#B0B8C1] mt-0.5 truncate">
                    {item.content.split("\n")[0]}
                  </p>
                  <p className="text-[11px] text-[#D1D6DB] mt-1">
                    {format(new Date(item.created_at), "yyyy.MM.dd", { locale: ko })}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </main>
    </div>
  );
}
