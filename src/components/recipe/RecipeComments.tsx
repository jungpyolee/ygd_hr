"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import { sendNotification } from "@/lib/notifications";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { Trash2, MessageSquare, CornerDownRight } from "lucide-react";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

interface CommentRow {
  id: string;
  recipe_id: string;
  profile_id: string;
  parent_id: string | null;
  content: string;
  mentioned_profile_id: string | null;
  is_deleted: boolean;
  created_at: string;
  profiles: { name: string; color_hex: string | null };
}

interface RecipeCommentsProps {
  recipeId: string;
  recipeCreatedBy: string | null;
}

export default function RecipeComments({
  recipeId,
  recipeCreatedBy,
}: RecipeCommentsProps) {
  const supabase = useMemo(() => createClient(), []);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    name: string;
    role: string;
  } | null>(null);
  const [text, setText] = useState("");
  const [replyingTo, setReplyingTo] = useState<CommentRow | null>(null);
  const [replyText, setReplyText] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CommentRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);

  const fetchComments = async () => {
    const { data } = await supabase
      .from("recipe_comments")
      .select("*, profiles!recipe_comments_profile_id_fkey(name, color_hex)")
      .eq("recipe_id", recipeId)
      .order("created_at", { ascending: true });
    setComments((data as CommentRow[]) ?? []);
  };

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("name, role")
          .eq("id", user.id)
          .single();
        setCurrentUser({
          id: user.id,
          name: profile?.name ?? "",
          role: profile?.role ?? "employee",
        });
      }
      await fetchComments();
      setLoading(false);
    };
    init();

    const channel = supabase
      .channel(`recipe-comments-${recipeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "recipe_comments",
          filter: `recipe_id=eq.${recipeId}`,
        },
        () => fetchComments()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [recipeId]);

  useEffect(() => {
    if (replyingTo && replyInputRef.current) {
      replyInputRef.current.focus();
    }
  }, [replyingTo]);

  const submitComment = async () => {
    if (!text.trim() || !currentUser || submitting) return;
    setSubmitting(true);
    const { error } = await supabase.from("recipe_comments").insert({
      recipe_id: recipeId,
      profile_id: currentUser.id,
      parent_id: null,
      content: text.trim(),
    });
    if (error) {
      toast.error("댓글 등록에 실패했어요", {
        description: "잠시 후 다시 시도해 주세요.",
      });
      setSubmitting(false);
      return;
    }
    setText("");
    setSubmitting(false);
    await fetchComments();

    // 알림: 레시피 작성자에게 (본인 제외)
    if (recipeCreatedBy && recipeCreatedBy !== currentUser.id) {
      await sendNotification({
        profile_id: recipeCreatedBy,
        target_role: "employee",
        type: "recipe_comment",
        title: "레시피에 새 댓글이 달렸어요",
        content: `${currentUser.name}님: ${text.trim().slice(0, 30)}${text.trim().length > 30 ? "..." : ""}`,
        source_id: recipeId,
      });
    }
  };

  const submitReply = async () => {
    if (!replyText.trim() || !currentUser || !replyingTo || submitting) return;
    setSubmitting(true);

    const parentAuthorId = replyingTo.profile_id;
    const mentionedId = replyingTo.profile_id;
    const finalMentionedId = mentionedId !== currentUser.id ? mentionedId : null;

    const { error } = await supabase.from("recipe_comments").insert({
      recipe_id: recipeId,
      profile_id: currentUser.id,
      parent_id: replyingTo.id,
      content: replyText.trim(),
      mentioned_profile_id: finalMentionedId,
    });
    if (error) {
      toast.error("답글 등록에 실패했어요", {
        description: "잠시 후 다시 시도해 주세요.",
      });
      setSubmitting(false);
      return;
    }

    const snippet = replyText.trim().slice(0, 30) + (replyText.trim().length > 30 ? "..." : "");

    // 알림: 부모 댓글 작성자에게 (본인 제외)
    if (parentAuthorId !== currentUser.id) {
      await sendNotification({
        profile_id: parentAuthorId,
        target_role: "employee",
        type: "recipe_reply",
        title: `${currentUser.name}님이 답글을 달았어요`,
        content: snippet,
        source_id: recipeId,
      });
    }

    // 알림: 멘션된 사용자가 부모 작성자와 다를 경우 (본인 제외)
    if (finalMentionedId && finalMentionedId !== parentAuthorId) {
      await sendNotification({
        profile_id: finalMentionedId,
        target_role: "employee",
        type: "recipe_mention",
        title: `${currentUser.name}님이 회원님을 언급했어요`,
        content: snippet,
        source_id: recipeId,
      });
    }

    setReplyText("");
    setReplyingTo(null);
    setSubmitting(false);
    await fetchComments();
  };

  const deleteComment = async (comment: CommentRow) => {
    const hasReplies = comments.some((c) => c.parent_id === comment.id && !c.is_deleted);
    if (hasReplies) {
      // soft delete
      await supabase
        .from("recipe_comments")
        .update({ is_deleted: true })
        .eq("id", comment.id);
    } else {
      await supabase.from("recipe_comments").delete().eq("id", comment.id);
    }
    setDeleteTarget(null);
  };

  const canDelete = (comment: CommentRow) =>
    currentUser?.id === comment.profile_id ||
    currentUser?.role === "admin";

  const timeAgo = (ts: string) =>
    formatDistanceToNow(new Date(ts), { addSuffix: true, locale: ko });

  const topLevel = comments.filter((c) => !c.parent_id);
  const totalVisible = comments.filter((c) => !c.is_deleted || comments.some((r) => r.parent_id === c.id)).length;

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 bg-slate-100 animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  const CommentCard = ({
    comment,
    isReply = false,
  }: {
    comment: CommentRow;
    isReply?: boolean;
  }) => {
    const replies = comments.filter((c) => c.parent_id === comment.id);
    const isShowingReplyInput = replyingTo?.id === comment.id;
    const initial = (comment.profiles?.name || "?").charAt(0);
    const color = comment.profiles?.color_hex || "#8B95A1";

    return (
      <div className={isReply ? "ml-8" : ""}>
        <div className="flex gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0"
            style={{ backgroundColor: color }}
          >
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[13px] font-bold text-[#191F28]">
                {comment.profiles?.name || "알 수 없음"}
              </span>
              <span className="text-[11px] text-[#B0B8C1]">
                {timeAgo(comment.created_at)}
              </span>
            </div>

            {comment.is_deleted ? (
              <p className="text-[13px] text-[#B0B8C1] italic">
                삭제된 댓글이에요.
              </p>
            ) : (
              <>
                <p className="text-[14px] text-[#333D4B] leading-snug whitespace-pre-wrap break-words">
                  {comment.content}
                </p>
                <div className="flex items-center gap-3 mt-1.5">
                  {!isReply && currentUser && (
                    <button
                      onClick={() => {
                        setReplyingTo(comment);
                        setReplyText(`@${comment.profiles.name} `);
                      }}
                      className="text-[12px] font-semibold text-[#8B95A1] flex items-center gap-1"
                    >
                      <CornerDownRight className="w-3 h-3" />
                      답글 달기
                    </button>
                  )}
                  {canDelete(comment) && (
                    <button
                      onClick={() => setDeleteTarget(comment)}
                      className="text-[12px] text-red-400 flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      삭제
                    </button>
                  )}
                </div>
              </>
            )}

            {/* 인라인 답글 입력창 */}
            {isShowingReplyInput && (
              <div className="mt-2 flex gap-2">
                <textarea
                  ref={replyInputRef}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submitReply();
                    }
                    if (e.key === "Escape") {
                      setReplyingTo(null);
                      setReplyText("");
                    }
                  }}
                  rows={2}
                  placeholder="답글을 입력해요. Enter로 등록, Esc로 취소"
                  className="flex-1 bg-[#F2F4F6] rounded-xl px-3 py-2 text-[13px] text-[#191F28] placeholder:text-[#B0B8C1] outline-none focus:ring-2 focus:ring-[#3182F6]/20 resize-none"
                />
                <button
                  onClick={submitReply}
                  disabled={!replyText.trim() || submitting}
                  className="px-3 py-2 bg-[#3182F6] text-white text-[12px] font-bold rounded-xl disabled:opacity-40 shrink-0"
                >
                  등록
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 대댓글 목록 */}
        {replies.length > 0 && (
          <div className="mt-3 space-y-3 pl-8 border-l-2 border-[#F2F4F6] ml-4">
            {replies.map((reply) => (
              <div key={reply.id} className="flex gap-3">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                  style={{
                    backgroundColor: reply.profiles?.color_hex || "#8B95A1",
                  }}
                >
                  {(reply.profiles?.name || "?").charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[12px] font-bold text-[#191F28]">
                      {reply.profiles?.name || "알 수 없음"}
                    </span>
                    <span className="text-[11px] text-[#B0B8C1]">
                      {timeAgo(reply.created_at)}
                    </span>
                  </div>
                  {reply.is_deleted ? (
                    <p className="text-[12px] text-[#B0B8C1] italic">
                      삭제된 댓글이에요.
                    </p>
                  ) : (
                    <>
                      <p className="text-[13px] text-[#333D4B] leading-snug whitespace-pre-wrap break-words">
                        {reply.content}
                      </p>
                      {canDelete(reply) && (
                        <button
                          onClick={() => setDeleteTarget(reply)}
                          className="mt-1 text-[11px] text-red-400 flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          삭제
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-[20px] p-5 border border-slate-100 space-y-4">
      <h2 className="text-[15px] font-bold text-[#191F28] flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-[#8B95A1]" />
        댓글 {totalVisible > 0 ? totalVisible : ""}
      </h2>

      {/* 댓글 목록 */}
      {topLevel.length === 0 ? (
        <p className="text-[14px] text-[#8B95A1] text-center py-4">
          첫 댓글을 남겨보세요.
        </p>
      ) : (
        <div className="space-y-4">
          {topLevel.map((comment) => (
            <CommentCard key={comment.id} comment={comment} />
          ))}
        </div>
      )}

      {/* 댓글 입력 */}
      {currentUser && (
        <div className="pt-3 border-t border-[#F2F4F6] space-y-2">
          <div className="flex gap-2 items-start">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0 mt-0.5"
              style={{ backgroundColor: "#8B95A1" }}
            >
              {currentUser.name.charAt(0)}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitComment();
                }
              }}
              rows={2}
              placeholder="궁금한점을 댓글로 남겨보세요."
              className="flex-1 bg-[#F2F4F6] rounded-xl px-3 py-2.5 text-[14px] text-[#191F28] placeholder:text-[#B0B8C1] outline-none focus:ring-2 focus:ring-[#3182F6]/20 resize-none"
            />
          </div>
          <button
            onClick={submitComment}
            disabled={!text.trim() || submitting}
            className="w-full h-10 bg-[#3182F6] text-white text-[14px] font-bold rounded-xl disabled:opacity-40 transition-opacity"
          >
            등록하기
          </button>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="댓글을 삭제할까요?"
        confirmLabel="삭제하기"
        cancelLabel="취소"
        onConfirm={() => deleteTarget && deleteComment(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
