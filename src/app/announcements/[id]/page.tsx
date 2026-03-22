"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter, useParams } from "next/navigation";
import { ChevronLeft, Pin } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import type { Announcement } from "@/types/announcement";
import AnnouncementReactions from "@/components/announcement/AnnouncementReactions";

export default function AnnouncementDetailPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data } = await supabase
        .from("announcements")
        .select("*, profiles(name)")
        .eq("id", id)
        .single();

      if (!data) {
        router.replace("/announcements");
        return;
      }

      setAnnouncement(data as Announcement);
      if (user) setCurrentUserId(user.id);
      setLoading(false);

      // 읽음 처리 (upsert)
      if (user) {
        await supabase.from("announcement_reads").upsert(
          { announcement_id: id, profile_id: user.id },
          { onConflict: "announcement_id,profile_id", ignoreDuplicates: true }
        );
      }
    };
    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-[#F2F4F6] font-pretendard">
        <div className="h-14 bg-white border-b border-[#E5E8EB]" />
        <div className="px-5 pt-6 space-y-4">
          <div className="h-8 w-48 bg-slate-200 animate-pulse rounded-xl" />
          <div className="bg-white rounded-[20px] h-[300px] animate-pulse border border-slate-100" />
        </div>
      </div>
    );
  }

  if (!announcement) return null;

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
        <h1 className="text-[17px] font-bold text-[#191F28] truncate">공지사항</h1>
      </header>

      <main className="flex-1 px-5 py-5 pb-10">
        <div className="bg-white rounded-[20px] p-5 border border-slate-100">
          {/* 헤더 */}
          <div className="mb-4 pb-4 border-b border-[#F2F4F6]">
            {announcement.is_pinned && (
              <div className="flex items-center gap-1 text-[12px] font-bold text-[#3182F6] mb-2">
                <Pin className="w-3 h-3" />
                고정 공지
              </div>
            )}
            <h2 className="text-[18px] font-bold text-[#191F28] leading-snug mb-2">
              {announcement.title}
            </h2>
            <div className="flex items-center gap-2 text-[12px] text-[#B0B8C1]">
              {announcement.profiles?.name && (
                <span>{announcement.profiles.name}</span>
              )}
              <span>
                {format(new Date(announcement.created_at), "yyyy년 M월 d일", { locale: ko })}
              </span>
            </div>
          </div>

          {/* 본문 */}
          <p className="text-[15px] text-[#333D4B] leading-relaxed whitespace-pre-wrap">
            {announcement.content}
          </p>

          {/* 리액션 */}
          {currentUserId && (
            <AnnouncementReactions
              announcementId={id}
              currentUserId={currentUserId}
            />
          )}
        </div>
      </main>
    </div>
  );
}
