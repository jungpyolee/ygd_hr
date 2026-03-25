"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, Flame } from "lucide-react";
import TierBadge from "@/components/TierBadge";
import { getTier, getTierProgress, formatTierMessage, STREAK_MILESTONES } from "@/lib/tier-utils";

interface TierCardProps {
  creditScore: number;
  currentStreak: number;
  longestStreak: number;
  claimedMilestones: number[];
}

export default function TierCard({
  creditScore,
  currentStreak,
  longestStreak,
  claimedMilestones,
}: TierCardProps) {
  const router = useRouter();
  const tier = getTier(creditScore);
  const message = formatTierMessage(creditScore);
  const progress = getTierProgress(creditScore);

  // 진행바 애니메이션: 마운트 시 0% → 실제값
  const [animatedProgress, setAnimatedProgress] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setAnimatedProgress(progress), 100);
    return () => clearTimeout(timer);
  }, [progress]);

  // 다음 마일스톤 계산
  const claimed = claimedMilestones ?? [];
  const nextMilestone = STREAK_MILESTONES.find((m) => !claimed.includes(m.count));
  const daysToNext = nextMilestone ? nextMilestone.count - currentStreak : null;

  return (
    <button
      onClick={() => router.push("/credit-history")}
      className="w-full text-left rounded-[28px] border border-slate-100 shadow-sm active:scale-[0.99] transition-transform overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${tier.color}18 0%, white 60%)`,
      }}
    >
      {/* 상단 영역 */}
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <TierBadge score={creditScore} size="lg" />
            <div>
              <span
                className="text-[14px] font-bold"
                style={{ color: tier.textColor }}
              >
                {tier.emoji} {tier.name}
              </span>
              <p className="text-[28px] font-bold text-[#191F28] leading-tight">
                {creditScore}<span className="text-[14px] font-normal text-[#8B95A1]">점</span>
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[#D1D6DB] mt-1" />
        </div>

        {/* 진행바 (애니메이션) */}
        <div className="h-1.5 w-full rounded-full bg-[#F2F4F6] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${animatedProgress}%`,
              backgroundColor: tier.color,
            }}
          />
        </div>

        <p className="text-[12px] text-[#4E5968] mt-2">{message}</p>
      </div>

      {/* 하단 스트릭 영역 */}
      <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Flame className="w-3.5 h-3.5 text-orange-500" />
          {currentStreak > 0 ? (
            <span className="text-[12px] font-semibold text-orange-500">
              연속출근 {currentStreak}일
            </span>
          ) : (
            <span className="text-[12px] text-[#8B95A1]">연속출근을 시작해봐요</span>
          )}
        </div>
        {daysToNext !== null && daysToNext > 0 && currentStreak > 0 && (
          <span className="text-[11px] text-[#8B95A1]">
            {daysToNext}일 더 출근하면 +{nextMilestone!.bonus}점
          </span>
        )}
      </div>
    </button>
  );
}
