"use client";

import { useState } from "react";
import { X, Check } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { createNotification } from "@/lib/notifications";
import { toast } from "sonner";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

export interface AdjustmentIssue {
  type: string; // adjustment_type DB value
  label: string; // "출근 1시간 41분 지연" 등
}

interface AdjustmentModalProps {
  targetDate: string; // "yyyy-MM-dd"
  profileId: string;
  scheduleStart?: string | null; // "HH:mm"
  scheduleEnd?: string | null;
  actualIn?: string | null; // "HH:mm"
  actualOut?: string | null;
  issues: AdjustmentIssue[];
  onClose: () => void;
  onSuccess: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  late_checkin: "출근을 늦게 찍었어요",
  missed_checkin: "출근을 안 찍었어요",
  early_checkout: "퇴근을 일찍 찍었어요",
  missed_checkout: "퇴근을 안 찍었어요",
};

// dismiss 가능한 유형 (기록은 있지만 시간 차이)
const DISMISSABLE_TYPES = new Set(["late_checkin", "early_checkout"]);

function needsTimeInput(type: string) {
  return ["late_checkin", "missed_checkin", "early_checkout", "missed_checkout"].includes(type);
}

function defaultTimeForType(type: string, scheduleStart?: string | null, scheduleEnd?: string | null) {
  if (type === "late_checkin" || type === "missed_checkin") return scheduleStart ?? "";
  if (type === "early_checkout" || type === "missed_checkout") return scheduleEnd ?? "";
  return "";
}

function timeLabel(type: string) {
  if (type === "late_checkin" || type === "missed_checkin") return "실제 출근 시각";
  return "실제 퇴근 시각";
}

export default function AdjustmentModal({
  targetDate,
  profileId,
  scheduleStart,
  scheduleEnd,
  actualIn,
  actualOut,
  issues,
  onClose,
  onSuccess,
}: AdjustmentModalProps) {
  // dismiss 처리된 이슈 타입 Set
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [times, setTimes] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const issue of issues) {
      if (needsTimeInput(issue.type)) {
        init[issue.type] = defaultTimeForType(issue.type, scheduleStart, scheduleEnd);
      }
    }
    return init;
  });
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const dateLabel = format(new Date(targetDate + "T00:00:00"), "M월 d일 (EEE)", {
    locale: ko,
  });

  // 조정이 필요한 이슈 (dismiss 안 된 것)
  const adjustIssues = issues.filter((i) => !dismissed.has(i.type));
  // dismiss된 이슈
  const dismissedIssues = issues.filter((i) => dismissed.has(i.type));
  // 조정 필요한 이슈가 있으면 사유 필수
  const needsReason = adjustIssues.length > 0;

  const toggleDismiss = (type: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (needsReason && !reason.trim()) {
      toast.error("사유를 입력해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClient();

      const rows = [
        // 조정 신청 건
        ...adjustIssues.map((issue) => ({
          profile_id: profileId,
          target_date: targetDate,
          adjustment_type: issue.type,
          requested_time: times[issue.type] || null,
          reason: reason.trim(),
          status: "pending",
          reviewed_by: null,
          reviewed_at: null,
          reject_reason: null,
        })),
        // dismiss 건
        ...dismissedIssues.map((issue) => ({
          profile_id: profileId,
          target_date: targetDate,
          adjustment_type: issue.type,
          requested_time: null,
          reason: "문제 없음 (본인 확인)",
          status: "dismissed",
          reviewed_by: null,
          reviewed_at: null,
          reject_reason: null,
        })),
      ];

      // upsert: 반려된 기존 건이 있으면 덮어쓰기 (재신청)
      const { error } = await supabase
        .from("attendance_adjustments")
        .upsert(rows, { onConflict: "profile_id,target_date,adjustment_type" });

      if (error) {
        toast.error("신청에 실패했어요.", { description: error.message });
        return;
      }

      // 조정 신청이 있을 때만 관리자에게 알림
      if (adjustIssues.length > 0) {
        await createNotification({
          target_role: "admin",
          type: "adjustment_requested",
          title: "근태 조정 신청이 있어요",
          content: `${dateLabel} 근태 조정 신청이 접수됐어요.`,
        });
      }

      if (adjustIssues.length > 0) {
        toast.success("근태 조정을 신청했어요.");
      } else {
        toast.success("확인 처리했어요.");
      }
      onSuccess();
      onClose();
    } catch {
      toast.error("처리에 실패했어요.", {
        description: "잠시 후 다시 시도해주세요.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const buttonLabel = () => {
    if (submitting) return "처리 중...";
    if (adjustIssues.length > 0 && dismissedIssues.length > 0)
      return `${adjustIssues.length}건 신청 · ${dismissedIssues.length}건 확인`;
    if (adjustIssues.length > 0) return `${adjustIssues.length}건 신청하기`;
    return "확인했어요";
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center px-5">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-[380px] bg-white rounded-[28px] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[17px] font-bold text-[#191F28]">
            근태 조정 신청
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F4F6] text-[#8B95A1]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 날짜 + 현재 기록 */}
        <div className="bg-[#F2F4F6] rounded-2xl p-4 mb-5">
          <p className="text-[14px] font-bold text-[#191F28] mb-2">
            {dateLabel}
          </p>
          <div className="space-y-1 text-[13px]">
            {scheduleStart && scheduleEnd && (
              <p className="text-[#8B95A1]">
                스케줄 {scheduleStart} ~ {scheduleEnd}
              </p>
            )}
            <p className="text-[#4E5968]">
              실제{" "}
              {actualIn ? `${actualIn} 출근` : "출근 미체크"}
              {" · "}
              {actualOut ? `${actualOut} 퇴근` : "퇴근 미체크"}
            </p>
          </div>
        </div>

        {/* 이슈 목록 */}
        <div className="mb-4">
          <p className="text-[13px] font-bold text-[#4E5968] mb-2">
            조정 항목
          </p>
          <div className="space-y-2">
            {issues.map((issue) => {
              const isDismissable = DISMISSABLE_TYPES.has(issue.type);
              const isDismissed = dismissed.has(issue.type);

              return (
                <div
                  key={issue.type}
                  className={`px-4 py-3 rounded-2xl border transition-all ${
                    isDismissed
                      ? "border-[#E5E8EB] bg-[#F9FAFB]"
                      : "border-[#3182F6] bg-[#E8F3FF]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-[14px] font-bold ${isDismissed ? "text-[#8B95A1]" : "text-[#3182F6]"}`}>
                        {TYPE_LABELS[issue.type] ?? issue.label}
                      </p>
                      <p className={`text-[12px] mt-0.5 ${isDismissed ? "text-[#8B95A1]/70" : "text-[#3182F6]/70"}`}>
                        {issue.label}
                      </p>
                    </div>
                    {isDismissable && (
                      <button
                        type="button"
                        onClick={() => toggleDismiss(issue.type)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-bold transition-all ${
                          isDismissed
                            ? "bg-[#E5E8EB] text-[#4E5968]"
                            : "bg-white/60 text-[#3182F6]"
                        }`}
                      >
                        {isDismissed && <Check className="w-3 h-3" />}
                        문제 없어요
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 조정 필요한 이슈의 시각 입력 */}
        {adjustIssues.some((i) => needsTimeInput(i.type)) && (
          <div className="mb-4 space-y-3">
            {adjustIssues.filter((i) => needsTimeInput(i.type)).map((issue) => (
              <div key={issue.type}>
                <p className="text-[13px] font-bold text-[#4E5968] mb-2">
                  {timeLabel(issue.type)}
                </p>
                <input
                  type="time"
                  value={times[issue.type] ?? ""}
                  onChange={(e) =>
                    setTimes((prev) => ({ ...prev, [issue.type]: e.target.value }))
                  }
                  className="w-full px-4 py-3 rounded-2xl border border-[#E5E8EB] text-[14px] font-semibold text-[#191F28] outline-none focus:border-[#3182F6] transition-colors"
                />
              </div>
            ))}
          </div>
        )}

        {/* 사유 입력 (조정 신청 건이 있을 때만) */}
        {needsReason && (
          <div className="mb-6">
            <p className="text-[13px] font-bold text-[#4E5968] mb-2">사유</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="사유를 입력해주세요"
              rows={3}
              className="w-full px-4 py-3 rounded-2xl border border-[#E5E8EB] text-[14px] text-[#191F28] outline-none focus:border-[#3182F6] transition-colors resize-none placeholder:text-[#D1D6DB]"
            />
          </div>
        )}

        {/* 버튼 */}
        <button
          onClick={handleSubmit}
          disabled={submitting || (needsReason && !reason.trim())}
          className="w-full py-3.5 bg-[#3182F6] text-white rounded-2xl font-bold text-[15px] disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
        >
          {buttonLabel()}
        </button>
      </div>
    </div>
  );
}
