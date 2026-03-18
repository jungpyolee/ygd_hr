"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import { Plus, Trash2, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import type { ChecklistTemplate } from "@/types/checklist";

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

export default function AdminChecklistsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [activeTab, setActiveTab] = useState<TriggerTab>("check_in");
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ChecklistTemplate | null>(null);

  // 신규 항목 입력 상태
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newLocation, setNewLocation] = useState<string>("");
  const [newPosition, setNewPosition] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const fetchTemplates = async () => {
    const { data } = await supabase
      .from("checklist_templates")
      .select("*")
      .order("trigger")
      .order("order_index");
    setTemplates((data as ChecklistTemplate[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const filtered = templates.filter((t) => t.trigger === activeTab);

  const toggleActive = async (item: ChecklistTemplate) => {
    const { error } = await supabase
      .from("checklist_templates")
      .update({ is_active: !item.is_active })
      .eq("id", item.id);
    if (error) {
      toast.error("변경에 실패했어요", { description: "잠시 후 다시 시도해 주세요." });
    } else {
      fetchTemplates();
    }
  };

  const addTemplate = async () => {
    if (!newTitle.trim()) return;
    setSaving(true);

    const maxOrder = filtered.reduce((max, t) => Math.max(max, t.order_index), -1);
    const { error } = await supabase.from("checklist_templates").insert({
      title: newTitle.trim(),
      trigger: activeTab,
      work_location: newLocation || null,
      cafe_position: newPosition || null,
      order_index: maxOrder + 1,
    });

    if (error) {
      toast.error("항목 추가에 실패했어요", { description: "잠시 후 다시 시도해 주세요." });
    } else {
      toast.success("항목을 추가했어요");
      setNewTitle("");
      setNewLocation("");
      setNewPosition("");
      setShowAddForm(false);
      fetchTemplates();
    }
    setSaving(false);
  };

  const deleteTemplate = async (item: ChecklistTemplate) => {
    const { error } = await supabase
      .from("checklist_templates")
      .delete()
      .eq("id", item.id);
    if (error) {
      toast.error("삭제에 실패했어요", { description: "잠시 후 다시 시도해 주세요." });
    } else {
      toast.success("항목을 삭제했어요");
      fetchTemplates();
    }
    setDeleteTarget(null);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-slate-100 animate-pulse rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold text-[#191F28]">체크리스트 설정</h1>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#3182F6] text-white text-[14px] font-bold rounded-2xl"
        >
          <Plus className="w-4 h-4" />
          항목 추가하기
        </button>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 bg-[#F2F4F6] rounded-2xl p-1">
        {(["check_in", "check_out"] as TriggerTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 rounded-xl text-[14px] font-bold transition-colors ${
              activeTab === tab
                ? "bg-white text-[#191F28] shadow-sm"
                : "text-[#8B95A1]"
            }`}
          >
            {tab === "check_in" ? "출근 체크리스트" : "퇴근 체크리스트"}
          </button>
        ))}
      </div>

      {/* 신규 항목 추가 폼 */}
      {showAddForm && (
        <div className="bg-white rounded-[20px] p-5 border border-[#3182F6]/30 space-y-3">
          <p className="text-[14px] font-bold text-[#191F28]">새 항목 추가</p>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="항목명 (예: 바닥 닦기)"
            autoFocus
            className="w-full bg-[#F2F4F6] rounded-xl px-4 py-3 text-[14px] text-[#191F28] placeholder:text-[#B0B8C1] outline-none focus:ring-2 focus:ring-[#3182F6]/20"
          />
          <div className="flex gap-2">
            <select
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              className="flex-1 bg-[#F2F4F6] rounded-xl px-3 py-2.5 text-[13px] text-[#4E5968] outline-none"
            >
              <option value="">전체 근무지</option>
              <option value="cafe">카페</option>
              <option value="factory">공장</option>
              <option value="catering">케이터링</option>
            </select>
            <select
              value={newPosition}
              onChange={(e) => setNewPosition(e.target.value)}
              className="flex-1 bg-[#F2F4F6] rounded-xl px-3 py-2.5 text-[13px] text-[#4E5968] outline-none"
            >
              <option value="">전체 포지션</option>
              <option value="hall">홀</option>
              <option value="kitchen">주방</option>
              <option value="showroom">쇼룸</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={addTemplate}
              disabled={!newTitle.trim() || saving}
              className="flex-1 py-3 bg-[#3182F6] text-white text-[14px] font-bold rounded-xl disabled:opacity-40"
            >
              저장하기
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setNewTitle("");
                setNewLocation("");
                setNewPosition("");
              }}
              className="flex-1 py-3 bg-[#F2F4F6] text-[#4E5968] text-[14px] font-bold rounded-xl"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 항목 목록 */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-[20px] p-10 border border-slate-100 flex flex-col items-center gap-3">
          <ClipboardList className="w-10 h-10 text-[#D1D6DB]" />
          <p className="text-[14px] text-[#8B95A1]">등록된 항목이 없어요.</p>
          <p className="text-[12px] text-[#B0B8C1]">위 버튼으로 항목을 추가해 보세요.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <div
              key={item.id}
              className={`bg-white rounded-[20px] px-5 py-4 border flex items-center gap-3 ${
                item.is_active ? "border-slate-100" : "border-slate-100 opacity-50"
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className={`text-[14px] font-bold ${item.is_active ? "text-[#191F28]" : "text-[#8B95A1] line-through"}`}>
                  {item.title}
                </p>
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  {item.work_location && (
                    <span className="text-[11px] bg-[#F2F4F6] text-[#4E5968] px-2 py-0.5 rounded-full">
                      {LOCATION_LABELS[item.work_location]}
                    </span>
                  )}
                  {item.cafe_position && (
                    <span className="text-[11px] bg-[#F2F4F6] text-[#4E5968] px-2 py-0.5 rounded-full">
                      {POSITION_LABELS[item.cafe_position]}
                    </span>
                  )}
                  {!item.work_location && !item.cafe_position && (
                    <span className="text-[11px] text-[#B0B8C1]">전체 적용</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* 활성/비활성 토글 */}
                <button
                  onClick={() => toggleActive(item)}
                  className={`w-10 h-5.5 rounded-full transition-colors relative flex items-center ${
                    item.is_active ? "bg-[#3182F6]" : "bg-[#D1D6DB]"
                  }`}
                  style={{ height: "22px", width: "40px" }}
                  aria-label={item.is_active ? "비활성화" : "활성화"}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                      item.is_active ? "left-5" : "left-0.5"
                    }`}
                  />
                </button>
                <button
                  onClick={() => setDeleteTarget(item)}
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
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
