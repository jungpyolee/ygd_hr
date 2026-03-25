"use client";

import { getTier, type TierInfo } from "@/lib/tier-utils";

interface TierBadgeProps {
  score: number;
  size?: "xs" | "sm" | "md" | "lg";
}

const SIZES = {
  xs: 20,
  sm: 32,
  md: 48,
  lg: 80,
} as const;

const FONT_SIZES = {
  xs: 8,
  sm: 11,
  md: 14,
  lg: 22,
} as const;

/** Rounded Hexagon SVG 티어 배지 */
export default function TierBadge({ score, size = "md" }: TierBadgeProps) {
  const tier = getTier(score);
  const px = SIZES[size];
  const fontSize = FONT_SIZES[size];

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: px, height: px }}
    >
      <svg
        viewBox="0 0 100 100"
        width={px}
        height={px}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Rounded Hexagon */}
        <path
          d="M50 5 L88 27 Q93 30 93 36 L93 64 Q93 70 88 73 L50 95 L12 73 Q7 70 7 64 L7 36 Q7 30 12 27 Z"
          fill={tier.color}
          stroke={tier.textColor}
          strokeWidth="2"
          strokeOpacity="0.2"
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center"
        style={{ fontSize, lineHeight: 1 }}
      >
        {tier.emoji}
      </span>
    </div>
  );
}

/** 텍스트와 함께 표시하는 인라인 티어 라벨 */
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
