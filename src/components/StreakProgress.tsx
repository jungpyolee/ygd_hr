"use client";

import { Flame, Check } from "lucide-react";
import { STREAK_MILESTONES } from "@/lib/tier-utils";

interface StreakProgressProps {
  currentStreak: number;
  longestStreak: number;
  claimedMilestones: number[];
  variant: "full" | "compact";
}

export default function StreakProgress({
  currentStreak,
  longestStreak,
  claimedMilestones,
  variant,
}: StreakProgressProps) {
  const claimed = claimedMilestones ?? [];
  const nextMilestone = STREAK_MILESTONES.find((m) => !claimed.includes(m.count));

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-1.5">
        <Flame className="w-3.5 h-3.5 text-orange-500" />
        {currentStreak > 0 ? (
          <>
            <span className="text-[12px] font-semibold text-orange-500">
              연속출근 {currentStreak}일
            </span>
            {nextMilestone && (
              <span className="text-[11px] text-[#8B95A1]">
                (다음 보너스: {nextMilestone.count}일)
              </span>
            )}
          </>
        ) : (
          <span className="text-[12px] text-[#8B95A1]">연속출근을 시작해봐요</span>
        )}
      </div>
    );
  }

  // full variant
  return (
    <div className="bg-white rounded-[28px] p-6 border border-slate-100 shadow-sm">
      {/* 현재 연속출근 */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center">
            <Flame className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <p className="text-[13px] text-[#4E5968]">현재 연속출근</p>
            <p className="text-2xl font-bold text-[#191F28]">{currentStreak}일</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-[#8B95A1]">최장 기록</p>
          <p className="text-[15px] font-bold text-[#191F28]">{longestStreak}일</p>
        </div>
      </div>

      {/* 마일스톤 로드맵 */}
      <div className="relative">
        {/* 연결선 */}
        <div className="absolute top-4 left-4 right-4 h-0.5 bg-[#E5E8EB]" />
        {/* 진행선 */}
        <div
          className="absolute top-4 left-4 h-0.5 bg-[#3182F6] transition-all duration-500"
          style={{ width: `${getProgressWidth(currentStreak, claimed)}%` }}
        />

        {/* 마일스톤 노드 */}
        <div className="relative flex justify-between">
          {STREAK_MILESTONES.map((m) => {
            const isClaimed = claimed.includes(m.count);
            const isCurrentTarget = !isClaimed && nextMilestone?.count === m.count;
            const isFuture = !isClaimed && !isCurrentTarget;

            return (
              <div key={m.count} className="flex flex-col items-center gap-1.5 w-16">
                {/* 노드 */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center z-[1] border-2 transition-all ${
                    isClaimed
                      ? "bg-emerald-500 border-emerald-500"
                      : isCurrentTarget
                        ? "bg-white border-[#3182F6]"
                        : "bg-white border-[#E5E8EB]"
                  }`}
                >
                  {isClaimed ? (
                    <Check className="w-4 h-4 text-white" />
                  ) : isCurrentTarget ? (
                    <span className="text-[10px] font-bold text-[#3182F6]">
                      {currentStreak}
                    </span>
                  ) : (
                    <span className="text-[10px] text-[#D1D6DB]">{m.count}</span>
                  )}
                </div>

                {/* 라벨 */}
                <span
                  className={`text-[11px] font-semibold ${
                    isClaimed
                      ? "text-emerald-600"
                      : isCurrentTarget
                        ? "text-[#3182F6]"
                        : "text-[#D1D6DB]"
                  }`}
                >
                  {m.count}일
                </span>
                <span
                  className={`text-[10px] ${
                    isClaimed
                      ? "text-emerald-500"
                      : isCurrentTarget
                        ? "text-[#3182F6]"
                        : "text-[#D1D6DB]"
                  }`}
                >
                  +{m.bonus}점
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 다음 보너스 안내 */}
      {nextMilestone && currentStreak > 0 && (
        <div className="mt-5 bg-[#E8F3FF] rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-[13px] text-[#3182F6] font-medium">
            {nextMilestone.count}일 달성 시 +{nextMilestone.bonus}점 보너스!
          </span>
          <span className="text-[13px] font-bold text-[#3182F6]">
            {currentStreak}/{nextMilestone.count}일
          </span>
        </div>
      )}

      {currentStreak === 0 && (
        <p className="mt-4 text-[13px] text-[#8B95A1] text-center">
          내일부터 연속출근을 시작해봐요
        </p>
      )}
    </div>
  );
}

/** 마일스톤 진행선 너비 계산 (0~100%) */
function getProgressWidth(streak: number, claimed: number[]): number {
  const milestones = STREAK_MILESTONES.map((m) => m.count);
  const maxMilestone = milestones[milestones.length - 1];

  if (streak >= maxMilestone) return 100;
  if (streak === 0) return 0;

  // 각 구간의 % 비율 (4개 노드, 3개 구간 → 각 33.3%)
  const segmentPct = 100 / (milestones.length - 1);

  for (let i = 0; i < milestones.length; i++) {
    if (streak < milestones[i]) {
      const prevMilestone = i === 0 ? 0 : milestones[i - 1];
      const segmentStart = i === 0 ? 0 : i * segmentPct;
      const progress = (streak - prevMilestone) / (milestones[i] - prevMilestone);
      return segmentStart + progress * segmentPct;
    }
  }
  return 100;
}
