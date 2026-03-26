"use client";

import { getTier } from "@/lib/tier-utils";
import TierIcon, { TIER_COLORS } from "@/components/TierIcon";

interface TierBadgeProps {
  score: number;
  size?: "xs" | "sm" | "md" | "lg";
}

const SIZES = {
  xs: 20,
  sm: 32,
  md: 40,
  lg: 56,
} as const;

/** 3D 원형 티어 배지 */
export default function TierBadge({ score, size = "md" }: TierBadgeProps) {
  const tier = getTier(score);
  const px = SIZES[size];
  const colors = TIER_COLORS[tier.key] ?? TIER_COLORS.iron;

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{
        width: px,
        height: px,
        filter: size === "lg" ? `drop-shadow(0 2px 8px ${colors.glow}50)` : undefined,
      }}
    >
      <TierIcon tierKey={tier.key} size={px} />
    </div>
  );
}

/** 텍스트와 함께 표시하는 인라인 티어 라벨 (이모지 텍스트 유지) */
export function TierLabel({ score, size = "sm" }: TierBadgeProps) {
  const tier = getTier(score);
  return (
    <span
      className="inline-flex items-center gap-1 font-semibold"
      style={{ color: tier.textColor, fontSize: size === "xs" ? 11 : size === "sm" ? 13 : 15 }}
    >
      <TierBadge score={score} size={size === "lg" ? "md" : size} />
      {tier.name}
    </span>
  );
}
