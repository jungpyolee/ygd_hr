"use client";

/**
 * 커스텀 SVG 티어 아이콘
 * 3D 토큰 스타일 — 단일 광원(좌상단), 구체 그라데이션, 글래스 하이라이트
 */

interface TierIconProps {
  tierKey: string;
  size?: number;
}

/**
 * 티어별 색상 팔레트
 * highlight: 좌상단 밝은 부분 / base: 메인 / shadow: 우하단 어두운 부분 / ring: 외곽 링
 */
const TIER_COLORS: Record<string, {
  highlight: string;
  base: string;
  shadow: string;
  ring: string;
  glow: string;
}> = {
  diamond:  { highlight: "#C4B5FD", base: "#7B68EE", shadow: "#4C3BB5", ring: "#A78BFA", glow: "#7B68EE" },
  platinum: { highlight: "#86EFDE", base: "#3DC8BE", shadow: "#1E8A82", ring: "#5EEAD4", glow: "#3DC8BE" },
  gold:     { highlight: "#FDE68A", base: "#F5A623", shadow: "#B07316", ring: "#FBBF24", glow: "#F5A623" },
  silver:   { highlight: "#CBD5E1", base: "#8E99A4", shadow: "#586775", ring: "#94A3B8", glow: "#8E99A4" },
  bronze:   { highlight: "#FDBA9E", base: "#E07C5A", shadow: "#A44E2E", ring: "#F09070", glow: "#E07C5A" },
  iron:     { highlight: "#A5D0F5", base: "#5B9BD5", shadow: "#2E6BA4", ring: "#7CB8E8", glow: "#5B9BD5" },
};

export default function TierIcon({ tierKey, size = 32 }: TierIconProps) {
  const c = TIER_COLORS[tierKey] ?? TIER_COLORS.iron;
  // 고유 ID (같은 페이지에 여러 개 렌더 시 충돌 방지)
  const id = `ti-${tierKey}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* 외곽 링: 위=밝은, 아래=어두운 */}
        <linearGradient id={`${id}-ring`} x1="20" y1="1" x2="20" y2="39" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={c.ring} />
          <stop offset="100%" stopColor={c.shadow} />
        </linearGradient>

        {/* 메인 구체: 좌상단 광원 → 우하단 그림자 */}
        <radialGradient id={`${id}-sphere`} cx="38%" cy="32%" r="62%" fx="38%" fy="32%">
          <stop offset="0%" stopColor={c.highlight} />
          <stop offset="50%" stopColor={c.base} />
          <stop offset="100%" stopColor={c.shadow} />
        </radialGradient>

        {/* 하단 내부 그림자 (깊이감) */}
        <radialGradient id={`${id}-ishadow`} cx="50%" cy="100%" r="60%">
          <stop offset="0%" stopColor={c.shadow} stopOpacity="0.35" />
          <stop offset="100%" stopColor={c.shadow} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 1) 외곽 링 (베젤) */}
      <circle cx="20" cy="20" r="19" fill={`url(#${id}-ring)`} />

      {/* 2) 메인 구체 */}
      <circle cx="20" cy="20" r="16" fill={`url(#${id}-sphere)`} />

      {/* 3) 하단 내부 그림자 */}
      <circle cx="20" cy="20" r="16" fill={`url(#${id}-ishadow)`} />

      {/* 4) 글래스 하이라이트 (좌상단, 하나만) */}
      <ellipse cx="16" cy="13" rx="8" ry="5.5" fill="white" fillOpacity="0.18" />

      {/* 5) 심볼 */}
      {renderSymbol(tierKey)}
    </svg>
  );
}

function renderSymbol(key: string) {
  switch (key) {
    case "diamond":
      // 보석 커팅 (상단 사다리꼴 + 하단 역삼각 + 패싯)
      return (
        <g>
          <polygon points="14,19.5 17,13.5 23,13.5 26,19.5" fill="white" fillOpacity="0.95" />
          <polygon points="14,19.5 26,19.5 20,28" fill="white" fillOpacity="0.75" />
          <line x1="20" y1="13.5" x2="20" y2="19.5" stroke={`rgba(0,0,0,0.08)`} strokeWidth="0.5" />
          <line x1="17" y1="13.5" x2="15.5" y2="19.5" stroke={`rgba(0,0,0,0.06)`} strokeWidth="0.4" />
          <line x1="23" y1="13.5" x2="24.5" y2="19.5" stroke={`rgba(0,0,0,0.06)`} strokeWidth="0.4" />
          <line x1="15.5" y1="19.5" x2="20" y2="28" stroke={`rgba(0,0,0,0.05)`} strokeWidth="0.4" />
          <line x1="24.5" y1="19.5" x2="20" y2="28" stroke={`rgba(0,0,0,0.05)`} strokeWidth="0.4" />
        </g>
      );

    case "platinum":
      // 왕관 (3봉우리, 굵고 명확)
      return (
        <path
          d="M12,26.5 L14.5,16 L17.5,20.5 L20,13 L22.5,20.5 L25.5,16 L28,26.5 Z"
          fill="white"
          fillOpacity="0.95"
        />
      );

    case "gold":
      // 45° 마름모
      return (
        <rect
          x="14" y="14" width="12" height="12" rx="1.5"
          transform="rotate(45 20 20)"
          fill="white"
          fillOpacity="0.95"
        />
      );

    case "silver":
      // 오각형
      return (
        <polygon
          points="20,11.5 28,17.5 24.8,27 15.2,27 12,17.5"
          fill="white"
          fillOpacity="0.95"
        />
      );

    case "bronze":
      // 삼각형
      return (
        <polygon
          points="20,11.5 28.5,27.5 11.5,27.5"
          fill="white"
          fillOpacity="0.95"
        />
      );

    case "iron":
      // 원
      return (
        <circle cx="20" cy="20" r="7" fill="white" fillOpacity="0.95" />
      );

    default:
      return null;
  }
}

export { TIER_COLORS };
