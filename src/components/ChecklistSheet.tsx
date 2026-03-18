"use client";

import { useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import type { ChecklistTemplate } from "@/types/checklist";

interface ChecklistSheetProps {
  isOpen: boolean;
  trigger: "check_in" | "check_out";
  items: ChecklistTemplate[];
  onComplete: (checkedIds: string[]) => void;
  onClose?: () => void; // check_in만 허용 (check_out은 반드시 완료 필요)
}

export default function ChecklistSheet({
  isOpen,
  trigger,
  items,
  onComplete,
  onClose,
}: ChecklistSheetProps) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  const toggle = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allChecked = items.every((item) => checkedIds.has(item.id));
  const remaining = items.length - checkedIds.size;

  const handleComplete = () => {
    onComplete(Array.from(checkedIds));
    setCheckedIds(new Set());
  };

  const handleClose = () => {
    setCheckedIds(new Set());
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={trigger === "check_in" ? handleClose : undefined}
      />
      <div className="relative w-full max-w-md bg-white rounded-t-[28px] px-5 pt-7 pb-10 shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[85vh] flex flex-col">
        {/* 핸들 */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-9 h-1 bg-[#D1D6DB] rounded-full" />

        {/* 헤더 */}
        <div className="mb-5">
          <h3 className="text-[18px] font-bold text-[#191F28]">
            {trigger === "check_in" ? "오픈 준비를 확인해요" : "마감 전 확인해요"}
          </h3>
          <p className="text-[13px] text-[#8B95A1] mt-1">
            {allChecked
              ? "모두 완료했어요 🎉"
              : `${remaining}개 항목이 남았어요`}
          </p>
        </div>

        {/* 항목 목록 */}
        <div className="flex-1 overflow-y-auto space-y-2 mb-5">
          {items.map((item) => {
            const checked = checkedIds.has(item.id);
            return (
              <button
                key={item.id}
                onClick={() => toggle(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left transition-colors ${
                  checked ? "bg-[#E8F3FF]" : "bg-[#F2F4F6]"
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
            );
          })}
        </div>

        {/* 완료 버튼 */}
        <button
          onClick={handleComplete}
          disabled={!allChecked}
          className="w-full h-14 rounded-2xl bg-[#3182F6] text-white font-bold text-[16px] disabled:bg-[#D1D6DB] disabled:text-[#8B95A1] transition-colors mb-2"
        >
          {allChecked
            ? trigger === "check_in"
              ? "확인 완료"
              : "퇴근할게요"
            : `${remaining}개 남았어요`}
        </button>

        {/* check_in은 건너뛰기 가능 */}
        {trigger === "check_in" && onClose && (
          <button
            onClick={handleClose}
            className="w-full h-12 rounded-2xl bg-[#F2F4F6] text-[#8B95A1] font-bold text-[14px]"
          >
            나중에 할게요
          </button>
        )}
      </div>
    </div>
  );
}
