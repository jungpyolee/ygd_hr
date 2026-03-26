"use client";

import TierBadge, { TierLabel } from "@/components/TierBadge";
import TierIcon from "@/components/TierIcon";
import { TIERS } from "@/lib/tier-utils";

export default function TestTierPage() {
  return (
    <div className="min-h-screen bg-[#F2F4F6] p-6">
      <h1 className="text-[20px] font-bold text-[#191F28] mb-6">티어 아이콘 테스트</h1>

      {/* 아이콘 단독 */}
      <section className="bg-white rounded-2xl p-5 mb-4">
        <h2 className="text-[15px] font-semibold text-[#191F28] mb-4">TierIcon 단독</h2>
        <div className="flex items-center gap-6">
          {TIERS.map((t) => (
            <div key={t.key} className="flex flex-col items-center gap-2">
              <TierIcon tierKey={t.key} size={40} />
              <span className="text-[11px] text-[#4E5968]">{t.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 뱃지 — 모든 사이즈 */}
      <section className="bg-white rounded-2xl p-5 mb-4">
        <h2 className="text-[15px] font-semibold text-[#191F28] mb-4">TierBadge 사이즈별</h2>
        {TIERS.map((t) => (
          <div key={t.key} className="flex items-center gap-4 mb-4">
            <span className="text-[13px] text-[#4E5968] w-20">{t.name}</span>
            <TierBadge score={t.min} size="xs" />
            <TierBadge score={t.min} size="sm" />
            <TierBadge score={t.min} size="md" />
            <TierBadge score={t.min} size="lg" />
          </div>
        ))}
      </section>

      {/* TierLabel */}
      <section className="bg-white rounded-2xl p-5 mb-4">
        <h2 className="text-[15px] font-semibold text-[#191F28] mb-4">TierLabel</h2>
        <div className="flex flex-col gap-3">
          {TIERS.map((t) => (
            <TierLabel key={t.key} score={t.min} size="sm" />
          ))}
        </div>
      </section>

      {/* 다크 배경 대비 */}
      <section className="bg-[#191F28] rounded-2xl p-5 mb-4">
        <h2 className="text-[15px] font-semibold text-white mb-4">다크 배경 대비</h2>
        <div className="flex items-center gap-4">
          {TIERS.map((t) => (
            <TierBadge key={t.key} score={t.min} size="lg" />
          ))}
        </div>
      </section>

      {/* 기존 이모지 vs 새 아이콘 비교 */}
      <section className="bg-white rounded-2xl p-5">
        <h2 className="text-[15px] font-semibold text-[#191F28] mb-4">기존 이모지 vs 새 아이콘</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[12px] text-[#8B95A1] mb-3">Before (이모지)</p>
            <div className="flex flex-col gap-3">
              {TIERS.map((t) => (
                <div key={t.key} className="flex items-center gap-2">
                  <span className="text-[24px]">{t.emoji}</span>
                  <span className="text-[13px] text-[#4E5968]">{t.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[12px] text-[#8B95A1] mb-3">After (커스텀 SVG)</p>
            <div className="flex flex-col gap-3">
              {TIERS.map((t) => (
                <div key={t.key} className="flex items-center gap-2">
                  <TierBadge score={t.min} size="sm" />
                  <span className="text-[13px] text-[#4E5968]">{t.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
