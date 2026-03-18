"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter, useParams } from "next/navigation";
import { ChevronLeft, Pencil, Trash2 } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import type { RecipeIngredient, RecipeItem, RecipeStep } from "@/types/recipe";
import RecipeComments from "@/components/recipe/RecipeComments";

export default function RecipeDetailPage() {
  const [recipe, setRecipe] = useState<RecipeItem | null>(null);
  const [steps, setSteps] = useState<RecipeStep[]>([]);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [canDelete, setCanDelete] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const supabase = createClient();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  useEffect(() => {
    const fetchData = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let userId: string | null = null;
      let isAdmin = false;
      let isFullTime = false;

      if (user) {
        userId = user.id;
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, employment_type")
          .eq("id", user.id)
          .single();
        isAdmin = profile?.role === "admin";
        isFullTime = profile?.employment_type === "full_time";
      }

      const [{ data: recipeData }, { data: stepsData }, { data: ingredientsData }] = await Promise.all([
        supabase
          .from("recipe_items")
          .select("*, recipe_categories(name), profiles(name)")
          .eq("id", id)
          .single(),
        supabase
          .from("recipe_steps")
          .select("*")
          .eq("recipe_id", id)
          .order("step_number", { ascending: true }),
        supabase
          .from("recipe_ingredients")
          .select("*")
          .eq("recipe_id", id)
          .order("order_index", { ascending: true }),
      ]);

      if (!recipeData) {
        router.replace("/recipes");
        return;
      }
      setRecipe(recipeData);
      setSteps(stepsData ?? []);
      setIngredients((ingredientsData as RecipeIngredient[]) ?? []);
      setCanDelete(
        isAdmin ||
          (isFullTime && !!userId && recipeData.created_by === userId)
      );
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
          <div className="flex items-center gap-2 flex-wrap">
            {recipe.recipe_categories && (
              <span className="text-[12px] text-[#8B95A1]">
                {recipe.recipe_categories.name}
              </span>
            )}
            {recipe.profiles?.name && (
              <>
                {recipe.recipe_categories && (
                  <span className="text-[12px] text-[#D1D6DB]">·</span>
                )}
                <span className="text-[12px] text-[#8B95A1]">
                  {recipe.profiles.name}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {canDelete && (
            <button
              onClick={() => router.push(`/recipes/${id}/edit`)}
              aria-label="레시피 수정"
              className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-[#F2F4F6] transition-colors"
            >
              <Pencil className="w-4 h-4 text-[#4E5968]" />
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => setDeleteOpen(true)}
              aria-label="레시피 삭제"
              className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4 text-red-400" />
            </button>
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

        {/* 재료 */}
        {ingredients.length > 0 && (
          <div className="bg-white rounded-[20px] p-5 border border-slate-100">
            <h2 className="text-[15px] font-bold text-[#191F28] mb-3">재료</h2>
            <div className="space-y-2">
              {ingredients.map((ing) => (
                <div
                  key={ing.id}
                  className="flex items-center justify-between py-1.5 border-b border-[#F2F4F6] last:border-0"
                >
                  <span className="text-[14px] text-[#191F28] font-medium">
                    {ing.name}
                  </span>
                  <span className="text-[14px] text-[#4E5968]">
                    {ing.amount}
                    {ing.unit ? ` ${ing.unit}` : ""}
                  </span>
                </div>
              ))}
            </div>
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

        {/* 댓글 */}
        <RecipeComments recipeId={id} recipeCreatedBy={recipe.created_by} />
      </main>

      <ConfirmDialog
        isOpen={deleteOpen}
        title="레시피를 삭제할까요?"
        description="삭제하면 복구할 수 없어요."
        confirmLabel="삭제하기"
        cancelLabel="취소"
        onConfirm={async () => {
          setDeleteOpen(false);
          await supabase.from("recipe_steps").delete().eq("recipe_id", id);
          const { error } = await supabase
            .from("recipe_items")
            .delete()
            .eq("id", id);
          if (error) {
            toast.error("삭제에 실패했어요", {
              description: "잠시 후 다시 시도해 주세요.",
            });
          } else {
            toast.success("레시피를 삭제했어요");
            router.replace("/recipes");
          }
        }}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
