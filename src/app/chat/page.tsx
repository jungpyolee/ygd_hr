"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronLeft, Send, Clock, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useWorkplaces } from "@/lib/hooks/useWorkplaces";
import ScheduleRequestModal from "@/components/chat/ScheduleRequestModal";

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

export default function ChatPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { byId } = useWorkplaces();

  const [profile, setProfile] = useState<any>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 초기 데이터 로드
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const [{ data: prof }, { data: conv }] = await Promise.all([
        supabase.from("profiles").select("id, name, color_hex, role").eq("id", user.id).single(),
        supabase.from("chat_conversations").select("id").eq("profile_id", user.id).maybeSingle(),
      ]);

      if (prof?.role === "admin") { router.push("/admin/chat"); return; }

      setProfile(prof);

      if (conv) {
        setConversationId(conv.id);
        const { data: msgs } = await supabase
          .from("chat_messages")
          .select("*")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: true });
        setMessages(msgs ?? []);

        await supabase.from("chat_conversations")
          .update({ unread_count_employee: 0 })
          .eq("id", conv.id);
      }

      setLoading(false);
    })();
  }, [supabase, router]);

  // Realtime 구독
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`chat-${conversationId}`)
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

  // 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getOrCreateConversation = async (profileId: string): Promise<string | null> => {
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
    opts?: {
      message_type?: "text" | "action_request";
      template_key?: string;
      context_data?: ChatMessage["context_data"];
    }
  ) => {
    if (!profile || sending || !content.trim()) return;
    setSending(true);

    try {
      const convId = await getOrCreateConversation(profile.id);
      if (!convId) throw new Error("채팅방을 만들 수 없어요");

      const { error } = await supabase.from("chat_messages").insert({
        conversation_id: convId,
        sender_id: profile.id,
        message_type: opts?.message_type ?? "text",
        content,
        template_key: opts?.template_key ?? null,
        action_status: opts?.message_type === "action_request" ? "pending" : null,
        context_data: opts?.context_data ?? null,
      });
      if (error) throw error;

      await supabase.from("chat_conversations").update({
        last_message_at: new Date().toISOString(),
        unread_count_admin: 999,
      }).eq("id", convId);

      setInput("");
    } catch {
      toast.error("메시지를 보내지 못했어요. 다시 시도해 주세요.");
    } finally {
      setSending(false);
    }
  };

  const handleSend = () => {
    if (input.trim()) sendMessage(input.trim());
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F2F4F6]">
        <div className="flex flex-col gap-3 w-full max-w-lg px-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className={`h-12 rounded-2xl bg-white animate-pulse ${i % 2 === 0 ? "w-3/4" : "w-1/2 ml-auto"}`} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#F2F4F6] font-pretendard">
      {/* 헤더 */}
      <header className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-[#F2F4F6]/90 backdrop-blur-md border-b border-[#E5E8EB]">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-full bg-white shadow-sm flex items-center justify-center"
        >
          <ChevronLeft className="w-5 h-5 text-[#4E5968]" />
        </button>
        <div>
          <p className="text-[16px] font-bold text-[#191F28]">사장님과 채팅</p>
          <p className="text-[12px] text-[#8B95A1]">1:1 업무 채팅</p>
        </div>
      </header>

      {/* 메시지 영역 */}
      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-[#E8F3FF] flex items-center justify-center">
              <Send className="w-6 h-6 text-[#3182F6]" />
            </div>
            <p className="text-[15px] font-bold text-[#191F28]">사장님께 메시지를 보내요</p>
            <p className="text-[13px] text-[#8B95A1]">지각·조퇴·결근·시간 변경 등 근태 관련 내용을<br />빠르게 전달하고 승인받을 수 있어요</p>
          </div>
        )}

        {messages.map((msg) => {
          const isMine = msg.sender_id === profile?.id;
          return (
            <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] ${isMine ? "items-end" : "items-start"} flex flex-col gap-1`}>
                {/* 컨텍스트 카드 */}
                {msg.context_data?.slot_date && (
                  <div className={`px-3 py-2 rounded-2xl bg-white border border-[#E5E8EB] text-[12px] text-[#4E5968] flex flex-wrap items-center gap-2 ${isMine ? "self-end" : "self-start"}`}>
                    <Clock className="w-3.5 h-3.5 text-[#3182F6] shrink-0" />
                    <span>
                      {format(new Date(msg.context_data.slot_date), "M/d(EEE)", { locale: ko })}
                      {" "}
                      {msg.context_data.start_time?.slice(0, 5)}~{msg.context_data.end_time?.slice(0, 5)}
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
                <div className={`px-4 py-3 rounded-2xl text-[14px] leading-snug ${
                  isMine
                    ? "bg-[#3182F6] text-white rounded-tr-md"
                    : "bg-white text-[#191F28] rounded-tl-md shadow-sm"
                }`}>
                  {msg.content}
                </div>

                {/* 액션 상태 */}
                {msg.message_type === "action_request" && msg.action_status && (
                  <div className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                    msg.action_status === "approved"
                      ? "bg-[#E6FAF0] text-[#00B761]"
                      : msg.action_status === "rejected"
                      ? "bg-[#FFF0F0] text-[#F04438]"
                      : "bg-[#F2F4F6] text-[#8B95A1]"
                  }`}>
                    {msg.action_status === "approved" ? "✓ 승인됨" : msg.action_status === "rejected" ? "✗ 거절됨" : "대기 중"}
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

      {/* 하단 입력 영역 */}
      <footer className="bg-white border-t border-[#E5E8EB] px-4 pt-3 pb-6 space-y-3">
        {/* 근태 요청 버튼 */}
        <div className="flex gap-2">
          <button
            onClick={() => setShowRequestModal(true)}
            disabled={sending}
            className="shrink-0 px-4 py-2 rounded-full border border-[#3182F6] text-[13px] font-bold text-[#3182F6] bg-[#E8F3FF] hover:bg-[#3182F6] hover:text-white transition-colors disabled:opacity-50"
          >
            📋 근태 요청
          </button>
        </div>

        {/* 텍스트 입력 */}
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            placeholder="메시지를 입력해요"
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-[#E5E8EB] px-4 py-3 text-[14px] text-[#191F28] placeholder:text-[#8B95A1] focus:outline-none focus:border-[#3182F6] bg-[#F9FAFB] max-h-28 overflow-y-auto"
            style={{ lineHeight: "1.5" }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="w-11 h-11 rounded-full bg-[#3182F6] flex items-center justify-center disabled:opacity-40 shrink-0 active:scale-95 transition-transform"
          >
            <Send className="w-4.5 h-4.5 text-white" />
          </button>
        </div>
      </footer>

      {/* 근태 요청 모달 */}
      {profile && (
        <ScheduleRequestModal
          open={showRequestModal}
          onClose={() => setShowRequestModal(false)}
          profileId={profile.id}
          supabase={supabase}
          byId={byId}
          onSend={(content, opts) => sendMessage(content, opts)}
        />
      )}
    </div>
  );
}
