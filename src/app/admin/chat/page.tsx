"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import useSWR from "swr";

interface ConversationItem {
  id: string;
  profile_id: string;
  last_message_at: string;
  unread_count_admin: number;
  profile: {
    name: string;
    color_hex: string;
  };
  last_message: {
    content: string;
    message_type: string;
    sender_id: string;
  } | null;
}

export default function AdminChatListPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [totalUnread, setTotalUnread] = useState(0);

  const { data: conversations = [], mutate } = useSWR(
    "admin-chat-conversations",
    async () => {
      const { data } = await supabase
        .from("chat_conversations")
        .select(`
          id, profile_id, last_message_at, unread_count_admin,
          profile:profiles!profile_id(name, color_hex)
        `)
        .order("last_message_at", { ascending: false });

      if (!data) return [];

      // 각 대화의 마지막 메시지 로드
      const withLastMsg = await Promise.all(
        (data as any[]).map(async (conv) => {
          const { data: msgs } = await supabase
            .from("chat_messages")
            .select("content, message_type, sender_id")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          return { ...conv, last_message: msgs ?? null } as ConversationItem;
        })
      );

      return withLastMsg;
    },
    { dedupingInterval: 10_000, revalidateOnFocus: true }
  );

  useEffect(() => {
    setTotalUnread(conversations.reduce((sum, c) => sum + (c.unread_count_admin > 0 ? 1 : 0), 0));
  }, [conversations]);

  // Realtime — 대화방 업데이트 감지
  useEffect(() => {
    const channel = supabase
      .channel("admin-chat-conversations-list")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "chat_conversations",
      }, () => mutate())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, mutate]);

  return (
    <div className="max-w-3xl animate-in fade-in duration-500 pb-20">
      <header className="mb-6 flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#191F28] tracking-tight">직원 채팅</h1>
          <p className="text-[14px] text-[#8B95A1] mt-0.5">직원들과의 1:1 업무 채팅</p>
        </div>
        {totalUnread > 0 && (
          <span className="ml-auto px-2.5 py-1 rounded-full bg-[#F04438] text-white text-[12px] font-bold">
            {totalUnread}명 미확인
          </span>
        )}
      </header>

      {conversations.length === 0 ? (
        <div className="bg-white rounded-[24px] border border-slate-100 p-12 text-center">
          <MessageSquare className="w-8 h-8 text-[#D1D6DB] mx-auto mb-3" />
          <p className="text-[14px] text-[#8B95A1]">아직 채팅이 없어요</p>
          <p className="text-[12px] text-[#8B95A1] mt-1">직원이 메시지를 보내면 여기 표시돼요</p>
        </div>
      ) : (
        <div className="bg-white rounded-[24px] border border-slate-100 overflow-hidden divide-y divide-slate-50">
          {conversations.map((conv) => {
            const hasUnread = conv.unread_count_admin > 0;
            return (
              <button
                key={conv.id}
                onClick={() => router.push(`/admin/chat/${conv.profile_id}`)}
                className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-[#F9FAFB] transition-colors active:bg-[#F2F4F6]"
              >
                {/* 아바타 */}
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-[15px] shrink-0"
                  style={{ backgroundColor: conv.profile?.color_hex || "#8B95A1" }}
                >
                  {conv.profile?.name?.charAt(0)}
                </div>

                {/* 텍스트 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className={`text-[15px] ${hasUnread ? "font-bold text-[#191F28]" : "font-medium text-[#191F28]"}`}>
                      {conv.profile?.name}
                    </p>
                    <p className="text-[11px] text-[#8B95A1] shrink-0 ml-2">
                      {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true, locale: ko })}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className={`text-[13px] truncate ${hasUnread ? "text-[#4E5968]" : "text-[#8B95A1]"}`}>
                      {conv.last_message
                        ? conv.last_message.content
                        : "채팅을 시작해 보세요"}
                    </p>
                    {hasUnread && (
                      <span className="shrink-0 ml-2 w-5 h-5 rounded-full bg-[#3182F6] text-white text-[11px] font-bold flex items-center justify-center">
                        N
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
