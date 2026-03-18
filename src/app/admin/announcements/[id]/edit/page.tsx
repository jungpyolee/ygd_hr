"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter, useParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import AnnouncementForm from "@/components/announcement/AnnouncementForm";
import type { Announcement } from "@/types/announcement";

export default function AdminAnnouncementEditPage() {
  const supabase = createClient();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase
        .from("announcements")
        .select("*")
        .eq("id", id)
        .single();

      if (!data) {
        router.replace("/admin/announcements");
        return;
      }
      setAnnouncement(data as Announcement);
      setLoading(false);
    };
    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-32 bg-slate-200 animate-pulse rounded-xl" />
        <div className="bg-white rounded-[20px] h-[200px] animate-pulse border border-slate-100" />
      </div>
    );
  }

  if (!announcement) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F2F4F6] transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-[#191F28]" />
        </button>
        <h1 className="text-[22px] font-bold text-[#191F28]">공지 수정하기</h1>
      </div>
      <AnnouncementForm initialData={announcement} />
    </div>
  );
}
