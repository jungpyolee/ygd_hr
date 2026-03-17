"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import RecipeForm from "@/components/recipe/RecipeForm";
import type { RecipeCategory } from "@/types/recipe";

export default function AdminRecipeNewPage() {
  const [categories, setCategories] = useState<RecipeCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    supabase
      .from("recipe_categories")
      .select("*")
      .order("order_index", { ascending: true })
      .then(({ data }) => {
        setCategories(data ?? []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-32 bg-slate-200 animate-pulse rounded-xl" />
        <div className="bg-white rounded-[20px] h-[200px] animate-pulse border border-slate-100" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F2F4F6] transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-[#191F28]" />
        </button>
        <h1 className="text-[22px] font-bold text-[#191F28]">레시피 추가하기</h1>
      </div>

      <RecipeForm categories={categories} />
    </div>
  );
}
