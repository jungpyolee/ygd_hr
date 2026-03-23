"use client";

import { useState } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase";
import { toast } from "sonner";
import {
  ChevronLeft,
  Plus,
  X,
  Star,
  Megaphone,
  CalendarDays,
  Coffee,
  Pencil,
  Trash2,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import Link from "next/link";
import { useWorkplaces } from "@/lib/hooks/useWorkplaces";
import { logError } from "@/lib/logError";

interface CompanyEvent {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  event_type: string;
  color: string;
  store_id: string | null;
  created_at: string;
}

const EVENT_TYPES = [
  { value: "event", label: "행사", icon: <Star className="w-4 h-4" /> },
  { value: "holiday", label: "휴일", icon: <Coffee className="w-4 h-4" /> },
  { value: "meeting", label: "미팅", icon: <CalendarDays className="w-4 h-4" /> },
  { value: "announcement", label: "공지", icon: <Megaphone className="w-4 h-4" /> },
];

const PRESET_COLORS = [
  "#3182F6",
  "#00B761",
  "#F97316",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#0EA5E9",
  "#F59E0B",
];

const EVENT_TYPE_DEFAULTS: Record<string, string> = {
  event: "#3182F6",
  holiday: "#00B761",
  meeting: "#8B5CF6",
  announcement: "#F97316",
};

// ─── EventFormSheet ───────────────────────────────────────────────────────────
interface FormState {
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  event_type: string;
  color: string;
  store_id: string;
}

interface EventFormSheetProps {
  event: CompanyEvent | null;
  onClose: () => void;
  onSave: (data: FormState, isNew: boolean) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

function EventFormSheet({ event, onClose, onSave, onDelete }: EventFormSheetProps) {
  const isNew = !event;
  const { workplaces } = useWorkplaces();
  const today = format(new Date(), "yyyy-MM-dd");

  const [form, setForm] = useState<FormState>({
    title: event?.title ?? "",
    description: event?.description ?? "",
    start_date: event?.start_date ?? today,
    end_date: event?.end_date ?? today,
    event_type: event?.event_type ?? "event",
    color: event?.color ?? "#3182F6",
    store_id: event?.store_id ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleEventTypeChange = (type: string) => {
    setForm((p) => ({
      ...p,
      event_type: type,
      color: EVENT_TYPE_DEFAULTS[type] ?? p.color,
    }));
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error("제목을 입력해주세요."); return; }
    if (!form.start_date || !form.end_date) { toast.error("날짜를 입력해주세요."); return; }
    if (form.start_date > form.end_date) { toast.error("시작일이 종료일보다 늦어요."); return; }
    setSaving(true);
    await onSave(form, isNew);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-t-[28px] px-5 pt-8 pb-10 shadow-2xl animate-in slide-in-from-bottom-4 duration-250 max-h-[90vh] overflow-y-auto scrollbar-hide">
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-9 h-1 bg-[#D1D6DB] rounded-full" />
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-[18px] font-bold text-[#191F28]">
            {isNew ? "회사 일정 추가" : "일정 수정"}
          </h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F4F6]">
            <X className="w-5 h-5 text-[#8B95A1]" />
          </button>
        </div>

        <div className="space-y-4">
          {/* 유형 선택 */}
          <div>
            <label className="block text-[12px] font-medium text-[#8B95A1] mb-2">일정 유형</label>
            <div className="grid grid-cols-4 gap-2">
              {EVENT_TYPES.map((et) => (
                <button
                  key={et.value}
                  onClick={() => handleEventTypeChange(et.value)}
                  className={`flex flex-col items-center gap-1.5 py-2.5 rounded-xl border transition-all ${
                    form.event_type === et.value
                      ? "border-[#3182F6] bg-[#E8F3FF] text-[#3182F6]"
                      : "border-slate-200 bg-white text-[#8B95A1]"
                  }`}
                >
                  {et.icon}
                  <span className="text-[11px] font-bold">{et.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 제목 */}
          <div>
            <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">제목</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="일정 제목을 입력해요"
              className="w-full px-3 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6]"
            />
          </div>

          {/* 설명 */}
          <div>
            <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">설명 (선택)</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="추가 설명을 입력해요"
              rows={2}
              className="w-full px-3 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6] resize-none"
            />
          </div>

          {/* 기간 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">시작일</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value, end_date: e.target.value > p.end_date ? e.target.value : p.end_date }))}
                className="w-full px-3 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6]"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">종료일</label>
              <input
                type="date"
                value={form.end_date}
                min={form.start_date}
                onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
                className="w-full px-3 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6]"
              />
            </div>
          </div>

          {/* 색상 */}
          <div>
            <label className="block text-[12px] font-medium text-[#8B95A1] mb-2">색상</label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setForm((p) => ({ ...p, color: c }))}
                  className={`w-8 h-8 rounded-full transition-all ${
                    form.color === c ? "ring-2 ring-offset-2 ring-[#191F28] scale-110" : ""
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
              {/* 직접 입력 */}
              <div className="flex items-center gap-1.5 ml-1">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
                  className="w-8 h-8 rounded-full border-0 cursor-pointer"
                  title="직접 선택"
                />
                <span className="text-[11px] text-[#8B95A1]">직접 선택</span>
              </div>
            </div>
            {/* 미리보기 */}
            <div
              className="mt-2 px-3 py-2 rounded-xl text-[13px] font-bold"
              style={{ backgroundColor: form.color + "22", color: form.color, borderLeft: `3px solid ${form.color}` }}
            >
              {form.title || "일정 제목"}
            </div>
          </div>

          {/* 근무지 (선택) */}
          <div>
            <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">
              대상 근무지 <span className="text-[#B0B8C1]">(미선택 시 전체)</span>
            </label>
            <select
              value={form.store_id}
              onChange={(e) => setForm((p) => ({ ...p, store_id: e.target.value }))}
              className="w-full px-3 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6]"
            >
              <option value="">전체 근무지</option>
              {workplaces.map((w) => (
                <option key={w.id} value={w.id}>{w.label}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full mt-6 py-3.5 bg-[#3182F6] text-white font-bold rounded-2xl disabled:opacity-50 active:scale-[0.98] transition-all"
        >
          {saving ? "저장 중..." : isNew ? "일정 추가하기" : "저장하기"}
        </button>

        {!isNew && onDelete && (
          <button
            onClick={() => {
              if (!confirmDelete) { setConfirmDelete(true); return; }
              setDeleting(true);
              onDelete(event!.id).finally(() => setDeleting(false));
            }}
            disabled={deleting}
            className={`w-full mt-2 py-3 font-bold rounded-2xl transition-all text-[14px] ${
              confirmDelete ? "bg-red-500 text-white" : "bg-[#F2F4F6] text-[#8B95A1]"
            }`}
          >
            {deleting ? "삭제 중..." : confirmDelete ? "정말 삭제할까요?" : "일정 삭제하기"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CompanyEventsPage() {
  const { workplaces, byId } = useWorkplaces();
  const [formTarget, setFormTarget] = useState<CompanyEvent | null | "new">(null);

  const { data: events = [], isLoading, mutate } = useSWR(
    "company-events-admin",
    async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("company_events")
        .select("*")
        .order("start_date", { ascending: false });
      if (error) {
        logError({ message: "회사 일정 조회 실패", error, source: "admin/calendar/events" });
        return [];
      }
      return data as CompanyEvent[];
    },
    { dedupingInterval: 30_000 }
  );

  const handleSave = async (formData: FormState, isNew: boolean) => {
    const supabase = createClient();
    const payload = {
      title: formData.title.trim(),
      description: formData.description.trim() || null,
      start_date: formData.start_date,
      end_date: formData.end_date,
      event_type: formData.event_type,
      color: formData.color,
      store_id: formData.store_id || null,
    };

    if (isNew) {
      const { error } = await supabase.from("company_events").insert(payload);
      if (error) {
        logError({ message: "회사 일정 추가 실패", error, source: "admin/calendar/events" });
        toast.error("추가에 실패했어요", { description: error.message });
        return;
      }
      toast.success("일정을 추가했어요");
    } else {
      const { error } = await supabase
        .from("company_events")
        .update(payload)
        .eq("id", (formTarget as CompanyEvent).id);
      if (error) {
        logError({ message: "회사 일정 수정 실패", error, source: "admin/calendar/events" });
        toast.error("수정에 실패했어요", { description: error.message });
        return;
      }
      toast.success("일정을 수정했어요");
    }

    setFormTarget(null);
    mutate();
  };

  const handleDelete = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.from("company_events").delete().eq("id", id);
    if (error) {
      toast.error("삭제에 실패했어요", { description: error.message });
      return;
    }
    toast.success("일정을 삭제했어요");
    setFormTarget(null);
    mutate();
  };

  const getTypeInfo = (type: string) => EVENT_TYPES.find((t) => t.value === type);

  // 월별 그룹
  const grouped: Record<string, CompanyEvent[]> = {};
  events.forEach((ev) => {
    const month = ev.start_date.slice(0, 7);
    if (!grouped[month]) grouped[month] = [];
    grouped[month].push(ev);
  });

  return (
    <div className="space-y-5 max-w-2xl">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/calendar"
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F2F4F6] transition-all"
          >
            <ChevronLeft className="w-5 h-5 text-[#4E5968]" />
          </Link>
          <div>
            <h1 className="text-[20px] font-bold text-[#191F28]">회사 일정 관리</h1>
            <p className="text-[13px] text-[#8B95A1]">직원 캘린더에 표시되는 공지 일정이에요</p>
          </div>
        </div>
        <button
          onClick={() => setFormTarget("new")}
          className="flex items-center gap-2 px-4 py-2 bg-[#3182F6] text-white text-[14px] font-bold rounded-xl hover:bg-blue-600 transition-all active:scale-[0.97]"
        >
          <Plus className="w-4 h-4" />
          일정 추가
        </button>
      </div>

      {/* 목록 */}
      {isLoading ? (
        <div className="py-20 text-center"><div className="cat-spinner mx-auto" /></div>
      ) : events.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-[24px] border border-dashed border-slate-200">
          <CalendarDays className="w-8 h-8 text-[#D1D6DB] mx-auto mb-3" />
          <p className="text-[14px] text-[#8B95A1]">등록된 회사 일정이 없어요</p>
          <button
            onClick={() => setFormTarget("new")}
            className="mt-4 px-4 py-2 bg-[#3182F6] text-white text-[13px] font-bold rounded-xl"
          >
            첫 일정 추가하기
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([month, monthEvents]) => (
              <div key={month}>
                <h3 className="text-[12px] font-bold text-[#8B95A1] mb-2 px-1">
                  {format(parseISO(`${month}-01`), "yyyy년 M월", { locale: ko })}
                </h3>
                <div className="space-y-2">
                  {monthEvents.map((ev) => {
                    const typeInfo = getTypeInfo(ev.event_type);
                    const storeName = ev.store_id ? byId[ev.store_id]?.label : null;
                    const isSameDay = ev.start_date === ev.end_date;
                    const dateLabel = isSameDay
                      ? format(parseISO(ev.start_date), "M월 d일 (EEE)", { locale: ko })
                      : `${format(parseISO(ev.start_date), "M월 d일")} — ${format(parseISO(ev.end_date), "M월 d일")}`;

                    return (
                      <div
                        key={ev.id}
                        className="flex items-start gap-3 p-4 bg-white rounded-[20px] border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer"
                        onClick={() => setFormTarget(ev)}
                      >
                        {/* 색상 바 */}
                        <div
                          className="w-1 self-stretch rounded-full shrink-0"
                          style={{ backgroundColor: ev.color }}
                        />

                        {/* 내용 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: ev.color + "22", color: ev.color }}
                            >
                              {typeInfo?.icon}
                              {typeInfo?.label}
                            </span>
                            {storeName && (
                              <span className="text-[11px] text-[#8B95A1] bg-[#F2F4F6] px-2 py-0.5 rounded-full">
                                {storeName}
                              </span>
                            )}
                          </div>
                          <p className="text-[15px] font-bold text-[#191F28] truncate">{ev.title}</p>
                          <p className="text-[12px] text-[#8B95A1] mt-0.5">{dateLabel}</p>
                          {ev.description && (
                            <p className="text-[12px] text-[#4E5968] mt-1 line-clamp-2">{ev.description}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); setFormTarget(ev); }}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F2F4F6] transition-all"
                          >
                            <Pencil className="w-4 h-4 text-[#8B95A1]" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* 폼 시트 */}
      {formTarget !== null && (
        <EventFormSheet
          event={formTarget === "new" ? null : formTarget}
          onClose={() => setFormTarget(null)}
          onSave={handleSave}
          onDelete={formTarget !== "new" ? handleDelete : undefined}
        />
      )}
    </div>
  );
}
