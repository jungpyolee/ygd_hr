"use client";

import useSWR from "swr";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { getTier, TIERS } from "@/lib/tier-utils";
import TierBadge from "@/components/TierBadge";
import { ChevronRight, Flame, AlertTriangle } from "lucide-react";

interface CreditProfile {
  id: string;
  name: string;
  credit_score: number;
  current_streak: number;
}

export default function TeamCreditOverview() {
  const router = useRouter();

  const { data: profiles = [], isLoading } = useSWR(
    "admin-team-credits",
    async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("id, name, credit_score, current_streak")
        .neq("role", "admin")
        .order("credit_score", { ascending: false });
      return (data ?? []) as CreditProfile[];
    },
    { dedupingInterval: 300_000, revalidateOnFocus: false }
  );

  if (isLoading) {
    return (
      <div className="bg-white rounded-[24px] border border-slate-100 p-5 animate-pulse">
        <div className="h-4 bg-[#F2F4F6] rounded w-32 mb-4" />
        <div className="h-8 bg-[#F2F4F6] rounded w-20 mb-3" />
        <div className="h-3 bg-[#F2F4F6] rounded w-48 mb-2" />
        <div className="h-3 bg-[#F2F4F6] rounded w-40" />
      </div>
    );
  }

  if (profiles.length === 0) return null;

  const avgScore = Math.round(
    profiles.reduce((sum, p) => sum + p.credit_score, 0) / profiles.length
  );

  // 티어 분포 계산
  const tierCounts: Record<string, number> = {};
  profiles.forEach((p) => {
    const tier = getTier(p.credit_score);
    tierCounts[tier.key] = (tierCounts[tier.key] || 0) + 1;
  });

  // 최고 스트릭
  const bestStreak = profiles.reduce(
    (best, p) => (p.current_streak > best.current_streak ? p : best),
    profiles[0]
  );

  // 위험 직원 (아이언 등급, 300점 미만)
  const atRisk = profiles.filter((p) => p.credit_score < 300);

  return (
    <button
      onClick={() => router.push("/admin/stats")}
      className="w-full bg-white rounded-[24px] border border-slate-100 p-5 text-left hover:shadow-sm transition-shadow"
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[15px] font-bold text-[#191F28]">
          팀 크레딧 현황
        </h2>
        <ChevronRight className="w-4 h-4 text-[#D1D6DB]" />
      </div>

      {/* 평균 점수 + 티어 분포 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TierBadge score={avgScore} size="sm" />
          <span className="text-[22px] font-bold text-[#191F28]">
            {avgScore}점
          </span>
          <span className="text-[12px] text-[#8B95A1]">평균</span>
        </div>
        <div className="flex items-center gap-1">
          {TIERS.filter((t) => tierCounts[t.key]).map((t) => (
            <span
              key={t.key}
              className="text-[11px] font-medium px-1.5 py-0.5 rounded-md"
              style={{ backgroundColor: `${t.color}30`, color: t.textColor }}
            >
              {t.emoji}
              {tierCounts[t.key]}
            </span>
          ))}
        </div>
      </div>

      {/* 하이라이트 */}
      <div className="space-y-1.5">
        {bestStreak.current_streak > 0 && (
          <div className="flex items-center gap-2 text-[13px]">
            <Flame className="w-3.5 h-3.5 text-[#F59E0B]" />
            <span className="text-[#4E5968]">
              <span className="font-bold text-[#191F28]">
                {bestStreak.name}
              </span>
              님 연속출근 {bestStreak.current_streak}일
            </span>
          </div>
        )}
        {atRisk.length > 0 && (
          <div className="flex items-center gap-2 text-[13px]">
            <AlertTriangle className="w-3.5 h-3.5 text-[#F04438]" />
            <span className="text-[#4E5968]">
              <span className="font-bold text-[#191F28]">
                {atRisk[0].name}
              </span>
              님 {atRisk[0].credit_score}점{" "}
              <span className="text-[#8B95A1]">
                ({getTier(atRisk[0].credit_score).name})
              </span>
              {atRisk.length > 1 && (
                <span className="text-[#8B95A1]">
                  {" "}
                  외 {atRisk.length - 1}명
                </span>
              )}
            </span>
          </div>
        )}
      </div>
    </button>
  );
}
