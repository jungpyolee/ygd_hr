"use client";

import { useState } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";
import {
  ChevronLeft,
  Check,
  X,
  Plus,
  Timer,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import ConfirmDialog from "@/components/ui/confirm-dialog";

interface OvertimeRequest {
  id: string;
  profile_id: string;
  date: string;
  start_time: string;
  end_time: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  created_at: string;
  profiles: { name: string; color_hex: string | null };
}

interface Employee {
  id: string;
  name: string;
  color_hex: string | null;
}

export default function AdminOvertimePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"requests" | "assign">("requests");
  const [rejectTarget, setRejectTarget] = useState<{ id: string; name: string } | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [assignForm, setAssignForm] = useState({
    profile_id: "",
    date: format(new Date(), "yyyy-MM-dd"),
    start_time: "",
    end_time: "",
    reason: "",
  });

  const { data: requests = [], mutate: mutateRequests } = useSWR(
    "admin-overtime-requests",
    async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("overtime_requests")
        .select("*, profiles!profile_id(name, color_hex)")
        .order("created_at", { ascending: false });
      return (data ?? []) as OvertimeRequest[];
    },
    { dedupingInterval: 15_000, revalidateOnFocus: true }
  );

  const { data: employees = [] } = useSWR("admin-employees-list", async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, name, color_hex")
      .eq("is_active", true)
      .order("name");
    return (data ?? []) as Employee[];
  });

  const handleApprove = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("overtime_requests")
      .update({ status: "approved" })
      .eq("id", id);
    if (error) {
      toast.error("승인에 실패했어요", { description: "잠시 후 다시 시도해주세요." });
    } else {
      toast.success("추가근무를 승인했어요");
      mutateRequests();
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("overtime_requests")
      .update({ status: "rejected", note: rejectNote || null })
      .eq("id", rejectTarget.id);
    if (error) {
      toast.error("반려에 실패했어요", { description: "잠시 후 다시 시도해주세요." });
    } else {
      toast.success("요청을 반려했어요");
      setRejectTarget(null);
      setRejectNote("");
      mutateRequests();
    }
  };

  const handleAssign = async () => {
    if (!assignForm.profile_id) {
      toast.error("직원을 선택해주세요");
      return;
    }
    if (!assignForm.start_time || !assignForm.end_time) {
      toast.error("시간을 입력해주세요", { description: "시작 시간과 종료 시간이 필요해요." });
      return;
    }
    if (assignForm.start_time >= assignForm.end_time) {
      toast.error("시간을 확인해주세요", { description: "종료 시간이 시작 시간보다 늦어야 해요." });
      return;
    }
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("overtime_requests").insert({
        profile_id: assignForm.profile_id,
        date: assignForm.date,
        start_time: assignForm.start_time,
        end_time: assignForm.end_time,
        reason: assignForm.reason || null,
        status: "approved",
      });
      if (error) throw error;
      toast.success("추가근무를 할당했어요");
      setShowAssignForm(false);
      setAssignForm({
        profile_id: "",
        date: format(new Date(), "yyyy-MM-dd"),
        start_time: "",
        end_time: "",
        reason: "",
      });
      mutateRequests();
    } catch {
      toast.error("할당에 실패했어요", { description: "잠시 후 다시 시도해주세요." });
    } finally {
      setSubmitting(false);
    }
  };

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const processedRequests = requests.filter((r) => r.status !== "pending");

  const statusInfo = {
    pending:  { label: "검토 중", color: "text-[#F59E0B]", bg: "bg-[#FFF7E6]", icon: Timer },
    approved: { label: "승인됨",  color: "text-[#3182F6]", bg: "bg-[#E8F3FF]", icon: CheckCircle2 },
    rejected: { label: "반려됨",  color: "text-[#F04452]", bg: "bg-[#FFF0F0]", icon: XCircle },
  };

  return (
    <div className="min-h-screen bg-[#F2F4F6] font-pretendard pb-10">
      {/* 헤더 */}
      <header className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 bg-white/80 backdrop-blur-md border-b border-[#E5E8EB]">
        <button
          onClick={() => router.back()}
          className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-[#F2F4F6]"
        >
          <ChevronLeft className="w-5 h-5 text-[#191F28]" />
        </button>
        <h1 className="text-[17px] font-bold text-[#191F28]">추가근무 관리</h1>
        <button
          onClick={() => setShowAssignForm(true)}
          className="ml-auto flex items-center gap-1.5 bg-[#3182F6] text-white px-3.5 py-2 rounded-full text-[13px] font-bold"
        >
          <Plus className="w-4 h-4" />
          직접 할당
        </button>
      </header>

      {/* 탭 */}
      <div className="px-5 pt-4 pb-2">
        <div className="flex bg-white rounded-2xl p-1 border border-[#E5E8EB] gap-1">
          <button
            onClick={() => setActiveTab("requests")}
            className={`flex-1 py-2.5 rounded-xl text-[14px] font-bold transition-all ${
              activeTab === "requests" ? "bg-[#3182F6] text-white" : "text-[#8B95A1]"
            }`}
          >
            직원 요청
            {pendingRequests.length > 0 && (
              <span className="ml-1.5 bg-red-400 text-white text-[11px] rounded-full px-1.5 py-0.5">
                {pendingRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("assign")}
            className={`flex-1 py-2.5 rounded-xl text-[14px] font-bold transition-all ${
              activeTab === "assign" ? "bg-[#3182F6] text-white" : "text-[#8B95A1]"
            }`}
          >
            처리 내역
          </button>
        </div>
      </div>

      {/* 직원 요청 탭 */}
      {activeTab === "requests" && (
        <div className="px-5 py-3 space-y-3">
          {pendingRequests.length === 0 ? (
            <div className="bg-white rounded-[24px] p-10 flex flex-col items-center gap-2 border border-slate-100">
              <CheckCircle2 className="w-10 h-10 text-[#D1D6DB]" />
              <p className="text-[14px] text-[#8B95A1]">검토할 요청이 없어요</p>
            </div>
          ) : (
            pendingRequests.map((req) => {
              const startH = req.start_time.slice(0, 5);
              const endH = req.end_time.slice(0, 5);
              return (
                <div key={req.id} className="bg-white rounded-[20px] p-5 border border-slate-100">
                  <div className="flex items-start gap-3 mb-4">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white font-bold"
                      style={{ backgroundColor: req.profiles?.color_hex || "#8B95A1" }}
                    >
                      {req.profiles?.name?.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-bold text-[#191F28]">{req.profiles?.name}</p>
                      <p className="text-[13px] text-[#4E5968] mt-0.5">
                        {format(new Date(req.date), "M월 d일 (eeee)", { locale: ko })} · {startH} ~ {endH}
                      </p>
                      {req.reason && (
                        <p className="text-[12px] text-[#8B95A1] mt-1 leading-snug">{req.reason}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRejectTarget({ id: req.id, name: req.profiles?.name })}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-[12px] bg-[#F2F4F6] text-[#4E5968] text-[14px] font-bold active:scale-[0.98] transition-all"
                    >
                      <X className="w-4 h-4" />
                      반려하기
                    </button>
                    <button
                      onClick={() => handleApprove(req.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-[12px] bg-[#3182F6] text-white text-[14px] font-bold active:scale-[0.98] transition-all"
                    >
                      <Check className="w-4 h-4" />
                      승인하기
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 처리 내역 탭 */}
      {activeTab === "assign" && (
        <div className="px-5 py-3 space-y-3">
          {processedRequests.length === 0 ? (
            <div className="bg-white rounded-[24px] p-10 flex flex-col items-center gap-2 border border-slate-100">
              <Timer className="w-10 h-10 text-[#D1D6DB]" />
              <p className="text-[14px] text-[#8B95A1]">처리된 내역이 없어요</p>
            </div>
          ) : (
            processedRequests.map((req) => {
              const s = statusInfo[req.status];
              const StatusIcon = s.icon;
              const startH = req.start_time.slice(0, 5);
              const endH = req.end_time.slice(0, 5);
              return (
                <div key={req.id} className="bg-white rounded-[20px] px-5 py-4 border border-slate-100">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-[13px]"
                        style={{ backgroundColor: req.profiles?.color_hex || "#8B95A1" }}
                      >
                        {req.profiles?.name?.charAt(0)}
                      </div>
                      <div>
                        <p className="text-[14px] font-bold text-[#191F28]">{req.profiles?.name}</p>
                        <p className="text-[12px] text-[#4E5968] mt-0.5">
                          {format(new Date(req.date), "M월 d일", { locale: ko })} · {startH}~{endH}
                        </p>
                        {req.note && (
                          <p className="text-[12px] text-[#8B95A1] mt-1">{req.note}</p>
                        )}
                      </div>
                    </div>
                    <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 ${s.bg} ${s.color}`}>
                      <StatusIcon className="w-3 h-3" />
                      {s.label}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 직접 할당 바텀시트 */}
      {showAssignForm && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowAssignForm(false)}
          />
          <div className="relative bg-white rounded-t-[28px] px-5 pt-5 pb-8 space-y-4 animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-[18px] font-bold text-[#191F28]">추가근무 할당하기</h2>
              <button
                onClick={() => setShowAssignForm(false)}
                className="w-8 h-8 rounded-full bg-[#F2F4F6] flex items-center justify-center"
              >
                <X className="w-4 h-4 text-[#4E5968]" />
              </button>
            </div>

            {/* 직원 선택 */}
            <div>
              <label className="text-[13px] font-semibold text-[#4E5968] mb-1.5 block">직원</label>
              <select
                value={assignForm.profile_id}
                onChange={(e) => setAssignForm((f) => ({ ...f, profile_id: e.target.value }))}
                className="w-full bg-[#F2F4F6] rounded-[14px] px-4 py-3 text-[15px] font-semibold text-[#191F28] outline-none"
              >
                <option value="">직원을 선택해주세요</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>

            {/* 날짜 */}
            <div>
              <label className="text-[13px] font-semibold text-[#4E5968] mb-1.5 block">날짜</label>
              <input
                type="date"
                value={assignForm.date}
                onChange={(e) => setAssignForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full bg-[#F2F4F6] rounded-[14px] px-4 py-3 text-[15px] font-semibold text-[#191F28] outline-none"
              />
            </div>

            {/* 시간 */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[13px] font-semibold text-[#4E5968] mb-1.5 block">시작 시간</label>
                <input
                  type="time"
                  value={assignForm.start_time}
                  onChange={(e) => setAssignForm((f) => ({ ...f, start_time: e.target.value }))}
                  className="w-full bg-[#F2F4F6] rounded-[14px] px-4 py-3 text-[15px] font-semibold text-[#191F28] outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="text-[13px] font-semibold text-[#4E5968] mb-1.5 block">종료 시간</label>
                <input
                  type="time"
                  value={assignForm.end_time}
                  onChange={(e) => setAssignForm((f) => ({ ...f, end_time: e.target.value }))}
                  className="w-full bg-[#F2F4F6] rounded-[14px] px-4 py-3 text-[15px] font-semibold text-[#191F28] outline-none"
                />
              </div>
            </div>

            {/* 사유 */}
            <div>
              <label className="text-[13px] font-semibold text-[#4E5968] mb-1.5 block">사유 (선택)</label>
              <textarea
                value={assignForm.reason}
                onChange={(e) => setAssignForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="추가근무 내용을 간단히 적어주세요"
                rows={2}
                className="w-full bg-[#F2F4F6] rounded-[14px] px-4 py-3 text-[14px] text-[#191F28] placeholder:text-[#B0B8C1] outline-none resize-none"
              />
            </div>

            <button
              onClick={handleAssign}
              disabled={submitting}
              className="w-full bg-[#3182F6] text-white rounded-[16px] py-4 text-[16px] font-bold active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {submitting ? "할당 중..." : "추가근무 승인 처리하기"}
            </button>
          </div>
        </div>
      )}

      {/* 반려 확인 다이얼로그 */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => { setRejectTarget(null); setRejectNote(""); }}
          />
          <div className="relative bg-white rounded-t-[28px] px-5 pt-5 pb-8 space-y-4 animate-in slide-in-from-bottom duration-300">
            <h2 className="text-[18px] font-bold text-[#191F28]">
              {rejectTarget.name}님 요청 반려
            </h2>
            <div>
              <label className="text-[13px] font-semibold text-[#4E5968] mb-1.5 block">반려 사유 (선택)</label>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="반려 이유를 적으면 직원에게 전달돼요"
                rows={3}
                className="w-full bg-[#F2F4F6] rounded-[14px] px-4 py-3 text-[14px] text-[#191F28] placeholder:text-[#B0B8C1] outline-none resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setRejectTarget(null); setRejectNote(""); }}
                className="flex-1 py-3.5 rounded-[14px] bg-[#F2F4F6] text-[#4E5968] text-[15px] font-bold"
              >
                취소
              </button>
              <button
                onClick={handleReject}
                className="flex-1 py-3.5 rounded-[14px] bg-[#F04452] text-white text-[15px] font-bold"
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
