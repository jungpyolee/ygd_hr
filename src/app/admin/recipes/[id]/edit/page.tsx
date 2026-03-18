"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter, useParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import RecipeForm from "@/components/recipe/RecipeForm";
import type { RecipeCategory, RecipeIngredient, RecipeItem, RecipeStep } from "@/types/recipe";

export default function AdminRecipeEditPage() {
  const [categories, setCategories] = useState<RecipeCategory[]>([]);
  const [recipe, setRecipe] = useState<RecipeItem | null>(null);
  const [steps, setSteps] = useState<RecipeStep[]>([]);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: cats }, { data: recipeData }, { data: stepsData }, { data: ingredientsData }] =
        await Promise.all([
          supabase
            .from("recipe_categories")
            .select("*")
            .order("order_index", { ascending: true }),
          supabase.from("recipe_items").select("*").eq("id", id).single(),
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
        router.replace("/admin/recipes");
        return;
      }
      setCategories(cats ?? []);
      setRecipe(recipeData);
      setSteps(stepsData ?? []);
      setIngredients((ingredientsData as RecipeIngredient[]) ?? []);
      setLoading(false);
    };

    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-32 bg-slate-200 animate-pulse rounded-xl" />
        <div className="bg-white rounded-[20px] h-[200px] animate-pulse border border-slate-100" />
      </div>
    );
  }

  if (!recipe) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F2F4F6] transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-[#191F28]" />
        </button>
        <h1 className="text-[22px] font-bold text-[#191F28]">레시피 수정하기</h1>
      </div>

      <RecipeForm
        categories={categories}
        initialRecipe={recipe}
        initialSteps={steps}
        initialIngredients={ingredients}
      />
    </div>
  );
}
