// 티어 시스템 유틸리티 (순수 함수)

export interface TierInfo {
  name: string;
  key: string;
  emoji: string;
  color: string;       // 배경/배지 색상
  textColor: string;   // 텍스트 색상
  min: number;
  max: number;
}

export const TIERS: TierInfo[] = [
  { name: "다이아몬드", key: "diamond",  emoji: "💎", color: "#B8D4F5", textColor: "#1A4A8A", min: 900, max: 1000 },
  { name: "플래티넘",   key: "platinum", emoji: "❇️", color: "#C8D4DC", textColor: "#4A5568", min: 750, max: 899  },
  { name: "골드",       key: "gold",     emoji: "🥇", color: "#C9A84C", textColor: "#7B6320", min: 600, max: 749  },
  { name: "실버",       key: "silver",   emoji: "🥈", color: "#9BAAB8", textColor: "#4A5568", min: 450, max: 599  },
  { name: "브론즈",     key: "bronze",   emoji: "🥉", color: "#9E7A5A", textColor: "#5C3D1E", min: 300, max: 449  },
  { name: "아이언",     key: "iron",     emoji: "⚙️", color: "#78828C", textColor: "#4A5568", min: 0,   max: 299  },
];

export function getTier(score: number): TierInfo {
  const clamped = Math.max(0, Math.min(1000, score));
  return TIERS.find((t) => clamped >= t.min && clamped <= t.max) ?? TIERS[TIERS.length - 1];
}

/** 현재 티어 내 진행률 (0~100) */
export function getTierProgress(score: number): number {
  const tier = getTier(score);
  const range = tier.max - tier.min;
  if (range === 0) return 100;
  return Math.round(((Math.min(score, tier.max) - tier.min) / range) * 100);
}

/** 다음 티어까지 남은 점수 (다이아면 null) */
export function getPointsToNextTier(score: number): number | null {
  const tier = getTier(score);
  const idx = TIERS.indexOf(tier);
  if (idx === 0) return null; // 다이아몬드
  const nextTier = TIERS[idx - 1];
  return nextTier.min - score;
}

/** "골드까지 47점 남았어요!" 형태의 메시지 */
export function formatTierMessage(score: number): string {
  const remaining = getPointsToNextTier(score);
  if (remaining === null) return "최고 등급을 달성했어요!";
  const nextTier = TIERS[TIERS.indexOf(getTier(score)) - 1];
  return `${nextTier.emoji} ${nextTier.name}까지 ${remaining}점 남았어요!`;
}

/** 이벤트 타입별 한글 라벨 */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  normal_attendance: "정상 출퇴근",
  late_minor: "지각 (5~10분)",
  late_major: "지각 (10분 이상)",
  no_show: "무단결근",
  early_leave: "조기퇴근",
  missing_checkout: "퇴근 미기록",
  same_day_cancel: "당일 취소",
  advance_cancel: "사전 취소",
  substitute_bonus: "대타 출근 (보너스)",
  substitute_regular: "대타 출근",
  streak_bonus_10: "연속출근 10일 달성",
  streak_bonus_30: "연속출근 30일 달성",
  streak_bonus_60: "연속출근 60일 달성",
  streak_bonus_100: "연속출근 100일 달성",
  admin_cancel_compensation: "관리자 취소 보상",
  admin_adjustment: "관리자 조정",
  exception_reversal: "예외 처리 (감점 취소)",
};

/** 예외 처리 사유 */
export const EXCEPTION_REASONS = {
  gps_error: "GPS 오류",
  app_error: "앱 장애",
  unavoidable_absence: "부득이한 사유로 결근",
} as const;

export type ExceptionReasonType = keyof typeof EXCEPTION_REASONS;

/** 스트릭 마일스톤 보너스 정의 */
export const STREAK_MILESTONES = [
  { count: 10,  bonus: 15  },
  { count: 30,  bonus: 50  },
  { count: 60,  bonus: 80  },
  { count: 100, bonus: 150 },
] as const;

/** 점수 증감 정책 상수 */
export const CREDIT_POINTS = {
  normal_attendance: 3,
  substitute_bonus: 10,      // 월 2회까지
  substitute_regular: 3,     // 월 2회 초과분
  admin_cancel_compensation: 5,
  late_minor: -3,
  late_major: -10,
  early_leave: -8,
  missing_checkout: -5,
  same_day_cancel: -20,
  advance_cancel: -5,
  no_show: -50,
} as const;

export const LATE_GRACE_MINUTES = 5;
export const LATE_MAJOR_THRESHOLD = 10;
