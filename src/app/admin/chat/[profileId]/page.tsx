"use client";

import { useEffect, useRef, useState, useMemo, use } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronLeft, Send, Clock, MapPin, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useWorkplaces } from "@/lib/hooks/useWorkplaces";

interface ChatMessage {
  id: string;
  sender_id: string;
  message_type: "text" | "action_request" | "action_response";
  content: string;
  template_key: string | null;
  action_status: "pending" | "approved" | "rejected" | null;
  context_data: {
    slot_id?: string;
    slot_date?: string;
    start_time?: string;
    end_time?: string;
    store_label?: string;
    requested_start_time?: string;
    requested_end_time?: string;
  } | null;
  created_at: string;
}

const ADMIN_TEMPLATES = [
  { key: "confirmed", label: "확인했어요", content: "확인했어요 👍" },
  { key: "early_out_allowed", label: "조기퇴근 허가", content: "오늘 일찍 퇴근해도 돼요. 수고했어요 😊" },
  { key: "schedule_change", label: "스케줄 변경", content: "스케줄 변경이 있어요. 확인해 주세요." },
] as const;

const ACTION_LABEL: Record<string, string> = {
  late: "지각 예정",
  early_leave: "조퇴 요청",
  absent: "결근 예정",
  time_change: "시간 변경 요청",
  sub_request: "대타 요청",
};

export default function AdminChatDetailPage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = use(params);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { byId } = useWorkplaces();

  const [employeeProfile, setEmployeeProfile] = useState<any>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setMyId(user.id);

      const [{ data: emp }, { data: conv }] = await Promise.all([
        supabase.from("profiles").select("id, name, color_hex").eq("id", profileId).single(),
        supabase.from("chat_conversations").select("id").eq("profile_id", profileId).maybeSingle(),
      ]);

      setEmployeeProfile(emp);

      if (conv) {
        setConversationId(conv.id);
        const { data: msgs } = await supabase
          .from("chat_messages")
          .select("*")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: true });
        setMessages(msgs ?? []);

        // 어드민 읽음 처리
        await supabase.from("chat_conversations")
          .update({ unread_count_admin: 0 })
          .eq("id", conv.id);
      }

      setLoading(false);
    })();
  }, [supabase, router, profileId]);

  // Realtime 구독
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`admin-chat-${conversationId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        setMessages((prev) => {
          if (prev.find((m) => m.id === (payload.new as ChatMessage).id)) return prev;
          return [...prev, payload.new as ChatMessage];
        });
        // 새 메시지 도착 시 읽음 처리
        supabase.from("chat_conversations").update({ unread_count_admin: 0 }).eq("id", conversationId);
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "chat_messages",
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        setMessages((prev) =>
          prev.map((m) => m.id === (payload.new as ChatMessage).id ? payload.new as ChatMessage : m)
        );
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, supabase]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getOrCreateConversation = async (): Promise<string | null> => {
    if (conversationId) return conversationId;
    const { data, error } = await supabase
      .from("chat_conversations")
      .upsert({ profile_id: profileId }, { onConflict: "profile_id" })
      .select("id")
      .single();
    if (error || !data) return null;
    setConversationId(data.id);
    return data.id;
  };

  const sendMessage = async (
    content: string,
    opts?: { message_type?: "text" | "action_response"; template_key?: string }
  ) => {
    if (!myId || sending || !content.trim()) return;
    setSending(true);
    try {
      const convId = await getOrCreateConversation();
      if (!convId) throw new Error("채팅방 생성 실패");

      await supabase.from("chat_messages").insert({
        conversation_id: convId,
        sender_id: myId,
        message_type: opts?.message_type ?? "text",
        content,
        template_key: opts?.template_key ?? null,
        action_status: null,
        context_data: null,
      });

      await supabase.from("chat_conversations").update({
        last_message_at: new Date().toISOString(),
        unread_count_employee: 999,
      }).eq("id", convId);

      setInput("");
    } catch {
      toast.error("메시지를 보내지 못했어요. 다시 시도해 주세요.");
    } finally {
      setSending(false);
    }
  };

  const handleAction = async (msg: ChatMessage, status: "approved" | "rejected") => {
    setActionLoading(msg.id);
    try {
      // 1. 메시지 상태 업데이트
      const { error: msgErr } = await supabase
        .from("chat_messages")
        .update({ action_status: status })
        .eq("id", msg.id);
      if (msgErr) throw msgErr;

      // 2. 근태 자동 반영
      if (status === "approved" && msg.context_data?.slot_id) {
        if (msg.template_key === "absent") {
          await supabase
            .from("schedule_slots")
            .update({ status: "cancelled" })
            .eq("id", msg.context_data.slot_id);
        } else if (msg.template_key === "early_leave") {
          // 현재 시각을 end_time으로 설정 (HH:MM:SS)
          const now = format(new Date(), "HH:mm:ss");
          await supabase
            .from("schedule_slots")
            .update({ end_time: now })
            .eq("id", msg.context_data.slot_id);
        } else if (msg.template_key === "time_change") {
          const updates: Record<string, string> = {};
          if (msg.context_data.requested_start_time) updates.start_time = msg.context_data.requested_start_time;
          if (msg.context_data.requested_end_time) updates.end_time = msg.context_data.requested_end_time;
          if (Object.keys(updates).length > 0) {
            await supabase
              .from("schedule_slots")
              .update(updates)
              .eq("id", msg.context_data.slot_id);
          }
        }
        // late, sub_request는 근태 변경 없음 (확인만)
      }

      // 3. 결과 메시지 전송
      let resultMsg: string;
      if (status === "approved" && msg.template_key === "sub_request") {
        resultMsg = "대타를 구해볼게요. 진행 상황을 알려드릴게요 ✓";
      } else if (status === "approved") {
        resultMsg = `${ACTION_LABEL[msg.template_key ?? ""] ?? "요청"}을 승인했어요 ✓`;
      } else {
        resultMsg = `${ACTION_LABEL[msg.template_key ?? ""] ?? "요청"}을 거절했어요.`;
      }

      await sendMessage(resultMsg, { message_type: "action_response" });

      toast.success(status === "approved" ? "승인했어요" : "거절했어요");
    } catch {
      toast.error("처리 중 오류가 생겼어요. 다시 시도해 주세요.");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="flex flex-col gap-3 w-full max-w-lg px-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className={`h-12 rounded-2xl bg-[#F2F4F6] animate-pulse ${i % 2 === 0 ? "w-2/3" : "w-1/2 ml-auto"}`} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#F2F4F6] font-pretendard">
      {/* 헤더 */}
      <header className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-[#F2F4F6]/90 backdrop-blur-md border-b border-[#E5E8EB]">
        <button
          onClick={() => router.push("/admin/chat")}
          className="w-9 h-9 rounded-full bg-white shadow-sm flex items-center justify-center"
        >
          <ChevronLeft className="w-5 h-5 text-[#4E5968]" />
        </button>
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-[14px] shrink-0"
          style={{ backgroundColor: employeeProfile?.color_hex || "#8B95A1" }}
        >
          {employeeProfile?.name?.charAt(0)}
        </div>
        <div>
          <p className="text-[16px] font-bold text-[#191F28]">{employeeProfile?.name}</p>
          <p className="text-[12px] text-[#8B95A1]">1:1 채팅</p>
        </div>
      </header>

      {/* 메시지 영역 */}
      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
            <p className="text-[14px] text-[#8B95A1]">{employeeProfile?.name}님과의 채팅을 시작해 보세요</p>
          </div>
        )}

        {messages.map((msg) => {
          const isMine = msg.sender_id === myId;
          const isPendingAction = msg.message_type === "action_request" && msg.action_status === "pending";

          return (
            <div key={msg.id} className={`flex flex-col ${isMine ? "items-end" : "items-start"} gap-1`}>
              {/* 스케줄 컨텍스트 카드 */}
              {msg.context_data?.slot_date && (
                <div className="px-3 py-2 rounded-2xl bg-white border border-[#E5E8EB] text-[12px] text-[#4E5968] flex flex-wrap items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-[#3182F6] shrink-0" />
                  <span>
                    {format(new Date(msg.context_data.slot_date), "M/d(EEE)", { locale: ko })}
                    {" "}{msg.context_data.start_time?.slice(0, 5)}~{msg.context_data.end_time?.slice(0, 5)}
                  </span>
                  {msg.context_data.store_label && (
                    <>
                      <MapPin className="w-3 h-3 text-[#8B95A1] shrink-0" />
                      <span>{msg.context_data.store_label}</span>
                    </>
                  )}
                  {(msg.context_data.requested_start_time || msg.context_data.requested_end_time) && (
                    <span className="text-[#3182F6] font-bold">
                      → {msg.context_data.requested_start_time?.slice(0, 5) ?? msg.context_data.start_time?.slice(0, 5)}~{msg.context_data.requested_end_time?.slice(0, 5) ?? msg.context_data.end_time?.slice(0, 5)}
                    </span>
                  )}
                </div>
              )}

              {/* 메시지 버블 */}
              <div className={`max-w-[75%] flex flex-col gap-1.5 ${isMine ? "items-end" : "items-start"}`}>
                <div className={`px-4 py-3 rounded-2xl text-[14px] leading-snug ${
                  isMine
                    ? "bg-[#3182F6] text-white rounded-tr-md"
                    : "bg-white text-[#191F28] rounded-tl-md shadow-sm"
                }`}>
                  {msg.content}
                </div>

                {/* 액션 요청일 때 — 승인/거절 버튼 */}
                {isPendingAction && !isMine && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAction(msg, "approved")}
                      disabled={actionLoading === msg.id}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#E6FAF0] text-[#00B761] text-[13px] font-bold hover:bg-[#C7F5E0] transition-colors disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      승인하기
                    </button>
                    <button
                      onClick={() => handleAction(msg, "rejected")}
                      disabled={actionLoading === msg.id}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#FFF0F0] text-[#F04438] text-[13px] font-bold hover:bg-[#FFE0E0] transition-colors disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                      거절하기
                    </button>
                  </div>
                )}

                {/* 액션 결과 상태 */}
                {msg.message_type === "action_request" && msg.action_status && msg.action_status !== "pending" && (
                  <div className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                    msg.action_status === "approved"
                      ? "bg-[#E6FAF0] text-[#00B761]"
                      : "bg-[#FFF0F0] text-[#F04438]"
                  }`}>
                    {msg.action_status === "approved" ? "✓ 승인됨" : "✗ 거절됨"}
                  </div>
                )}

                <p className="text-[11px] text-[#8B95A1] px-1">
                  {format(new Date(msg.created_at), "a h:mm", { locale: ko })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </main>

      {/* 하단 입력 */}
      <footer className="bg-white border-t border-[#E5E8EB] px-4 pt-3 pb-6 space-y-3">
        {/* 어드민 템플릿 */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {ADMIN_TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.key}
              onClick={() => sendMessage(tmpl.content, { message_type: "action_response", template_key: tmpl.key })}
              disabled={sending}
              className="shrink-0 px-3 py-2 rounded-full border border-[#E5E8EB] text-[13px] font-bold text-[#4E5968] bg-[#F2F4F6] hover:bg-[#E8F3FF] hover:text-[#3182F6] hover:border-[#3182F6] transition-colors disabled:opacity-50"
            >
              {tmpl.label}
            </button>
          ))}
        </div>

        {/* 텍스트 입력 */}
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (input.trim()) sendMessage(input.trim());
              }
            }}
            placeholder="메시지를 입력해요"
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-[#E5E8EB] px-4 py-3 text-[14px] text-[#191F28] placeholder:text-[#8B95A1] focus:outline-none focus:border-[#3182F6] bg-[#F9FAFB] max-h-28 overflow-y-auto"
          />
          <button
            onClick={() => { if (input.trim()) sendMessage(input.trim()); }}
            disabled={sending || !input.trim()}
            className="w-11 h-11 rounded-full bg-[#3182F6] flex items-center justify-center disabled:opacity-40 shrink-0 active:scale-95 transition-transform"
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
      </footer>
    </div>
  );
}
