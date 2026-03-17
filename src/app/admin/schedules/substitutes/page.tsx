"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { toast } from "sonner";
import { ChevronLeft, X, Check, AlertCircle, Clock, MapPin } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import Link from "next/link";

interface SubstituteRequest {
  id: string;
  slot_id: string;
  requester_id: string;
  reason: string | null;
  status: string;
  reject_reason: string | null;
  rejected_at: string | null;
  approved_at: string | null;
  eligible_profile_ids: string[];
  accepted_by: string | null;
  accepted_at: string | null;
  created_at: string;
  // joined
  slot_date: string;
  start_time: string;
  end_time: string;
  work_location: string;
  requester_name: string;
  requester_color: string;
  accepted_name?: string;
}

interface Profile {
  id: string;
  name: string;
  color_hex: string;
  work_locations: string[] | null;
}

const LOCATION_LABELS: Record<string, string> = {
  cafe: "카페",
  factory: "공장",
  catering: "케이터링",
};
const LOCATION_COLORS: Record<string, string> = {
  cafe: "#3182F6",
  factory: "#00B761",
  catering: "#F59E0B",
};

export default function AdminSubstitutesPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<"pending" | "done">("pending");
  const [requests, setRequests] = useState<SubstituteRequest[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);

  // Reject bottom sheet
  const [rejectTarget, setRejectTarget] = useState<SubstituteRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  // Approve bottom sheet
  const [approveTarget, setApproveTarget] = useState<SubstituteRequest | null>(null);
  const [eligibleIds, setEligibleIds] = useState<string[]>([]);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentAdminId(user.id);
      const { data } = await supabase.from("profiles").select("id, name, color_hex, work_locations").order("name");
      if (data) setProfiles(data as Profile[]);
    };
    init();
  }, []);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("substitute_requests")
      .select(`
        id, slot_id, requester_id, reason, status, reject_reason, rejected_at, approved_at,
        eligible_profile_ids, accepted_by, accepted_at, created_at,
        schedule_slots!slot_id (slot_date, start_time, end_time, work_location),
        requester:profiles!requester_id (name, color_hex),
        accepted:profiles!accepted_by (name)
      `)
      .order("created_at", { ascending: false });

    if (!error && data) {
      const mapped = data.map((r: any) => ({
        id: r.id,
        slot_id: r.slot_id,
        requester_id: r.requester_id,
        reason: r.reason,
        status: r.status,
        reject_reason: r.reject_reason,
        rejected_at: r.rejected_at,
        approved_at: r.approved_at,
        eligible_profile_ids: r.eligible_profile_ids || [],
        accepted_by: r.accepted_by,
        accepted_at: r.accepted_at,
        created_at: r.created_at,
        slot_date: r.schedule_slots?.slot_date || "",
        start_time: r.schedule_slots?.start_time || "",
        end_time: r.schedule_slots?.end_time || "",
        work_location: r.schedule_slots?.work_location || "",
        requester_name: r.requester?.name || "알 수 없음",
        requester_color: r.requester?.color_hex || "#8B95A1",
        accepted_name: r.accepted?.name,
      })) as SubstituteRequest[];
      setRequests(mapped);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleReject = async () => {
    if (!rejectTarget || !currentAdminId) return;
    setRejecting(true);
    const { error } = await supabase
      .from("substitute_requests")
      .update({
        status: "rejected",
        reject_reason: rejectReason || null,
        rejected_by: currentAdminId,
        rejected_at: new Date().toISOString(),
      })
      .eq("id", rejectTarget.id);

    if (error) { toast.error("반려에 실패했어요", { description: error.message }); }
    else {
      // Notify requester
      await supabase.from("notifications").insert({
        profile_id: rejectTarget.requester_id,
        target_role: "employee",
        type: "substitute_rejected",
        title: "대타 요청이 반려됐어요",
        content: `${format(new Date(rejectTarget.slot_date), "M월 d일", { locale: ko })} 대타 요청이 반려됐어요.${rejectReason ? ` 사유: ${rejectReason}` : ""}`,
        source_id: rejectTarget.id,
      });
      toast.success("반려 처리했어요");
      setRejectTarget(null);
      setRejectReason("");
      fetchRequests();
    }
    setRejecting(false);
  };

  const openApproveSheet = (req: SubstituteRequest) => {
    setApproveTarget(req);
    // Auto-populate eligible profiles: work_location matches, not requester
    const eligible = profiles.filter((p) => {
      if (p.id === req.requester_id) return false;
      if (!p.work_locations || !p.work_locations.includes(req.work_location)) return false;
      return true;
    });
    setEligibleIds(eligible.map((p) => p.id));
  };

  const handleApprove = async () => {
    if (!approveTarget || !currentAdminId) return;
    if (eligibleIds.length === 0) { toast.error("대타 가능한 직원을 선택해주세요."); return; }
    setApproving(true);

    const { error } = await supabase
      .from("substitute_requests")
      .update({
        status: "approved",
        eligible_profile_ids: eligibleIds,
        approved_by: currentAdminId,
        approved_at: new Date().toISOString(),
      })
      .eq("id", approveTarget.id);

    if (error) { toast.error("승인에 실패했어요", { description: error.message }); }
    else {
      // Notify eligible employees
      const notifications = eligibleIds.map((pid) => ({
        profile_id: pid,
        target_role: "employee" as const,
        type: "substitute_approved",
        title: "대타 요청이 왔어요",
        content: `${format(new Date(approveTarget.slot_date), "M월 d일", { locale: ko })} ${LOCATION_LABELS[approveTarget.work_location]} ${approveTarget.start_time.slice(0, 5)}~${approveTarget.end_time.slice(0, 5)} 대타를 설 수 있어요. 확인해보세요.`,
        source_id: approveTarget.id,
      }));
      await supabase.from("notifications").insert(notifications);
      toast.success(`승인 완료! ${eligibleIds.length}명에게 알림을 보냈어요`);
      setApproveTarget(null);
      setEligibleIds([]);
      fetchRequests();
    }
    setApproving(false);
  };

  const filtered = requests.filter((r) =>
    tab === "pending" ? r.status === "pending" : ["approved", "rejected", "filled"].includes(r.status)
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending": return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#FFF3BF] text-[#E67700]">대기중</span>;
      case "approved": return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#E8F3FF] text-[#3182F6]">승인됨</span>;
      case "rejected": return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#FFEBEB] text-[#E03131]">반려됨</span>;
      case "filled": return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#E6FAF0] text-[#00B761]">충원됨</span>;
      default: return null;
    }
  };

  return (
    <div className="max-w-3xl animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/schedules" className="p-2 rounded-full hover:bg-[#F2F4F6] text-[#8B95A1] transition-all">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[#191F28]">대체근무 관리</h1>
          <p className="text-[14px] text-[#8B95A1]">직원들의 대타 요청을 처리해요.</p>
        </div>
      </div>

      {/* Tabs */}
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

      {loading ? (
        <div className="flex justify-center items-center h-40">
          <div className="w-8 h-8 border-4 border-[#3182F6] border-t-transparent rounded-full animate-spin" />
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
          {filtered.map((req) => (
            <div key={req.id} className="bg-white rounded-[20px] p-5 border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
              {/* Top row: requester + status */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold text-white"
                    style={{ backgroundColor: req.requester_color }}
                  >
                    {req.requester_name.charAt(0)}
                  </div>
                  <span className="text-[15px] font-bold text-[#191F28]">{req.requester_name}</span>
                </div>
                {getStatusBadge(req.status)}
              </div>

              {/* Slot info */}
              <div className="flex flex-wrap gap-3 mb-3 text-[13px] text-[#4E5968]">
                <span className="flex items-center gap-1 font-medium">
                  <Clock className="w-3.5 h-3.5 text-[#8B95A1]" />
                  {req.slot_date ? format(new Date(req.slot_date), "M월 d일 (EEE)", { locale: ko }) : ""}
                </span>
                <span className="font-medium">{req.start_time.slice(0, 5)} ~ {req.end_time.slice(0, 5)}</span>
                <span
                  className="flex items-center gap-1 font-bold px-2 py-0.5 rounded-md text-white text-[12px]"
                  style={{ backgroundColor: LOCATION_COLORS[req.work_location] }}
                >
                  <MapPin className="w-3 h-3" />{LOCATION_LABELS[req.work_location]}
                </span>
              </div>

              {req.reason && (
                <p className="text-[13px] text-[#8B95A1] mb-3 bg-[#F9FAFB] rounded-xl px-3 py-2">
                  사유: <span className="text-[#4E5968] font-medium">{req.reason}</span>
                </p>
              )}

              {req.status === "filled" && req.accepted_name && (
                <p className="text-[13px] text-[#00B761] font-bold mb-3">
                  대타: {req.accepted_name}님이 수락했어요
                </p>
              )}

              {req.status === "rejected" && req.reject_reason && (
                <p className="text-[13px] text-[#E03131] mb-3">
                  반려 사유: {req.reject_reason}
                </p>
              )}

              {/* Actions (only for pending) */}
              {req.status === "pending" && (
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => setRejectTarget(req)}
                    className="flex-1 py-2.5 bg-[#F9FAFB] hover:bg-[#F2F4F6] border border-slate-200 text-[#4E5968] rounded-xl text-[13px] font-bold transition-all"
                  >
                    반려하기
                  </button>
                  <button
                    onClick={() => openApproveSheet(req)}
                    className="flex-1 py-2.5 bg-[#3182F6] hover:bg-[#1B64DA] text-white rounded-xl text-[13px] font-bold transition-all"
                  >
                    승인하기
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reject Bottom Sheet */}
      {rejectTarget && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setRejectTarget(null)} />
          <div className="relative w-full max-w-md bg-white rounded-t-[28px] px-5 pt-8 pb-10 shadow-2xl animate-in slide-in-from-bottom-4 duration-250">
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-9 h-1 bg-[#D1D6DB] rounded-full" />
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[18px] font-bold text-[#191F28]">반려 사유 입력</h3>
              <button onClick={() => setRejectTarget(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F4F6]">
                <X className="w-5 h-5 text-[#8B95A1]" />
              </button>
            </div>
            <p className="text-[14px] text-[#4E5968] mb-4">
              {rejectTarget.requester_name}님의 대타 요청을 반려해요.
            </p>
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="반려 사유를 입력해요 (선택)"
              className="w-full px-4 py-3 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6] mb-4"
            />
            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleReject}
                disabled={rejecting}
                className="w-full h-14 bg-[#FFEBEB] text-[#E03131] rounded-2xl font-bold text-[16px] disabled:opacity-50 active:scale-[0.98] transition-all"
              >
                {rejecting ? "처리 중..." : "반려하기"}
              </button>
              <button onClick={() => setRejectTarget(null)} className="w-full h-14 bg-[#F2F4F6] text-[#4E5968] rounded-2xl font-bold text-[16px]">
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve Bottom Sheet */}
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
              알림을 받을 직원을 선택해요. 자동으로 가능한 직원을 추천했어요.
            </p>

            <div className="space-y-2 mb-6">
              {profiles
                .filter((p) => p.id !== approveTarget.requester_id)
                .map((p) => {
                  const selected = eligibleIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setEligibleIds((prev) =>
                          selected ? prev.filter((id) => id !== p.id) : [...prev, p.id]
                        );
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                        selected
                          ? "bg-[#E8F3FF] border-[#3182F6] text-[#3182F6]"
                          : "bg-white border-slate-100 text-[#4E5968]"
                      }`}
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold text-white shrink-0"
                        style={{ backgroundColor: p.color_hex }}
                      >
                        {p.name.charAt(0)}
                      </div>
                      <span className="font-bold text-[14px] flex-1 text-left">{p.name}</span>
                      {selected && <Check className="w-4 h-4" />}
                    </button>
                  );
                })}
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleApprove}
                disabled={approving}
                className="w-full h-14 bg-[#3182F6] text-white rounded-2xl font-bold text-[16px] disabled:opacity-50 active:scale-[0.98] transition-all"
              >
                {approving ? "처리 중..." : `승인 및 알림 보내기 (${eligibleIds.length}명)`}
              </button>
              <button onClick={() => setApproveTarget(null)} className="w-full h-14 bg-[#F2F4F6] text-[#4E5968] rounded-2xl font-bold text-[16px]">
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
