"use client";

import { useState } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase";
import {
  Plus,
  Trash2,
  ClipboardList,
  Pencil,
  Eye,
  LayoutGrid,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  Check,
  X,
} from "lucide-react";
import { CheckCircle2, Circle } from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import type { ChecklistTemplate } from "@/types/checklist";

type ViewMode = "group" | "preview";
type TriggerTab = "check_in" | "check_out";

const LOCATION_LABELS: Record<string, string> = {
  cafe: "카페",
  factory: "공장",
  catering: "케이터링",
};
const POSITION_LABELS: Record<string, string> = {
  hall: "홀",
  kitchen: "주방",
  showroom: "쇼룸",
};

const COMBOS: { location: string | null; position: string | null; label: string }[] = [
  { location: null, position: null, label: "전체 적용" },
  { location: "cafe", position: null, label: "카페 (공통)" },
  { location: "cafe", position: "hall", label: "카페 · 홀" },
  { location: "cafe", position: "kitchen", label: "카페 · 주방" },
  { location: "cafe", position: "showroom", label: "카페 · 쇼룸" },
  { location: "factory", position: null, label: "공장" },
  { location: "catering", position: null, label: "케이터링" },
];

/** 특정 조합에 직접 속하는 항목 (정확히 일치) */
function getExactItems(
  templates: ChecklistTemplate[],
  trigger: TriggerTab,
  location: string | null,
  position: string | null
) {
  return templates
    .filter(
      (t) =>
        t.trigger === trigger &&
        (t.work_location ?? null) === location &&
        (t.cafe_position ?? null) === position
    )
    .sort((a, b) => a.order_index - b.order_index);
}

/** 특정 조합의 직원이 실제로 받게 될 항목 수 (필터 로직 동일) */
function getVisibleCount(
  templates: ChecklistTemplate[],
  trigger: TriggerTab,
  location: string | null,
  position: string | null
) {
  return templates.filter((t) => {
    if (t.trigger !== trigger || !t.is_active) return false;
    if (t.work_location && t.work_location !== location) return false;
    if (t.cafe_position && t.cafe_position !== position) return false;
    return true;
  }).length;
}

/** 미리보기용: 직원이 실제로 받게 될 항목 목록 */
function getPreviewItems(
  templates: ChecklistTemplate[],
  trigger: TriggerTab,
  location: string | null,
  position: string | null
) {
  return templates
    .filter((t) => {
      if (t.trigger !== trigger || !t.is_active) return false;
      if (t.work_location && t.work_location !== location) return false;
      if (t.cafe_position && t.cafe_position !== position) return false;
      return true;
    })
    .sort((a, b) => a.order_index - b.order_index);
}

export default function AdminChecklistsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("group");

  // 조합별 보기
  const [openCombo, setOpenCombo] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [addingKey, setAddingKey] = useState<string | null>(null); // "comboKey-trigger"
  const [newTitle, setNewTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChecklistTemplate | null>(null);

  // 미리보기
  const [previewLocation, setPreviewLocation] = useState("cafe");
  const [previewPosition, setPreviewPosition] = useState("hall");
  const [previewTrigger, setPreviewTrigger] = useState<TriggerTab>("check_in");
  const [previewCheckedIds, setPreviewCheckedIds] = useState<Set<string>>(new Set());

  const { data: templates = [], isLoading: loading, mutate } = useSWR(
    "admin-checklist-templates",
    async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("checklist_templates")
        .select("*")
        .order("trigger")
        .order("order_index");
      return (data as ChecklistTemplate[]) ?? [];
    },
    { dedupingInterval: 60_000, revalidateOnFocus: false }
  );

  // ── 수정 ─────────────────────────────────────────────
  const startEdit = (item: ChecklistTemplate) => {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditLocation(item.work_location ?? "");
    setEditPosition(item.cafe_position ?? "");
    setAddingKey(null);
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async () => {
    if (!editingId || !editTitle.trim()) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("checklist_templates")
      .update({
        title: editTitle.trim(),
        work_location: editLocation || null,
        cafe_position: editPosition || null,
      })
      .eq("id", editingId);
    if (error) {
      toast.error("수정에 실패했어요", { description: "잠시 후 다시 시도해 주세요." });
    } else {
      toast.success("항목을 수정했어요");
      setEditingId(null);
      mutate();
    }
    setSaving(false);
  };

  // ── 순서 변경 ─────────────────────────────────────────
  const moveItem = async (
    item: ChecklistTemplate,
    siblings: ChecklistTemplate[],
    dir: "up" | "down"
  ) => {
    const idx = siblings.findIndex((t) => t.id === item.id);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;
    const a = siblings[idx];
    const b = siblings[swapIdx];
    const supabase = createClient();
    await Promise.all([
      supabase.from("checklist_templates").update({ order_index: b.order_index }).eq("id", a.id),
      supabase.from("checklist_templates").update({ order_index: a.order_index }).eq("id", b.id),
    ]);
    mutate();
  };

  // ── 토글 ──────────────────────────────────────────────
  const toggleActive = async (item: ChecklistTemplate) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("checklist_templates")
      .update({ is_active: !item.is_active })
      .eq("id", item.id);
    if (error) {
      toast.error("변경에 실패했어요", { description: "잠시 후 다시 시도해 주세요." });
    } else {
      mutate();
    }
  };

  // ── 추가 ──────────────────────────────────────────────
  const addTemplate = async (
    trigger: TriggerTab,
    location: string | null,
    position: string | null
  ) => {
    if (!newTitle.trim()) return;
    setSaving(true);
    const supabase = createClient();
    const existing = getExactItems(templates, trigger, location, position);
    const maxOrder = existing.reduce((max, t) => Math.max(max, t.order_index), -1);
    const { error } = await supabase.from("checklist_templates").insert({
      title: newTitle.trim(),
      trigger,
      work_location: location,
      cafe_position: position,
      order_index: maxOrder + 1,
    });
    if (error) {
      toast.error("항목 추가에 실패했어요", { description: "잠시 후 다시 시도해 주세요." });
    } else {
      toast.success("항목을 추가했어요");
      setNewTitle("");
      setAddingKey(null);
      mutate();
    }
    setSaving(false);
  };

  // ── 삭제 ──────────────────────────────────────────────
  const deleteTemplate = async (item: ChecklistTemplate) => {
    const supabase = createClient();
    const { error } = await supabase.from("checklist_templates").delete().eq("id", item.id);
    if (error) {
      toast.error("삭제에 실패했어요", { description: "잠시 후 다시 시도해 주세요." });
    } else {
      toast.success("항목을 삭제했어요");
      mutate();
    }
    setDeleteTarget(null);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-slate-100 animate-pulse rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <h1 className="text-[22px] font-bold text-[#191F28]">체크리스트 설정</h1>

      {/* 뷰 모드 탭 */}
      <div className="flex gap-2 bg-[#F2F4F6] rounded-2xl p-1">
        {(
          [
            { id: "group" as ViewMode, label: "조합별 보기", icon: <LayoutGrid className="w-3.5 h-3.5" /> },
            { id: "preview" as ViewMode, label: "미리보기", icon: <Eye className="w-3.5 h-3.5" /> },
          ]
        ).map((mode) => (
          <button
            key={mode.id}
            onClick={() => setViewMode(mode.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] font-bold transition-colors ${
              viewMode === mode.id ? "bg-white text-[#191F28] shadow-sm" : "text-[#8B95A1]"
            }`}
          >
            {mode.icon}
            {mode.label}
          </button>
        ))}
      </div>

      {/* ── 조합별 보기 ── */}
      {viewMode === "group" && (
        <div className="space-y-2">
          {COMBOS.map((combo) => {
            const comboKey = `${combo.location ?? "all"}-${combo.position ?? "all"}`;
            const isOpen = openCombo === comboKey;

            const inCount = getExactItems(templates, "check_in", combo.location, combo.position).length;
            const outCount = getExactItems(templates, "check_out", combo.location, combo.position).length;
            const totalCount = inCount + outCount;

            return (
              <div key={comboKey} className="bg-white rounded-[20px] border border-slate-100 overflow-hidden">
                {/* 조합 헤더 */}
                <button
                  onClick={() => {
                    setOpenCombo(isOpen ? null : comboKey);
                    setEditingId(null);
                    setAddingKey(null);
                  }}
                  className="w-full flex items-center px-5 py-4 gap-3 text-left"
                >
                  <div className="flex-1">
                    <p className="text-[14px] font-bold text-[#191F28]">{combo.label}</p>
                    <p className="text-[12px] text-[#8B95A1] mt-0.5">
                      {totalCount === 0 ? "항목 없음" : `출근 ${inCount}개 · 퇴근 ${outCount}개`}
                    </p>
                  </div>
                  <span
                    className={`text-[12px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
                      totalCount > 0 ? "bg-[#E8F3FF] text-[#3182F6]" : "bg-[#F2F4F6] text-[#B0B8C1]"
                    }`}
                  >
                    {totalCount}
                  </span>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-[#8B95A1] shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#8B95A1] shrink-0" />
                  )}
                </button>

                {/* 펼쳐진 내용 */}
                {isOpen && (
                  <div className="border-t border-[#F2F4F6]">
                    {(["check_in", "check_out"] as TriggerTab[]).map((trigger) => {
                      const items = getExactItems(templates, trigger, combo.location, combo.position);
                      const addKey = `${comboKey}-${trigger}`;
                      const isAdding = addingKey === addKey;

                      return (
                        <div key={trigger} className="px-5 py-4 border-b border-[#F2F4F6] last:border-b-0">
                          {/* 트리거 헤더 */}
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-[12px] font-bold text-[#4E5968]">
                              {trigger === "check_in" ? "출근 체크리스트" : "퇴근 체크리스트"}
                            </span>
                            <button
                              onClick={() => {
                                setAddingKey(isAdding ? null : addKey);
                                setNewTitle("");
                                setEditingId(null);
                              }}
                              className="flex items-center gap-1 text-[12px] font-bold text-[#3182F6]"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              추가
                            </button>
                          </div>

                          {/* 추가 폼 */}
                          {isAdding && (
                            <div className="bg-[#F8FAFB] rounded-xl p-3 mb-3 space-y-2">
                              <input
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                placeholder="항목명 (예: 바닥 닦기)"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") addTemplate(trigger, combo.location, combo.position);
                                  if (e.key === "Escape") { setAddingKey(null); setNewTitle(""); }
                                }}
                                className="w-full bg-white border border-[#E5E8EB] rounded-xl px-3 py-2.5 text-[13px] text-[#191F28] placeholder:text-[#B0B8C1] outline-none focus:border-[#3182F6]"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => addTemplate(trigger, combo.location, combo.position)}
                                  disabled={!newTitle.trim() || saving}
                                  className="flex-1 py-2 bg-[#3182F6] text-white text-[13px] font-bold rounded-xl disabled:opacity-40"
                                >
                                  저장하기
                                </button>
                                <button
                                  onClick={() => { setAddingKey(null); setNewTitle(""); }}
                                  className="flex-1 py-2 bg-[#F2F4F6] text-[#4E5968] text-[13px] font-bold rounded-xl"
                                >
                                  취소
                                </button>
                              </div>
                            </div>
                          )}

                          {/* 항목 목록 */}
                          {items.length === 0 && !isAdding ? (
                            <p className="text-[12px] text-[#B0B8C1] py-1">등록된 항목이 없어요.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {items.map((item, idx) =>
                                editingId === item.id ? (
                                  // 인라인 편집 폼
                                  <div key={item.id} className="bg-[#F8FAFB] rounded-xl p-3 space-y-2">
                                    <input
                                      value={editTitle}
                                      onChange={(e) => setEditTitle(e.target.value)}
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") saveEdit();
                                        if (e.key === "Escape") cancelEdit();
                                      }}
                                      className="w-full bg-white border border-[#E5E8EB] rounded-xl px-3 py-2.5 text-[13px] text-[#191F28] outline-none focus:border-[#3182F6]"
                                    />
                                    <div className="flex gap-2">
                                      <select
                                        value={editLocation}
                                        onChange={(e) => setEditLocation(e.target.value)}
                                        className="flex-1 bg-white border border-[#E5E8EB] rounded-xl px-2 py-2 text-[12px] text-[#4E5968] outline-none"
                                      >
                                        <option value="">전체 근무지</option>
                                        <option value="cafe">카페</option>
                                        <option value="factory">공장</option>
                                        <option value="catering">케이터링</option>
                                      </select>
                                      <select
                                        value={editPosition}
                                        onChange={(e) => setEditPosition(e.target.value)}
                                        className="flex-1 bg-white border border-[#E5E8EB] rounded-xl px-2 py-2 text-[12px] text-[#4E5968] outline-none"
                                      >
                                        <option value="">전체 포지션</option>
                                        <option value="hall">홀</option>
                                        <option value="kitchen">주방</option>
                                        <option value="showroom">쇼룸</option>
                                      </select>
                                    </div>
                                    <div className="flex gap-2">
                                      <button
                                        onClick={saveEdit}
                                        disabled={!editTitle.trim() || saving}
                                        className="flex-1 py-2 bg-[#3182F6] text-white text-[13px] font-bold rounded-xl disabled:opacity-40"
                                      >
                                        저장하기
                                      </button>
                                      <button
                                        onClick={cancelEdit}
                                        className="flex-1 py-2 bg-[#F2F4F6] text-[#4E5968] text-[13px] font-bold rounded-xl"
                                      >
                                        취소
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  // 항목 카드
                                  <div
                                    key={item.id}
                                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl ${
                                      item.is_active ? "bg-[#F8FAFB]" : "bg-[#F8FAFB] opacity-50"
                                    }`}
                                  >
                                    {/* 순서 변경 */}
                                    <div className="flex flex-col gap-0.5 shrink-0">
                                      <button
                                        onClick={() => moveItem(item, items, "up")}
                                        disabled={idx === 0}
                                        className="w-5 h-4 flex items-center justify-center text-[#C5CBD2] hover:text-[#4E5968] disabled:opacity-20 transition-colors"
                                      >
                                        <ArrowUp className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={() => moveItem(item, items, "down")}
                                        disabled={idx === items.length - 1}
                                        className="w-5 h-4 flex items-center justify-center text-[#C5CBD2] hover:text-[#4E5968] disabled:opacity-20 transition-colors"
                                      >
                                        <ArrowDown className="w-3 h-3" />
                                      </button>
                                    </div>

                                    {/* 항목명 */}
                                    <span
                                      className={`flex-1 text-[13px] font-semibold min-w-0 truncate ${
                                        item.is_active ? "text-[#191F28]" : "text-[#8B95A1] line-through"
                                      }`}
                                    >
                                      {item.title}
                                    </span>

                                    {/* 액션 버튼 */}
                                    <div className="flex items-center gap-1 shrink-0">
                                      {/* 수정 */}
                                      <button
                                        onClick={() => startEdit(item)}
                                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#E5E8EB] transition-colors"
                                      >
                                        <Pencil className="w-3.5 h-3.5 text-[#8B95A1]" />
                                      </button>

                                      {/* 활성 토글 */}
                                      <button
                                        type="button"
                                        onClick={() => toggleActive(item)}
                                        className={`w-9 h-5 rounded-full transition-colors relative overflow-hidden shrink-0 ${
                                          item.is_active ? "bg-[#3182F6]" : "bg-[#D1D6DB]"
                                        }`}
                                        aria-label={item.is_active ? "비활성화" : "활성화"}
                                      >
                                        <span
                                          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                                            item.is_active ? "translate-x-4" : "translate-x-0.5"
                                          }`}
                                        />
                                      </button>

                                      {/* 삭제 */}
                                      <button
                                        onClick={() => setDeleteTarget(item)}
                                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 transition-colors"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                      </button>
                                    </div>
                                  </div>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── 미리보기 ── */}
      {viewMode === "preview" && (
        <>
          {/* 조건 선택 */}
          <div className="bg-white rounded-[20px] p-4 border border-slate-100 space-y-3">
            <p className="text-[13px] font-bold text-[#4E5968]">조건 선택</p>
            <div className="flex gap-2">
              <select
                value={previewLocation}
                onChange={(e) => {
                  setPreviewLocation(e.target.value);
                  setPreviewCheckedIds(new Set());
                }}
                className="flex-1 bg-[#F2F4F6] rounded-xl px-3 py-2.5 text-[13px] text-[#4E5968] outline-none"
              >
                <option value="cafe">카페</option>
                <option value="factory">공장</option>
                <option value="catering">케이터링</option>
              </select>
              <select
                value={previewPosition}
                onChange={(e) => {
                  setPreviewPosition(e.target.value);
                  setPreviewCheckedIds(new Set());
                }}
                className="flex-1 bg-[#F2F4F6] rounded-xl px-3 py-2.5 text-[13px] text-[#4E5968] outline-none"
              >
                <option value="hall">홀</option>
                <option value="kitchen">주방</option>
                <option value="showroom">쇼룸</option>
              </select>
            </div>
          </div>

          {/* 출근/퇴근 탭 */}
          <div className="flex gap-2 bg-[#F2F4F6] rounded-2xl p-1">
            {(["check_in", "check_out"] as TriggerTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setPreviewTrigger(tab);
                  setPreviewCheckedIds(new Set());
                }}
                className={`flex-1 py-2.5 rounded-xl text-[14px] font-bold transition-colors ${
                  previewTrigger === tab ? "bg-white text-[#191F28] shadow-sm" : "text-[#8B95A1]"
                }`}
              >
                {tab === "check_in" ? "출근" : "퇴근"}
              </button>
            ))}
          </div>

          {/* 체크리스트 미리보기 */}
          {(() => {
            const previewItems = getPreviewItems(
              templates,
              previewTrigger,
              previewLocation,
              previewPosition
            );
            const remaining = previewItems.filter((item) => !previewCheckedIds.has(item.id)).length;
            const allChecked = previewItems.length > 0 && remaining === 0;

            return (
              <div className="bg-white rounded-[28px] border border-slate-100 px-5 pt-6 pb-6 space-y-4">
                {/* 미리보기 뱃지 */}
                <div className="flex items-center gap-2">
                  <Eye className="w-3.5 h-3.5 text-[#3182F6]" />
                  <span className="text-[11px] font-bold text-[#3182F6]">
                    {LOCATION_LABELS[previewLocation]} ·{" "}
                    {POSITION_LABELS[previewPosition]} 미리보기
                  </span>
                </div>

                {/* 체크리스트 헤더 */}
                <div>
                  <h3 className="text-[18px] font-bold text-[#191F28]">
                    {previewTrigger === "check_in" ? "오픈 준비를 확인해요" : "마감 전 확인해요"}
                  </h3>
                  <p className="text-[13px] text-[#8B95A1] mt-1">
                    {previewItems.length === 0
                      ? "표시될 항목이 없어요"
                      : allChecked
                      ? "모두 완료했어요 🎉"
                      : `${remaining}개 항목을 확인해주세요`}
                  </p>
                </div>

                {/* 항목 목록 */}
                {previewItems.length === 0 ? (
                  <div className="py-6 flex flex-col items-center gap-2">
                    <ClipboardList className="w-8 h-8 text-[#D1D6DB]" />
                    <p className="text-[13px] text-[#8B95A1]">해당 조합에 활성 항목이 없어요.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {previewItems.map((item) => {
                      const checked = previewCheckedIds.has(item.id);
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            if (checked) return;
                            setPreviewCheckedIds((prev) => new Set(prev).add(item.id));
                          }}
                          disabled={checked}
                          className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left transition-colors ${
                            checked ? "bg-[#E8F3FF]" : "bg-[#F2F4F6] active:bg-[#E8F3FF]"
                          }`}
                        >
                          {checked ? (
                            <CheckCircle2 className="w-5 h-5 text-[#3182F6] shrink-0" />
                          ) : (
                            <Circle className="w-5 h-5 text-[#D1D6DB] shrink-0" />
                          )}
                          <span
                            className={`text-[14px] font-semibold ${
                              checked ? "text-[#3182F6]" : "text-[#191F28]"
                            }`}
                          >
                            {item.title}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 완료 버튼 */}
                <button
                  onClick={() => setPreviewCheckedIds(new Set())}
                  disabled={!allChecked}
                  className={`w-full h-14 rounded-2xl font-bold text-[16px] transition-all ${
                    allChecked
                      ? "bg-[#3182F6] text-white active:scale-[0.98]"
                      : "bg-[#F2F4F6] text-[#B0B8C1] cursor-not-allowed"
                  }`}
                >
                  {allChecked
                    ? previewTrigger === "check_in"
                      ? "확인 완료 (초기화)"
                      : "퇴근할게요 (초기화)"
                    : previewItems.length === 0
                    ? "항목 없음"
                    : `${remaining}개 남았어요`}
                </button>
              </div>
            );
          })()}
        </>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="항목을 삭제할까요?"
        description="삭제하면 복구할 수 없어요."
        confirmLabel="삭제하기"
        cancelLabel="취소"
        onConfirm={() => deleteTarget && deleteTemplate(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
