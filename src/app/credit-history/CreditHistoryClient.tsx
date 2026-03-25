"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { startOfMonth, endOfMonth } from "date-fns";
import { ChevronLeft, ArrowUp, ArrowDown, HelpCircle } from "lucide-react";
import TierBadge from "@/components/TierBadge";
import TierProgressBar from "@/components/TierProgressBar";
import StreakProgress from "@/components/StreakProgress";
import CreditPolicyModal from "@/components/CreditPolicyModal";
import { getTier, formatTierMessage, EVENT_TYPE_LABELS } from "@/lib/tier-utils";

interface CreditEvent {
  id: string;
  event_type: string;
  points: number;
  description: string;
  reference_date: string | null;
  created_at: string;
  invalidated_by: string | null;
}

interface ProfileData {
  credit_score: number;
  current_streak: number;
  longest_streak: number;
  streak_milestones_claimed: number[];
}

interface CreditHistoryClientProps {
  profile: ProfileData | null;
  initialEvents: CreditEvent[];
  userId: string;
}

const supabase = createClient();

export default function CreditHistoryClient({
  profile: initialProfile,
  initialEvents,
  userId,
}: CreditHistoryClientProps) {
  const router = useRouter();
  const [limit, setLimit] = useState(50);
  const [showPolicy, setShowPolicy] = useState(false);

  // SWR로 실시간 갱신 (초기값은 서버에서 가져온 데이터)
  const { data: profile } = useSWR(
    ["credit-profile", userId],
    async () => {
      const { data } = await supabase
        .from("profiles")
        .select("credit_score, current_streak, longest_streak, streak_milestones_claimed")
        .eq("id", userId)
        .single();
      return data as ProfileData | null;
    },
    { fallbackData: initialProfile, revalidateOnFocus: false },
  );

  const { data: events = initialEvents } = useSWR(
    ["credit-events", userId, limit],
    async () => {
      const { data } = await supabase
        .from("attendance_credits")
        .select("id, event_type, points, description, reference_date, created_at, invalidated_by")
        .eq("profile_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);
      return (data ?? []) as CreditEvent[];
    },
    { fallbackData: initialEvents, revalidateOnFocus: false },
  );

  const score = profile?.credit_score ?? 500;
  const tier = getTier(score);
  const message = formatTierMessage(score);
  const streak = profile?.current_streak ?? 0;
  const longestStreak = profile?.longest_streak ?? 0;

  const claimed: number[] = profile?.streak_milestones_claimed ?? [];

  // 이번 달 요약 계산
  const monthlySummary = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    let gained = 0;
    let lost = 0;
    let normalCnt = 0;
    let lateCnt = 0;
    let absentCnt = 0;

    for (const e of events) {
      if (e.invalidated_by) continue;
      const d = e.reference_date
        ? new Date(e.reference_date + "T00:00:00")
        : new Date(e.created_at);
      if (d < monthStart || d > monthEnd) continue;

      if (e.points > 0) gained += e.points;
      else lost += e.points;

      if (e.event_type === "normal_attendance") normalCnt++;
      else if (e.event_type === "late_minor" || e.event_type === "late_major") lateCnt++;
      else if (e.event_type === "no_show") absentCnt++;
    }

    return { gained, lost, net: gained + lost, normalCnt, lateCnt, absentCnt };
  }, [events]);

  return (
    <div className="min-h-screen bg-[#F2F4F6] font-pretendard">
      <nav className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-[#F2F4F6]/80 backdrop-blur-md">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/60"
        >
          <ChevronLeft className="w-5 h-5 text-[#191F28]" />
        </button>
        <h1 className="text-[17px] font-bold text-[#191F28] flex-1">내 크레딧</h1>
        <button
          onClick={() => setShowPolicy(true)}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/60"
        >
          <HelpCircle className="w-5 h-5 text-[#8B95A1]" />
        </button>
      </nav>

      <CreditPolicyModal isOpen={showPolicy} onClose={() => setShowPolicy(false)} />

      <main className="px-5 pb-24 space-y-4">
        {/* 티어 카드 */}
        <div className="bg-white rounded-[28px] p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <TierBadge score={score} size="lg" />
            <div>
              <span
                className="text-[16px] font-bold"
                style={{ color: tier.textColor }}
              >
                {tier.emoji} {tier.name}
              </span>
              <p className="text-3xl font-bold text-[#191F28] mt-1">
                {score}<span className="text-[14px] font-normal text-[#8B95A1]">점</span>
              </p>
            </div>
          </div>

          <TierProgressBar score={score} />

          <p className="text-[13px] text-[#4E5968] mt-3">{message}</p>
        </div>

        {/* 연속출근 진척도 */}
        <StreakProgress
          currentStreak={streak}
          longestStreak={longestStreak}
          claimedMilestones={claimed}
          variant="full"
        />

        {/* 이번 달 크레딧 요약 */}
        {(monthlySummary.gained !== 0 || monthlySummary.lost !== 0) && (
          <div className="bg-white rounded-[28px] p-5 border border-slate-100 shadow-sm">
            <h3 className="text-[14px] font-bold text-[#191F28] mb-3">이번 달 크레딧</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ArrowUp className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-[13px] text-[#4E5968]">가점</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[#8B95A1]">
                    {monthlySummary.normalCnt > 0 && `정상출근 ${monthlySummary.normalCnt}회`}
                  </span>
                  <span className="text-[14px] font-bold text-emerald-600">+{monthlySummary.gained}점</span>
                </div>
              </div>
              {monthlySummary.lost !== 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ArrowDown className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-[13px] text-[#4E5968]">감점</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-[#8B95A1]">
                      {monthlySummary.lateCnt > 0 && `지각 ${monthlySummary.lateCnt}회`}
                      {monthlySummary.lateCnt > 0 && monthlySummary.absentCnt > 0 && " · "}
                      {monthlySummary.absentCnt > 0 && `결근 ${monthlySummary.absentCnt}회`}
                    </span>
                    <span className="text-[14px] font-bold text-red-500">{monthlySummary.lost}점</span>
                  </div>
                </div>
              )}
              <div className="pt-2 border-t border-[#F2F4F6] flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[#191F28]">순변동</span>
                <span className={`text-[15px] font-bold ${monthlySummary.net >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {monthlySummary.net >= 0 ? "+" : ""}{monthlySummary.net}점
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 이벤트 이력 */}
        <div className="bg-white rounded-[28px] border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#F2F4F6]">
            <h3 className="text-[15px] font-bold text-[#191F28]">크레딧 이력</h3>
          </div>

          {events.length === 0 ? (
            <div className="p-12 text-center text-[#8B95A1] text-[14px]">
              아직 이력이 없어요
            </div>
          ) : (
            <div className="divide-y divide-[#F2F4F6]">
              {events.map((e) => {
                const isInvalidated = !!e.invalidated_by;
                return (
                  <div
                    key={e.id}
                    className={`flex items-center justify-between px-5 py-3.5 ${isInvalidated ? "opacity-40" : ""}`}
                  >
                    <div className="min-w-0">
                      <p className={`text-[14px] font-medium truncate ${isInvalidated ? "line-through text-[#8B95A1]" : "text-[#191F28]"}`}>
                        {EVENT_TYPE_LABELS[e.event_type] || e.event_type}
                        {isInvalidated && " (취소됨)"}
                      </p>
                      <p className="text-[12px] text-[#8B95A1]">
                        {e.reference_date
                          ? format(new Date(e.reference_date + "T00:00:00"), "M/d (EEE)", { locale: ko })
                          : format(new Date(e.created_at), "M/d HH:mm", { locale: ko })}
                      </p>
                    </div>
                    <span
                      className={`text-[15px] font-bold shrink-0 flex items-center gap-0.5 ${
                        isInvalidated ? "text-[#8B95A1] line-through" : e.points > 0 ? "text-emerald-600" : "text-red-500"
                      }`}
                    >
                      {e.points > 0 ? (
                        <ArrowUp className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowDown className="w-3.5 h-3.5" />
                      )}
                      {e.points > 0 ? "+" : ""}{e.points}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {events.length >= limit && (
            <button
              onClick={() => setLimit((l) => l + 30)}
              className="w-full py-4 text-[14px] text-[#3182F6] font-semibold border-t border-[#F2F4F6]"
            >
              더 보기
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
