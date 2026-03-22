"use client";

import { useState } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { logError } from "@/lib/logError";
import { toast } from "sonner";
import { AlertCircle, Clock, MapPin, Check, X } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useWorkplaces } from "@/lib/hooks/useWorkplaces";

// ─── Types ───────────────────────────────────────────────────────────────────

interface RequestRow {
  id: string;
  type: "early_leave" | "absent" | "time_change" | "substitute";
  status: "pending" | "approved" | "rejected" | "filled" | "cancelled" | "cancel_requested";
  reason: string | null;
  reject_reason: string | null;
  requested_start_time: string | null;
  requested_end_time: string | null;
  eligible_profile_ids: string[];
  accepted_by: string | null;
  accepted_name?: string;
  created_at: string;
  // requester
  requester_id: string;
  requester_name: string;
  requester_color: string;
  // slot
  slot_id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  store_id: string;
}

interface Profile {
  id: string;
  name: string;
  color_hex: string;
  assigned_store_ids: string[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
  early_leave: { label: "조퇴 요청", emoji: "🏃", color: "text-[#E67700]", bg: "bg-[#FFF3BF]" },
  absent:      { label: "결근 예정", emoji: "😔", color: "text-[#E03131]", bg: "bg-[#FFEBEB]" },
  time_change: { label: "시간 변경", emoji: "🔄", color: "text-[#3182F6]", bg: "bg-[#E8F3FF]" },
  substitute:  { label: "대타 요청", emoji: "🙏", color: "text-[#7B5CF0]", bg: "bg-[#F0EDFF]" },
};

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:          { label: "대기중",      color: "text-[#E67700]", bg: "bg-[#FFF3BF]" },
  approved:         { label: "승인됨",      color: "text-[#00B761]", bg: "bg-[#E6FAF0]" },
  rejected:         { label: "거절됨",      color: "text-[#E03131]", bg: "bg-[#FFEBEB]" },
  filled:           { label: "대타 확정",   color: "text-[#3182F6]", bg: "bg-[#E8F3FF]" },
  cancelled:        { label: "취소됨",      color: "text-[#8B95A1]", bg: "bg-[#F2F4F6]" },
  cancel_requested: { label: "취소 요청중", color: "text-[#7B5CF0]", bg: "bg-[#F0EDFF]" },
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminRequestsPage() {
  const { byId } = useWorkplaces();
  const { user } = useAuth();
  const adminId = user?.id ?? null;

  const [tab, setTab] = useState<"pending" | "done">("pending");

  // 거절 시트
  const [rejectTarget, setRejectTarget] = useState<RequestRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  // 대타 승인 시트
  const [approveTarget, setApproveTarget] = useState<RequestRow | null>(null);
  const [eligibleIds, setEligibleIds] = useState<string[]>([]);
  const [approving, setApproving] = useState(false);

  const { data: profiles = [] } = useSWR(
    "admin-requests-profiles",
    async () => {
      const supabase = createClient();
      const [{ data: profs }, { data: assignments }] = await Promise.all([
        supabase.from("profiles").select("id, name, color_hex").order("name"),
        supabase.from("employee_store_assignments").select("profile_id, store_id"),
      ]);

      const assignMap: Record<string, string[]> = {};
      for (const a of assignments ?? []) {
        if (!assignMap[a.profile_id]) assignMap[a.profile_id] = [];
        assignMap[a.profile_id].push(a.store_id);
      }

      return ((profs ?? []) as { id: string; name: string; color_hex: string }[]).map((p) => ({
        id: p.id,
        name: p.name,
        color_hex: p.color_hex,
        assigned_store_ids: assignMap[p.id] ?? [],
      })) as Profile[];
    },
    { dedupingInterval: 60_000, revalidateOnFocus: false }
  );

  const { data: requests = [], isLoading, mutate } = useSWR(
    "admin-requests-list",
    async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("requests")
        .select(`
          id, type, status, reason, reject_reason,
          requested_start_time, requested_end_time,
          eligible_profile_ids, accepted_by, created_at,
          requester_id, slot_id,
          requester:profiles!requester_id (name, color_hex),
          accepted:profiles!accepted_by (name),
          schedule_slots!slot_id (slot_date, start_time, end_time, store_id)
        `)
        .order("created_at", { ascending: false });

      if (error || !data) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data as any[]).map((r) => ({
        id: r.id,
        type: r.type,
        status: r.status,
        reason: r.reason,
        reject_reason: r.reject_reason,
        requested_start_time: r.requested_start_time,
        requested_end_time: r.requested_end_time,
        eligible_profile_ids: r.eligible_profile_ids ?? [],
        accepted_by: r.accepted_by,
        accepted_name: r.accepted?.name,
        created_at: r.created_at,
        requester_id: r.requester_id,
        requester_name: r.requester?.name ?? "알 수 없음",
        requester_color: r.requester?.color_hex ?? "#8B95A1",
        slot_id: r.slot_id,
        slot_date: r.schedule_slots?.slot_date ?? "",
        start_time: r.schedule_slots?.start_time ?? "",
        end_time: r.schedule_slots?.end_time ?? "",
        store_id: r.schedule_slots?.store_id ?? "",
      })) as RequestRow[];
    },
    { dedupingInterval: 30_000, revalidateOnFocus: true }
  );

  const filtered = requests.filter((r) =>
    tab === "pending"
      ? r.status === "pending" || r.status === "cancel_requested"
      : r.status !== "pending" && r.status !== "cancel_requested"
  );

  // ─── 승인 (근태) ────────────────────────────────────────────────────────────

  const handleApproveAttendance = async (req: RequestRow) => {
    if (!adminId) return;
    const supabase = createClient();
    try {
      // 1. requests 상태 업데이트
      await supabase.from("requests").update({
        status: "approved",
        admin_id: adminId,
        processed_at: new Date().toISOString(),
      }).eq("id", req.id);

      // 2. 근태 자동 반영
      if (req.type === "absent") {
        await supabase.from("schedule_slots").update({ status: "cancelled" }).eq("id", req.slot_id);
      } else if (req.type === "early_leave" && req.requested_end_time) {
        await supabase.from("schedule_slots")
          .update({ end_time: req.requested_end_time })
          .eq("id", req.slot_id);
      } else if (req.type === "time_change") {
        const updates: Record<string, string> = {};
        if (req.requested_start_time) updates.start_time = req.requested_start_time;
        if (req.requested_end_time) updates.end_time = req.requested_end_time;
        if (Object.keys(updates).length > 0) {
          await supabase.from("schedule_slots").update(updates).eq("id", req.slot_id);
        }
      }

      // 3. 직원 알림
      await supabase.from("notifications").insert({
        profile_id: req.requester_id,
        target_role: "employee",
        type: "request_approved",
        title: `${TYPE_META[req.type].label}이 승인됐어요`,
        content: `${format(new Date(req.slot_date + "T00:00:00"), "M월 d일", { locale: ko })} ${TYPE_META[req.type].label}이 승인됐어요.`,
        source_id: req.id,
      });

      toast.success("승인했어요");
      mutate();
    } catch (error) {
      logError({ message: "요청 승인 실패", error, source: "admin/requests/handleApproveAttendance", context: { requestId: req.id } });
      toast.error("처리 중 오류가 생겼어요. 다시 시도해 주세요.");
    }
  };

  // ─── 대타 취소 요청 처리 ────────────────────────────────────────────────────

  const handleCancelApprove = async (req: RequestRow) => {
    if (!adminId) return;
    const supabase = createClient();
    try {
      await supabase.from("requests").update({
        status: "cancelled",
        admin_id: adminId,
        processed_at: new Date().toISOString(),
      }).eq("id", req.id);

      // eligible_profile_ids에게 취소 알림
      if (req.eligible_profile_ids?.length > 0) {
        const uniqueIds = Array.from(new Set(req.eligible_profile_ids));
        const notifications = uniqueIds.map((pid) => ({
          profile_id: pid,
          target_role: "employee" as const,
          type: "substitute_cancelled",
          title: "대타 요청이 취소됐어요",
          content: `${format(new Date(req.slot_date + "T00:00:00"), "M월 d일", { locale: ko })} ${byId[req.store_id]?.label || ""} 대타 요청이 취소됐어요.`,
          source_id: req.id,
        }));
        await supabase.from("notifications").insert(notifications);
      }

      // 요청자에게도 알림
      await supabase.from("notifications").insert({
        profile_id: req.requester_id,
        target_role: "employee",
        type: "request_approved",
        title: "대타 취소 요청이 처리됐어요",
        content: `${format(new Date(req.slot_date + "T00:00:00"), "M월 d일", { locale: ko })} 대타 취소 요청이 승인됐어요.`,
        source_id: req.id,
      });

      toast.success("취소 처리 완료. 알림을 보냈어요.");
      mutate();
    } catch (error) {
      logError({ message: "대타 취소 승인 실패", error, source: "admin/requests/handleCancelApprove", context: { requestId: req.id } });
      toast.error("처리 중 오류가 생겼어요. 다시 시도해 주세요.");
    }
  };

  const handleCancelReject = async (req: RequestRow) => {
    if (!adminId) return;
    const supabase = createClient();
    try {
      // 취소 거절 → 다시 approved로 복귀
      await supabase.from("requests").update({ status: "approved" }).eq("id", req.id);

      await supabase.from("notifications").insert({
        profile_id: req.requester_id,
        target_role: "employee",
        type: "request_rejected",
        title: "대타 취소 요청이 거절됐어요",
        content: `${format(new Date(req.slot_date + "T00:00:00"), "M월 d일", { locale: ko })} 대타 취소 요청이 거절됐어요. 기존 대타 요청은 유지돼요.`,
        source_id: req.id,
      });

      toast.success("취소 거절 처리했어요. 대타 요청이 유지돼요.");
      mutate();
    } catch (error) {
      logError({ message: "대타 취소 거절 실패", error, source: "admin/requests/handleCancelReject", context: { requestId: req.id } });
      toast.error("처리 중 오류가 생겼어요. 다시 시도해 주세요.");
    }
  };

  // ─── 거절 ──────────────────────────────────────────────────────────────────

  const handleReject = async () => {
    if (!rejectTarget || !adminId) return;
    const supabase = createClient();
    setRejecting(true);
    try {
      await supabase.from("requests").update({
        status: "rejected",
        reject_reason: rejectReason.trim() || null,
        admin_id: adminId,
        processed_at: new Date().toISOString(),
      }).eq("id", rejectTarget.id);

      await supabase.from("notifications").insert({
        profile_id: rejectTarget.requester_id,
        target_role: "employee",
        type: "request_rejected",
        title: `${TYPE_META[rejectTarget.type].label}이 거절됐어요`,
        content: `${format(new Date(rejectTarget.slot_date + "T00:00:00"), "M월 d일", { locale: ko })} ${TYPE_META[rejectTarget.type].label}이 거절됐어요.${rejectReason ? ` 사유: ${rejectReason}` : ""}`,
        source_id: rejectTarget.id,
      });

      toast.success("거절 처리했어요");
      setRejectTarget(null);
      setRejectReason("");
      mutate();
    } catch (error) {
      logError({ message: "요청 거절 실패", error, source: "admin/requests/handleReject", context: { requestId: rejectTarget?.id } });
      toast.error("처리 중 오류가 생겼어요. 다시 시도해 주세요.");
    } finally {
      setRejecting(false);
    }
  };

  // ─── 대타 승인 ─────────────────────────────────────────────────────────────

  const openSubstituteApprove = (req: RequestRow) => {
    setApproveTarget(req);
    // 같은 매장 직원 자동 선택
    const eligible = profiles.filter((p) =>
      p.id !== req.requester_id && p.assigned_store_ids.includes(req.store_id)
    );
    setEligibleIds(eligible.map((p) => p.id));
  };

  const handleSubstituteApprove = async () => {
    if (!approveTarget || !adminId) return;
    if (eligibleIds.length === 0) {
      toast.error("대타 가능한 직원을 선택해 주세요.", {
        description: "목록에서 1명 이상 선택해 주세요.",
      });
      return;
    }
    const supabase = createClient();
    setApproving(true);
    try {
      await supabase.from("requests").update({
        status: "approved",
        eligible_profile_ids: eligibleIds,
        admin_id: adminId,
        processed_at: new Date().toISOString(),
      }).eq("id", approveTarget.id);

      const uniqueIds = Array.from(new Set(eligibleIds));
      const notifications = uniqueIds.map((pid) => ({
        profile_id: pid,
        target_role: "employee" as const,
        type: "substitute_available",
        title: "대타 요청이 왔어요",
        content: `${format(new Date(approveTarget.slot_date + "T00:00:00"), "M월 d일", { locale: ko })} ${byId[approveTarget.store_id]?.label || ""} ${approveTarget.start_time.slice(0, 5)}~${approveTarget.end_time.slice(0, 5)} 대타를 설 수 있어요. 확인해보세요.`,
        source_id: approveTarget.id,
      }));
      await supabase.from("notifications").insert(notifications);

      toast.success(`승인 완료! ${uniqueIds.length}명에게 알림을 보냈어요`);
      setApproveTarget(null);
      setEligibleIds([]);
      mutate();
    } catch (error) {
      logError({ message: "대타 승인 실패", error, source: "admin/requests/handleSubstituteApprove", context: { requestId: approveTarget?.id } });
      toast.error("처리 중 오류가 생겼어요. 다시 시도해 주세요.");
    } finally {
      setApproving(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl animate-in fade-in duration-500 pb-20">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#191F28]">요청 관리</h1>
        <p className="text-[14px] text-[#8B95A1]">직원들의 조퇴·결근·시간변경·대타 요청을 검토하고 승인해요.</p>
      </div>

      {/* 탭 */}
      <div className="flex bg-[#F2F4F6] p-1 rounded-xl w-fit mb-4">
        {(["pending", "done"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-[13px] font-bold transition-all ${tab === t ? "bg-white text-[#191F28] shadow-sm" : "text-[#8B95A1]"}`}
          >
            {t === "pending" ? "대기중" : "처리완료"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-[20px] p-5 border border-slate-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-[#F2F4F6] animate-pulse" />
                <div className="w-24 h-4 bg-[#F2F4F6] rounded animate-pulse" />
              </div>
              <div className="w-full h-3 bg-[#F2F4F6] rounded animate-pulse mb-2" />
              <div className="w-2/3 h-3 bg-[#F2F4F6] rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-[24px] border border-slate-100 p-12 text-center">
          <AlertCircle className="w-8 h-8 text-[#D1D6DB] mx-auto mb-3" />
          <p className="text-[#8B95A1] text-[15px] font-medium">
            {tab === "pending" ? "대기 중인 요청이 없어요" : "처리된 요청이 없어요"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((req) => {
            const typeMeta = TYPE_META[req.type];
            const statusMeta = STATUS_META[req.status];
            return (
              <div key={req.id} className="bg-white rounded-[20px] p-5 border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
                {/* 상단: 직원 + 상태 */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold text-white"
                      style={{ backgroundColor: req.requester_color }}
                    >
                      {req.requester_name?.charAt(0)}
                    </div>
                    <span className="text-[15px] font-bold text-[#191F28]">{req.requester_name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${typeMeta.bg} ${typeMeta.color}`}>
                      {typeMeta.emoji} {typeMeta.label}
                    </span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${statusMeta.bg} ${statusMeta.color}`}>
                    {statusMeta.label}
                  </span>
                </div>

                {/* 슬롯 정보 */}
                <div className="flex flex-wrap gap-3 mb-3 text-[13px] text-[#4E5968]">
                  <span className="flex items-center gap-1 font-medium">
                    <Clock className="w-3.5 h-3.5 text-[#8B95A1]" />
                    {req.slot_date ? format(new Date(req.slot_date + "T00:00:00"), "M월 d일 (EEE)", { locale: ko }) : ""}
                  </span>
                  <span className="font-medium">
                    {req.start_time.slice(0, 5)} ~ {req.end_time.slice(0, 5)}
                  </span>
                  {byId[req.store_id] && (
                    <span
                      className="flex items-center gap-1 font-bold px-2 py-0.5 rounded-md text-white text-[12px]"
                      style={{ backgroundColor: byId[req.store_id].color }}
                    >
                      <MapPin className="w-3 h-3" />
                      {byId[req.store_id].label}
                    </span>
                  )}
                </div>

                {/* 희망 시간 */}
                {(req.requested_start_time || req.requested_end_time) && (
                  <p className="text-[12px] text-[#3182F6] font-bold mb-2">
                    희망: {req.requested_start_time?.slice(0, 5) ?? req.start_time.slice(0, 5)} ~ {req.requested_end_time?.slice(0, 5) ?? req.end_time.slice(0, 5)}
                  </p>
                )}

                {/* 사유 */}
                {req.reason && (
                  <p className="text-[13px] text-[#8B95A1] bg-[#F9FAFB] rounded-xl px-3 py-2 mb-3">
                    사유: <span className="text-[#4E5968] font-medium">{req.reason}</span>
                  </p>
                )}

                {/* 대타 확정: 수락자 */}
                {req.status === "filled" && req.accepted_name && (
                  <p className="text-[13px] text-[#00B761] font-bold mb-3">
                    대타: {req.accepted_name}님이 수락했어요
                  </p>
                )}

                {/* 거절 사유 */}
                {req.status === "rejected" && req.reject_reason && (
                  <p className="text-[13px] text-[#E03131] mb-3">
                    거절 사유: {req.reject_reason}
                  </p>
                )}

                <p className="text-[11px] text-[#8B95A1] mb-3">
                  {format(new Date(req.created_at), "M월 d일 a h:mm", { locale: ko })}
                </p>

                {/* 액션 버튼 — 일반 대기중 */}
                {req.status === "pending" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRejectTarget(req)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[#F9FAFB] hover:bg-[#F2F4F6] border border-slate-200 text-[#4E5968] rounded-xl text-[13px] font-bold transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                      거절하기
                    </button>
                    <button
                      onClick={() =>
                        req.type === "substitute"
                          ? openSubstituteApprove(req)
                          : handleApproveAttendance(req)
                      }
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[#3182F6] hover:bg-[#1B64DA] text-white rounded-xl text-[13px] font-bold transition-all"
                    >
                      <Check className="w-3.5 h-3.5" />
                      승인하기
                    </button>
                  </div>
                )}

                {/* 액션 버튼 — 대타 취소 요청 */}
                {req.status === "cancel_requested" && (
                  <div>
                    <p className="text-[12px] text-[#7B5CF0] font-bold bg-[#F0EDFF] rounded-xl px-3 py-2 mb-3">
                      직원이 대타 요청 취소를 요청했어요
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCancelReject(req)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[#F9FAFB] hover:bg-[#F2F4F6] border border-slate-200 text-[#4E5968] rounded-xl text-[13px] font-bold transition-all"
                      >
                        <X className="w-3.5 h-3.5" />
                        취소 거절
                      </button>
                      <button
                        onClick={() => handleCancelApprove(req)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[#FFEBEB] hover:bg-[#FFD6D6] text-[#E03131] rounded-xl text-[13px] font-bold transition-all"
                      >
                        <Check className="w-3.5 h-3.5" />
                        취소 승인
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 거절 바텀시트 */}
      {rejectTarget && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setRejectTarget(null)} />
          <div className="relative w-full max-w-md bg-white rounded-t-[28px] px-5 pt-8 pb-10 shadow-2xl animate-in slide-in-from-bottom-4 duration-250">
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-9 h-1 bg-[#D1D6DB] rounded-full" />
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[18px] font-bold text-[#191F28]">거절 사유</h3>
              <button onClick={() => setRejectTarget(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F4F6]">
                <X className="w-5 h-5 text-[#8B95A1]" />
              </button>
            </div>
            <p className="text-[14px] text-[#4E5968] mb-4">
              {rejectTarget.requester_name}님의 {TYPE_META[rejectTarget.type].label}을 거절해요.
            </p>
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="거절 사유를 입력해요 (선택)"
              className="w-full px-4 py-3 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6] mb-4"
            />
            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleReject}
                disabled={rejecting}
                className="w-full h-14 bg-[#FFEBEB] text-[#E03131] rounded-2xl font-bold text-[16px] disabled:opacity-50 active:scale-[0.98] transition-all"
              >
                {rejecting ? "처리하는 중이에요" : "거절하기"}
              </button>
              <button onClick={() => setRejectTarget(null)} className="w-full h-14 bg-[#F2F4F6] text-[#4E5968] rounded-2xl font-bold text-[16px]">
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 대타 승인 바텀시트 */}
      {approveTarget && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setApproveTarget(null)} />
          <div className="relative w-full max-w-md bg-white rounded-t-[28px] px-5 pt-8 pb-10 shadow-2xl animate-in slide-in-from-bottom-4 duration-250 max-h-[80vh] overflow-y-auto scrollbar-hide">
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-9 h-1 bg-[#D1D6DB] rounded-full" />
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[18px] font-bold text-[#191F28]">대타 승인 및 알림</h3>
              <button onClick={() => setApproveTarget(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F4F6]">
                <X className="w-5 h-5 text-[#8B95A1]" />
              </button>
            </div>
            <p className="text-[14px] text-[#4E5968] mb-4">
              알림을 받을 직원을 선택해요. 같은 매장 직원을 자동으로 추천했어요.
            </p>
            <div className="space-y-2 mb-6">
              {profiles
                .filter((p) => p.id !== approveTarget.requester_id)
                .map((p) => {
                  const sel = eligibleIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() =>
                        setEligibleIds((prev) =>
                          sel ? prev.filter((id) => id !== p.id) : [...prev, p.id]
                        )
                      }
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                        sel ? "bg-[#E8F3FF] border-[#3182F6] text-[#3182F6]" : "bg-white border-slate-100 text-[#4E5968]"
                      }`}
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold text-white shrink-0"
                        style={{ backgroundColor: p.color_hex }}
                      >
                        {p.name?.charAt(0)}
                      </div>
                      <span className="font-bold text-[14px] flex-1 text-left">{p.name}</span>
                      {sel && <Check className="w-4 h-4" />}
                    </button>
                  );
                })}
            </div>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleSubstituteApprove}
                disabled={approving}
                className="w-full h-14 bg-[#3182F6] text-white rounded-2xl font-bold text-[16px] disabled:opacity-50 active:scale-[0.98] transition-all"
              >
                {approving ? "처리하는 중이에요" : `승인 및 알림 보내기 (${eligibleIds.length}명)`}
              </button>
              <button onClick={() => setApproveTarget(null)} className="w-full h-14 bg-[#F2F4F6] text-[#4E5968] rounded-2xl font-bold text-[16px]">
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
