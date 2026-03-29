"use client";

import { useState } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";
import { Check, X, Clock, AlertCircle, CalendarDays, MapPin } from "lucide-react";
import { createNotification } from "@/lib/notifications";

interface AdjustmentRow {
  id: string;
  profile_id: string;
  target_date: string;
  adjustment_type: string;
  requested_time: string | null;
  reason: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  created_at: string;
  profiles: { name: string; color_hex: string } | null;
  // 추가 데이터 (fetcher에서 병합)
  scheduleStart?: string | null;
  scheduleEnd?: string | null;
  storeName?: string | null;
  actualIn?: string | null;
  actualOut?: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  late_checkin: "출근 지연",
  early_checkout: "조기 퇴근",
  missed_checkin: "출근 미체크",
  missed_checkout: "퇴근 미체크",
  wrong_store: "매장 오류",
  other: "기타",
};

export default function AdminAdjustmentsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"pending" | "done">("pending");
  const [rejectTarget, setRejectTarget] = useState<AdjustmentRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);

  const { data: items, mutate } = useSWR(
    user ? ["admin-adjustments", tab] : null,
    async ([, currentTab]) => {
      const supabase = createClient();
      let query = supabase
        .from("attendance_adjustments")
        .select("*, profiles!profile_id(name, color_hex)")
        .order("created_at", { ascending: false });

      if (currentTab === "pending") {
        query = query.eq("status", "pending");
      } else {
        query = query.in("status", ["approved", "rejected"]);
      }

      const { data } = await query.limit(50);
      const rows = (data ?? []) as AdjustmentRow[];
      if (rows.length === 0) return rows;

      // 고유 (profile_id, target_date) 조합 수집
      const keys = new Map<string, { profileId: string; date: string }>();
      for (const r of rows) {
        const k = `${r.profile_id}_${r.target_date}`;
        if (!keys.has(k)) keys.set(k, { profileId: r.profile_id, date: r.target_date });
      }

      const profileIds = [...new Set(rows.map((r) => r.profile_id))];
      const dates = [...new Set(rows.map((r) => r.target_date))];

      // 스케줄 조회
      const { data: wsData } = await supabase
        .from("weekly_schedules")
        .select("id")
        .eq("status", "confirmed");
      const wsIds = (wsData ?? []).map((w: any) => w.id);

      const { data: slots } = wsIds.length > 0
        ? await supabase
            .from("schedule_slots")
            .select("profile_id, slot_date, start_time, end_time, stores!store_id(label)")
            .in("profile_id", profileIds)
            .in("slot_date", dates)
            .eq("status", "active")
            .in("weekly_schedule_id", wsIds)
        : { data: [] };

      const slotMap = new Map<string, { start: string; end: string; store: string }>();
      for (const s of (slots ?? []) as any[]) {
        slotMap.set(`${s.profile_id}_${s.slot_date}`, {
          start: s.start_time?.slice(0, 5),
          end: s.end_time?.slice(0, 5),
          store: s.stores?.label ?? "",
        });
      }

      // 출퇴근 기록 조회
      const minDate = dates.sort()[0];
      const maxDate = dates.sort()[dates.length - 1];
      const { data: logs } = await supabase
        .from("attendance_logs")
        .select("profile_id, type, created_at")
        .in("profile_id", profileIds)
        .gte("created_at", `${minDate}T00:00:00+09:00`)
        .lte("created_at", `${maxDate}T23:59:59+09:00`)
        .order("created_at", { ascending: true });

      // 날짜별 첫 IN, 마지막 OUT
      const inMap = new Map<string, string>();
      const outMap = new Map<string, string>();
      for (const log of (logs ?? []) as any[]) {
        const d = format(new Date(log.created_at), "yyyy-MM-dd");
        const k = `${log.profile_id}_${d}`;
        if (log.type === "IN" && !inMap.has(k)) {
          inMap.set(k, format(new Date(log.created_at), "HH:mm"));
        }
        if (log.type === "OUT") {
          outMap.set(k, format(new Date(log.created_at), "HH:mm"));
        }
      }

      // 병합
      return rows.map((r) => {
        const k = `${r.profile_id}_${r.target_date}`;
        const slot = slotMap.get(k);
        return {
          ...r,
          scheduleStart: slot?.start ?? null,
          scheduleEnd: slot?.end ?? null,
          storeName: slot?.store ?? null,
          actualIn: inMap.get(k) ?? null,
          actualOut: outMap.get(k) ?? null,
        };
      });
    },
    { dedupingInterval: 30_000, revalidateOnFocus: true },
  );

  const handleApprove = async (item: AdjustmentRow) => {
    if (!user || submitting) return;
    setSubmitting(item.id);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("attendance_adjustments")
        .update({
          status: "approved",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      if (error) throw error;

      await createNotification({
        profile_id: item.profile_id,
        target_role: "employee",
        type: "adjustment_approved",
        title: "근태 조정이 승인됐어요",
        content: `${format(new Date(item.target_date + "T00:00:00"), "M월 d일", { locale: ko })} ${TYPE_LABELS[item.adjustment_type]} 조정이 승인됐어요.`,
      });

      toast.success("승인했어요.");
      mutate();
    } catch {
      toast.error("처리에 실패했어요.", {
        description: "잠시 후 다시 시도해주세요.",
      });
    } finally {
      setSubmitting(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget || !user || submitting) return;
    setSubmitting(rejectTarget.id);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("attendance_adjustments")
        .update({
          status: "rejected",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          reject_reason: rejectReason || null,
        })
        .eq("id", rejectTarget.id);

      if (error) throw error;

      await createNotification({
        profile_id: rejectTarget.profile_id,
        target_role: "employee",
        type: "adjustment_rejected",
        title: "근태 조정이 반려됐어요",
        content: `${format(new Date(rejectTarget.target_date + "T00:00:00"), "M월 d일", { locale: ko })} 조정 신청이 반려됐어요.${rejectReason ? ` 사유: ${rejectReason}` : ""}`,
      });

      toast.success("반려했어요.");
      setRejectTarget(null);
      setRejectReason("");
      mutate();
    } catch {
      toast.error("처리에 실패했어요.", {
        description: "잠시 후 다시 시도해주세요.",
      });
    } finally {
      setSubmitting(null);
    }
  };

  // 시간 차이 계산 (분)
  function timeDiffLabel(scheduled: string | null, actual: string | null) {
    if (!scheduled || !actual) return null;
    const [sh, sm] = scheduled.split(":").map(Number);
    const [ah, am] = actual.split(":").map(Number);
    const diff = (ah * 60 + am) - (sh * 60 + sm);
    if (diff === 0) return null;
    const abs = Math.abs(diff);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    const label = h > 0 ? `${h}시간 ${m}분` : `${m}분`;
    return diff > 0 ? `+${label}` : `-${label}`;
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6 font-pretendard">
      <h1 className="text-[22px] font-bold text-[#191F28] mb-6">
        근태 조정 신청
      </h1>

      {/* 탭 */}
      <div className="flex bg-[#F2F4F6] p-1 rounded-2xl gap-1 mb-6">
        <button
          onClick={() => setTab("pending")}
          className={`flex-1 py-2.5 text-[14px] font-bold rounded-xl transition-all ${
            tab === "pending"
              ? "bg-white text-[#191F28] shadow-sm"
              : "text-[#8B95A1]"
          }`}
        >
          대기중
        </button>
        <button
          onClick={() => setTab("done")}
          className={`flex-1 py-2.5 text-[14px] font-bold rounded-xl transition-all ${
            tab === "done"
              ? "bg-white text-[#191F28] shadow-sm"
              : "text-[#8B95A1]"
          }`}
        >
          처리완료
        </button>
      </div>

      {/* 목록 */}
      <div className="space-y-3">
        {!items ? (
          <div className="h-32 bg-[#F2F4F6] rounded-2xl animate-pulse" />
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-[#8B95A1] text-[14px]">
            {tab === "pending"
              ? "대기 중인 조정 신청이 없어요"
              : "처리된 조정 신청이 없어요"}
          </div>
        ) : (
          items.map((item) => {
            const dateLabel = format(
              new Date(item.target_date + "T00:00:00"),
              "M월 d일 (EEE)",
              { locale: ko },
            );
            const inDiff = item.adjustment_type === "late_checkin"
              ? timeDiffLabel(item.scheduleStart ?? null, item.actualIn ?? null)
              : null;
            const outDiff = item.adjustment_type === "early_checkout"
              ? timeDiffLabel(item.actualOut ?? null, item.scheduleEnd ?? null)
              : null;

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl p-5 border border-slate-100"
              >
                {/* 헤더: 직원 정보 + 상태 */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-bold"
                      style={{
                        backgroundColor:
                          item.profiles?.color_hex ?? "#8B95A1",
                      }}
                    >
                      {item.profiles?.name?.charAt(0) ?? "?"}
                    </div>
                    <div>
                      <p className="text-[14px] font-bold text-[#191F28]">
                        {item.profiles?.name ?? "알 수 없음"}
                      </p>
                      <p className="text-[12px] text-[#8B95A1]">
                        {dateLabel}
                        {item.storeName && (
                          <span className="ml-1.5 text-[#8B95A1]">
                            &middot; {item.storeName}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  {item.status === "pending" ? (
                    <span className="px-2.5 py-1 bg-[#FFF7E6] text-[#F59E0B] rounded-full text-[12px] font-bold">
                      대기중
                    </span>
                  ) : item.status === "approved" ? (
                    <span className="px-2.5 py-1 bg-[#ECFDF5] text-[#22C55E] rounded-full text-[12px] font-bold">
                      승인
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 bg-[#FFF0F0] text-[#F04438] rounded-full text-[12px] font-bold">
                      반려
                    </span>
                  )}
                </div>

                {/* 조정 유형 뱃지 */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2.5 py-1 bg-[#E8F3FF] text-[#3182F6] rounded-lg text-[12px] font-bold">
                    {TYPE_LABELS[item.adjustment_type] ?? item.adjustment_type}
                  </span>
                  {inDiff && (
                    <span className="text-[12px] font-bold text-[#F04438]">{inDiff}</span>
                  )}
                  {outDiff && (
                    <span className="text-[12px] font-bold text-[#F04438]">-{outDiff?.replace("-", "")}</span>
                  )}
                </div>

                {/* 시간 비교 테이블 */}
                <div className="bg-[#F9FAFB] rounded-xl p-3 mb-3">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="text-[11px] text-[#8B95A1] font-medium">
                        <th className="text-left pb-2 w-[25%]"></th>
                        <th className="text-center pb-2 w-[25%]">스케줄</th>
                        <th className="text-center pb-2 w-[25%]">실제 기록</th>
                        <th className="text-center pb-2 w-[25%]">요청 시각</th>
                      </tr>
                    </thead>
                    <tbody className="text-[#4E5968]">
                      <tr>
                        <td className="py-1 font-bold text-[#191F28]">출근</td>
                        <td className="py-1 text-center">{item.scheduleStart ?? "-"}</td>
                        <td className={`py-1 text-center font-bold ${
                          item.actualIn ? (
                            item.adjustment_type === "late_checkin" ? "text-[#F04438]" : "text-[#191F28]"
                          ) : "text-[#F04438]"
                        }`}>
                          {item.actualIn ?? "미체크"}
                        </td>
                        <td className="py-1 text-center font-bold text-[#3182F6]">
                          {(item.adjustment_type === "late_checkin" || item.adjustment_type === "missed_checkin")
                            ? (item.requested_time?.slice(0, 5) ?? "-")
                            : ""}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1 font-bold text-[#191F28]">퇴근</td>
                        <td className="py-1 text-center">{item.scheduleEnd ?? "-"}</td>
                        <td className={`py-1 text-center font-bold ${
                          item.actualOut ? (
                            item.adjustment_type === "early_checkout" ? "text-[#F04438]" : "text-[#191F28]"
                          ) : "text-[#F04438]"
                        }`}>
                          {item.actualOut ?? "미체크"}
                        </td>
                        <td className="py-1 text-center font-bold text-[#3182F6]">
                          {(item.adjustment_type === "early_checkout" || item.adjustment_type === "missed_checkout")
                            ? (item.requested_time?.slice(0, 5) ?? "-")
                            : ""}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 사유 + 신청 시각 */}
                <div className="mb-3 space-y-1.5">
                  <p className="text-[13px] text-[#4E5968] leading-snug">
                    <span className="font-bold text-[#191F28]">사유:</span> {item.reason}
                  </p>
                  <p className="text-[11px] text-[#8B95A1]">
                    신청 {format(new Date(item.created_at), "M/d HH:mm")}
                    {item.reviewed_at && (
                      <span> &middot; 처리 {format(new Date(item.reviewed_at), "M/d HH:mm")}</span>
                    )}
                  </p>
                </div>

                {/* 반려 사유 (처리완료 탭) */}
                {item.status === "rejected" && item.reject_reason && (
                  <p className="text-[12px] text-[#F04438] mb-3">
                    반려 사유: {item.reject_reason}
                  </p>
                )}

                {/* 액션 버튼 (pending만) */}
                {item.status === "pending" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRejectTarget(item)}
                      disabled={submitting === item.id}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[#F2F4F6] text-[#4E5968] rounded-xl font-bold text-[13px] active:scale-[0.98] transition-all disabled:opacity-40"
                    >
                      <X className="w-4 h-4" />
                      반려하기
                    </button>
                    <button
                      onClick={() => handleApprove(item)}
                      disabled={submitting === item.id}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[#3182F6] text-white rounded-xl font-bold text-[13px] active:scale-[0.98] transition-all disabled:opacity-40"
                    >
                      <Check className="w-4 h-4" />
                      승인하기
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 반려 모달 */}
      {rejectTarget && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center px-5">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setRejectTarget(null)}
          />
          <div className="relative w-full max-w-[380px] bg-white rounded-[28px] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-[17px] font-bold text-[#191F28] mb-4">
              반려 사유
            </h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="반려 사유를 입력해주세요 (선택)"
              rows={3}
              className="w-full px-4 py-3 rounded-2xl border border-[#E5E8EB] text-[14px] text-[#191F28] outline-none focus:border-[#3182F6] transition-colors resize-none placeholder:text-[#D1D6DB] mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setRejectTarget(null);
                  setRejectReason("");
                }}
                className="flex-1 py-3 bg-[#F2F4F6] text-[#4E5968] rounded-2xl font-bold text-[14px]"
              >
                취소
              </button>
              <button
                onClick={handleReject}
                disabled={!!submitting}
                className="flex-1 py-3 bg-[#F04438] text-white rounded-2xl font-bold text-[14px] disabled:opacity-40"
              >
                반려하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
