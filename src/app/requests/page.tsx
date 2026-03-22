"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import {
  format, addDays, addMonths, subMonths,
  startOfMonth, getDay, getDaysInMonth,
  isBefore, startOfDay,
} from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, Clock, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { useWorkplaces } from "@/lib/hooks/useWorkplaces";
import useSWR from "swr";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Request {
  id: string;
  type: "early_leave" | "absent" | "time_change" | "substitute";
  status: "pending" | "approved" | "rejected" | "filled" | "cancelled" | "cancel_requested";
  reason: string | null;
  reject_reason: string | null;
  requested_start_time: string | null;
  requested_end_time: string | null;
  created_at: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  store_id: string;
}

interface Slot {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  store_id: string;
}

type FunnelStep = "date" | "type" | "detail" | "confirm";

// ─── Constants ───────────────────────────────────────────────────────────────

// TODO: 분 단위 시간 입력 지원 필요 (현재 30분 단위 고정 — 카페 등 분 단위 스케줄 운영 케이스 미지원)
function generateTimeOptions(startH: number, endH: number): string[] {
  const opts: string[] = [];
  for (let h = startH; h <= endH; h++) {
    opts.push(`${String(h).padStart(2, "0")}:00`);
    if (h < endH) opts.push(`${String(h).padStart(2, "0")}:30`);
  }
  return opts;
}
const TIME_OPTIONS = generateTimeOptions(7, 22);

const REQUEST_TYPES = [
  { key: "early_leave" as const, label: "조퇴 요청", desc: "일찍 퇴근하고 싶어요", emoji: "🏃", needsEndTime: true, needsStartTime: false },
  { key: "absent" as const, label: "결근 예정", desc: "출근이 어려울 것 같아요", emoji: "😔", needsEndTime: false, needsStartTime: false },
  { key: "time_change" as const, label: "시간 변경", desc: "출퇴근 시간을 바꾸고 싶어요", emoji: "🔄", needsEndTime: true, needsStartTime: true },
  { key: "substitute" as const, label: "대타 요청", desc: "대신 근무해 줄 분을 구해요", emoji: "🙏", needsEndTime: false, needsStartTime: false },
] as const;

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

const STEP_ORDER: FunnelStep[] = ["date", "type", "detail", "confirm"];
const STEP_TITLES: Record<FunnelStep, string> = {
  date:    "날짜 선택",
  type:    "요청 유형",
  detail:  "상세 입력",
  confirm: "최종 확인",
};

// ─── Mini Calendar ────────────────────────────────────────────────────────────

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function MiniCalendar({
  slots,
  activeSlotIds,
  selectedDate,
  onSelectDate,
}: {
  slots: Slot[];
  activeSlotIds: Set<string>;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}) {
  const [month, setMonth] = useState(() => new Date());
  const today = startOfDay(new Date());

  const year = month.getFullYear();
  const mon = month.getMonth();
  const firstDay = getDay(startOfMonth(month));
  const daysInMonth = getDaysInMonth(month);
  const isCurrentMonth = year === today.getFullYear() && mon === today.getMonth();

  // 선택 가능한 날짜 (진행 중 요청 없는 슬롯이 1개라도 있는 날짜)
  const selectableDates = useMemo(
    () => new Set(slots.filter((s) => !activeSlotIds.has(s.id)).map((s) => s.slot_date)),
    [slots, activeSlotIds]
  );

  // 슬롯은 있지만 모두 진행 중인 날짜 (회색 점 표시)
  const allBusyDates = useMemo(() => {
    const allDates = new Set(slots.map((s) => s.slot_date));
    const result = new Set<string>();
    allDates.forEach((d) => {
      if (!selectableDates.has(d)) result.add(d);
    });
    return result;
  }, [slots, selectableDates]);

  return (
    <div>
      {/* 월 네비게이션 */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setMonth(subMonths(month, 1))}
          disabled={isCurrentMonth}
          className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30 hover:bg-[#F2F4F6] transition-colors active:scale-95"
        >
          <ChevronLeft className="w-5 h-5 text-[#4E5968]" />
        </button>
        <span className="text-[15px] font-bold text-[#191F28]">
          {format(month, "yyyy년 M월")}
        </span>
        <button
          onClick={() => setMonth(addMonths(month, 1))}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[#F2F4F6] transition-colors active:scale-95"
        >
          <ChevronRight className="w-5 h-5 text-[#4E5968]" />
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map((d, i) => (
          <div
            key={d}
            className={`text-center text-[11px] font-bold py-1 ${
              i === 0 ? "text-[#E03131]" : i === 6 ? "text-[#3182F6]" : "text-[#8B95A1]"
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7 gap-y-1">
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`e${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const d = i + 1;
          const dateStr = `${year}-${String(mon + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const date = new Date(year, mon, d);
          const isPast = isBefore(date, today);
          const isSelectable = selectableDates.has(dateStr) && !isPast;
          const isAllBusy = allBusyDates.has(dateStr) && !isPast;
          const isSelected = selectedDate === dateStr;
          const isTodayD = date.getTime() === today.getTime();
          const dow = (firstDay + i) % 7;

          return (
            <button
              key={d}
              disabled={!isSelectable}
              onClick={() => onSelectDate(dateStr)}
              className={`relative flex flex-col items-center py-2 rounded-xl transition-colors ${
                isSelected
                  ? "bg-[#3182F6]"
                  : isSelectable
                  ? "hover:bg-[#F2F4F6] active:scale-95"
                  : "cursor-default"
              }`}
            >
              <span
                className={`text-[14px] font-semibold leading-none ${
                  isSelected
                    ? "text-white"
                    : isPast
                    ? "text-[#D1D6DB]"
                    : isTodayD
                    ? "text-[#3182F6] font-bold"
                    : dow === 0
                    ? "text-[#E03131]"
                    : dow === 6
                    ? "text-[#3182F6]"
                    : "text-[#191F28]"
                }`}
              >
                {d}
              </span>
              {/* 선택 가능한 날짜: 파란 점 */}
              {isSelectable && (
                <div className={`mt-1 w-1 h-1 rounded-full ${isSelected ? "bg-white/80" : "bg-[#3182F6]"}`} />
              )}
              {/* 모두 진행 중인 날짜: 회색 점 */}
              {isAllBusy && (
                <div className="mt-1 w-1 h-1 rounded-full bg-[#D1D6DB]" />
              )}
            </button>
          );
        })}
      </div>

      {/* 범례 */}
      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-[#F2F4F6]">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[#3182F6]" />
          <span className="text-[11px] text-[#8B95A1]">근무 있음</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[#D1D6DB]" />
          <span className="text-[11px] text-[#8B95A1]">요청 진행 중</span>
        </div>
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RequestsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { byId } = useWorkplaces();

  const [profile, setProfile] = useState<{ id: string; name: string } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Request | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // 퍼널 상태
  const [step, setStep] = useState<FunnelStep>("date");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [activeSlotIds, setActiveSlotIds] = useState<Set<string>>(new Set());
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [selectedType, setSelectedType] = useState<typeof REQUEST_TYPES[number] | null>(null);
  const [reason, setReason] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, name, role")
        .eq("id", user.id)
        .single();
      if (prof?.role === "admin") { router.push("/admin/requests"); return; }
      setProfile(prof);
    })();
  }, [supabase, router]);

  // 내 요청 목록
  const { data: requests = [], isLoading, mutate } = useSWR(
    profile ? ["my-requests", profile.id] : null,
    async () => {
      const { data, error } = await supabase
        .from("requests")
        .select(`
          id, type, status, reason, reject_reason,
          requested_start_time, requested_end_time, created_at,
          schedule_slots!slot_id (slot_date, start_time, end_time, store_id)
        `)
        .eq("requester_id", profile!.id)
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
        created_at: r.created_at,
        slot_date: r.schedule_slots?.slot_date ?? "",
        start_time: r.schedule_slots?.start_time ?? "",
        end_time: r.schedule_slots?.end_time ?? "",
        store_id: r.schedule_slots?.store_id ?? "",
      })) as Request[];
    },
    { dedupingInterval: 30_000, revalidateOnFocus: true }
  );

  // 모달 열 때 슬롯 + 진행 중 요청 로드 (90일치)
  const openModal = async () => {
    setShowModal(true);
    setStep("date");
    setSelectedDate(null);
    setSelectedSlot(null);
    setSelectedType(null);
    setReason("");
    setStartTime("");
    setEndTime("");
    setLoadingSlots(true);

    const today = format(new Date(), "yyyy-MM-dd");
    const ninetyDaysLater = format(addDays(new Date(), 90), "yyyy-MM-dd");

    // 슬롯 + 진행 중 요청 병렬 조회
    const [wsResult, activeReqResult] = await Promise.all([
      supabase.from("weekly_schedules").select("id, confirmed_dates, status"),
      supabase
        .from("requests")
        .select("slot_id")
        .eq("requester_id", profile!.id)
        .in("status", ["pending", "approved", "filled", "cancel_requested"]),
    ]);

    // 진행 중인 요청의 slot_id 집합
    const busyIds = new Set(
      ((activeReqResult.data ?? []) as { slot_id: string }[])
        .map((r) => r.slot_id)
        .filter(Boolean)
    );
    setActiveSlotIds(busyIds);

    // status="confirmed"이거나 confirmed_dates가 하나라도 있는 스케줄만 사용
    const wsEntries = ((wsResult.data ?? []) as { id: string; confirmed_dates: string[] | null; status: string }[])
      .filter((w) => w.status === "confirmed" || (w.confirmed_dates && w.confirmed_dates.length > 0));
    const wsIds = wsEntries.map((w) => w.id);

    if (wsIds.length > 0) {
      let q = supabase
        .from("schedule_slots")
        .select("id, slot_date, start_time, end_time, store_id")
        .eq("profile_id", profile!.id)
        .gte("slot_date", today)
        .lte("slot_date", ninetyDaysLater)
        .eq("status", "active")
        .in("weekly_schedule_id", wsIds);

      const confirmedDates = wsEntries.flatMap((w) =>
        w.confirmed_dates?.length ? w.confirmed_dates : []
      );
      if (confirmedDates.length > 0) q = q.in("slot_date", confirmedDates);

      const { data } = await q.order("slot_date");
      setSlots(data ?? []);
    } else {
      setSlots([]);
    }
    setLoadingSlots(false);
  };

  const closeModal = () => setShowModal(false);

  const handleBack = () => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx === 0) closeModal();
    else setStep(STEP_ORDER[idx - 1]);
  };

  // 날짜 선택 → 슬롯 1개면 자동 진행, 여러 개면 선택 대기
  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    setSelectedSlot(null);
    // 선택 가능한 슬롯(진행 중 아닌 것)만 필터
    const availableSlots = slots.filter(
      (s) => s.slot_date === date && !activeSlotIds.has(s.id)
    );
    if (availableSlots.length === 1) {
      setSelectedSlot(availableSlots[0]);
      setStep("type");
    }
  };

  // 슬롯 선택 (같은 날 여러 개일 때)
  const handleSlotSelect = (slot: Slot) => {
    setSelectedSlot(slot);
    setStep("type");
  };

  // 요청 유형 선택 → detail로
  const handleTypeSelect = (type: typeof REQUEST_TYPES[number]) => {
    setSelectedType(type);
    setStartTime("");
    setEndTime("");
    setStep("detail");
  };

  // 조퇴: 예정 퇴근 시간보다 이른 옵션만
  const endTimeOptions = useMemo(() => {
    if (selectedType?.key === "early_leave" && selectedSlot) {
      const slotEnd = selectedSlot.end_time.slice(0, 5);
      return TIME_OPTIONS.filter((t) => t < slotEnd);
    }
    return TIME_OPTIONS;
  }, [selectedType, selectedSlot]);

  const canGoToConfirm = () => {
    if (!selectedType) return false;
    if (selectedType.needsEndTime && !endTime) return false;
    if (selectedType.needsStartTime && !startTime) return false;
    return true;
  };

  const handleSubmit = async () => {
    if (!selectedSlot || !selectedType || !profile) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        requester_id: profile.id,
        type: selectedType.key,
        slot_id: selectedSlot.id,
        reason: reason.trim() || null,
      };
      if (selectedType.needsStartTime && startTime) payload.requested_start_time = startTime;
      if (selectedType.needsEndTime && endTime) payload.requested_end_time = endTime;

      const { error } = await supabase.from("requests").insert(payload);
      if (error) throw error;

      toast.success("요청을 보냈어요");
      closeModal();
      mutate();
    } catch {
      toast.error("요청을 보내지 못했어요. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── 취소 핸들러 ─────────────────────────────────────────────────────────

  const handleCancel = async (req: Request) => {
    setCancelling(true);
    try {
      if (req.status === "pending") {
        const { error } = await supabase
          .from("requests")
          .update({ status: "cancelled" })
          .eq("id", req.id);
        if (error) throw error;
        toast.success("요청을 취소했어요");
      } else if (req.type === "substitute" && req.status === "approved") {
        const { data: latest } = await supabase
          .from("requests")
          .select("status, accepted_by")
          .eq("id", req.id)
          .single();

        if (latest?.status === "filled" || latest?.accepted_by) {
          toast.error("이미 대타가 확정됐어요.", { description: "확정된 대타는 취소할 수 없어요." });
          setCancelTarget(null);
          mutate();
          return;
        }

        const { error } = await supabase
          .from("requests")
          .update({ status: "cancel_requested" })
          .eq("id", req.id);
        if (error) throw error;
        toast.success("취소 요청을 보냈어요. 사장님 확인 후 처리돼요.");
      }

      setCancelTarget(null);
      mutate();
    } catch {
      toast.error("취소 처리 중 오류가 생겼어요. 다시 시도해 주세요.");
    } finally {
      setCancelling(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  // 선택된 날짜의 슬롯 (진행 중 표시 포함, 전체)
  const slotsOnDate = selectedDate ? slots.filter((s) => s.slot_date === selectedDate) : [];

  return (
    <div className="flex flex-col min-h-screen bg-[#F2F4F6] font-pretendard">
      {/* 헤더 */}
      <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-[#F2F4F6]/90 backdrop-blur-md border-b border-[#E5E8EB]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full bg-white shadow-sm flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5 text-[#4E5968]" />
          </button>
          <div>
            <p className="text-[16px] font-bold text-[#191F28]">요청 내역</p>
            <p className="text-[12px] text-[#8B95A1]">조퇴·결근·시간변경·대타</p>
          </div>
        </div>
        <button
          onClick={openModal}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#3182F6] text-white text-[13px] font-bold active:scale-95 transition-transform"
        >
          <Plus className="w-4 h-4" />
          새 요청
        </button>
      </header>

      {/* 요청 목록 */}
      <main className="flex-1 px-4 py-4 space-y-3 pb-20">
        {isLoading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-[20px] p-5 border border-slate-100 animate-pulse">
              <div className="w-20 h-5 bg-[#F2F4F6] rounded-full mb-3" />
              <div className="w-full h-4 bg-[#F2F4F6] rounded mb-2" />
              <div className="w-1/2 h-3 bg-[#F2F4F6] rounded" />
            </div>
          ))
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-14 h-14 rounded-full bg-[#E8F3FF] flex items-center justify-center">
              <Plus className="w-6 h-6 text-[#3182F6]" />
            </div>
            <p className="text-[15px] font-bold text-[#191F28]">아직 요청이 없어요</p>
            <p className="text-[13px] text-[#8B95A1]">위 버튼을 눌러 첫 번째 요청을 보내보세요</p>
          </div>
        ) : (
          requests.map((req) => {
            const typeMeta = TYPE_META[req.type];
            const statusMeta = STATUS_META[req.status];
            return (
              <div key={req.id} className="bg-white rounded-[20px] p-5 border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
                <div className="flex items-center justify-between mb-3">
                  <span className={`px-2.5 py-1 rounded-full text-[12px] font-bold ${typeMeta.bg} ${typeMeta.color}`}>
                    {typeMeta.emoji} {typeMeta.label}
                  </span>
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${statusMeta.bg} ${statusMeta.color}`}>
                    {statusMeta.label}
                  </span>
                </div>

                {req.slot_date && (
                  <div className="flex flex-wrap gap-3 mb-2 text-[13px] text-[#4E5968]">
                    <span className="flex items-center gap-1 font-medium">
                      <Clock className="w-3.5 h-3.5 text-[#8B95A1]" />
                      {format(new Date(req.slot_date + "T00:00:00"), "M월 d일 (EEE)", { locale: ko })}
                    </span>
                    <span className="font-medium">
                      {req.start_time.slice(0, 5)} ~ {req.end_time.slice(0, 5)}
                    </span>
                    {byId[req.store_id] && (
                      <span className="flex items-center gap-1 font-bold px-2 py-0.5 rounded-md text-white text-[12px]"
                        style={{ backgroundColor: byId[req.store_id].color }}>
                        <MapPin className="w-3 h-3" />
                        {byId[req.store_id].label}
                      </span>
                    )}
                  </div>
                )}

                {(req.requested_start_time || req.requested_end_time) && (
                  <p className="text-[12px] text-[#3182F6] font-bold mb-2">
                    희망: {req.requested_start_time?.slice(0, 5) ?? req.start_time.slice(0, 5)} ~ {req.requested_end_time?.slice(0, 5) ?? req.end_time.slice(0, 5)}
                  </p>
                )}

                {req.reason && (
                  <p className="text-[13px] text-[#8B95A1] bg-[#F9FAFB] rounded-xl px-3 py-2 mb-2">
                    사유: <span className="text-[#4E5968] font-medium">{req.reason}</span>
                  </p>
                )}

                {req.status === "rejected" && req.reject_reason && (
                  <p className="text-[12px] text-[#E03131] font-medium mb-2">
                    거절 사유: {req.reject_reason}
                  </p>
                )}

                <p className="text-[11px] text-[#8B95A1] mt-2 mb-3">
                  {format(new Date(req.created_at), "M월 d일 a h:mm", { locale: ko })}
                </p>

                {req.status === "pending" && (
                  <button
                    onClick={() => setCancelTarget(req)}
                    className="w-full py-2.5 rounded-xl border border-slate-200 text-[13px] font-bold text-[#8B95A1] hover:bg-[#F2F4F6] transition-colors"
                  >
                    요청 취소하기
                  </button>
                )}
                {req.type === "substitute" && req.status === "approved" && (
                  <button
                    onClick={() => setCancelTarget(req)}
                    className="w-full py-2.5 rounded-xl border border-[#F0EDFF] text-[13px] font-bold text-[#7B5CF0] bg-[#F0EDFF] hover:bg-[#E8E3FF] transition-colors"
                  >
                    대타 취소 요청하기
                  </button>
                )}
              </div>
            );
          })
        )}
      </main>

      {/* 취소 확인 모달 */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCancelTarget(null)} />
          <div className="relative w-full max-w-sm bg-white rounded-[28px] shadow-2xl p-6">
            <h2 className="text-[17px] font-bold text-[#191F28] mb-2">
              {cancelTarget.status === "approved" ? "대타 취소 요청" : "요청 취소"}
            </h2>
            <p className="text-[14px] text-[#4E5968] mb-6">
              {cancelTarget.status === "approved"
                ? "대타 취소 요청을 보낼게요. 사장님 확인 후 취소돼요. 이미 대타를 수락한 분이 있으면 취소가 불가능해요."
                : "요청을 취소하면 되돌릴 수 없어요. 정말 취소할까요?"}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setCancelTarget(null)}
                className="flex-1 py-3 rounded-2xl bg-[#F2F4F6] text-[#4E5968] text-[14px] font-bold"
              >
                닫기
              </button>
              <button
                onClick={() => handleCancel(cancelTarget)}
                disabled={cancelling}
                className="flex-1 py-3 rounded-2xl bg-[#FFEBEB] text-[#E03131] text-[14px] font-bold disabled:opacity-50"
              >
                {cancelling ? "처리 중이에요..." : cancelTarget.status === "approved" ? "취소 요청하기" : "취소하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 새 요청 퍼널 모달 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative w-full max-w-md bg-white rounded-[28px] shadow-2xl flex flex-col max-h-[85vh]">

            {/* 모달 헤더 */}
            <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-[#E5E8EB] shrink-0">
              <button
                onClick={handleBack}
                className="w-9 h-9 rounded-full bg-[#F2F4F6] flex items-center justify-center active:scale-95 transition-transform"
              >
                <ChevronLeft className="w-5 h-5 text-[#4E5968]" />
              </button>
              <div className="flex-1">
                <p className="text-[16px] font-bold text-[#191F28]">{STEP_TITLES[step]}</p>
                <div className="flex gap-1 mt-1.5">
                  {STEP_ORDER.map((s, i) => {
                    const curIdx = STEP_ORDER.indexOf(step);
                    return (
                      <div
                        key={s}
                        className={`h-1 rounded-full transition-all duration-300 ${
                          i <= curIdx ? "bg-[#3182F6]" : "bg-[#E5E8EB]"
                        } ${i === curIdx ? "w-6" : "w-3"}`}
                      />
                    );
                  })}
                </div>
              </div>
              <button
                onClick={closeModal}
                className="w-9 h-9 rounded-full bg-[#F2F4F6] flex items-center justify-center active:scale-95 transition-transform"
              >
                <X className="w-4 h-4 text-[#4E5968]" />
              </button>
            </div>

            {/* 콘텐츠 */}
            <div className="overflow-y-auto flex-1 px-5 py-5">

              {/* ── Step 1: 날짜 선택 ── */}
              {step === "date" && (
                <div className="space-y-5">
                  {loadingSlots ? (
                    <div className="h-64 rounded-2xl bg-[#F2F4F6] animate-pulse" />
                  ) : slots.length === 0 ? (
                    <div className="flex flex-col items-center py-12 gap-2">
                      <p className="text-[15px] font-bold text-[#191F28]">확정된 스케줄이 없어요</p>
                      <p className="text-[13px] text-[#8B95A1]">사장님이 스케줄을 확정하면 여기서 선택할 수 있어요</p>
                    </div>
                  ) : (
                    <>
                      <MiniCalendar
                        slots={slots}
                        activeSlotIds={activeSlotIds}
                        selectedDate={selectedDate}
                        onSelectDate={handleDateSelect}
                      />

                      {/* 같은 날 슬롯 여러 개일 때 선택 */}
                      {selectedDate && slotsOnDate.length > 1 && (
                        <div className="space-y-2 pt-2 border-t border-[#E5E8EB]">
                          <p className="text-[13px] font-bold text-[#8B95A1]">
                            {format(new Date(selectedDate + "T00:00:00"), "M월 d일", { locale: ko })} 어떤 근무인가요?
                          </p>
                          {slotsOnDate.map((slot) => {
                            const isBusy = activeSlotIds.has(slot.id);
                            return (
                              <button
                                key={slot.id}
                                disabled={isBusy}
                                onClick={() => handleSlotSelect(slot)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-colors ${
                                  isBusy
                                    ? "border-[#E5E8EB] bg-[#F9FAFB] opacity-60 cursor-default"
                                    : "border-[#E5E8EB] bg-white hover:bg-[#F9FAFB]"
                                }`}
                              >
                                <Clock className="w-4 h-4 text-[#8B95A1] shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-[14px] font-bold text-[#191F28]">
                                    {slot.start_time.slice(0, 5)} ~ {slot.end_time.slice(0, 5)}
                                  </p>
                                  {byId[slot.store_id] && (
                                    <p className="text-[12px] text-[#8B95A1] flex items-center gap-1 mt-0.5">
                                      <MapPin className="w-3 h-3" />
                                      {byId[slot.store_id].label}
                                    </p>
                                  )}
                                </div>
                                {isBusy ? (
                                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#FFF3BF] text-[#E67700] shrink-0">
                                    진행 중
                                  </span>
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-[#D1D6DB] shrink-0" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── Step 2: 요청 유형 ── */}
              {step === "type" && selectedSlot && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#F2F4F6]">
                    <Clock className="w-4 h-4 text-[#8B95A1] shrink-0" />
                    <span className="text-[13px] font-bold text-[#4E5968]">
                      {format(new Date(selectedSlot.slot_date + "T00:00:00"), "M월 d일 (EEE)", { locale: ko })}
                    </span>
                    <span className="text-[13px] text-[#4E5968]">
                      {selectedSlot.start_time.slice(0, 5)} ~ {selectedSlot.end_time.slice(0, 5)}
                    </span>
                    {byId[selectedSlot.store_id] && (
                      <span
                        className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded-md text-white shrink-0"
                        style={{ backgroundColor: byId[selectedSlot.store_id].color }}
                      >
                        {byId[selectedSlot.store_id].label}
                      </span>
                    )}
                  </div>

                  <p className="text-[13px] font-bold text-[#8B95A1]">어떤 요청인가요?</p>
                  <div className="grid grid-cols-2 gap-2">
                    {REQUEST_TYPES.map((type) => (
                      <button
                        key={type.key}
                        onClick={() => handleTypeSelect(type)}
                        className="flex flex-col items-start p-4 rounded-2xl border border-[#E5E8EB] bg-white hover:bg-[#F9FAFB] active:scale-[0.97] transition-all text-left"
                      >
                        <span className="text-[22px] mb-2">{type.emoji}</span>
                        <p className="text-[13px] font-bold text-[#191F28]">{type.label}</p>
                        <p className="text-[11px] text-[#8B95A1] mt-0.5 leading-snug">{type.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Step 3: 상세 입력 ── */}
              {step === "detail" && selectedSlot && selectedType && (
                <div className="space-y-5">
                  <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#F2F4F6]">
                    <span className="text-[16px]">{selectedType.emoji}</span>
                    <span className="text-[13px] font-bold text-[#4E5968]">{selectedType.label}</span>
                    <span className="text-[12px] text-[#8B95A1] ml-auto">
                      {format(new Date(selectedSlot.slot_date + "T00:00:00"), "M/d(EEE)", { locale: ko })} {selectedSlot.start_time.slice(0, 5)}~{selectedSlot.end_time.slice(0, 5)}
                    </span>
                  </div>

                  {(selectedType.needsStartTime || selectedType.needsEndTime) && (
                    <div className="space-y-3">
                      <p className="text-[13px] font-bold text-[#8B95A1]">희망 시간을 선택해 주세요</p>
                      {selectedType.needsStartTime && (
                        <div>
                          <label className="text-[12px] text-[#8B95A1] mb-1.5 block">출근 시간</label>
                          <select
                            value={startTime}
                            onChange={(e) => setStartTime(e.target.value)}
                            className="w-full h-12 px-4 rounded-2xl border border-[#E5E8EB] text-[14px] text-[#191F28] bg-[#F9FAFB] focus:outline-none focus:border-[#3182F6]"
                          >
                            <option value="">선택해 주세요</option>
                            {TIME_OPTIONS.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {selectedType.needsEndTime && (
                        <div>
                          <label className="text-[12px] text-[#8B95A1] mb-1.5 block">
                            퇴근 시간
                            {selectedType.key === "early_leave" && (
                              <span className="ml-1.5 text-[11px] text-[#8B95A1] font-normal">
                                (예정 퇴근 {selectedSlot.end_time.slice(0, 5)} 이전만 선택 가능해요)
                              </span>
                            )}
                          </label>
                          <select
                            value={endTime}
                            onChange={(e) => setEndTime(e.target.value)}
                            className="w-full h-12 px-4 rounded-2xl border border-[#E5E8EB] text-[14px] text-[#191F28] bg-[#F9FAFB] focus:outline-none focus:border-[#3182F6]"
                          >
                            <option value="">선택해 주세요</option>
                            {endTimeOptions.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="text-[13px] font-bold text-[#8B95A1] mb-2 block">
                      사유 <span className="font-normal">(선택)</span>
                    </label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="사유를 입력해 주세요"
                      rows={3}
                      className="w-full resize-none px-4 py-3 rounded-2xl border border-[#E5E8EB] text-[14px] text-[#191F28] placeholder:text-[#8B95A1] focus:outline-none focus:border-[#3182F6] bg-[#F9FAFB]"
                    />
                  </div>
                </div>
              )}

              {/* ── Step 4: 최종 확인 ── */}
              {step === "confirm" && selectedSlot && selectedType && (
                <div className="space-y-4">
                  <p className="text-[13px] font-bold text-[#8B95A1]">요청 내용을 확인해 주세요</p>

                  <div className="bg-[#F9FAFB] rounded-2xl divide-y divide-[#E5E8EB] overflow-hidden border border-[#E5E8EB]">
                    <div className="flex items-center justify-between px-4 py-3.5">
                      <span className="text-[13px] text-[#8B95A1]">날짜</span>
                      <span className="text-[13px] font-bold text-[#191F28]">
                        {format(new Date(selectedSlot.slot_date + "T00:00:00"), "yyyy년 M월 d일 (EEE)", { locale: ko })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3.5">
                      <span className="text-[13px] text-[#8B95A1]">근무 시간</span>
                      <span className="text-[13px] font-bold text-[#191F28]">
                        {selectedSlot.start_time.slice(0, 5)} ~ {selectedSlot.end_time.slice(0, 5)}
                      </span>
                    </div>
                    {byId[selectedSlot.store_id] && (
                      <div className="flex items-center justify-between px-4 py-3.5">
                        <span className="text-[13px] text-[#8B95A1]">근무지</span>
                        <span
                          className="text-[12px] font-bold px-2.5 py-1 rounded-lg text-white"
                          style={{ backgroundColor: byId[selectedSlot.store_id].color }}
                        >
                          {byId[selectedSlot.store_id].label}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between px-4 py-3.5">
                      <span className="text-[13px] text-[#8B95A1]">요청 유형</span>
                      <span className={`text-[12px] font-bold px-2.5 py-1 rounded-lg ${TYPE_META[selectedType.key].bg} ${TYPE_META[selectedType.key].color}`}>
                        {TYPE_META[selectedType.key].emoji} {TYPE_META[selectedType.key].label}
                      </span>
                    </div>
                    {(startTime || endTime) && (
                      <div className="flex items-center justify-between px-4 py-3.5">
                        <span className="text-[13px] text-[#8B95A1]">희망 시간</span>
                        <span className="text-[13px] font-bold text-[#3182F6]">
                          {startTime || selectedSlot.start_time.slice(0, 5)} ~ {endTime || selectedSlot.end_time.slice(0, 5)}
                        </span>
                      </div>
                    )}
                    {reason.trim() && (
                      <div className="px-4 py-3.5">
                        <span className="text-[13px] text-[#8B95A1] block mb-1">사유</span>
                        <span className="text-[13px] font-medium text-[#191F28]">{reason.trim()}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 하단 CTA */}
            {step === "detail" && (
              <div className="px-5 pb-6 pt-4 border-t border-[#E5E8EB] shrink-0">
                <button
                  onClick={() => setStep("confirm")}
                  disabled={!canGoToConfirm()}
                  className="w-full py-4 rounded-2xl bg-[#3182F6] text-white text-[15px] font-bold disabled:opacity-40 transition-opacity active:scale-[0.98]"
                >
                  다음
                </button>
              </div>
            )}
            {step === "confirm" && (
              <div className="px-5 pb-6 pt-4 border-t border-[#E5E8EB] shrink-0">
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full py-4 rounded-2xl bg-[#3182F6] text-white text-[15px] font-bold disabled:opacity-40 transition-opacity active:scale-[0.98]"
                >
                  {submitting ? "전송 중이에요..." : "요청 보내기"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
