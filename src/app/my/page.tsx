"use client";

import { useState } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { format, startOfMonth } from "date-fns";
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
  ChevronDown,
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
}

// 실제 근무 이력 중 스케줄 초과 세션
interface ExcessSession {
  date: string;           // "yyyy-MM-dd"
  scheduledEnd: string;   // "HH:MM" - 스케줄 종료 시간
  actualEnd: string;      // "HH:MM" - 실제 퇴근 시간
  excessMinutes: number;  // 초과 분
  alreadyRequested: boolean;
}

export default function MyPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [showOvertimeModal, setShowOvertimeModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState<ExcessSession | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: profile, mutate } = useSWR(
    user ? ["my-profile", user.id] : null,
    async ([, userId]) => {
      const supabase = createClient();
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
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
        .limit(30);
      return (data ?? []) as OvertimeRequest[];
    },
    { dedupingInterval: 30_000 }
  );

  // 실제 근무 이력 기반 초과 세션 계산 (이번 달)
  const { data: excessSessions = [], isLoading: excessLoading } = useSWR(
    user ? ["excess-sessions", user.id] : null,
    async ([, userId]) => {
      const supabase = createClient();
      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthStartStr = format(monthStart, "yyyy-MM-dd");
      const todayStr = format(now, "yyyy-MM-dd");

      // 이미 요청된 날짜 목록 (중복 방지)
      const requestedDates = new Set(overtimeRequests.map((r) => r.date));

      // 출근 로그 (날짜별 첫 IN)
      const { data: inLogs } = await supabase
        .from("attendance_logs")
        .select("created_at")
        .eq("profile_id", userId)
        .eq("type", "IN")
        .gte("created_at", monthStart.toISOString())
        .order("created_at", { ascending: true });

      // 퇴근 로그 (날짜별 마지막 OUT)
      const { data: outLogs } = await supabase
        .from("attendance_logs")
        .select("created_at")
        .eq("profile_id", userId)
        .eq("type", "OUT")
        .gte("created_at", monthStart.toISOString())
        .order("created_at", { ascending: true });

      const outByDate = new Map<string, string>(); // date → "HH:MM"
      (outLogs ?? []).forEach((l: any) => {
        const d = format(new Date(l.created_at), "yyyy-MM-dd");
        outByDate.set(d, format(new Date(l.created_at), "HH:mm"));
      });

      const workedDates = new Set<string>(
        (inLogs ?? []).map((l: any) => format(new Date(l.created_at), "yyyy-MM-dd"))
      );

      if (workedDates.size === 0) return [];

      // 스케줄 슬롯 조회
      const { data: wsData } = await supabase
        .from("weekly_schedules")
        .select("id")
        .eq("status", "confirmed")
        .gte("week_start", monthStartStr);

      const scheduledEndByDate = new Map<string, string>(); // date → 가장 늦은 종료 시간
      if (wsData && wsData.length > 0) {
        const wsIds = wsData.map((w: any) => w.id);
        const { data: slots } = await supabase
          .from("schedule_slots")
          .select("slot_date, end_time")
          .eq("profile_id", userId)
          .eq("status", "active")
          .in("weekly_schedule_id", wsIds)
          .gte("slot_date", monthStartStr)
          .lte("slot_date", todayStr);

        (slots ?? []).forEach((slot: any) => {
          const existing = scheduledEndByDate.get(slot.slot_date);
          if (!existing || slot.end_time > existing) {
            scheduledEndByDate.set(slot.slot_date, slot.end_time.slice(0, 5));
          }
        });
      }

      // 초과 세션 계산
      const sessions: ExcessSession[] = [];
      workedDates.forEach((date) => {
        const scheduledEnd = scheduledEndByDate.get(date);
        const actualEnd = outByDate.get(date);
        if (!scheduledEnd || !actualEnd) return;

        const [seh, sem] = scheduledEnd.split(":").map(Number);
        const [aeh, aem] = actualEnd.split(":").map(Number);
        const excessMins = (aeh * 60 + aem) - (seh * 60 + sem);

        if (excessMins > 0) {
          sessions.push({
            date,
            scheduledEnd,
            actualEnd,
            excessMinutes: excessMins,
            alreadyRequested: requestedDates.has(date),
          });
        }
      });

      return sessions.sort((a, b) => b.date.localeCompare(a.date));
    },
    { dedupingInterval: 30_000 }
  );

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const handleSubmitOvertime = async () => {
    if (!selectedSession) return;
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("overtime_requests").insert({
        profile_id: user!.id,
        date: selectedSession.date,
        start_time: selectedSession.scheduledEnd + ":00",
        end_time: selectedSession.actualEnd + ":00",
        reason: reason || null,
        status: "pending",
      });
      if (error) throw error;
      toast.success("추가근무 요청을 보냈어요", { description: "사장님이 확인 후 승인해드릴게요." });
      setShowOvertimeModal(false);
      setSelectedSession(null);
      setReason("");
      mutateOvertime();
    } catch {
      toast.error("요청에 실패했어요", { description: "잠시 후 다시 시도해주세요." });
    } finally {
      setSubmitting(false);
    }
  };

  const menuItems = [
    { icon: Clock, label: "근무 기록", description: "출퇴근 내역 확인하기", onClick: () => router.push("/attendances") },
    { icon: BookOpen, label: "이용 가이드", description: "앱 사용 방법 안내", onClick: () => router.push("/guide") },
  ];

  const pendingCount = overtimeRequests.filter((r) => r.status === "pending").length;
  const availableCount = excessSessions.filter((s) => !s.alreadyRequested).length;

  const statusInfo = {
    pending:  { label: "검토 중", color: "text-[#F59E0B]", bg: "bg-[#FFF7E6]", icon: Timer },
    approved: { label: "승인됨",  color: "text-[#3182F6]", bg: "bg-[#E8F3FF]", icon: CheckCircle2 },
    rejected: { label: "반려됨",  color: "text-[#F04452]", bg: "bg-[#FFF0F0]", icon: XCircle },
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#F2F4F6] font-pretendard pb-24">
      <header className="px-5 pt-5 pb-4">
        <h1 className="text-[22px] font-bold text-[#191F28]">마이</h1>
      </header>

      {/* 프로필 카드 */}
      <div className="px-5 mb-4">
        <button
          onClick={() => profile && setIsEditModalOpen(true)}
          className="w-full bg-white rounded-[24px] p-5 border border-slate-100 flex items-center gap-4 active:scale-[0.99] transition-transform text-left"
        >
          <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: profile?.color_hex || "#E5E8EB" }}>
            {profile?.color_hex
              ? <span className="text-white font-bold text-xl">{profile.name?.charAt(0)}</span>
              : <UserCircle className="w-8 h-8 text-[#8B95A1]" />}
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

      {/* 메뉴 */}
      <div className="px-5 mb-4">
        <div className="bg-white rounded-[24px] border border-slate-100 overflow-hidden">
          {menuItems.map(({ icon: Icon, label, description, onClick }, i) => (
            <button key={label} onClick={onClick}
              className={`w-full flex items-center gap-4 px-5 py-4 text-left active:bg-[#F9FAFB] transition-colors ${i < menuItems.length - 1 ? "border-b border-[#F2F4F6]" : ""}`}>
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
                {pendingCount > 0
                  ? `검토 중인 요청 ${pendingCount}건`
                  : availableCount > 0
                  ? `신청 가능한 초과 근무 ${availableCount}건`
                  : "승인 시 근무 시간에 반영돼요"}
              </p>
            </div>
            <button
              onClick={() => setShowOvertimeModal(true)}
              className="flex items-center gap-1.5 bg-[#3182F6] text-white px-3.5 py-2 rounded-full text-[13px] font-bold"
            >
              <Plus className="w-3.5 h-3.5" />
              요청하기
            </button>
          </div>

          {overtimeRequests.length === 0 ? (
            <div className="px-5 py-6 text-center text-[#8B95A1] text-[13px]">요청 내역이 없어요</div>
          ) : (
            overtimeRequests.map((req, i) => {
              const s = statusInfo[req.status];
              const StatusIcon = s.icon;
              return (
                <div key={req.id}
                  className={`px-5 py-4 ${i < overtimeRequests.length - 1 ? "border-b border-[#F2F4F6]" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-[#191F28]">
                        {format(new Date(req.date), "M월 d일 (eeee)", { locale: ko })}
                      </p>
                      <p className="text-[13px] text-[#4E5968] mt-0.5">
                        {req.start_time.slice(0, 5)} ~ {req.end_time.slice(0, 5)}
                      </p>
                      {req.reason && <p className="text-[12px] text-[#8B95A1] mt-1 line-clamp-1">{req.reason}</p>}
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
          <button onClick={() => router.push("/admin")}
            className="w-full bg-[#E8F3FF] rounded-[20px] px-5 py-4 flex items-center gap-3 active:scale-[0.99] transition-transform">
            <LayoutDashboard className="w-5 h-5 text-[#3182F6]" />
            <span className="text-[15px] font-bold text-[#3182F6]">관리자 대시보드로 이동하기</span>
            <ChevronRight className="w-4 h-4 text-[#3182F6] ml-auto" />
          </button>
        </div>
      )}

      {/* 로그아웃 */}
      <div className="px-5">
        <button onClick={() => setIsLogoutConfirmOpen(true)}
          className="w-full bg-white rounded-[20px] px-5 py-4 flex items-center gap-3 border border-slate-100 active:scale-[0.99] transition-transform">
          <LogOut className="w-5 h-5 text-[#F04452]" />
          <span className="text-[15px] font-bold text-[#F04452]">로그아웃</span>
        </button>
      </div>

      {/* ─── 추가근무 요청 모달 ─── */}
      {showOvertimeModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-5">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setShowOvertimeModal(false); setSelectedSession(null); setReason(""); }} />
          <div className="relative bg-white rounded-[28px] w-full max-w-sm shadow-2xl overflow-hidden">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4">
              <h2 className="text-[18px] font-bold text-[#191F28]">추가근무 요청하기</h2>
              <button onClick={() => { setShowOvertimeModal(false); setSelectedSession(null); setReason(""); }}
                className="w-8 h-8 rounded-full bg-[#F2F4F6] flex items-center justify-center">
                <X className="w-4 h-4 text-[#4E5968]" />
              </button>
            </div>

            <div className="px-6 pb-6 space-y-4">
              {/* 초과 세션 선택 */}
              <div>
                <p className="text-[13px] font-semibold text-[#4E5968] mb-2">초과 근무 날짜 선택</p>
                {excessLoading ? (
                  <div className="h-14 bg-[#F2F4F6] rounded-[14px] animate-pulse" />
                ) : excessSessions.length === 0 ? (
                  <div className="bg-[#F2F4F6] rounded-[14px] px-4 py-4 text-center">
                    <p className="text-[13px] text-[#8B95A1]">이번 달 초과 근무 이력이 없어요</p>
                    <p className="text-[11px] text-[#B0B8C1] mt-1">스케줄 종료 시간 이후에 퇴근한 날만 표시돼요</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {excessSessions.map((session) => {
                      const exH = Math.floor(session.excessMinutes / 60);
                      const exM = session.excessMinutes % 60;
                      const isSelected = selectedSession?.date === session.date;
                      const isRequested = session.alreadyRequested;
                      return (
                        <button
                          key={session.date}
                          disabled={isRequested}
                          onClick={() => setSelectedSession(isSelected ? null : session)}
                          className={`w-full text-left rounded-[14px] px-4 py-3 border-2 transition-all ${
                            isRequested
                              ? "border-[#E5E8EB] bg-[#F9FAFB] opacity-50 cursor-not-allowed"
                              : isSelected
                              ? "border-[#3182F6] bg-[#E8F3FF]"
                              : "border-[#E5E8EB] bg-white active:scale-[0.99]"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className={`text-[14px] font-bold ${isSelected ? "text-[#3182F6]" : "text-[#191F28]"}`}>
                                {format(new Date(session.date), "M월 d일 (eeee)", { locale: ko })}
                              </p>
                              <p className="text-[12px] text-[#4E5968] mt-0.5">
                                스케줄 ~{session.scheduledEnd} → 실제 ~{session.actualEnd}
                              </p>
                            </div>
                            <div className="text-right shrink-0 ml-3">
                              {isRequested ? (
                                <span className="text-[11px] font-bold text-[#8B95A1]">요청됨</span>
                              ) : (
                                <span className={`text-[13px] font-bold ${isSelected ? "text-[#3182F6]" : "text-[#F59E0B]"}`}>
                                  +{exH > 0 ? `${exH}시간 ` : ""}{exM > 0 ? `${exM}분` : ""}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 사유 입력 (세션 선택된 경우만) */}
              {selectedSession && (
                <div>
                  <p className="text-[13px] font-semibold text-[#4E5968] mb-2">사유 (선택)</p>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="추가근무 사유를 간단히 적어주세요"
                    rows={2}
                    className="w-full bg-[#F2F4F6] rounded-[14px] px-4 py-3 text-[14px] text-[#191F28] placeholder:text-[#B0B8C1] outline-none resize-none"
                  />
                </div>
              )}

              <button
                onClick={handleSubmitOvertime}
                disabled={!selectedSession || submitting}
                className="w-full bg-[#3182F6] text-white rounded-[16px] py-4 text-[16px] font-bold active:scale-[0.99] transition-all disabled:opacity-40"
              >
                {submitting ? "요청 중..." : selectedSession
                  ? `${format(new Date(selectedSession.date), "M월 d일")} 추가근무 요청하기`
                  : "날짜를 선택해주세요"}
              </button>
            </div>
          </div>
        </div>
      )}

      {profile && (
        <MyInfoModal isOpen={isEditModalOpen} profile={profile}
          onClose={() => setIsEditModalOpen(false)} onUpdate={() => mutate()} />
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
