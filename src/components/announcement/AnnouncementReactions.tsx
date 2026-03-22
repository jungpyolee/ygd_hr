"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { REACTION_EMOJIS } from "@/types/announcement";

interface ReactionSummary {
  emoji: string;
  count: number;
  mine: boolean;
}

interface Props {
  announcementId: string;
  currentUserId: string;
}

export default function AnnouncementReactions({ announcementId, currentUserId }: Props) {
  const [reactions, setReactions] = useState<ReactionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchReactions = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("announcement_reactions")
      .select("emoji, profile_id")
      .eq("announcement_id", announcementId);

    const summary = REACTION_EMOJIS.map((emoji) => {
      const matched = (data ?? []).filter((r) => r.emoji === emoji);
      return {
        emoji,
        count: matched.length,
        mine: matched.some((r) => r.profile_id === currentUserId),
      };
    });
    setReactions(summary);
    setLoading(false);
  }, [announcementId, currentUserId]);

  useEffect(() => {
    fetchReactions();
  }, [fetchReactions]);

  const toggle = async (emoji: string) => {
    if (toggling) return;
    setToggling(emoji);

    const supabase = createClient();
    const current = reactions.find((r) => r.emoji === emoji);
    if (!current) { setToggling(null); return; }

    if (current.mine) {
      await supabase
        .from("announcement_reactions")
        .delete()
        .eq("announcement_id", announcementId)
        .eq("profile_id", currentUserId)
        .eq("emoji", emoji);
    } else {
      await supabase
        .from("announcement_reactions")
        .insert({ announcement_id: announcementId, profile_id: currentUserId, emoji });
    }

    await fetchReactions();
    setToggling(null);
  };

  if (loading) {
    return (
      <div className="flex gap-2 mt-5 pt-5 border-t border-[#F2F4F6]">
        {REACTION_EMOJIS.map((e) => (
          <div key={e} className="w-14 h-8 bg-slate-100 animate-pulse rounded-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 mt-5 pt-5 border-t border-[#F2F4F6]">
      {reactions.map(({ emoji, count, mine }) => (
        <button
          key={emoji}
          onClick={() => toggle(emoji)}
          disabled={toggling !== null}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[14px] font-medium border transition-all active:scale-95 ${
            mine
              ? "bg-[#E8F3FF] border-[#3182F6] text-[#3182F6]"
              : "bg-[#F2F4F6] border-transparent text-[#4E5968] hover:bg-[#E5E8EB]"
          }`}
        >
          <span>{emoji}</span>
          {count > 0 && <span className="text-[13px]">{count}</span>}
        </button>
      ))}
    </div>
  );
}
