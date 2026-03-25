"use client";

import { useState, useEffect } from "react";
import { X, ArrowDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reverseCredit } from "@/lib/credit-engine";
import { createClient } from "@/lib/supabase";
import { EVENT_TYPE_LABELS, EXCEPTION_REASONS, type ExceptionReasonType } from "@/lib/tier-utils";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";

interface CreditEvent {
  id: string;
  event_type: string;
  points: number;
  description: string;
  reference_date: string | null;
  created_at: string;
  invalidated_by: string | null;
}

interface InvalidateCreditSheetProps {
  isOpen: boolean;
  profileId: string;
  profileName: string;
  onClose: () => void;
  onSuccess: () => void;
}

const supabase = createClient();

export default function InvalidateCreditSheet({
  isOpen,
  profileId,
  profileName,
  onClose,
  onSuccess,
}: InvalidateCreditSheetProps) {
  const [penalties, setPenalties] = useState<CreditEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reasonType, setReasonType] = useState<ExceptionReasonType | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);

  // 감점 이벤트 목록 조회 (무효화 안 된 것만)
  useEffect(() => {
    if (!isOpen) return;
    setFetchLoading(true);
    supabase
      .from("attendance_credits")
      .select("id, event_type, points, description, reference_date, created_at, invalidated_by")
      .eq("profile_id", profileId)
      .lt("points", 0)
      .is("invalidated_by", null)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        setPenalties((data ?? []) as CreditEvent[]);
        setFetchLoading(false);
      });
  }, [isOpen, profileId]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!selectedId || !reasonType) return;

    setLoading(true);
    const { error } = await reverseCredit(selectedId, reasonType);
    setLoading(false);

    if (error) {
      toast.error(error);
      return;
    }

    const selectedPenalty = penalties.find((p) => p.id === selectedId);
    const restored = selectedPenalty ? Math.abs(selectedPenalty.points) : 0;
    toast.success(`${profileName}님 감점이 취소됐어요 (+${restored}점 복구)`);

    setSelectedId(null);
    setReasonType(null);
    onSuccess();
    onClose();
  };

  const handleClose = () => {
    setSelectedId(null);
    setReasonType(null);
    onClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-50 transition-opacity"
        onClick={handleClose}
      />

      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl p-6 pb-8 animate-slide-up max-h-[80vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[17px] font-bold text-[#191F28]">
            예외 처리하기
          </h3>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F2F4F6]"
          >
            <X className="w-5 h-5 text-[#8B95A1]" />
          </button>
        </div>

        <p className="text-[13px] text-[#4E5968] mb-4">
          {profileName}님의 감점 이벤트 중 무효화할 항목을 선택해주세요
        </p>

        {/* 감점 이벤트 목록 */}
        {fetchLoading ? (
          <div className="space-y-2 mb-5">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 bg-[#F2F4F6] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : penalties.length === 0 ? (
          <div className="p-8 text-center text-[#8B95A1] text-[14px] mb-5">
            무효화 가능한 감점이 없어요
          </div>
        ) : (
          <div className="space-y-2 mb-5 max-h-[200px] overflow-y-auto">
            {penalties.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors text-left ${
                  selectedId === p.id
                    ? "border-[#3182F6] bg-[#E8F3FF]"
                    : "border-[#E5E8EB] hover:bg-[#F9FAFB]"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] text-[#191F28] font-medium truncate">
                    {EVENT_TYPE_LABELS[p.event_type] || p.event_type}
                  </p>
                  <p className="text-[12px] text-[#8B95A1]">
                    {p.reference_date
                      ? format(new Date(p.reference_date + "T00:00:00"), "M/d (EEE)", { locale: ko })
                      : format(new Date(p.created_at), "M/d HH:mm", { locale: ko })}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[14px] font-bold text-red-500 flex items-center gap-0.5">
                    <ArrowDown className="w-3 h-3" />
                    {p.points}
                  </span>
                  {selectedId === p.id && (
                    <Check className="w-4 h-4 text-[#3182F6]" />
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* 예외 사유 선택 */}
        {selectedId && (
          <div className="mb-6">
            <label className="text-[13px] font-medium text-[#4E5968] mb-2 block">
              예외 사유
            </label>
            <div className="space-y-2">
              {(Object.entries(EXCEPTION_REASONS) as [ExceptionReasonType, string][]).map(
                ([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setReasonType(reasonType === key ? null : key)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors text-left ${
                      reasonType === key
                        ? "border-[#3182F6] bg-[#E8F3FF]"
                        : "border-[#E5E8EB] hover:bg-[#F9FAFB]"
                    }`}
                  >
                    <span className="text-[14px] text-[#191F28]">{label}</span>
                    {reasonType === key && (
                      <Check className="w-4 h-4 text-[#3182F6]" />
                    )}
                  </button>
                ),
              )}
            </div>
          </div>
        )}

        {/* 확인 버튼 */}
        <Button
          onClick={handleSubmit}
          disabled={loading || !selectedId || !reasonType || penalties.length === 0}
          className="w-full h-[52px] rounded-2xl bg-[#3182F6] hover:bg-[#1B64DA] text-white font-semibold text-[15px] disabled:opacity-50"
        >
          {loading ? "처리 중..." : "감점 취소하기"}
        </Button>
      </div>
    </>
  );
}
