"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase";
import { getTargetProfileIds } from "@/lib/announcement-targets";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Check, CircleDashed } from "lucide-react";
import AvatarDisplay from "@/components/AvatarDisplay";
import type { Announcement } from "@/types/announcement";

interface ProfileRow {
  id: string;
  name: string | null;
  avatar_config: any;
}

interface Props {
  announcement: Announcement;
}

export default function AnnouncementReadStatus({ announcement }: Props) {
  const supabase = useMemo(() => createClient(), []);

  const { data, isLoading } = useSWR(
    ["announcement-reads", announcement.id],
    async () => {
      const role = announcement.target_roles?.[0] ?? "all";
      const targetIds = await getTargetProfileIds(
        supabase,
        role,
        announcement.target_store_ids ?? [],
      );

      if (targetIds.length === 0) {
        return { targets: [] as ProfileRow[], readMap: new Map<string, string>() };
      }

      const [{ data: profiles }, { data: reads }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, name, avatar_config")
          .in("id", targetIds)
          .order("name"),
        supabase
          .from("announcement_reads")
          .select("profile_id, read_at")
          .eq("announcement_id", announcement.id)
          .in("profile_id", targetIds),
      ]);

      const readMap = new Map<string, string>();
      (reads ?? []).forEach((r: any) => readMap.set(r.profile_id, r.read_at));
      return { targets: (profiles ?? []) as ProfileRow[], readMap };
    },
    { revalidateOnFocus: false },
  );

  if (isLoading) {
    return <div className="bg-white rounded-[20px] h-40 animate-pulse border border-slate-100" />;
  }

  const targets = data?.targets ?? [];
  const readMap = data?.readMap ?? new Map<string, string>();
  const readCount = targets.filter((t) => readMap.has(t.id)).length;
  const total = targets.length;

  const readList = targets
    .filter((t) => readMap.has(t.id))
    .sort((a, b) => (readMap.get(b.id) ?? "").localeCompare(readMap.get(a.id) ?? ""));
  const unreadList = targets.filter((t) => !readMap.has(t.id));

  return (
    <div className="bg-white rounded-[20px] p-5 border border-slate-100 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-bold text-[#4E5968]">읽음 현황</p>
          <p className="text-[11px] text-[#8B95A1] mt-0.5">공지 대상 직원 기준</p>
        </div>
        <div className="text-right">
          <p className="text-[18px] font-bold text-[#3182F6]">
            {readCount} <span className="text-[#8B95A1] font-semibold">/ {total}</span>
          </p>
          <p className="text-[11px] text-[#8B95A1]">읽음 / 전체</p>
        </div>
      </div>

      {total === 0 && (
        <p className="text-[13px] text-[#8B95A1]">대상 직원이 없어요.</p>
      )}

      {total > 0 && (
        <div className="grid grid-cols-1 gap-4">
          {/* 읽은 직원 */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Check className="w-3.5 h-3.5 text-[#3182F6]" />
              <span className="text-[12px] font-bold text-[#4E5968]">읽은 직원 ({readList.length})</span>
            </div>
            {readList.length === 0 ? (
              <p className="text-[12px] text-[#8B95A1]">아직 읽은 직원이 없어요.</p>
            ) : (
              <ul className="space-y-1.5">
                {readList.map((p) => {
                  const at = readMap.get(p.id);
                  return (
                    <li key={p.id} className="flex items-center gap-2.5 text-[13px]">
                      <AvatarDisplay userId={p.id} avatarConfig={p.avatar_config} size={24} />
                      <span className="text-[#191F28] flex-1">{p.name ?? "이름 없음"}</span>
                      <span className="text-[11px] text-[#8B95A1]">
                        {at ? format(new Date(at), "M/d HH:mm", { locale: ko }) : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* 안 읽은 직원 */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <CircleDashed className="w-3.5 h-3.5 text-[#8B95A1]" />
              <span className="text-[12px] font-bold text-[#4E5968]">안 읽은 직원 ({unreadList.length})</span>
            </div>
            {unreadList.length === 0 ? (
              <p className="text-[12px] text-[#8B95A1]">모두 읽었어요.</p>
            ) : (
              <ul className="space-y-1.5">
                {unreadList.map((p) => (
                  <li key={p.id} className="flex items-center gap-2.5 text-[13px]">
                    <AvatarDisplay userId={p.id} avatarConfig={p.avatar_config} size={24} />
                    <span className="text-[#191F28] flex-1">{p.name ?? "이름 없음"}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
