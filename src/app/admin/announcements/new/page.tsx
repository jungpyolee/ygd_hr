"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import AnnouncementForm from "@/components/announcement/AnnouncementForm";

export default function AdminAnnouncementNewPage() {
  const router = useRouter();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F2F4F6] transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-[#191F28]" />
        </button>
        <h1 className="text-[22px] font-bold text-[#191F28]">공지 올리기</h1>
      </div>
      <AnnouncementForm />
    </div>
  );
}
