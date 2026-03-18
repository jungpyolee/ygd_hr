"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Pin } from "lucide-react";
import { toast } from "sonner";
import type { Announcement, AnnouncementTargetRole } from "@/types/announcement";

interface AnnouncementFormProps {
  initialData?: Announcement;
}

const TARGET_OPTIONS: { value: AnnouncementTargetRole; label: string }[] = [
  { value: "all", label: "전체 직원" },
  { value: "full_time", label: "정규직만" },
  { value: "part_time", label: "파트타임만" },
];

export default function AnnouncementForm({ initialData }: AnnouncementFormProps) {
  const supabase = createClient();
  const router = useRouter();

  const [title, setTitle] = useState(initialData?.title ?? "");
  const [content, setContent] = useState(initialData?.content ?? "");
  const [isPinned, setIsPinned] = useState(initialData?.is_pinned ?? false);
  const [targetRole, setTargetRole] = useState<AnnouncementTargetRole>(
    initialData?.target_roles?.[0] ?? "all"
  );
  const [submitting, setSubmitting] = useState(false);

  const isEdit = !!initialData;

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error("제목과 내용을 입력해 주세요.");
      return;
    }
    setSubmitting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("로그인이 필요해요.");
      setSubmitting(false);
      return;
    }

    if (isEdit) {
      const { error } = await supabase
        .from("announcements")
        .update({
          title: title.trim(),
          content: content.trim(),
          is_pinned: isPinned,
          target_roles: [targetRole],
        })
        .eq("id", initialData.id);

      if (error) {
        toast.error("저장에 실패했어요", { description: "잠시 후 다시 시도해 주세요." });
        setSubmitting(false);
        return;
      }
      toast.success("공지를 수정했어요");
    } else {
      const { data: newItem, error } = await supabase
        .from("announcements")
        .insert({
          title: title.trim(),
          content: content.trim(),
          is_pinned: isPinned,
          target_roles: [targetRole],
          created_by: user.id,
        })
        .select()
        .single();

      if (error || !newItem) {
        toast.error("공지 등록에 실패했어요", { description: "잠시 후 다시 시도해 주세요." });
        setSubmitting(false);
        return;
      }

      // 대상 직원들에게 알림 발송
      await sendAnnouncementNotifications(newItem.id, title.trim(), targetRole);
      toast.success("공지를 등록했어요");
    }

    router.push("/admin/announcements");
    router.refresh();
  };

  const sendAnnouncementNotifications = async (
    announcementId: string,
    announcementTitle: string,
    role: AnnouncementTargetRole
  ) => {
    // 대상 직원 조회
    let query = supabase.from("profiles").select("id").eq("role", "employee");
    if (role === "full_time") query = query.eq("employment_type", "full_time");
    if (role === "part_time") query = query.eq("employment_type", "part_time");

    const { data: targets } = await query;
    if (!targets?.length) return;

    const notifications = targets.map((p) => ({
      profile_id: p.id,
      target_role: "employee" as const,
      type: "announcement",
      title: "새 공지사항이 올라왔어요",
      content: announcementTitle.slice(0, 50),
      source_id: announcementId,
    }));

    await supabase.from("notifications").insert(notifications);
  };

  return (
    <div className="space-y-4">
      {/* 제목 */}
      <div className="bg-white rounded-[20px] p-5 border border-slate-100 space-y-3">
        <label className="text-[13px] font-bold text-[#4E5968]">제목</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="공지 제목을 입력해 주세요."
          className="w-full bg-[#F2F4F6] rounded-xl px-4 py-3 text-[14px] text-[#191F28] placeholder:text-[#B0B8C1] outline-none focus:ring-2 focus:ring-[#3182F6]/20"
        />
      </div>

      {/* 내용 */}
      <div className="bg-white rounded-[20px] p-5 border border-slate-100 space-y-3">
        <label className="text-[13px] font-bold text-[#4E5968]">내용</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="공지 내용을 입력해 주세요."
          rows={8}
          className="w-full bg-[#F2F4F6] rounded-xl px-4 py-3 text-[14px] text-[#191F28] placeholder:text-[#B0B8C1] outline-none focus:ring-2 focus:ring-[#3182F6]/20 resize-none"
        />
      </div>

      {/* 설정 */}
      <div className="bg-white rounded-[20px] p-5 border border-slate-100 space-y-4">
        {/* 공개/알림 대상 */}
        <div className="space-y-2">
          <label className="text-[13px] font-bold text-[#4E5968]">공개 · 알림 대상</label>
          <div className="flex gap-2 flex-wrap">
            {TARGET_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTargetRole(opt.value)}
                className={`px-4 py-2 rounded-full text-[13px] font-semibold transition-colors ${
                  targetRole === opt.value
                    ? "bg-[#3182F6] text-white"
                    : "bg-[#F2F4F6] text-[#4E5968]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 상단 고정 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Pin className="w-4 h-4 text-[#8B95A1]" />
            <span className="text-[13px] font-bold text-[#4E5968]">상단 고정</span>
          </div>
          <button
            onClick={() => setIsPinned(!isPinned)}
            className={`w-11 h-6 rounded-full transition-colors relative ${
              isPinned ? "bg-[#3182F6]" : "bg-[#D1D6DB]"
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${
                isPinned ? "left-6" : "left-1"
              }`}
            />
          </button>
        </div>
      </div>

      {/* 저장 버튼 */}
      <button
        onClick={handleSave}
        disabled={!title.trim() || !content.trim() || submitting}
        className="w-full py-4 bg-[#3182F6] text-white text-[16px] font-bold rounded-2xl disabled:opacity-40"
      >
        {isEdit ? "수정하기" : "게시하기"}
      </button>
    </div>
  );
}
