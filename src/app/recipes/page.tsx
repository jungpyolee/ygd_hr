"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { ChevronLeft, BookOpen, Search, X, Plus } from "lucide-react";
import Image from "next/image";
import type { RecipeCategory, RecipeItem } from "@/types/recipe";

export default function RecipesPage() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const router = useRouter();

  const { data, isLoading: loading } = useSWR(
    "recipes-list",
    async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      let canCreate = false;
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, employment_type")
          .eq("id", user.id)
          .single();
        canCreate = profile?.role === "admin" || profile?.employment_type === "full_time";
      }

      const [{ data: cats }, { data: items }] = await Promise.all([
        supabase
          .from("recipe_categories")
          .select("*")
          .order("order_index", { ascending: true }),
        supabase
          .from("recipe_items")
          .select("*, recipe_categories(name)")
          .eq("is_published", true)
          .order("order_index", { ascending: true }),
      ]);

      return { categories: (cats as RecipeCategory[]) ?? [], recipes: (items as RecipeItem[]) ?? [], canCreate };
    },
    { dedupingInterval: 300_000, revalidateOnFocus: false }
  );

  const categories = data?.categories ?? [];
  const recipes = data?.recipes ?? [];
  const canCreate = data?.canCreate ?? false;

  // 첫 번째 카테고리 자동 선택
  useEffect(() => {
    if (categories.length > 0 && selectedCategory === null) {
      setSelectedCategory(categories[0].id);
    }
  }, [categories, selectedCategory]);

  // recentIds는 localStorage에서 로드
  useEffect(() => {
    try {
      const stored: string[] = JSON.parse(
        localStorage.getItem("recent_recipes") || "[]"
      );
      setRecentIds(stored);
    } catch {}
  }, []);

  const filtered = searchQuery.trim()
    ? recipes.filter((r) =>
        r.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : selectedCategory
    ? recipes.filter((r) => r.category_id === selectedCategory)
    : recipes;

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-[#F2F4F6] font-pretendard">
        <div className="h-14 bg-white border-b border-[#E5E8EB]" />
        <div className="flex gap-2 px-5 py-4 bg-white border-b border-[#E5E8EB]">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-9 w-16 bg-slate-200 animate-pulse rounded-full shrink-0" />
          ))}
        </div>
        <div className="px-5 pt-5 space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white rounded-[28px] h-[100px] animate-pulse border border-slate-100"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F2F4F6] font-pretendard">
      {/* 헤더 */}
      <header className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 bg-white/80 backdrop-blur-md border-b border-[#E5E8EB]">
        <button
          onClick={() => router.back()}
          aria-label="뒤로가기"
          className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-[#F2F4F6] transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-[#191F28]" />
        </button>
        <h1 className="text-[17px] font-bold text-[#191F28]">레시피</h1>
      </header>

      {/* 검색 */}
      <div className="px-5 py-3 bg-white border-b border-[#E5E8EB]">
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
      </div>

      {/* 카테고리 탭 */}
      {!searchQuery && categories.length > 0 && (
        <div className="flex gap-2 px-5 py-4 overflow-x-auto scrollbar-hide bg-white border-b border-[#E5E8EB]">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`shrink-0 px-4 py-2 rounded-full text-[14px] font-semibold transition-all ${
                selectedCategory === cat.id
                  ? "bg-[#3182F6] text-white"
                  : "bg-[#F2F4F6] text-[#4E5968]"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* 레시피 목록 */}
      <main className="flex-1 px-5 py-5 pb-24 space-y-3">
        {/* 최근 본 레시피 */}
        {!searchQuery && recentIds.length > 0 && (() => {
          const recentRecipes = recentIds
            .map((rid) => recipes.find((r) => r.id === rid))
            .filter(Boolean) as typeof recipes;
          if (recentRecipes.length === 0) return null;
          return (
            <div className="space-y-2 mb-1">
              <p className="text-[13px] font-semibold text-[#8B95A1] px-1">최근 본 레시피</p>
              <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
                {recentRecipes.map((recipe) => (
                  <button
                    key={recipe.id}
                    onClick={() => router.push(`/recipes/${recipe.id}`)}
                    className="shrink-0 flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
                  >
                    <div className="w-[60px] h-[60px] rounded-[16px] overflow-hidden bg-[#E8F3FF] flex items-center justify-center shrink-0">
                      {recipe.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={recipe.thumbnail_url}
                          alt={recipe.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <BookOpen className="w-5 h-5 text-[#3182F6]" />
                      )}
                    </div>
                    <p className="text-[11px] text-[#4E5968] font-medium w-[60px] text-center truncate">
                      {recipe.name}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <BookOpen className="w-10 h-10 text-[#8B95A1]" />
            <p className="text-[15px] text-[#8B95A1]">
              {searchQuery ? `"${searchQuery}" 검색 결과가 없어요` : "아직 등록된 레시피가 없어요"}
            </p>
          </div>
        ) : (
          filtered.map((recipe) => (
            <button
              key={recipe.id}
              onClick={() => router.push(`/recipes/${recipe.id}`)}
              className="w-full bg-white rounded-[28px] p-4 border border-slate-100 flex items-center gap-4 text-left active:scale-[0.98] transition-transform"
            >
              {recipe.thumbnail_url ? (
                <div className="relative w-[72px] h-[72px] rounded-[14px] overflow-hidden shrink-0 bg-[#F2F4F6]">
                  <Image
                    src={recipe.thumbnail_url}
                    alt={recipe.name}
                    fill
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="w-[72px] h-[72px] rounded-[14px] bg-[#E8F3FF] flex items-center justify-center shrink-0">
                  <BookOpen className="w-7 h-7 text-[#3182F6]" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[16px] font-bold text-[#191F28] truncate">
                  {recipe.name}
                </p>
                {recipe.description && (
                  <p className="text-[13px] text-[#8B95A1] mt-1 line-clamp-2 leading-snug">
                    {recipe.description}
                  </p>
                )}
              </div>
              <ChevronLeft className="w-5 h-5 text-[#8B95A1] rotate-180 shrink-0" />
            </button>
          ))
        )}
      </main>

      {canCreate && (
        <button
          onClick={() => router.push("/recipes/new")}
          className="fixed bottom-6 right-6 w-14 h-14 bg-[#3182F6] text-white rounded-full shadow-lg shadow-blue-500/30 flex items-center justify-center active:scale-95 transition-all z-50"
          aria-label="레시피 추가하기"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
