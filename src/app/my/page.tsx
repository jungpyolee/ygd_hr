"use client";

import { useState } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";
import {
  Clock,
  BookOpen,
  ChevronRight,
  LogOut,
  UserCircle,
  LayoutDashboard,
  Plus,
  X,
  CheckCircle2,
  XCircle,
  Timer,
} from "lucide-react";
import MyInfoModal from "@/components/MyInfoModal";
import PushNotificationSettings from "@/components/PushNotificationSettings";
import ConfirmDialog from "@/components/ui/confirm-dialog";

interface OvertimeRequest {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  created_at: string;
}

export default function MyPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [showOvertimeForm, setShowOvertimeForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    date: format(new Date(), "yyyy-MM-dd"),
    start_time: "",
    end_time: "",
    reason: "",
  });

  const { data: profile, mutate } = useSWR(
    user ? ["my-profile", user.id] : null,
    async ([, userId]) => {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      return data;
    },
    { dedupingInterval: 60_000 }
  );

  const { data: overtimeRequests = [], mutate: mutateOvertime } = useSWR(
    user ? ["overtime-requests", user.id] : null,
    async ([, userId]) => {
      const supabase = createClient();
      const { data } = await supabase
        .from("overtime_requests")
        .select("*")
        .eq("profile_id", userId)
        .order("date", { ascending: false })
        .limit(20);
      return (data ?? []) as OvertimeRequest[];
    },
    { dedupingInterval: 30_000 }
  );

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const handleSubmitOvertime = async () => {
    if (!form.start_time || !form.end_time) {
      toast.error("시간을 입력해주세요", { description: "시작 시간과 종료 시간 모두 필요해요." });
      return;
    }
    if (form.start_time >= form.end_time) {
      toast.error("시간을 확인해주세요", { description: "종료 시간이 시작 시간보다 늦어야 해요." });
      return;
    }
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("overtime_requests").insert({
        profile_id: user!.id,
        date: form.date,
        start_time: form.start_time,
        end_time: form.end_time,
        reason: form.reason || null,
        status: "pending",
      });
      if (error) throw error;
      toast.success("추가근무 요청을 보냈어요", { description: "사장님이 확인 후 승인해드릴게요." });
      setShowOvertimeForm(false);
      setForm({ date: format(new Date(), "yyyy-MM-dd"), start_time: "", end_time: "", reason: "" });
      mutateOvertime();
    } catch {
      toast.error("요청에 실패했어요", { description: "잠시 후 다시 시도해주세요." });
    } finally {
      setSubmitting(false);
    }
  };

  const menuItems = [
    {
      icon: Clock,
      label: "근무 기록",
      description: "출퇴근 내역 확인하기",
      onClick: () => router.push("/attendances"),
    },
    {
      icon: BookOpen,
      label: "이용 가이드",
      description: "앱 사용 방법 안내",
      onClick: () => router.push("/guide"),
    },
  ];

  const pendingCount = overtimeRequests.filter((r) => r.status === "pending").length;

  const statusInfo = {
    pending:  { label: "검토 중",  color: "text-[#F59E0B]", bg: "bg-[#FFF7E6]", icon: Timer },
    approved: { label: "승인됨",   color: "text-[#3182F6]", bg: "bg-[#E8F3FF]", icon: CheckCircle2 },
    rejected: { label: "반려됨",   color: "text-[#F04452]", bg: "bg-[#FFF0F0]", icon: XCircle },
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#F2F4F6] font-pretendard pb-24">
      {/* 헤더 */}
      <header className="px-5 pt-5 pb-4">
        <h1 className="text-[22px] font-bold text-[#191F28]">마이</h1>
      </header>

      {/* 프로필 카드 */}
      <div className="px-5 mb-4">
        <button
          onClick={() => profile && setIsEditModalOpen(true)}
          className="w-full bg-white rounded-[24px] p-5 border border-slate-100 flex items-center gap-4 active:scale-[0.99] transition-transform text-left"
        >
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: profile?.color_hex || "#E5E8EB" }}
          >
            {profile?.color_hex ? (
              <span className="text-white font-bold text-xl">{profile.name?.charAt(0)}</span>
            ) : (
              <UserCircle className="w-8 h-8 text-[#8B95A1]" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[17px] font-bold text-[#191F28]">{profile?.name ?? "이름 없음"}</p>
            <p className="text-[13px] text-[#8B95A1] mt-0.5">{profile?.phone ?? "전화번호 미등록"}</p>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[13px] font-semibold text-[#3182F6]">편집하기</span>
            <ChevronRight className="w-4 h-4 text-[#3182F6]" />
          </div>
        </button>
      </div>

      {/* 메뉴 목록 */}
      <div className="px-5 mb-4">
        <div className="bg-white rounded-[24px] border border-slate-100 overflow-hidden">
          {menuItems.map(({ icon: Icon, label, description, onClick }, i) => (
            <button
              key={label}
              onClick={onClick}
              className={`w-full flex items-center gap-4 px-5 py-4 text-left active:bg-[#F9FAFB] transition-colors ${
                i < menuItems.length - 1 ? "border-b border-[#F2F4F6]" : ""
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-[#F2F4F6] flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-[#4E5968]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold text-[#191F28]">{label}</p>
                <p className="text-[12px] text-[#8B95A1] mt-0.5">{description}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-[#D1D6DB] shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* 추가근무 요청 섹션 */}
      <div className="px-5 mb-4">
        <div className="bg-white rounded-[24px] border border-slate-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#F2F4F6]">
            <div>
              <p className="text-[15px] font-bold text-[#191F28]">추가근무 요청</p>
              <p className="text-[12px] text-[#8B95A1] mt-0.5">
                {pendingCount > 0 ? `검토 중인 요청 ${pendingCount}건` : "승인 시 근무 시간에 반영돼요"}
              </p>
            </div>
            <button
              onClick={() => setShowOvertimeForm(true)}
              className="w-9 h-9 bg-[#3182F6] rounded-full flex items-center justify-center shrink-0"
              aria-label="추가근무 요청하기"
            >
              <Plus className="w-4 h-4 text-white" />
            </button>
          </div>

          {overtimeRequests.length === 0 ? (
            <div className="px-5 py-6 text-center text-[#8B95A1] text-[13px]">
              요청 내역이 없어요
            </div>
          ) : (
            overtimeRequests.map((req, i) => {
              const s = statusInfo[req.status];
              const StatusIcon = s.icon;
              const startH = req.start_time.slice(0, 5);
              const endH = req.end_time.slice(0, 5);
              return (
                <div
                  key={req.id}
                  className={`px-5 py-4 ${i < overtimeRequests.length - 1 ? "border-b border-[#F2F4F6]" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-[#191F28]">
                        {format(new Date(req.date), "M월 d일 (eeee)", { locale: ko })}
                      </p>
                      <p className="text-[13px] text-[#4E5968] mt-0.5">
                        {startH} ~ {endH}
                      </p>
                      {req.reason && (
                        <p className="text-[12px] text-[#8B95A1] mt-1 line-clamp-1">{req.reason}</p>
                      )}
                      {req.note && req.status === "rejected" && (
                        <p className="text-[12px] text-[#F04452] mt-1">반려 사유: {req.note}</p>
                      )}
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
      </div>

      {/* 알림 설정 */}
      <div className="px-5 mb-4">
        <div className="bg-white rounded-[24px] border border-slate-100 px-5 py-4">
          <p className="text-[13px] font-semibold text-[#8B95A1] mb-3">알림 설정</p>
          <PushNotificationSettings />
        </div>
      </div>

      {/* 어드민 이동 */}
      {profile?.role === "admin" && (
        <div className="px-5 mb-4">
          <button
            onClick={() => router.push("/admin")}
            className="w-full bg-[#E8F3FF] rounded-[20px] px-5 py-4 flex items-center gap-3 active:scale-[0.99] transition-transform"
          >
            <LayoutDashboard className="w-5 h-5 text-[#3182F6]" />
            <span className="text-[15px] font-bold text-[#3182F6]">관리자 대시보드로 이동하기</span>
            <ChevronRight className="w-4 h-4 text-[#3182F6] ml-auto" />
          </button>
        </div>
      )}

      {/* 로그아웃 */}
      <div className="px-5">
        <button
          onClick={() => setIsLogoutConfirmOpen(true)}
          className="w-full bg-white rounded-[20px] px-5 py-4 flex items-center gap-3 border border-slate-100 active:scale-[0.99] transition-transform"
        >
          <LogOut className="w-5 h-5 text-[#F04452]" />
          <span className="text-[15px] font-bold text-[#F04452]">로그아웃</span>
        </button>
      </div>

      {/* 추가근무 요청 폼 바텀시트 */}
      {showOvertimeForm && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowOvertimeForm(false)}
          />
          <div className="relative bg-white rounded-t-[28px] px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-4 animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-[18px] font-bold text-[#191F28]">추가근무 요청하기</h2>
              <button
                onClick={() => setShowOvertimeForm(false)}
                className="w-8 h-8 rounded-full bg-[#F2F4F6] flex items-center justify-center"
              >
                <X className="w-4 h-4 text-[#4E5968]" />
              </button>
            </div>

            {/* 날짜 */}
            <div>
              <label className="text-[13px] font-semibold text-[#4E5968] mb-1.5 block">날짜</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full bg-[#F2F4F6] rounded-[14px] px-4 py-3 text-[15px] font-semibold text-[#191F28] outline-none"
              />
            </div>

            {/* 시간 */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[13px] font-semibold text-[#4E5968] mb-1.5 block">시작 시간</label>
                <input
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                  className="w-full bg-[#F2F4F6] rounded-[14px] px-4 py-3 text-[15px] font-semibold text-[#191F28] outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="text-[13px] font-semibold text-[#4E5968] mb-1.5 block">종료 시간</label>
                <input
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                  className="w-full bg-[#F2F4F6] rounded-[14px] px-4 py-3 text-[15px] font-semibold text-[#191F28] outline-none"
                />
              </div>
            </div>

            {/* 사유 */}
            <div>
              <label className="text-[13px] font-semibold text-[#4E5968] mb-1.5 block">사유 (선택)</label>
              <textarea
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="추가근무 사유를 간단히 적어주세요"
                rows={3}
                className="w-full bg-[#F2F4F6] rounded-[14px] px-4 py-3 text-[14px] text-[#191F28] placeholder:text-[#B0B8C1] outline-none resize-none"
              />
            </div>

            <button
              onClick={handleSubmitOvertime}
              disabled={submitting}
              className="w-full bg-[#3182F6] text-white rounded-[16px] py-4 text-[16px] font-bold active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {submitting ? "요청 중..." : "요청 보내기"}
            </button>
          </div>
        </div>
      )}

      {profile && (
        <MyInfoModal
          isOpen={isEditModalOpen}
          profile={profile}
          onClose={() => setIsEditModalOpen(false)}
          onUpdate={() => mutate()}
        />
      )}

      <ConfirmDialog
        isOpen={isLogoutConfirmOpen}
        title="로그아웃 할까요?"
        description="다시 로그인하려면 이메일과 비밀번호가 필요해요."
        confirmLabel="로그아웃하기"
        variant="destructive"
        onConfirm={handleLogout}
        onCancel={() => setIsLogoutConfirmOpen(false)}
      />
    </div>
  );
}
