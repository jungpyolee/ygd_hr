"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import RecipeForm from "@/components/recipe/RecipeForm";
import type { RecipeCategory } from "@/types/recipe";

export default function RecipeNewPage() {
  const [categories, setCategories] = useState<RecipeCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, employment_type")
        .eq("id", user.id)
        .single();

      const canCreate =
        profile?.role === "admin" ||
        profile?.employment_type === "full_time";

      if (!canCreate) {
        setUnauthorized(true);
        setLoading(false);
        return;
      }

      if (profile?.role === "admin") {
        router.replace("/admin/recipes/new");
        return;
      }

      const { data: cats } = await supabase
        .from("recipe_categories")
        .select("*")
        .order("order_index", { ascending: true });

      setCategories(cats ?? []);
      setLoading(false);
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-[#F2F4F6] font-pretendard">
        <div className="h-14 bg-white border-b border-[#E5E8EB]" />
        <div className="px-5 pt-6 space-y-4">
          <div className="h-8 w-32 bg-slate-200 animate-pulse rounded-xl" />
          <div className="bg-white rounded-[20px] h-[200px] animate-pulse border border-slate-100" />
        </div>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="flex min-h-screen flex-col bg-[#F2F4F6] font-pretendard items-center justify-center px-6">
        <p className="text-[17px] font-bold text-[#191F28] mb-2">
          레시피 작성 권한이 없어요
        </p>
        <p className="text-[14px] text-[#8B95A1] text-center mb-6">
          레시피 작성은 정규직 직원만 가능해요
        </p>
        <button
          onClick={() => router.back()}
          className="px-6 py-3 bg-[#3182F6] text-white font-bold rounded-2xl"
        >
          돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F2F4F6] font-pretendard">
      <header className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 bg-white/80 backdrop-blur-md border-b border-[#E5E8EB]">
        <button
          onClick={() => router.back()}
          aria-label="뒤로가기"
          className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-[#F2F4F6] transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-[#191F28]" />
        </button>
        <h1 className="text-[17px] font-bold text-[#191F28]">레시피 추가하기</h1>
      </header>

      <main className="flex-1 px-5 py-5">
        <RecipeForm
          categories={categories}
          redirectAfterSave="/recipes"
          defaultPublished={true}
          canCreateCategory={false}
        />
      </main>
    </div>
  );
}
