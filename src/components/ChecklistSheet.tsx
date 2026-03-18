"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import type { ChecklistTemplate } from "@/types/checklist";

interface ChecklistSheetProps {
  isOpen: boolean;
  trigger: "check_in" | "check_out";
  items: ChecklistTemplate[];
  onComplete: (checkedIds: string[]) => void;
  onClose?: () => void;
}

export default function ChecklistSheet({
  isOpen,
  trigger,
  items,
  onComplete,
}: ChecklistSheetProps) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [completing, setCompleting] = useState(false);

  // 열릴 때마다 상태 초기화
  useEffect(() => {
    if (isOpen) {
      setCheckedIds(new Set());
      setHiddenIds(new Set());
      setCompleting(false);
    }
  }, [isOpen]);

  // 모두 체크되면 자동 완료
  useEffect(() => {
    if (!isOpen || completing) return;
    if (items.length > 0 && checkedIds.size === items.length) {
      setCompleting(true);
      const timer = setTimeout(() => {
        onComplete(Array.from(checkedIds));
        setCheckedIds(new Set());
        setHiddenIds(new Set());
        setCompleting(false);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [checkedIds, items.length, isOpen, completing, onComplete]);

  if (!isOpen) return null;

  const toggle = (id: string) => {
    if (checkedIds.has(id)) return; // 이미 체크된 건 취소 불가

    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    // 짧은 딜레이 후 사라지는 애니메이션
    setTimeout(() => {
      setHiddenIds((prev) => new Set(prev).add(id));
    }, 350);
  };

  const remaining = items.filter((item) => !checkedIds.has(item.id)).length;
  const allChecked = remaining === 0 && items.length > 0;

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-5">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm bg-white rounded-[28px] px-5 pt-7 pb-7 shadow-2xl animate-in fade-in zoom-in-95 duration-300 max-h-[80vh] flex flex-col">

        {/* 헤더 */}
        <div className="mb-5">
          <h3 className="text-[18px] font-bold text-[#191F28]">
            {trigger === "check_in" ? "오픈 준비를 확인해요" : "마감 전 확인해요"}
          </h3>
          <p className="text-[13px] text-[#8B95A1] mt-1">
            {allChecked
              ? "모두 완료했어요 🎉"
              : `${remaining}개 항목을 확인해주세요`}
          </p>
        </div>

        {/* 항목 목록 */}
        <div className="flex-1 overflow-y-auto space-y-2 mb-2">
          {items.map((item) => {
            const checked = checkedIds.has(item.id);
            const hidden = hiddenIds.has(item.id);

            return (
              <div
                key={item.id}
                className={`transition-all duration-300 overflow-hidden ${
                  hidden ? "opacity-0 max-h-0 mb-0 scale-95" : "opacity-100 max-h-20 scale-100"
                }`}
              >
                <button
                  onClick={() => toggle(item.id)}
                  disabled={checked}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left transition-colors ${
                    checked ? "bg-[#E8F3FF]" : "bg-[#F2F4F6] active:bg-[#E8F3FF]"
                  }`}
                >
                  {checked ? (
                    <CheckCircle2 className="w-5 h-5 text-[#3182F6] shrink-0" />
                  ) : (
                    <Circle className="w-5 h-5 text-[#D1D6DB] shrink-0" />
                  )}
                  <span
                    className={`text-[14px] font-semibold ${
                      checked ? "text-[#3182F6]" : "text-[#191F28]"
                    }`}
                  >
                    {item.title}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        {/* 완료 중 표시 */}
        {allChecked && (
          <div className="w-full h-14 rounded-2xl bg-[#3182F6] flex items-center justify-center mt-2">
            <span className="text-white font-bold text-[16px]">
              {trigger === "check_in" ? "확인 완료 ✓" : "퇴근할게요 ✓"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
