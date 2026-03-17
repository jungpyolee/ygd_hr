"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown, Trash2, Plus, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import type { RecipeCategory } from "@/types/recipe";

export default function AdminRecipeCategoriesPage() {
  const [categories, setCategories] = useState<RecipeCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RecipeCategory | null>(null);
  const supabase = createClient();
  const router = useRouter();

  const fetchCategories = async () => {
    const { data } = await supabase
      .from("recipe_categories")
      .select("*")
      .order("order_index", { ascending: true });
    setCategories(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const moveCategory = async (index: number, direction: "up" | "down") => {
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= categories.length) return;

    const catA = categories[index];
    const catB = categories[swapIndex];

    // upsert 는 name(NOT NULL, no default) 누락으로 실패하므로 update 사용
    const [res1, res2] = await Promise.all([
      supabase
        .from("recipe_categories")
        .update({ order_index: swapIndex })
        .eq("id", catA.id),
      supabase
        .from("recipe_categories")
        .update({ order_index: index })
        .eq("id", catB.id),
    ]);

    const error = res1.error || res2.error;
    if (error) {
      toast.error("순서를 변경할 수 없어요", {
        description: "잠시 후 다시 시도해주세요",
      });
      return;
    }

    const updated = [...categories];
    [updated[index], updated[swapIndex]] = [updated[swapIndex], updated[index]];
    setCategories(updated.map((c, i) => ({ ...c, order_index: i })));
  };

  const addCategory = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    const { error } = await supabase.from("recipe_categories").insert({
      name: newName.trim(),
      order_index: categories.length,
    });
    if (error) {
      toast.error("카테고리를 추가할 수 없어요", {
        description: "잠시 후 다시 시도해주세요",
      });
      setAdding(false);
      return;
    }
    toast.success("카테고리를 추가했어요");
    setNewName("");
    setAdding(false);
    fetchCategories();
  };

  const deleteCategory = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from("recipe_categories")
      .delete()
      .eq("id", deleteTarget.id);
    if (error) {
      toast.error("카테고리를 삭제할 수 없어요", {
        description: "레시피가 등록된 카테고리는 삭제할 수 없어요",
      });
      setDeleteTarget(null);
      return;
    }
    toast.success("카테고리를 삭제했어요");
    setDeleteTarget(null);
    fetchCategories();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-32 bg-slate-200 animate-pulse rounded-xl" />
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white rounded-[20px] h-[60px] animate-pulse border border-slate-100"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/admin/recipes")}
          aria-label="뒤로가기"
          className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-[#F2F4F6] transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-[#191F28]" />
        </button>
        <h1 className="text-[22px] font-bold text-[#191F28]">카테고리 관리</h1>
      </div>

      {/* 카테고리 목록 */}
      <div className="space-y-2">
        {categories.length === 0 ? (
          <div className="bg-white rounded-[20px] py-16 flex flex-col items-center gap-2 border border-slate-100">
            <p className="text-[15px] text-[#8B95A1]">아직 등록된 카테고리가 없어요</p>
          </div>
        ) : (
          categories.map((cat, index) => (
            <div
              key={cat.id}
              className="bg-white rounded-[20px] px-4 py-3 border border-slate-100 flex items-center gap-3"
            >
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveCategory(index, "up")}
                  disabled={index === 0}
                  aria-label="위로 이동"
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#F2F4F6] disabled:opacity-30 transition-colors"
                >
                  <ChevronUp className="w-4 h-4 text-[#4E5968]" />
                </button>
                <button
                  onClick={() => moveCategory(index, "down")}
                  disabled={index === categories.length - 1}
                  aria-label="아래로 이동"
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#F2F4F6] disabled:opacity-30 transition-colors"
                >
                  <ChevronDown className="w-4 h-4 text-[#4E5968]" />
                </button>
              </div>
              <p className="flex-1 text-[15px] font-semibold text-[#191F28]">
                {cat.name}
              </p>
              <button
                onClick={() => setDeleteTarget(cat)}
                aria-label="카테고리 삭제"
                className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4 text-red-400" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* 카테고리 추가 */}
      <div className="bg-white rounded-[20px] p-4 border border-slate-100 space-y-3">
        <p className="text-[14px] font-semibold text-[#191F28]">카테고리 추가하기</p>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCategory()}
            placeholder="카테고리 이름 (예: 음료)"
            className="flex-1 bg-[#F2F4F6] rounded-xl px-4 py-2.5 text-[14px] text-[#191F28] placeholder:text-[#B0B8C1] outline-none focus:ring-2 focus:ring-[#3182F6]/20 transition-colors"
          />
          <button
            onClick={addCategory}
            disabled={adding || !newName.trim()}
            aria-label="카테고리 추가"
            className="w-11 h-11 flex items-center justify-center bg-[#3182F6] rounded-xl disabled:opacity-50 transition-opacity"
          >
            <Plus className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title={`"${deleteTarget?.name}"을 삭제할까요?`}
        description="삭제하면 해당 카테고리가 사라져요. 레시피가 있으면 삭제할 수 없어요."
        confirmLabel="삭제할게요"
        cancelLabel="취소"
        variant="destructive"
        onConfirm={deleteCategory}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
