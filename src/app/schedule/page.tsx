"use client";

import { useState, Suspense, useEffect } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Calendar, MapPin, Clock, ArrowRightLeft, X, Check, UserCheck } from "lucide-react";
import { format, addWeeks, subWeeks, startOfWeek, addDays, isSameDay, isToday } from "date-fns";
import { ko } from "date-fns/locale";
import { useSearchParams, useRouter } from "next/navigation";
import { useWorkplaces } from "@/lib/hooks/useWorkplaces";

interface ScheduleSlot {
  id: string;
  weekly_schedule_id: string;
  profile_id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  store_id: string;
  position_keys: string[];
  status: string;
  notes: string | null;
}

interface MySubstituteRequest {
  id: string;
  reason: string | null;
  status: string;
  accepted_by: string | null;
  acceptor_name: string | null;
  slot_date: string;
  start_time: string;
  end_time: string;
  store_id: string;
  position_keys: string[];
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
  store_id: string;
  position_keys: string[];
}

const DAY_LABELS_SHORT = ["일", "월", "화", "수", "목", "금", "토"];

function getWeekDates(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

function SchedulePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { byId, positionsOfStore } = useWorkplaces();

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());

  // 대타 요청하기 바텀시트 (내가 요청)
  const [requestTarget, setRequestTarget] = useState<ScheduleSlot | null>(null);
  const [requestReason, setRequestReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 나에게 온 대타 요청
  const [respondingId, setRespondingId] = useState<string | null>(null);

  // 대타 수락 확인 바텀시트
  const [activeRequest, setActiveRequest] = useState<SubstituteRequest | null>(null);

  const { user } = useAuth();
  const profileId = user?.id ?? null;

  const weekDates = getWeekDates(weekStart);
  const weekStartStr = format(weekStart, "yyyy-MM-dd");

  // 2. 내 스케줄 슬롯
  const { data: slots = [], isLoading, mutate: mutateSlots } = useSWR(
    profileId ? ["schedule-slots", profileId, weekStartStr] : null,
    async ([, pid, wss]) => {
      const supabase = createClient();
      const { data: wsData } = await supabase
        .from("weekly_schedules")
        .select("id")
        .eq("status", "confirmed")
        .eq("week_start", wss);

      if (!wsData || wsData.length === 0) return [];

      const wsIds = wsData.map((ws: { id: string }) => ws.id);
      const { data: slotData } = await supabase
        .from("schedule_slots")
        .select("*")
        .eq("profile_id", pid)
        .in("weekly_schedule_id", wsIds)
        .eq("status", "active");

      return (slotData as ScheduleSlot[]) ?? [];
    },
    { dedupingInterval: 30_000, revalidateOnFocus: true, revalidateOnMount: true }
  );

  // 3. 나에게 온 대타 요청
  const { data: incomingRequests = [], mutate: mutateIncoming } = useSWR(
    profileId ? ["substitute-incoming", profileId] : null,
    async ([, pid]) => {
      const supabase = createClient();
      const { data: requests } = await supabase
        .from("substitute_requests")
        .select(`
          id, slot_id, requester_id, reason, status, eligible_profile_ids, accepted_by,
          schedule_slots!slot_id(slot_date, start_time, end_time, store_id, position_keys),
          profiles!requester_id(name)
        `)
        .eq("status", "approved");

      if (!requests) return [];

      const eligibleRequests = requests.filter((r: any) =>
        Array.isArray(r.eligible_profile_ids) && r.eligible_profile_ids.includes(pid)
      );

      if (eligibleRequests.length === 0) return [];

      const requestIds = eligibleRequests.map((r: any) => r.id);
      const { data: responses } = await supabase
        .from("substitute_responses")
        .select("request_id")
        .eq("profile_id", pid)
        .in("request_id", requestIds);

      const respondedIds = new Set((responses || []).map((r: any) => r.request_id));

      return eligibleRequests
        .filter((r: any) => !respondedIds.has(r.id))
        .map((r: any) => ({
          id: r.id,
          slot_id: r.slot_id,
          requester_id: r.requester_id,
          reason: r.reason,
          status: r.status,
          eligible_profile_ids: r.eligible_profile_ids,
          accepted_by: r.accepted_by,
          requester_name: r.profiles?.name || "알 수 없음",
          slot_date: r.schedule_slots?.slot_date || "",
          start_time: r.schedule_slots?.start_time || "",
          end_time: r.schedule_slots?.end_time || "",
          store_id: r.schedule_slots?.store_id || "",
          position_keys: r.schedule_slots?.position_keys || [],
        })) as SubstituteRequest[];
    },
    { dedupingInterval: 30_000, revalidateOnFocus: true }
  );

  // 4. 내가 요청한 대타
  const { data: myRequests = [], mutate: mutateMyRequests } = useSWR(
    profileId ? ["substitute-my", profileId, weekStartStr] : null,
    async ([, pid]) => {
      const supabase = createClient();
      const { data } = await supabase
        .from("substitute_requests")
        .select(`
          id, reason, status, accepted_by,
          schedule_slots!substitute_requests_slot_id_fkey(slot_date, start_time, end_time, store_id, position_keys),
          profiles!substitute_requests_accepted_by_fkey(name)
        `)
        .eq("requester_id", pid)
        .order("created_at", { ascending: false });
      if (!data) return [];
      return data.map((r: any) => ({
        id: r.id,
        reason: r.reason,
        status: r.status,
        accepted_by: r.accepted_by,
        acceptor_name: r.profiles?.name ?? null,
        slot_date: r.schedule_slots?.slot_date ?? "",
        start_time: r.schedule_slots?.start_time ?? "",
        end_time: r.schedule_slots?.end_time ?? "",
        store_id: r.schedule_slots?.store_id ?? "",
        position_keys: r.schedule_slots?.position_keys ?? [],
      })) as MySubstituteRequest[];
    },
    { dedupingInterval: 30_000, revalidateOnFocus: true }
  );

  // URL request_id → 바텀시트 자동 오픈
  useEffect(() => {
    const requestId = searchParams.get("request_id");
    if (!requestId || incomingRequests.length === 0) return;
    const req = incomingRequests.find((r) => r.id === requestId);
    if (req) setActiveRequest(req);
  }, [searchParams, incomingRequests]);

  const closeActiveRequest = () => {
    setActiveRequest(null);
    router.replace("/schedule");
  };

  const handleAcceptSubstitute = async (req: SubstituteRequest) => {
    if (!profileId) return;
    const supabase = createClient();
    setRespondingId(req.id);

    const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    const reqStart = toMin(req.start_time.slice(0, 5));
    const reqEnd   = toMin(req.end_time.slice(0, 5));

    // 겹치거나 맞닿는 기존 슬롯 탐색 (위치·포지션 포함 조회)
    const { data: existingSlots } = await supabase
      .from("schedule_slots")
      .select("start_time, end_time, store_id, position_keys")
      .eq("profile_id", profileId)
      .eq("slot_date", req.slot_date)
      .eq("status", "active");

    const overlapSlot = (existingSlots || []).find((s) =>
      // 맞닿음(<=) 포함 — 10~15 + 15~20 도 병합 대상
      toMin(s.start_time) <= reqEnd && toMin(s.end_time) >= reqStart
    );

    if (overlapSlot) {
      // 병합 가능 조건: 같은 위치 + 포지션 일치
      const sameLocation = overlapSlot.store_id === req.store_id;
      const existingPos  = (overlapSlot.position_keys ?? []) as string[];
      const reqPos       = (req.position_keys ?? []) as string[];
      const bothNoPos    = existingPos.length === 0 && reqPos.length === 0;
      const samePos      = bothNoPos ||
        (existingPos.length === reqPos.length &&
         existingPos.every((p) => reqPos.includes(p)));

      if (!sameLocation || !samePos) {
        toast.error("기존 근무와 시간이 겹쳐요", {
          description: "위치나 포지션이 달라서 합칠 수 없어요. 스케줄을 확인해주세요.",
        });
        setRespondingId(null);
        return;
      }
      // 병합 가능 → 서버에서 처리 (RPC 내 UPDATE)
    }

    const { data: rpcResult, error } = await supabase.rpc("accept_substitute", {
      p_request_id: req.id,
      p_acceptor_id: profileId,
    });

    if (error) {
      if (error.message.includes("ALREADY_FILLED_OR_NOT_ELIGIBLE")) {
        toast.error("이미 다른 분이 수락했어요", { description: "대타가 확정됐어요." });
      } else if (error.message.includes("OVERLAP_DIFFERENT_LOCATION_OR_POSITION")) {
        toast.error("기존 근무와 시간이 겹쳐요", {
          description: "위치나 포지션이 달라서 합칠 수 없어요.",
        });
      } else {
        toast.error("수락에 실패했어요", { description: "잠시 후 다시 시도해주세요." });
      }
      setRespondingId(null);
      return;
    }

    const slotDateLabel = req.slot_date
      ? format(new Date(req.slot_date + "T00:00:00"), "M월 d일", { locale: ko })
      : "";
    await supabase.from("notifications").insert({
      profile_id: req.requester_id,
      target_role: "employee",
      type: "substitute_filled",
      title: "대타가 구해졌어요",
      content: `${slotDateLabel} ${byId[req.store_id]?.label || ""} 대타가 확정됐어요.`,
      source_id: req.id,
    });

    const isMerged = rpcResult?.mode === "merged";
    if (isMerged) {
      const mergedStart = (rpcResult.merged_start as string).slice(0, 5);
      const mergedEnd   = (rpcResult.merged_end   as string).slice(0, 5);
      toast.success("근무가 합쳐졌어요", {
        description: `${slotDateLabel} 기존 근무와 이어져서 ${mergedStart}~${mergedEnd}로 변경됐어요.`,
      });
    } else {
      toast.success("대타를 수락했어요", { description: `${slotDateLabel} 근무가 추가됐어요.` });
    }
    setRespondingId(null);
    closeActiveRequest();
    mutateIncoming();
    mutateSlots();
  };

  const handleDeclineSubstitute = async (req: SubstituteRequest) => {
    if (!profileId) return;
    const supabase = createClient();
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
      closeActiveRequest();
      mutateIncoming();
    }
    setRespondingId(null);
  };

  const selectedDateStr = format(selectedDay, "yyyy-MM-dd");
  const selectedSlots = slots.filter((s) => s.slot_date === selectedDateStr);

  const handleSubstituteRequest = async () => {
    if (!requestTarget || !profileId) return;
    const supabase = createClient();
    setSubmitting(true);

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
      await supabase.from("notifications").insert({
        target_role: "admin",
        type: "substitute_requested",
        title: "대타 요청이 들어왔어요",
        content: `${format(new Date(requestTarget.slot_date), "M월 d일", { locale: ko })} ${byId[requestTarget.store_id]?.label || ""} ${requestTarget.start_time.slice(0, 5)}~${requestTarget.end_time.slice(0, 5)} 대타 요청이 접수됐어요.`,
        source_id: requestTarget.id,
      });
      toast.success("대타 요청을 보냈어요", { description: "관리자 승인 후 알림을 드려요." });
      setRequestTarget(null);
      setRequestReason("");
      mutateMyRequests();
    }
    setSubmitting(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#F2F4F6] font-pretendard">
      {/* 헤더 */}
      <header className="sticky top-0 z-10 px-5 pt-5 pb-4 bg-[#F2F4F6]">
        <h1 className="text-[22px] font-bold text-[#191F28]">스케줄</h1>
      </header>

      <main className="flex-1 px-5 pb-24 space-y-4">
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
                    {DAY_LABELS_SHORT[day.getDay()]}
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

          {isLoading ? (
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
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className="flex items-center gap-1 px-3 py-1 rounded-full text-[13px] font-bold"
                          style={{
                            backgroundColor: byId[slot.store_id]?.bg_color,
                            color: byId[slot.store_id]?.color,
                          }}
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          {byId[slot.store_id]?.label || ""}
                        </span>
                        {slot.position_keys && slot.position_keys.length > 0 && (
                          <div className="flex gap-1">
                            {slot.position_keys.map((pos) => (
                              <span key={pos} className="px-2 py-0.5 bg-[#F2F4F6] text-[#4E5968] rounded-md text-[11px] font-bold">
                                {positionsOfStore(slot.store_id).find(p => p.position_key === pos)?.label || pos}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
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

        {/* 나에게 온 대타 요청 */}
        {incomingRequests.length > 0 && (
          <div className="mt-2">
            <h2 className="text-[16px] font-bold text-[#191F28] mb-3 flex items-center gap-2">
              나에게 온 대타 요청
              <span className="bg-red-500 text-white text-[11px] font-bold px-1.5 py-0.5 rounded-full">
                {incomingRequests.length}
              </span>
            </h2>
            <div className="space-y-3">
              {incomingRequests.map((req) => {
                const slotDate = req.slot_date ? new Date(req.slot_date + "T00:00:00") : null;
                return (
                  <div
                    key={req.id}
                    className="bg-white rounded-[20px] p-5 border border-orange-100 shadow-[0_2px_10px_rgba(0,0,0,0.03)]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span
                            className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[12px] font-bold shrink-0"
                            style={{
                              backgroundColor: byId[req.store_id]?.bg_color || "#F2F4F6",
                              color: byId[req.store_id]?.color || "#4E5968",
                            }}
                          >
                            <MapPin className="w-3 h-3" />
                            {byId[req.store_id]?.label || ""}
                          </span>
                          {req.position_keys && req.position_keys.length > 0 && req.position_keys.map((pos) => (
                            <span key={pos} className="px-2 py-0.5 bg-[#F2F4F6] text-[#4E5968] rounded-md text-[11px] font-bold shrink-0">
                              {positionsOfStore(req.store_id).find(p => p.position_key === pos)?.label || pos}
                            </span>
                          ))}
                          {slotDate && (
                            <span className="text-[13px] font-bold text-[#4E5968]">
                              {format(slotDate, "M월 d일 EEEE", { locale: ko })}
                            </span>
                          )}
                        </div>
                        <p className="text-[14px] font-bold text-[#191F28]">
                          {req.start_time?.slice(0, 5)} ~ {req.end_time?.slice(0, 5)}
                        </p>
                        <p className="text-[12px] text-[#8B95A1] mt-0.5">{req.requester_name}님의 요청</p>
                      </div>
                      <button
                        onClick={() => setActiveRequest(req)}
                        className="shrink-0 px-4 py-2.5 bg-[#3182F6] text-white rounded-xl text-[13px] font-bold active:scale-[0.97] transition-all"
                      >
                        확인하기
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 내가 요청한 대타 현황 */}
        {myRequests.length > 0 && (
          <div className="mt-2">
            <h2 className="text-[16px] font-bold text-[#191F28] mb-3">내가 요청한 대타</h2>
            <div className="space-y-3">
              {myRequests.map((req) => {
                const slotDate = req.slot_date ? new Date(req.slot_date + "T00:00:00") : null;
                const statusMap: Record<string, { label: string; bg: string; color: string }> = {
                  pending: { label: "검토 중", bg: "#FFF7E6", color: "#F59E0B" },
                  approved: { label: "구인 중", bg: "#E8F3FF", color: "#3182F6" },
                  filled:   { label: "대타 확정", bg: "#E6FAF0", color: "#00B761" },
                  rejected: { label: "요청 거절", bg: "#FFF0F0", color: "#E03131" },
                };
                const badge = statusMap[req.status] ?? { label: req.status, bg: "#F2F4F6", color: "#8B95A1" };

                return (
                  <div key={req.id} className="bg-white rounded-[20px] p-5 border border-slate-100">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span
                            className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[12px] font-bold shrink-0"
                            style={{
                              backgroundColor: byId[req.store_id]?.bg_color || "#F2F4F6",
                              color: byId[req.store_id]?.color || "#4E5968",
                            }}
                          >
                            <MapPin className="w-3 h-3" />
                            {byId[req.store_id]?.label || ""}
                          </span>
                          {req.position_keys && req.position_keys.length > 0 && req.position_keys.map((pos) => (
                            <span key={pos} className="px-2 py-0.5 bg-[#F2F4F6] text-[#4E5968] rounded-md text-[11px] font-bold shrink-0">
                              {positionsOfStore(req.store_id).find(p => p.position_key === pos)?.label || pos}
                            </span>
                          ))}
                          {slotDate && (
                            <span className="text-[13px] font-bold text-[#4E5968]">
                              {format(slotDate, "M월 d일 (EEE)", { locale: ko })}
                            </span>
                          )}
                        </div>
                        <p className="text-[14px] font-bold text-[#191F28]">
                          {req.start_time?.slice(0, 5)} ~ {req.end_time?.slice(0, 5)}
                        </p>
                        {req.status === "filled" && req.acceptor_name && (
                          <p className="text-[13px] text-[#00B761] font-semibold mt-1.5 flex items-center gap-1">
                            <UserCheck className="w-3.5 h-3.5" />
                            {req.acceptor_name}님이 대신 근무해요
                          </p>
                        )}
                        {req.reason && (
                          <p className="text-[12px] text-[#8B95A1] mt-0.5">사유: {req.reason}</p>
                        )}
                      </div>
                      <span
                        className="shrink-0 px-2.5 py-1 rounded-full text-[12px] font-bold"
                        style={{ backgroundColor: badge.bg, color: badge.color }}
                      >
                        {badge.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* 대타 요청하기 모달 */}
      {requestTarget && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-5">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setRequestTarget(null)} />
          <div className="relative w-full max-w-sm bg-white rounded-[28px] px-5 pt-7 pb-7 shadow-2xl animate-in fade-in zoom-in-95 duration-250">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-[18px] font-bold text-[#191F28]">대타 요청하기</h3>
              <button
                aria-label="닫기"
                onClick={() => { setRequestTarget(null); setRequestReason(""); }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F4F6]"
              >
                <X className="w-5 h-5 text-[#8B95A1]" />
              </button>
            </div>
            <p className="text-[14px] text-[#4E5968] mb-4">
              {format(new Date(requestTarget.slot_date + "T00:00:00"), "M월 d일", { locale: ko })}{" "}
              {byId[requestTarget.store_id]?.label || ""}{" "}
              {requestTarget.start_time.slice(0, 5)}~{requestTarget.end_time.slice(0, 5)} 근무예요.
            </p>
            <div className="mb-4">
              <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">요청 사유 (선택)</label>
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
              <button
                onClick={() => { setRequestTarget(null); setRequestReason(""); }}
                className="w-full h-14 bg-[#F2F4F6] text-[#4E5968] rounded-2xl font-bold text-[16px]"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 대타 수락 확인 모달 */}
      {activeRequest && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-5">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeActiveRequest} />
          <div className="relative w-full max-w-sm bg-white rounded-[28px] px-5 pt-7 pb-7 shadow-2xl animate-in fade-in zoom-in-95 duration-250">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-[18px] font-bold text-[#191F28]">대타 요청 확인</h3>
              <button aria-label="닫기" onClick={closeActiveRequest} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F4F6]">
                <X className="w-5 h-5 text-[#8B95A1]" />
              </button>
            </div>

            {/* 요청 정보 카드 */}
            <div className="bg-[#F9FAFB] rounded-2xl p-4 mb-5 space-y-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[13px] font-bold"
                  style={{
                    backgroundColor: byId[activeRequest.store_id]?.bg_color || "#F2F4F6",
                    color: byId[activeRequest.store_id]?.color || "#4E5968",
                  }}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  {byId[activeRequest.store_id]?.label || ""}
                </span>
                {activeRequest.slot_date && (
                  <span className="text-[14px] font-bold text-[#191F28]">
                    {format(new Date(activeRequest.slot_date + "T00:00:00"), "M월 d일 (EEE)", { locale: ko })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[#191F28] font-bold text-[17px]">
                <Clock className="w-4 h-4 text-[#8B95A1]" />
                {activeRequest.start_time?.slice(0, 5)} ~ {activeRequest.end_time?.slice(0, 5)}
              </div>
              <p className="text-[13px] text-[#4E5968]">
                <span className="font-bold">{activeRequest.requester_name}</span>님의 요청이에요
              </p>
              {activeRequest.reason && (
                <p className="text-[13px] text-[#8B95A1] italic">&ldquo;{activeRequest.reason}&rdquo;</p>
              )}
            </div>

            <p className="text-[13px] text-[#8B95A1] text-center mb-4">
              수락하면 이 날 근무가 내 스케줄에 추가돼요
            </p>

            <div className="flex gap-2.5">
              <button
                onClick={() => handleDeclineSubstitute(activeRequest)}
                disabled={respondingId === activeRequest.id}
                className="flex-1 h-14 bg-[#F2F4F6] text-[#4E5968] rounded-2xl text-[15px] font-bold disabled:opacity-50 active:scale-[0.97] transition-all"
              >
                {respondingId === activeRequest.id ? "처리하는 중이에요" : "거절하기"}
              </button>
              <button
                onClick={() => handleAcceptSubstitute(activeRequest)}
                disabled={respondingId === activeRequest.id}
                className="flex-1 h-14 bg-[#3182F6] text-white rounded-2xl text-[15px] font-bold disabled:opacity-50 active:scale-[0.97] transition-all flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                {respondingId === activeRequest.id ? "처리하는 중이에요" : "수락하기"}
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
    <Suspense fallback={<div className="flex min-h-screen flex-col bg-[#F2F4F6]" />}>
      <SchedulePageInner />
    </Suspense>
  );
}
