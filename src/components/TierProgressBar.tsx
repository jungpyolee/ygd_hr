"use client";

import { getTier, getTierProgress, getPointsToNextTier } from "@/lib/tier-utils";

interface TierProgressBarProps {
  score: number;
  showLabel?: boolean;
}

export default function TierProgressBar({ score, showLabel = true }: TierProgressBarProps) {
  const tier = getTier(score);
  const progress = getTierProgress(score);
  const remaining = getPointsToNextTier(score);

  return (
    <div className="w-full">
      <div className="h-2 bg-[#F2F4F6] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${progress}%`, backgroundColor: tier.color }}
        />
      </div>
      {showLabel && (
        <div className="flex justify-between mt-1">
          <span className="text-[11px] text-[#8B95A1]">
            {tier.min}점
          </span>
          <span className="text-[11px] text-[#8B95A1]">
            {remaining !== null ? `다음 티어까지 ${remaining}점` : "최고 등급"}
          </span>
        </div>
      )}
    </div>
  );
}
