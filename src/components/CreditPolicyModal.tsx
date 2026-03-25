"use client";

import { X } from "lucide-react";
import { TIERS, CREDIT_POINTS, STREAK_MILESTONES } from "@/lib/tier-utils";

interface CreditPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const BONUS_ITEMS = [
  { label: "정상 출퇴근", points: CREDIT_POINTS.normal_attendance },
  { label: "대타 출근 (월 2회)", points: CREDIT_POINTS.substitute_bonus },
  { label: "대타 출근 (추가)", points: CREDIT_POINTS.substitute_regular },
  { label: "관리자 취소 보상", points: CREDIT_POINTS.admin_cancel_compensation },
];

const PENALTY_ITEMS = [
  { label: "지각 (5~10분)", points: CREDIT_POINTS.late_minor },
  { label: "지각 (10분 이상)", points: CREDIT_POINTS.late_major },
  { label: "조기퇴근", points: CREDIT_POINTS.early_leave },
  { label: "퇴근 미기록", points: CREDIT_POINTS.missing_checkout },
  { label: "당일 취소", points: CREDIT_POINTS.same_day_cancel },
  { label: "사전 취소", points: CREDIT_POINTS.advance_cancel },
  { label: "무단결근", points: CREDIT_POINTS.no_show },
];

export default function CreditPolicyModal({
  isOpen,
  onClose,
}: CreditPolicyModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-5">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-sm max-h-[85vh] bg-white rounded-[28px] shadow-2xl animate-in fade-in zoom-in-95 duration-300 flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <h3 className="text-[18px] font-bold text-[#191F28]">
            크레딧 정책 안내
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F4F6]"
          >
            <X className="w-4 h-4 text-[#4E5968]" />
          </button>
        </div>

        {/* 스크롤 콘텐츠 */}
        <div className="overflow-y-auto px-6 pb-6 space-y-6">
          {/* 크레딧이란 */}
          <section>
            <p className="text-[14px] text-[#4E5968] leading-relaxed">
              크레딧은 출퇴근 성실도를 점수로 나타내는 시스템이에요.
              기본 500점에서 시작하며, 출석·지각·결근 등에 따라
              점수가 변동돼요.
            </p>
          </section>

          {/* 티어 */}
          <section>
            <h4 className="text-[15px] font-bold text-[#191F28] mb-3">
              등급 기준
            </h4>
            <div className="space-y-2">
              {TIERS.map((tier) => (
                <div
                  key={tier.key}
                  className="flex items-center justify-between py-2 px-3 rounded-xl"
                  style={{ backgroundColor: `${tier.color}20` }}
                >
                  <span
                    className="text-[14px] font-semibold"
                    style={{ color: tier.textColor }}
                  >
                    {tier.emoji} {tier.name}
                  </span>
                  <span className="text-[13px] text-[#4E5968]">
                    {tier.min} ~ {tier.max}점
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* 가점 */}
          <section>
            <h4 className="text-[15px] font-bold text-emerald-600 mb-3">
              가점 항목
            </h4>
            <div className="space-y-1.5">
              {BONUS_ITEMS.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between py-2 px-3 bg-emerald-50 rounded-xl"
                >
                  <span className="text-[13px] text-[#191F28]">
                    {item.label}
                  </span>
                  <span className="text-[13px] font-bold text-emerald-600">
                    +{item.points}점
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* 감점 */}
          <section>
            <h4 className="text-[15px] font-bold text-red-500 mb-3">
              감점 항목
            </h4>
            <div className="space-y-1.5">
              {PENALTY_ITEMS.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between py-2 px-3 bg-red-50 rounded-xl"
                >
                  <span className="text-[13px] text-[#191F28]">
                    {item.label}
                  </span>
                  <span className="text-[13px] font-bold text-red-500">
                    {item.points}점
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* 연속출근 보너스 */}
          <section>
            <h4 className="text-[15px] font-bold text-orange-500 mb-3">
              연속출근 보너스
            </h4>
            <p className="text-[13px] text-[#4E5968] mb-3">
              매일 정시 출근하면 연속출근이 쌓여요. 마일스톤을 달성하면
              보너스 점수를 받을 수 있어요.
            </p>
            <div className="space-y-1.5">
              {STREAK_MILESTONES.map((m) => (
                <div
                  key={m.count}
                  className="flex items-center justify-between py-2 px-3 bg-orange-50 rounded-xl"
                >
                  <span className="text-[13px] text-[#191F28]">
                    {m.count}일 연속출근
                  </span>
                  <span className="text-[13px] font-bold text-orange-500">
                    +{m.bonus}점
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* 참고사항 */}
          <section className="bg-[#F2F4F6] rounded-xl p-4">
            <h4 className="text-[13px] font-bold text-[#4E5968] mb-2">
              참고사항
            </h4>
            <ul className="text-[12px] text-[#8B95A1] space-y-1.5 list-disc list-inside">
              <li>지각이나 결근 시 연속출근이 초기화돼요</li>
              <li>부당한 감점은 관리자에게 예외 처리를 요청할 수 있어요</li>
              <li>출근 인정 기준: 예정 시간 기준 5분 이내 도착</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
