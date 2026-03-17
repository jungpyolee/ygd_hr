"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Plus, BookOpen, Eye, EyeOff, Trash2, Copy, Search, X, Settings2 } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import type { RecipeCategory, RecipeItem } from "@/types/recipe";

export default function AdminRecipesPage() {
  const [categories, setCategories] = useState<RecipeCategory[]>([]);
  const [recipes, setRecipes] = useState<RecipeItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | "all">(
    "all"
  );
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<RecipeItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const supabase = createClient();
  const router = useRouter();

  const fetchData = async () => {
    const [{ data: cats }, { data: items }] = await Promise.all([
      supabase
        .from("recipe_categories")
        .select("*")
        .order("order_index", { ascending: true }),
      supabase
        .from("recipe_items")
        .select("*, recipe_categories(name)")
        .order("order_index", { ascending: true }),
    ]);
    setCategories(cats ?? []);
    setRecipes(items ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const togglePublish = async (recipe: RecipeItem) => {
    const { error } = await supabase
      .from("recipe_items")
      .update({ is_published: !recipe.is_published })
      .eq("id", recipe.id);

    if (error) {
      toast.error("공개 상태를 변경할 수 없어요", {
        description: "잠시 후 다시 시도해주세요",
      });
      return;
    }
    toast.success(recipe.is_published ? "비공개로 전환했어요" : "공개로 전환했어요");
    fetchData();
  };

  const deleteRecipe = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from("recipe_items")
      .delete()
      .eq("id", deleteTarget.id);

    if (error) {
      toast.error("레시피를 삭제할 수 없어요", {
        description: "잠시 후 다시 시도해주세요",
      });
      return;
    }
    toast.success("레시피를 삭제했어요");
    setDeleteTarget(null);
    fetchData();
  };

  const copyRecipe = async (recipe: RecipeItem) => {
    const newId = crypto.randomUUID();
    const { error: recipeError } = await supabase.from("recipe_items").insert({
      id: newId,
      category_id: recipe.category_id,
      name: `${recipe.name} (복사)`,
      description: recipe.description,
      thumbnail_url: recipe.thumbnail_url,
      video_url: recipe.video_url,
      is_published: false,
      order_index: recipes.length,
    });
    if (recipeError) {
      toast.error("레시피를 복사할 수 없어요", {
        description: "잠시 후 다시 시도해주세요",
      });
      return;
    }
    const { data: stepsData } = await supabase
      .from("recipe_steps")
      .select("*")
      .eq("recipe_id", recipe.id)
      .order("step_number", { ascending: true });
    if (stepsData && stepsData.length > 0) {
      await supabase.from("recipe_steps").insert(
        stepsData.map((s) => ({
          id: crypto.randomUUID(),
          recipe_id: newId,
          step_number: s.step_number,
          title: s.title,
          content: s.content,
          image_url: s.image_url,
        }))
      );
    }
    toast.success("레시피를 복사했어요", { description: "비공개로 저장됐어요" });
    fetchData();
  };

  const baseFiltered =
    selectedCategory === "all"
      ? recipes
      : recipes.filter((r) => r.category_id === selectedCategory);

  const filtered = searchQuery.trim()
    ? recipes.filter((r) =>
        r.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : baseFiltered;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-8 w-28 bg-slate-200 animate-pulse rounded-xl" />
          <div className="h-10 w-32 bg-slate-200 animate-pulse rounded-xl" />
        </div>
        <div className="flex gap-2 pb-1">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 w-16 bg-slate-200 animate-pulse rounded-full shrink-0" />
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white rounded-[20px] h-[88px] animate-pulse border border-slate-100"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold text-[#191F28]">레시피 관리</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/admin/recipes/categories")}
            aria-label="카테고리 관리"
            className="w-11 h-11 flex items-center justify-center rounded-xl bg-[#F2F4F6] hover:bg-[#E5E8EB] transition-colors"
          >
            <Settings2 className="w-5 h-5 text-[#4E5968]" />
          </button>
          <button
            onClick={() => router.push("/admin/recipes/new")}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#3182F6] text-white rounded-xl text-[14px] font-bold hover:bg-blue-600 transition-colors active:scale-95"
          >
            <Plus className="w-4 h-4" />
            레시피 추가하기
          </button>
        </div>
      </div>

      {/* 검색 */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B95A1]" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="레시피 검색"
          className="w-full bg-[#F2F4F6] rounded-xl pl-9 pr-9 py-2.5 text-[14px] text-[#191F28] placeholder:text-[#B0B8C1] outline-none"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            aria-label="검색 초기화"
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center"
          >
            <X className="w-4 h-4 text-[#8B95A1]" />
          </button>
        )}
      </div>

      {/* 카테고리 필터 */}
      {!searchQuery && (
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        <button
          onClick={() => setSelectedCategory("all")}
          className={`shrink-0 px-4 py-2 rounded-full text-[13px] font-semibold transition-all ${
            selectedCategory === "all"
              ? "bg-[#191F28] text-white"
              : "bg-[#F2F4F6] text-[#4E5968]"
          }`}
        >
          전체 ({recipes.length})
        </button>
        {categories.map((cat) => {
          const count = recipes.filter((r) => r.category_id === cat.id).length;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`shrink-0 px-4 py-2 rounded-full text-[13px] font-semibold transition-all ${
                selectedCategory === cat.id
                  ? "bg-[#191F28] text-white"
                  : "bg-[#F2F4F6] text-[#4E5968]"
              }`}
            >
              {cat.name} ({count})
            </button>
          );
        })}
      </div>
      )}

      {/* 레시피 목록 */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 bg-white rounded-[20px] border border-slate-100">
          <BookOpen className="w-10 h-10 text-[#8B95A1]" />
          <p className="text-[15px] text-[#8B95A1]">
            {searchQuery ? `"${searchQuery}" 검색 결과가 없어요` : "아직 등록된 레시피가 없어요"}
          </p>
          <button
            onClick={() => router.push("/admin/recipes/new")}
            className="mt-2 px-5 py-2.5 bg-[#3182F6] text-white rounded-xl text-[14px] font-bold"
          >
            첫 레시피 추가하기
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((recipe) => (
            <div
              key={recipe.id}
              onClick={() => router.push(`/admin/recipes/${recipe.id}/edit`)}
              className="bg-white rounded-[20px] p-4 border border-slate-100 flex items-center gap-4 cursor-pointer active:bg-[#F2F4F6] transition-colors"
            >
              {recipe.thumbnail_url ? (
                <div className="relative w-16 h-16 rounded-[12px] overflow-hidden shrink-0 bg-[#F2F4F6]">
                  <Image
                    src={recipe.thumbnail_url}
                    alt={recipe.name}
                    fill
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-[12px] bg-[#F2F4F6] flex items-center justify-center shrink-0">
                  <BookOpen className="w-6 h-6 text-[#8B95A1]" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold text-[#191F28] truncate">
                  {recipe.name}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                      recipe.is_published
                        ? "bg-[#E8F3FF] text-[#3182F6]"
                        : "bg-[#F2F4F6] text-[#8B95A1]"
                    }`}
                  >
                    {recipe.is_published ? "공개" : "비공개"}
                  </span>
                  {recipe.recipe_categories && (
                    <p className="text-[12px] text-[#8B95A1] truncate">
                      {recipe.recipe_categories.name}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); copyRecipe(recipe); }}
                  aria-label="레시피 복사"
                  className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-[#F2F4F6] transition-colors"
                >
                  <Copy className="w-4 h-4 text-[#4E5968]" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); togglePublish(recipe); }}
                  aria-label={recipe.is_published ? "비공개로 전환" : "공개로 전환"}
                  className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-[#F2F4F6] transition-colors"
                >
                  {recipe.is_published ? (
                    <Eye className="w-4 h-4 text-[#3182F6]" />
                  ) : (
                    <EyeOff className="w-4 h-4 text-[#8B95A1]" />
                  )}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(recipe); }}
                  aria-label="레시피 삭제"
                  className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-red-50 transition-colors"
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
        title={`"${deleteTarget?.name}"을 삭제할까요?`}
        description="삭제하면 모든 단계 정보도 함께 사라져요."
        confirmLabel="삭제할게요"
        cancelLabel="취소"
        variant="destructive"
        onConfirm={deleteRecipe}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
