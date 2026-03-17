"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { ChevronLeft, BookOpen } from "lucide-react";
import Image from "next/image";
import type { RecipeCategory, RecipeItem } from "@/types/recipe";

export default function RecipesPage() {
  const [categories, setCategories] = useState<RecipeCategory[]>([]);
  const [recipes, setRecipes] = useState<RecipeItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
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

      const catList = cats ?? [];
      setCategories(catList);
      setRecipes(items ?? []);
      if (catList.length > 0) setSelectedCategory(catList[0].id);
      setLoading(false);
    };

    fetchData();
  }, []);

  const filtered = selectedCategory
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

      {/* 카테고리 탭 */}
      {categories.length > 0 && (
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
      <main className="flex-1 px-5 py-5 space-y-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <BookOpen className="w-10 h-10 text-[#8B95A1]" />
            <p className="text-[15px] text-[#8B95A1]">아직 등록된 레시피가 없어요</p>
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
    </div>
  );
}
