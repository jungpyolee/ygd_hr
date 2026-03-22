"use client";

import { useState, useEffect } from "react";
import { format, addDays } from "date-fns";
import { ko } from "date-fns/locale";
import { X, Clock, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";

interface Slot {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  store_id: string;
}

interface SendOpts {
  message_type: "action_request";
  template_key: string;
  context_data: {
    slot_id: string;
    slot_date: string;
    start_time: string;
    end_time: string;
    store_label: string;
    requested_start_time?: string;
    requested_end_time?: string;
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  profileId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  byId: Record<string, { label: string }>;
  onSend: (content: string, opts: SendOpts) => void;
}

const REQUEST_TYPES = [
  {
    key: "late",
    label: "지각 예정",
    desc: "늦게 출근할 것 같아요",
    emoji: "⏰",
    content: "오늘 지각할 것 같아요. 양해 부탁드려요.",
    needsStartTime: false,
    needsEndTime: false,
  },
  {
    key: "early_leave",
    label: "조퇴 요청",
    desc: "일찍 퇴근하고 싶어요",
    emoji: "🏃",
    content: "오늘 조퇴가 가능할까요?",
    needsStartTime: false,
    needsEndTime: true,
  },
  {
    key: "absent",
    label: "결근 예정",
    desc: "출근이 어려울 것 같아요",
    emoji: "😔",
    content: "오늘 결근해야 할 것 같아요. 죄송해요.",
    needsStartTime: false,
    needsEndTime: false,
  },
  {
    key: "time_change",
    label: "시간 변경",
    desc: "출퇴근 시간을 바꾸고 싶어요",
    emoji: "🔄",
    content: "근무 시간 변경을 요청해요.",
    needsStartTime: true,
    needsEndTime: true,
  },
  {
    key: "sub_request",
    label: "대타 요청",
    desc: "대신 근무해 줄 분을 구해요",
    emoji: "🙏",
    content: "이 날 대타를 구해주실 수 있을까요?",
    needsStartTime: false,
    needsEndTime: false,
  },
] as const;

export default function ScheduleRequestModal({ open, onClose, profileId, supabase, byId, onSend }: Props) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [requestType, setRequestType] = useState<typeof REQUEST_TYPES[number] | null>(null);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelectedSlot(null);
    setRequestType(null);
    setStartTime("");
    setEndTime("");
    loadSlots();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const loadSlots = async () => {
    setLoadingSlots(true);
    const today = format(new Date(), "yyyy-MM-dd");
    const twoWeeksLater = format(addDays(new Date(), 13), "yyyy-MM-dd");

    const { data: wsData } = await supabase
      .from("weekly_schedules")
      .select("id, confirmed_dates")
      .eq("status", "confirmed");
    const wsEntries = (wsData ?? []) as { id: string; confirmed_dates: string[] | null }[];
    const wsIds = wsEntries.map((w) => w.id);

    if (wsIds.length > 0) {
      let slotQuery = supabase
        .from("schedule_slots")
        .select("id, slot_date, start_time, end_time, store_id")
        .eq("profile_id", profileId)
        .gte("slot_date", today)
        .lte("slot_date", twoWeeksLater)
        .eq("status", "active")
        .in("weekly_schedule_id", wsIds);

      const allConfirmedDates = wsEntries.flatMap((w) =>
        w.confirmed_dates && w.confirmed_dates.length > 0 ? w.confirmed_dates : []
      );
      if (allConfirmedDates.length > 0) {
        slotQuery = slotQuery.in("slot_date", allConfirmedDates);
      }

      const { data } = await slotQuery.order("slot_date");
      setSlots(data ?? []);
    } else {
      setSlots([]);
    }
    setLoadingSlots(false);
  };

  const canSend = () => {
    if (!selectedSlot || !requestType) return false;
    if (requestType.needsEndTime && !endTime) return false;
    if (requestType.needsStartTime && !startTime) return false;
    return true;
  };

  const handleSend = () => {
    if (!selectedSlot || !requestType) return;

    const contextData: SendOpts["context_data"] = {
      slot_id: selectedSlot.id,
      slot_date: selectedSlot.slot_date,
      start_time: selectedSlot.start_time,
      end_time: selectedSlot.end_time,
      store_label: byId[selectedSlot.store_id]?.label ?? selectedSlot.store_id,
    };
    if (requestType.needsStartTime && startTime) contextData.requested_start_time = startTime + ":00";
    if (requestType.needsEndTime && endTime) contextData.requested_end_time = endTime + ":00";

    onSend(requestType.content, {
      message_type: "action_request",
      template_key: requestType.key,
      context_data: contextData,
    });
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-[28px] shadow-2xl max-h-[85vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#E5E8EB] shrink-0">
          <h2 className="text-[17px] font-bold text-[#191F28]">근태 요청</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#F2F4F6] flex items-center justify-center"
          >
            <X className="w-4 h-4 text-[#4E5968]" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          {/* Step 1: 슬롯 선택 */}
          <div>
            <p className="text-[13px] font-bold text-[#8B95A1] mb-3">어떤 날 근무인가요?</p>
            {loadingSlots ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 rounded-2xl bg-[#F2F4F6] animate-pulse" />
                ))}
              </div>
            ) : slots.length === 0 ? (
              <p className="text-[13px] text-[#8B95A1] py-6 text-center">
                앞으로 2주 내 확정된 스케줄이 없어요
              </p>
            ) : (
              <div className="space-y-2">
                {slots.map((slot) => {
                  const isSelected = selectedSlot?.id === slot.id;
                  return (
                    <button
                      key={slot.id}
                      onClick={() => setSelectedSlot(slot)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-colors text-left ${
                        isSelected
                          ? "border-[#3182F6] bg-[#E8F3FF]"
                          : "border-[#E5E8EB] bg-white hover:bg-[#F9FAFB]"
                      }`}
                    >
                      <Clock className={`w-4 h-4 shrink-0 ${isSelected ? "text-[#3182F6]" : "text-[#8B95A1]"}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-[14px] font-bold ${isSelected ? "text-[#3182F6]" : "text-[#191F28]"}`}>
                          {format(new Date(slot.slot_date), "M/d(EEE)", { locale: ko })}
                        </p>
                        <p className="text-[12px] text-[#8B95A1] flex items-center gap-1 mt-0.5">
                          {slot.start_time.slice(0, 5)}~{slot.end_time.slice(0, 5)}
                          {byId[slot.store_id] && (
                            <>
                              <MapPin className="w-3 h-3 shrink-0" />
                              {byId[slot.store_id].label}
                            </>
                          )}
                        </p>
                      </div>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-[#3182F6] flex items-center justify-center shrink-0">
                          <div className="w-2 h-2 rounded-full bg-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 2: 요청 유형 선택 */}
          {selectedSlot && (
            <div>
              <p className="text-[13px] font-bold text-[#8B95A1] mb-3">어떤 요청인가요?</p>
              <div className="grid grid-cols-2 gap-2">
                {REQUEST_TYPES.map((type) => {
                  const isSelected = requestType?.key === type.key;
                  return (
                    <button
                      key={type.key}
                      onClick={() => {
                        setRequestType(type);
                        setStartTime("");
                        setEndTime("");
                      }}
                      className={`flex flex-col items-start p-4 rounded-2xl border transition-colors ${
                        isSelected
                          ? "border-[#3182F6] bg-[#E8F3FF]"
                          : "border-[#E5E8EB] bg-white hover:bg-[#F9FAFB]"
                      }`}
                    >
                      <span className="text-[22px] mb-1">{type.emoji}</span>
                      <p className={`text-[13px] font-bold ${isSelected ? "text-[#3182F6]" : "text-[#191F28]"}`}>
                        {type.label}
                      </p>
                      <p className="text-[11px] text-[#8B95A1] mt-0.5 leading-snug">{type.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: 시간 입력 (시간변경/조퇴만) */}
          {requestType && (requestType.needsStartTime || requestType.needsEndTime) && (
            <div className="space-y-3">
              <p className="text-[13px] font-bold text-[#8B95A1]">희망 시간을 입력해 주세요</p>
              {requestType.needsStartTime && (
                <div>
                  <label className="text-[12px] text-[#8B95A1] mb-1.5 block">출근 시간</label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full h-12 px-4 rounded-2xl border-[#E5E8EB] text-[14px] text-[#191F28] bg-[#F9FAFB] focus-visible:border-[#3182F6] focus-visible:ring-[#3182F6]/20"
                  />
                </div>
              )}
              {requestType.needsEndTime && (
                <div>
                  <label className="text-[12px] text-[#8B95A1] mb-1.5 block">퇴근 시간</label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full h-12 px-4 rounded-2xl border-[#E5E8EB] text-[14px] text-[#191F28] bg-[#F9FAFB] focus-visible:border-[#3182F6] focus-visible:ring-[#3182F6]/20"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* 전송 버튼 */}
        <div className="px-6 pb-7 pt-4 shrink-0 border-t border-[#E5E8EB]">
          <button
            onClick={handleSend}
            disabled={!canSend()}
            className="w-full py-4 rounded-2xl bg-[#3182F6] text-white text-[15px] font-bold disabled:opacity-40 transition-opacity active:scale-[0.98]"
          >
            요청 보내기
          </button>
        </div>
      </div>
    </div>
  );
}
