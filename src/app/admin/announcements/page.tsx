"use client";

import { useState } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Pin, PinOff, Pencil, Trash2, Plus, Megaphone } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";
import { useWorkplaces } from "@/lib/hooks/useWorkplaces";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { getTargetProfileIds } from "@/lib/announcement-targets";
import type { Announcement } from "@/types/announcement";

const TARGET_LABEL: Record<string, string> = {
  all: "전체 직원",
  full_time: "정규직",
  part_time: "파트타임",
};

export default function AdminAnnouncementsPage() {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const { byId: storeById } = useWorkplaces();

  const { data: announcements = [], isLoading: loading, mutate } = useSWR(
    "admin-announcements-list",
    async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("announcements")
        .select("*, profiles(name)")
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      return (data as Announcement[]) ?? [];
    },
    { dedupingInterval: 60_000, revalidateOnFocus: false }
  );

  // 공지별 (읽음 수 / 대상자 수)
  const { data: readStats = {} } = useSWR(
    announcements.length > 0 ? ["admin-announcements-reads", announcements.map((a) => a.id).join(",")] : null,
    async () => {
      const supabase = createClient();
      // 공지별 대상자 목록 병렬 계산
      const targetEntries = await Promise.all(
        announcements.map(async (a) => {
          const role = a.target_roles?.[0] ?? "all";
          const ids = await getTargetProfileIds(supabase, role, a.target_store_ids ?? []);
          return [a.id, ids] as const;
        }),
      );
      const targetMap = new Map(targetEntries);

      // 읽음 기록 한 번에 조회
      const { data: reads } = await supabase
        .from("announcement_reads")
        .select("announcement_id, profile_id")
        .in("announcement_id", announcements.map((a) => a.id));

      const result: Record<string, { read: number; total: number }> = {};
      announcements.forEach((a) => {
        const targets = targetMap.get(a.id) ?? [];
        const targetSet = new Set(targets);
        const readCount = (reads ?? []).filter(
          (r: any) => r.announcement_id === a.id && targetSet.has(r.profile_id),
        ).length;
        result[a.id] = { read: readCount, total: targets.length };
      });
      return result;
    },
    { revalidateOnFocus: false },
  );

  const togglePin = async (item: Announcement) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("announcements")
      .update({ is_pinned: !item.is_pinned })
      .eq("id", item.id);
    if (error) {
      toast.error("고정 설정에 실패했어요", { description: "잠시 후 다시 시도해 주세요." });
    } else {
      mutate();
    }
  };

  const deleteAnnouncement = async (item: Announcement) => {
    const supabase = createClient();
    const { error } = await supabase.from("announcements").delete().eq("id", item.id);
    if (error) {
      toast.error("삭제에 실패했어요", { description: "잠시 후 다시 시도해 주세요." });
    } else {
      toast.success("공지를 삭제했어요");
      mutate();
    }
    setDeleteTarget(null);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-slate-100 animate-pulse rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold text-[#191F28]">공지사항 관리</h1>
        <button
          onClick={() => router.push("/admin/announcements/new")}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#3182F6] text-white text-[14px] font-bold rounded-2xl"
        >
          <Plus className="w-4 h-4" />
          공지 올리기
        </button>
      </div>

      {announcements.length === 0 ? (
        <div className="bg-white rounded-[20px] p-10 border border-slate-100 flex flex-col items-center gap-3">
          <Megaphone className="w-10 h-10 text-[#D1D6DB]" />
          <p className="text-[14px] text-[#8B95A1]">등록된 공지가 없어요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-[20px] px-5 py-4 border border-slate-100 flex items-start gap-3 cursor-pointer active:scale-[0.99] transition-transform"
              onClick={() => router.push(`/admin/announcements/${item.id}/edit`)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {item.is_pinned && (
                    <span className="text-[11px] font-bold text-[#3182F6] bg-[#E8F3FF] px-2 py-0.5 rounded-full">
                      고정
                    </span>
                  )}
                  <span className="text-[11px] text-[#8B95A1] bg-[#F2F4F6] px-2 py-0.5 rounded-full">
                    {item.target_roles.map((r) => TARGET_LABEL[r] ?? r).join(", ")}
                  </span>
                  {item.target_store_ids?.length > 0 ? (
                    item.target_store_ids.map((sid) => {
                      const store = storeById[sid];
                      if (!store) return null;
                      return (
                        <span
                          key={sid}
                          className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                          style={{ color: store.color, backgroundColor: store.bg_color }}
                        >
                          {store.label}
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-[11px] text-[#8B95A1] bg-[#F2F4F6] px-2 py-0.5 rounded-full">
                      전체 근무지
                    </span>
                  )}
                </div>
                <p className="text-[14px] font-bold text-[#191F28] truncate">{item.title}</p>
                <p className="text-[12px] text-[#8B95A1] mt-0.5">
                  {format(new Date(item.created_at), "yyyy.MM.dd", { locale: ko })}
                  {item.profiles?.name && ` · ${item.profiles.name}`}
                  {readStats[item.id] && (
                    <>
                      {" · "}
                      <span className={
                        readStats[item.id].total > 0 && readStats[item.id].read === readStats[item.id].total
                          ? "text-[#3182F6] font-semibold"
                          : "text-[#8B95A1]"
                      }>
                        읽음 {readStats[item.id].read}/{readStats[item.id].total}
                      </span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); togglePin(item); }}
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F2F4F6] transition-colors"
                  aria-label={item.is_pinned ? "고정 해제" : "상단 고정"}
                >
                  {item.is_pinned ? (
                    <PinOff className="w-4 h-4 text-[#3182F6]" />
                  ) : (
                    <Pin className="w-4 h-4 text-[#8B95A1]" />
                  )}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); router.push(`/admin/announcements/${item.id}/edit`); }}
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F2F4F6] transition-colors"
                  aria-label="수정"
                >
                  <Pencil className="w-4 h-4 text-[#4E5968]" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(item); }}
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-red-50 transition-colors"
                  aria-label="삭제"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="공지를 삭제할까요?"
        description="삭제하면 복구할 수 없어요."
        confirmLabel="삭제하기"
        cancelLabel="취소"
        onConfirm={() => deleteTarget && deleteAnnouncement(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
