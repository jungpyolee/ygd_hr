"use client";

import { X } from "lucide-react";
import { TIERS, CREDIT_POINTS, STREAK_MILESTONES } from "@/lib/tier-utils";

interface StatsGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function StatsGuideModal({ isOpen, onClose }: StatsGuideModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-5">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-sm max-h-[85vh] bg-white rounded-[28px] shadow-2xl animate-in fade-in zoom-in-95 duration-300 flex flex-col">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <h3 className="text-[18px] font-bold text-[#191F28]">
            통계 안내
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F4F6]"
          >
            <X className="w-4 h-4 text-[#4E5968]" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 pb-6 space-y-6">
          {/* 통계 읽는 법 */}
          <section>
            <h4 className="text-[15px] font-bold text-[#191F28] mb-3">
              통계 읽는 법
            </h4>
            <div className="space-y-3 text-[13px] text-[#4E5968] leading-relaxed">
              <div className="bg-[#F2F4F6] rounded-xl p-3 space-y-1.5">
                <p className="font-semibold text-[#191F28]">이행률</p>
                <p>스케줄이 있는 날 중 실제로 출근한 비율이에요. 지각도 출근으로 인정돼요.</p>
              </div>
              <div className="bg-[#F2F4F6] rounded-xl p-3 space-y-1.5">
                <p className="font-semibold text-[#191F28]">크레딧 점수</p>
                <p>출퇴근 성실도를 종합적으로 나타내는 점수예요. 정상 출근, 지각, 결근 등이 모두 반영돼요.</p>
              </div>
              <div className="bg-[#F2F4F6] rounded-xl p-3 space-y-1.5">
                <p className="font-semibold text-[#191F28]">
                  <span className="relative inline-flex h-2 w-2 mr-1 align-middle">
                    <span className="inline-flex rounded-full h-2 w-2 bg-[#3182F6]" />
                  </span>
                  파란 점
                </p>
                <p>오늘 출근 중인 직원을 나타내요.</p>
              </div>
            </div>
          </section>

          {/* 정산이란 */}
          <section>
            <h4 className="text-[15px] font-bold text-[#191F28] mb-3">
              정산이란?
            </h4>
            <div className="text-[13px] text-[#4E5968] leading-relaxed space-y-2">
              <p>
                정산은 어제 스케줄이 있었는데 출근하지 않은 직원에게
                <span className="font-semibold text-red-500"> 결근({CREDIT_POINTS.no_show}점)</span>이나
                <span className="font-semibold text-amber-500"> 퇴근 미기록({CREDIT_POINTS.missing_checkout}점)</span>을
                자동으로 반영하는 기능이에요.
              </p>
              <p>매일 오전 9시에 자동으로 정산돼요. 이미 처리된 건은 중복 반영되지 않아요.</p>
            </div>
          </section>

          {/* 크레딧 점수 체계 */}
          <section>
            <h4 className="text-[15px] font-bold text-[#191F28] mb-3">
              크레딧 점수 체계
            </h4>
            <p className="text-[13px] text-[#4E5968] mb-3">
              모든 직원은 500점에서 시작해요. 출퇴근에 따라 점수가 변동되고, 점수에 따라 등급이 결정돼요.
            </p>

            <div className="space-y-1.5 mb-4">
              {TIERS.map((tier) => (
                <div
                  key={tier.key}
                  className="flex items-center justify-between py-1.5 px-3 rounded-lg"
                  style={{ backgroundColor: `${tier.color}20` }}
                >
                  <span className="text-[13px] font-semibold" style={{ color: tier.textColor }}>
                    {tier.emoji} {tier.name}
                  </span>
                  <span className="text-[12px] text-[#4E5968]">
                    {tier.min}~{tier.max}점
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* 점수 변동 기준 */}
          <section>
            <h4 className="text-[15px] font-bold text-emerald-600 mb-2">가점</h4>
            <div className="space-y-1 mb-4">
              {[
                { label: "정상 출퇴근", points: CREDIT_POINTS.normal_attendance },
                { label: "대타 출근 (월 2회)", points: CREDIT_POINTS.substitute_bonus },
              ].map((item) => (
                <div key={item.label} className="flex justify-between py-1.5 px-3 bg-emerald-50 rounded-lg text-[13px]">
                  <span>{item.label}</span>
                  <span className="font-bold text-emerald-600">+{item.points}점</span>
                </div>
              ))}
            </div>

            <h4 className="text-[15px] font-bold text-red-500 mb-2">감점</h4>
            <div className="space-y-1 mb-4">
              {[
                { label: "지각 (5~10분)", points: CREDIT_POINTS.late_minor },
                { label: "지각 (10분 이상)", points: CREDIT_POINTS.late_major },
                { label: "퇴근 미기록", points: CREDIT_POINTS.missing_checkout },
                { label: "당일 취소", points: CREDIT_POINTS.same_day_cancel },
                { label: "무단결근", points: CREDIT_POINTS.no_show },
              ].map((item) => (
                <div key={item.label} className="flex justify-between py-1.5 px-3 bg-red-50 rounded-lg text-[13px]">
                  <span>{item.label}</span>
                  <span className="font-bold text-red-500">{item.points}점</span>
                </div>
              ))}
            </div>
          </section>

          {/* 연속출근 보너스 */}
          <section>
            <h4 className="text-[15px] font-bold text-orange-500 mb-2">연속출근 보너스</h4>
            <p className="text-[13px] text-[#4E5968] mb-2">
              직원이 매일 정시 출근하면 연속출근이 쌓이고, 마일스톤 달성 시 보너스를 받아요.
              지각이나 결근 시 초기화돼요.
            </p>
            <div className="space-y-1">
              {STREAK_MILESTONES.map((m) => (
                <div key={m.count} className="flex justify-between py-1.5 px-3 bg-orange-50 rounded-lg text-[13px]">
                  <span>{m.count}일 연속출근</span>
                  <span className="font-bold text-orange-500">+{m.bonus}점</span>
                </div>
              ))}
            </div>
          </section>

          {/* 예외 처리 */}
          <section>
            <h4 className="text-[15px] font-bold text-[#191F28] mb-3">
              예외 처리
            </h4>
            <div className="text-[13px] text-[#4E5968] leading-relaxed space-y-2">
              <p>
                GPS 오류, 앱 장애 등으로 부당한 감점이 발생했다면 직원 행을 눌러 예외 처리할 수 있어요.
              </p>
              <p>감점 항목을 선택하고 사유를 지정하면 해당 감점이 취소되고 점수가 복구돼요.</p>
            </div>
          </section>

          {/* 참고사항 */}
          <section className="bg-[#F2F4F6] rounded-xl p-4">
            <h4 className="text-[13px] font-bold text-[#4E5968] mb-2">참고사항</h4>
            <ul className="text-[12px] text-[#8B95A1] space-y-1.5 list-disc list-inside">
              <li>통계 수치(출근/지각/결근)는 실제 출퇴근 기록 기반으로 실시간 반영돼요</li>
              <li>크레딧 점수는 정산 후에 결근/퇴근 미기록이 반영돼요</li>
              <li>출근 인정 기준: 예정 시간 기준 5분 이내 도착</li>
              <li>직원도 자신의 크레딧과 등급을 확인할 수 있어요</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
