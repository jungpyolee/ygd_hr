"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter, useParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import Image from "next/image";
import type { RecipeItem, RecipeStep } from "@/types/recipe";

export default function RecipeDetailPage() {
  const [recipe, setRecipe] = useState<RecipeItem | null>(null);
  const [steps, setSteps] = useState<RecipeStep[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: recipeData }, { data: stepsData }] = await Promise.all([
        supabase
          .from("recipe_items")
          .select("*, recipe_categories(name)")
          .eq("id", id)
          .single(),
        supabase
          .from("recipe_steps")
          .select("*")
          .eq("recipe_id", id)
          .order("step_number", { ascending: true }),
      ]);

      if (!recipeData) {
        router.replace("/recipes");
        return;
      }
      setRecipe(recipeData);
      setSteps(stepsData ?? []);
      setLoading(false);

      // 최근 본 레시피 저장
      try {
        const prev: string[] = JSON.parse(
          localStorage.getItem("recent_recipes") || "[]"
        );
        const updated = [id, ...prev.filter((rid) => rid !== id)].slice(0, 6);
        localStorage.setItem("recent_recipes", JSON.stringify(updated));
      } catch {}

    };

    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-[#F2F4F6] font-pretendard">
        <div className="h-14 bg-white border-b border-[#E5E8EB]" />
        <div className="px-5 pt-6 space-y-4">
          <div className="bg-white rounded-[20px] h-[220px] animate-pulse" />
          <div className="bg-white rounded-[20px] h-[120px] animate-pulse" />
          <div className="bg-white rounded-[20px] h-[120px] animate-pulse" />
        </div>
      </div>
    );
  }

  if (!recipe) return null;

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
        <div className="flex-1 min-w-0">
          <h1 className="text-[17px] font-bold text-[#191F28] truncate">
            {recipe.name}
          </h1>
          {recipe.recipe_categories && (
            <p className="text-[12px] text-[#8B95A1]">
              {recipe.recipe_categories.name}
            </p>
          )}
        </div>
      </header>

      <main className="flex-1 px-5 py-5 space-y-4 pb-10">
        {/* 영상 또는 썸네일 */}
        {recipe.video_url ? (
          <div className="w-full rounded-[20px] overflow-hidden bg-black aspect-video">
            <video
              src={recipe.video_url}
              controls
              playsInline
              className="w-full h-full object-contain"
            />
          </div>
        ) : recipe.thumbnail_url ? (
          <div className="relative w-full aspect-video rounded-[20px] overflow-hidden bg-[#F2F4F6]">
            <Image
              src={recipe.thumbnail_url}
              alt={recipe.name}
              fill
              className="object-cover"
            />
          </div>
        ) : null}

        {/* 설명 */}
        {recipe.description && (
          <div className="bg-white rounded-[20px] p-5 border border-slate-100">
            <p className="text-[15px] text-[#4E5968] leading-relaxed">
              {recipe.description}
            </p>
          </div>
        )}

        {/* 단계 */}
        {steps.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-[16px] font-bold text-[#191F28] px-1">
              만드는 방법
            </h2>
            {steps.map((step) => (
              <div
                key={step.id}
                className="bg-white rounded-[20px] p-5 border border-slate-100"
              >
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-[#3182F6] flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[13px] font-bold text-white">
                      {step.step_number}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    {step.title && (
                      <p className="text-[15px] font-bold text-[#191F28] mb-1">
                        {step.title}
                      </p>
                    )}
                    <p className="text-[14px] text-[#4E5968] leading-relaxed">
                      {step.content}
                    </p>
                    {step.image_url && (
                      <div className="relative w-full aspect-video mt-3 rounded-[12px] overflow-hidden bg-[#F2F4F6]">
                        <Image
                          src={step.image_url}
                          alt={`step ${step.step_number}`}
                          fill
                          className="object-cover"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
