"use client";

import { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { createClient } from "@/lib/supabase";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Calendar, MapPin, Clock, ArrowRightLeft, X, Check } from "lucide-react";
import { format, addWeeks, subWeeks, startOfWeek, addDays, isSameDay, isToday } from "date-fns";
import { ko } from "date-fns/locale";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

interface ScheduleSlot {
  id: string;
  weekly_schedule_id: string;
  profile_id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  work_location: string;
  cafe_positions: string[];
  status: string;
  notes: string | null;
}

interface SubstituteRequest {
  id: string;
  slot_id: string;
  requester_id: string;
  reason: string | null;
  status: string;
  eligible_profile_ids: string[];
  accepted_by: string | null;
  requester_name: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  work_location: string;
  cafe_positions: string[];
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
const LOCATION_BG: Record<string, string> = {
  cafe: "#E8F3FF",
  factory: "#E6FAF0",
  catering: "#FFF7E6",
};
const CAFE_POSITION_LABELS: Record<string, string> = {
  hall: "홀",
  kitchen: "주방",
  showroom: "쇼룸",
};
const DAY_LABELS_SHORT = ["일", "월", "화", "수", "목", "금", "토"];

function getWeekDates(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

function SchedulePageInner() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string>("");
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);

  // Substitute request bottom sheet
  const [requestTarget, setRequestTarget] = useState<ScheduleSlot | null>(null);
  const [requestReason, setRequestReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Incoming substitute requests (대타 수락/거절)
  const [incomingRequests, setIncomingRequests] = useState<SubstituteRequest[]>([]);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [activeRequest, setActiveRequest] = useState<SubstituteRequest | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setProfileId(user.id);
      const { data: profileData } = await supabase.from("profiles").select("name").eq("id", user.id).single();
      if (profileData) setProfileName(profileData.name);
    };
    init();
  }, []);

  const weekDates = getWeekDates(weekStart);

  const fetchSlots = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    try {
      const weekStartStr = format(weekStart, "yyyy-MM-dd");

      const { data: wsData } = await supabase
        .from("weekly_schedules")
        .select("id")
        .eq("status", "confirmed")
        .eq("week_start", weekStartStr);

      if (!wsData || wsData.length === 0) {
        setSlots([]);
        return;
      }

      const wsIds = wsData.map((ws: { id: string }) => ws.id);
      const { data: slotData } = await supabase
        .from("schedule_slots")
        .select("*")
        .eq("profile_id", profileId)
        .in("weekly_schedule_id", wsIds)
        .eq("status", "active");

      setSlots((slotData as ScheduleSlot[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [profileId, weekStart, supabase]);

  const fetchIncomingRequests = useCallback(async () => {
    if (!profileId) return;

    // Step 1: DB 레벨에서 eligible_profile_ids 필터링 (성능 개선)
    const { data: requests } = await supabase
      .from("substitute_requests")
      .select("id, slot_id, requester_id, reason, status, eligible_profile_ids, accepted_by")
      .eq("status", "approved")
      .contains("eligible_profile_ids", [profileId]);

    if (!requests || requests.length === 0) {
      setIncomingRequests([]);
      return;
    }

    // Step 2: 이미 응답한 요청 제외
    const requestIds = requests.map((r: any) => r.id);
    const { data: responses } = await supabase
      .from("substitute_responses")
      .select("request_id")
      .eq("profile_id", profileId)
      .in("request_id", requestIds);

    const respondedIds = new Set((responses || []).map((r: any) => r.request_id));
    const pending = requests.filter((r: any) => !respondedIds.has(r.id));

    if (pending.length === 0) {
      setIncomingRequests([]);
      return;
    }

    // Step 3: 슬롯 정보와 요청자 이름을 병렬로 직접 조회 (JOIN RLS 우회)
    const slotIds = pending.map((r: any) => r.slot_id);
    const requesterIds = [...new Set(pending.map((r: any) => r.requester_id))] as string[];

    const [{ data: slots }, { data: requesters }] = await Promise.all([
      supabase
        .from("schedule_slots")
        .select("id, slot_date, start_time, end_time, work_location, cafe_positions")
        .in("id", slotIds),
      supabase
        .from("profiles")
        .select("id, name")
        .in("id", requesterIds),
    ]);

    const slotMap = new Map((slots || []).map((s: any) => [s.id, s]));
    const requesterMap = new Map((requesters || []).map((p: any) => [p.id, p]));

    const result: SubstituteRequest[] = pending.map((r: any) => {
      const slot = slotMap.get(r.slot_id);
      const requester = requesterMap.get(r.requester_id);
      return {
        id: r.id,
        slot_id: r.slot_id,
        requester_id: r.requester_id,
        reason: r.reason,
        status: r.status,
        eligible_profile_ids: r.eligible_profile_ids || [],
        accepted_by: r.accepted_by,
        requester_name: requester?.name || "알 수 없음",
        slot_date: slot?.slot_date || "",
        start_time: slot?.start_time || "",
        end_time: slot?.end_time || "",
        work_location: slot?.work_location || "",
        cafe_positions: slot?.cafe_positions || [],
      };
    });

    setIncomingRequests(result);
  }, [profileId, supabase]);

  useEffect(() => {
    if (profileId) {
      fetchSlots();
      fetchIncomingRequests();
    }
  }, [fetchSlots, fetchIncomingRequests, profileId]);

  // URL request_id 파라미터 → 해당 요청 바텀시트 자동 오픈
  useEffect(() => {
    const requestId = searchParams.get("request_id");
    if (!requestId || incomingRequests.length === 0) return;
    const target = incomingRequests.find((r) => r.id === requestId);
    if (target) setActiveRequest(target);
  }, [incomingRequests, searchParams]);

  const handleAcceptSubstitute = async (req: SubstituteRequest) => {
    if (!profileId) return;
    setRespondingId(req.id);

    const { error } = await supabase.rpc("accept_substitute", {
      p_request_id: req.id,
      p_acceptor_id: profileId,
    });

    if (error) {
      if (error.message.includes("ALREADY_FILLED_OR_NOT_ELIGIBLE")) {
        toast.error("이미 다른 분이 수락했어요", { description: "대타가 확정됐어요." });
      } else {
        toast.error("수락에 실패했어요", { description: "잠시 후 다시 시도해주세요." });
      }
      setRespondingId(null);
      return;
    }

    // 알림 발송 (실패해도 수락 자체는 성공)
    const slotDateLabel = req.slot_date ? format(new Date(req.slot_date + "T00:00:00"), "M월 d일", { locale: ko }) : "";
    const locationLabel = LOCATION_LABELS[req.work_location] || req.work_location;
    const timeLabel = req.start_time && req.end_time ? `${req.start_time.slice(0, 5)}~${req.end_time.slice(0, 5)}` : "";
    const positionsLabel = req.cafe_positions?.length
      ? ` (${req.cafe_positions.map((p: string) => CAFE_POSITION_LABELS[p] || p).join(", ")})`
      : "";

    await Promise.all([
      // 요청자(직원)에게 알림
      supabase.from("notifications").insert({
        profile_id: req.requester_id,
        target_role: "employee",
        type: "substitute_filled",
        title: "대체근무가 확정됐어요",
        content: `${slotDateLabel} ${locationLabel} ${timeLabel} 근무를 ${profileName}님이 수락했어요.`,
        source_id: req.id,
      }),
      // 어드민에게 알림
      supabase.from("notifications").insert({
        target_role: "admin",
        type: "substitute_filled",
        title: "대체근무가 확정됐어요",
        content: `${slotDateLabel} ${locationLabel}${positionsLabel} ${timeLabel} 근무를 ${profileName}님이 수락했어요.`,
        source_id: req.id,
      }),
    ]);

    toast.success("대타를 수락했어요", { description: `${slotDateLabel} 근무가 추가됐어요.` });
    setActiveRequest(null);
    router.replace("/schedule");
    setRespondingId(null);
    fetchIncomingRequests();
    fetchSlots();
  };

  const handleDeclineSubstitute = async (req: SubstituteRequest) => {
    if (!profileId) return;
    setRespondingId(req.id);

    const { error } = await supabase.from("substitute_responses").insert({
      request_id: req.id,
      profile_id: profileId,
      response: "declined",
    });

    if (error) {
      toast.error("거절에 실패했어요", { description: error.message });
    } else {
      toast.success("거절했어요");
      setActiveRequest(null);
      router.replace("/schedule");
      fetchIncomingRequests();
    }
    setRespondingId(null);
  };

  const selectedDateStr = format(selectedDay, "yyyy-MM-dd");
  const selectedSlots = slots.filter((s) => s.slot_date === selectedDateStr);

  const handleSubstituteRequest = async () => {
    if (!requestTarget || !profileId) return;
    setSubmitting(true);

    // Check if already requested
    const { data: existing } = await supabase
      .from("substitute_requests")
      .select("id")
      .eq("slot_id", requestTarget.id)
      .eq("requester_id", profileId)
      .maybeSingle();

    if (existing) {
      toast.error("이미 대타 요청을 보냈어요", { description: "관리자의 처리를 기다려주세요." });
      setSubmitting(false);
      return;
    }

    const { error } = await supabase.from("substitute_requests").insert({
      slot_id: requestTarget.id,
      requester_id: profileId,
      reason: requestReason || null,
      status: "pending",
    });

    if (error) {
      toast.error("요청에 실패했어요", { description: "잠시 후 다시 시도해주세요." });
    } else {
      // Notify admin
      await supabase.from("notifications").insert({
        target_role: "admin",
        type: "substitute_requested",
        title: "대타 요청이 들어왔어요",
        content: `${format(new Date(requestTarget.slot_date), "M월 d일", { locale: ko })} ${LOCATION_LABELS[requestTarget.work_location]} ${requestTarget.start_time.slice(0, 5)}~${requestTarget.end_time.slice(0, 5)} 대타 요청이 접수됐어요.`,
        source_id: requestTarget.id,
      });
      toast.success("대타 요청을 보냈어요", { description: "관리자 승인 후 알림을 드려요." });
      setRequestTarget(null);
      setRequestReason("");
    }
    setSubmitting(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#F2F4F6] font-pretendard">
      {/* Navbar */}
      <nav className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[#F2F4F6]/80 backdrop-blur-md">
        <span className="text-xl font-bold text-[#333D4B]">내 스케줄</span>
        <Link
          href="/"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 rounded-full transition-all shadow-sm"
        >
          <ChevronLeft className="w-3.5 h-3.5 text-[#4E5968]" />
          <span className="text-[13px] font-semibold text-[#4E5968]">홈</span>
        </Link>
      </nav>

      <main className="flex-1 px-5 pb-10 space-y-4">
        {/* Week navigator */}
        <div className="flex items-center justify-between py-2">
          <button
            aria-label="이전 주"
            onClick={() => { const w = subWeeks(weekStart, 1); setWeekStart(w); setSelectedDay(startOfWeek(w, { weekStartsOn: 0 })); }}
            className="p-2 rounded-full hover:bg-white text-[#8B95A1] transition-all"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="font-bold text-[#191F28] text-[15px]">
            {format(weekStart, "M월 d일", { locale: ko })} ~ {format(addDays(weekStart, 6), "M월 d일", { locale: ko })}
          </span>
          <button
            aria-label="다음 주"
            onClick={() => { const w = addWeeks(weekStart, 1); setWeekStart(w); setSelectedDay(startOfWeek(w, { weekStartsOn: 0 })); }}
            className="p-2 rounded-full hover:bg-white text-[#8B95A1] transition-all"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Day strip */}
        <div className="bg-white rounded-[28px] p-4 border border-slate-100">
          <div className="flex gap-1 justify-between">
            {weekDates.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const hasSlotsOnDay = slots.some((s) => s.slot_date === dateStr);
              const isSelected = isSameDay(day, selectedDay);
              const isT = isToday(day);
              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDay(day)}
                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-2xl transition-all ${
                    isSelected ? "bg-[#3182F6]" : isT ? "bg-[#E8F3FF]" : ""
                  }`}
                >
                  <span className={`text-[11px] font-bold ${isSelected ? "text-white/80" : "text-[#8B95A1]"}`}>
                    {DAY_LABELS_SHORT[(day.getDay())]}
                  </span>
                  <span className={`text-[15px] font-bold ${isSelected ? "text-white" : isT ? "text-[#3182F6]" : "text-[#191F28]"}`}>
                    {format(day, "d")}
                  </span>
                  {hasSlotsOnDay && (
                    <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white/60" : "bg-[#3182F6]"}`} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected day slots */}
        <div>
          <h2 className="text-[16px] font-bold text-[#191F28] mb-3">
            {format(selectedDay, "M월 d일 (EEE)", { locale: ko })} 근무
          </h2>

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="bg-white rounded-[20px] p-5 h-[100px] animate-pulse border border-slate-100" />
              ))}
            </div>
          ) : selectedSlots.length === 0 ? (
            <div className="bg-white rounded-[24px] border border-slate-100 p-10 text-center">
              <Calendar className="w-8 h-8 text-[#D1D6DB] mx-auto mb-3" />
              <p className="text-[#8B95A1] text-[15px] font-medium">이 날은 근무가 없어요</p>
              <p className="text-[#8B95A1] text-[13px] mt-1">스케줄이 궁금하면 관리자에게 확인해보세요.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedSlots.map((slot) => (
                <div
                  key={slot.id}
                  className="bg-white rounded-[20px] p-5 border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      {/* Location */}
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className="flex items-center gap-1 px-3 py-1 rounded-full text-[13px] font-bold"
                          style={{
                            backgroundColor: LOCATION_BG[slot.work_location],
                            color: LOCATION_COLORS[slot.work_location],
                          }}
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          {LOCATION_LABELS[slot.work_location]}
                        </span>
                        {slot.cafe_positions && slot.cafe_positions.length > 0 && (
                          <div className="flex gap-1">
                            {slot.cafe_positions.map((pos) => (
                              <span key={pos} className="px-2 py-0.5 bg-[#F2F4F6] text-[#4E5968] rounded-md text-[11px] font-bold">
                                {CAFE_POSITION_LABELS[pos] || pos}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Time */}
                      <div className="flex items-center gap-2 text-[#191F28] font-bold text-[18px]">
                        <Clock className="w-4 h-4 text-[#8B95A1]" />
                        {slot.start_time.slice(0, 5)} ~ {slot.end_time.slice(0, 5)}
                      </div>

                      {slot.notes && (
                        <p className="text-[13px] text-[#8B95A1] mt-2">{slot.notes}</p>
                      )}
                    </div>

                    <button
                      onClick={() => setRequestTarget(slot)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-[#F9FAFB] hover:bg-[#F2F4F6] border border-slate-200 text-[#4E5968] rounded-xl text-[12px] font-bold transition-all shrink-0 active:scale-[0.97]"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      대타 요청
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 대체 근무 자리 섹션 */}
        {incomingRequests.length > 0 && (
          <div className="mt-2">
            <h2 className="text-[16px] font-bold text-[#191F28] mb-1 flex items-center gap-2">
              대체 근무 자리
              <span className="bg-[#3182F6] text-white text-[11px] font-bold px-1.5 py-0.5 rounded-full">
                {incomingRequests.length}
              </span>
            </h2>
            <p className="text-[13px] text-[#8B95A1] mb-3">빠진 자리를 채울 수 있어요. 확인해보세요.</p>
            <div className="space-y-3">
              {incomingRequests.map((req) => {
                const slotDate = req.slot_date ? new Date(req.slot_date + "T00:00:00") : null;
                return (
                  <button
                    key={req.id}
                    onClick={() => setActiveRequest(req)}
                    className="w-full text-left bg-white rounded-[20px] p-5 border border-[#E8F3FF] shadow-[0_2px_10px_rgba(49,130,246,0.06)] active:scale-[0.98] transition-all"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[12px] font-bold"
                          style={{
                            backgroundColor: LOCATION_BG[req.work_location] || "#F2F4F6",
                            color: LOCATION_COLORS[req.work_location] || "#4E5968",
                          }}
                        >
                          <MapPin className="w-3 h-3" />
                          {LOCATION_LABELS[req.work_location] || req.work_location}
                        </span>
                        {slotDate && (
                          <span className="text-[13px] font-bold text-[#4E5968]">
                            {format(slotDate, "M월 d일 (EEE)", { locale: ko })}
                          </span>
                        )}
                      </div>
                      <span className="text-[12px] font-bold text-[#3182F6] bg-[#E8F3FF] px-2 py-0.5 rounded-full shrink-0">지원 가능</span>
                    </div>
                    <p className="text-[17px] font-bold text-[#191F28] mb-1 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-[#8B95A1] shrink-0" />
                      {req.start_time ? req.start_time.slice(0, 5) : "--:--"} ~ {req.end_time ? req.end_time.slice(0, 5) : "--:--"}
                    </p>
                    <p className="text-[12px] text-[#8B95A1]">{req.requester_name}님 자리예요{req.reason ? ` • "${req.reason}"` : ""}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* 대타 요청 상세 바텀시트 */}
      {activeRequest && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setActiveRequest(null); router.replace("/schedule"); }} />
          <div className="relative w-full max-w-md bg-white rounded-t-[28px] px-5 pt-8 pb-10 shadow-2xl animate-in slide-in-from-bottom-4 duration-250">
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-9 h-1 bg-[#D1D6DB] rounded-full" />
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-[18px] font-bold text-[#191F28]">대체 근무 지원</h3>
              <button
                aria-label="닫기"
                onClick={() => { setActiveRequest(null); router.replace("/schedule"); }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F4F6]"
              >
                <X className="w-5 h-5 text-[#8B95A1]" />
              </button>
            </div>

            {/* 요청자 */}
            <p className="text-[13px] text-[#8B95A1] mb-1">빈 자리</p>
            <p className="text-[15px] font-bold text-[#191F28] mb-4">{activeRequest.requester_name}님 근무</p>

            {/* 날짜 / 위치 / 시간 */}
            <div className="bg-[#F9FAFB] rounded-2xl px-4 py-4 mb-4 space-y-2">
              <div className="flex items-center gap-2">
                <span
                  className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[12px] font-bold"
                  style={{
                    backgroundColor: LOCATION_BG[activeRequest.work_location] || "#F2F4F6",
                    color: LOCATION_COLORS[activeRequest.work_location] || "#4E5968",
                  }}
                >
                  <MapPin className="w-3 h-3" />
                  {LOCATION_LABELS[activeRequest.work_location] || activeRequest.work_location}
                </span>
                {activeRequest.slot_date && (
                  <span className="text-[13px] font-bold text-[#4E5968]">
                    {format(new Date(activeRequest.slot_date + "T00:00:00"), "M월 d일 (EEE)", { locale: ko })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[#191F28] font-bold text-[17px]">
                <Clock className="w-4 h-4 text-[#8B95A1]" />
                {activeRequest.start_time?.slice(0, 5)} ~ {activeRequest.end_time?.slice(0, 5)}
              </div>
            </div>

            {/* 사유 */}
            {activeRequest.reason && (
              <p className="text-[13px] text-[#8B95A1] mb-4 bg-[#F9FAFB] rounded-xl px-4 py-3">
                사유: <span className="text-[#4E5968] font-medium">{activeRequest.reason}</span>
              </p>
            )}

            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => handleAcceptSubstitute(activeRequest)}
                disabled={respondingId === activeRequest.id}
                className="w-full h-14 bg-[#3182F6] text-white rounded-2xl font-bold text-[16px] disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <Check className="w-5 h-5" />
                {respondingId === activeRequest.id ? "처리하는 중이에요" : "지원하기"}
              </button>
              <button
                onClick={() => handleDeclineSubstitute(activeRequest)}
                disabled={respondingId === activeRequest.id}
                className="w-full h-14 bg-[#F2F4F6] text-[#4E5968] rounded-2xl font-bold text-[16px] disabled:opacity-50 active:scale-[0.98] transition-all"
              >
                거절하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Substitute Request Bottom Sheet */}
      {requestTarget && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setRequestTarget(null)} />
          <div className="relative w-full max-w-md bg-white rounded-t-[28px] px-5 pt-8 pb-10 shadow-2xl animate-in slide-in-from-bottom-4 duration-250">
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-9 h-1 bg-[#D1D6DB] rounded-full" />
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-[18px] font-bold text-[#191F28]">대타 요청하기</h3>
              <button aria-label="닫기" onClick={() => { setRequestTarget(null); setRequestReason(""); }} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F4F6]">
                <X className="w-5 h-5 text-[#8B95A1]" />
              </button>
            </div>

            <p className="text-[14px] text-[#4E5968] mb-4">
              {format(new Date(requestTarget.slot_date + "T00:00:00"), "M월 d일", { locale: ko })}{" "}
              {LOCATION_LABELS[requestTarget.work_location]}{" "}
              {requestTarget.start_time.slice(0, 5)}~{requestTarget.end_time.slice(0, 5)} 근무예요.
            </p>

            <div className="mb-4">
              <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">
                요청 사유 (선택)
              </label>
              <textarea
                value={requestReason}
                onChange={(e) => setRequestReason(e.target.value)}
                placeholder="사유를 입력해요 (예: 개인 사정, 몸 상태 불량)"
                rows={3}
                className="w-full px-4 py-3 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6] resize-none"
              />
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleSubstituteRequest}
                disabled={submitting}
                className="w-full h-14 bg-[#3182F6] text-white rounded-2xl font-bold text-[16px] disabled:opacity-50 active:scale-[0.98] transition-all"
              >
                {submitting ? "요청하는 중이에요" : "대타 요청하기"}
              </button>
              <button onClick={() => { setRequestTarget(null); setRequestReason(""); }} className="w-full h-14 bg-[#F2F4F6] text-[#4E5968] rounded-2xl font-bold text-[16px]">
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SchedulePage() {
  return (
    <Suspense>
      <SchedulePageInner />
    </Suspense>
  );
}
