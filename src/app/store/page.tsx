"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import {
  Megaphone,
  BookOpen,
  Pin,
  Search,
  X,
  Plus,
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import Image from "next/image";
import type { Announcement } from "@/types/announcement";
import type { RecipeCategory, RecipeItem } from "@/types/recipe";

type Tab = "announcements" | "recipes";

export default function StorePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("announcements");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [recentIds, setRecentIds] = useState<string[]>([]);

  // 공지사항 데이터
  const { data: announcementData, isLoading: announcementLoading } = useSWR(
    user ? ["announcements-list", user.id] : null,
    async ([, userId]) => {
      const supabase = createClient();
      const [{ data: items }, { data: reads }] = await Promise.all([
        supabase
          .from("announcements")
          .select("*")
          .order("is_pinned", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("announcement_reads")
          .select("announcement_id")
          .eq("profile_id", userId),
      ]);
      return {
        announcements: (items as Announcement[]) ?? [],
        readIds: new Set(
          (reads ?? []).map((r: any) => r.announcement_id as string)
        ),
      };
    },
    { dedupingInterval: 120_000, revalidateOnFocus: false }
  );

  // 레시피 데이터
  const { data: recipeData, isLoading: recipeLoading } = useSWR(
    user ? ["recipes-list", user.id] : null,
    async ([, userId]) => {
      const supabase = createClient();
      let canCreate = false;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, employment_type")
        .eq("id", userId)
        .single();
      canCreate =
        profile?.role === "admin" || profile?.employment_type === "full_time";

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
      return {
        categories: (cats as RecipeCategory[]) ?? [],
        recipes: (items as RecipeItem[]) ?? [],
        canCreate,
      };
    },
    { dedupingInterval: 300_000, revalidateOnFocus: false }
  );

  const announcements = announcementData?.announcements ?? [];
  const readIds = announcementData?.readIds ?? new Set<string>();
  const categories = recipeData?.categories ?? [];
  const recipes = recipeData?.recipes ?? [];
  const canCreate = recipeData?.canCreate ?? false;

  // 첫 번째 카테고리 자동 선택
  useEffect(() => {
    if (categories.length > 0 && selectedCategory === null) {
      setSelectedCategory(categories[0].id);
    }
  }, [categories, selectedCategory]);

  // 최근 본 레시피 로드
  useEffect(() => {
    try {
      const stored: string[] = JSON.parse(
        localStorage.getItem("recent_recipes") || "[]"
      );
      setRecentIds(stored);
    } catch {}
  }, []);

  const filteredRecipes = searchQuery.trim()
    ? recipes.filter((r) =>
        r.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : selectedCategory
    ? recipes.filter((r) => r.category_id === selectedCategory)
    : recipes;

  const unreadCount = announcements.filter((a) => !readIds.has(a.id)).length;

  return (
    <div className="flex min-h-screen flex-col bg-[#F2F4F6] font-pretendard">
      {/* 헤더 */}
      <header className="sticky top-0 z-10 px-5 pt-5 pb-0 bg-[#F2F4F6]">
        <h1 className="text-[22px] font-bold text-[#191F28] mb-4">매장</h1>

        {/* 탭 스위처 */}
        <div className="flex bg-white rounded-2xl p-1 border border-[#E5E8EB] gap-1">
          <button
            onClick={() => setActiveTab("announcements")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[14px] font-bold transition-all ${
              activeTab === "announcements"
                ? "bg-[#3182F6] text-white shadow-sm"
                : "text-[#8B95A1]"
            }`}
          >
            <Megaphone className="w-4 h-4" />
            공지사항
            {unreadCount > 0 && activeTab !== "announcements" && (
              <span className="w-4 h-4 text-[10px] font-bold text-white bg-red-400 rounded-full flex items-center justify-center leading-none">
                {unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("recipes")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[14px] font-bold transition-all ${
              activeTab === "recipes"
                ? "bg-[#3182F6] text-white shadow-sm"
                : "text-[#8B95A1]"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            레시피
          </button>
        </div>
      </header>

      {/* 공지사항 탭 */}
      {activeTab === "announcements" && (
        <main className="flex-1 px-5 py-4 pb-24 space-y-3">
          {announcementLoading ? (
            <>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-20 bg-white animate-pulse rounded-[20px]"
                />
              ))}
            </>
          ) : announcements.length === 0 ? (
            <div className="bg-white rounded-[20px] p-10 border border-slate-100 flex flex-col items-center gap-3 mt-4">
              <Megaphone className="w-10 h-10 text-[#D1D6DB]" />
              <p className="text-[14px] text-[#8B95A1]">등록된 공지가 없어요.</p>
            </div>
          ) : (
            announcements.map((item) => {
              const isRead = readIds.has(item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => router.push(`/announcements/${item.id}`)}
                  className="w-full text-left bg-white rounded-[20px] px-5 py-4 border border-slate-100 flex items-start gap-3 active:scale-[0.99] transition-transform"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {item.is_pinned && (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-[#3182F6]">
                          <Pin className="w-3 h-3" />
                          고정
                        </span>
                      )}
                      {!isRead && (
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                      )}
                    </div>
                    <p
                      className={`text-[14px] font-bold truncate ${isRead ? "text-[#8B95A1]" : "text-[#191F28]"}`}
                    >
                      {item.title}
                    </p>
                    <p className="text-[12px] text-[#B0B8C1] mt-0.5 truncate">
                      {item.content.split("\n")[0]}
                    </p>
                    <p className="text-[11px] text-[#D1D6DB] mt-1">
                      {format(new Date(item.created_at), "yyyy.MM.dd", {
                        locale: ko,
                      })}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </main>
      )}

      {/* 레시피 탭 */}
      {activeTab === "recipes" && (
        <>
          {/* 검색 */}
          <div className="px-5 pt-3 pb-0">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B95A1]" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="레시피 검색"
                className="w-full bg-white rounded-2xl pl-9 pr-9 py-3 text-[14px] text-[#191F28] placeholder:text-[#B0B8C1] outline-none border border-[#E5E8EB]"
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
            <div className="flex gap-2 px-5 py-3 overflow-x-auto scrollbar-hide">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`shrink-0 px-4 py-2 rounded-full text-[13px] font-semibold transition-all ${
                    selectedCategory === cat.id
                      ? "bg-[#3182F6] text-white"
                      : "bg-white text-[#4E5968] border border-[#E5E8EB]"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}

          <main className="flex-1 px-5 py-3 pb-24 space-y-3">
            {recipeLoading ? (
              <>
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="bg-white rounded-[28px] h-[100px] animate-pulse border border-slate-100"
                  />
                ))}
              </>
            ) : (
              <>
                {/* 최근 본 레시피 */}
                {!searchQuery && recentIds.length > 0 && (() => {
                  const recentRecipes = recentIds
                    .map((rid) => recipes.find((r) => r.id === rid))
                    .filter(Boolean) as typeof recipes;
                  if (recentRecipes.length === 0) return null;
                  return (
                    <div className="space-y-2 mb-1">
                      <p className="text-[13px] font-semibold text-[#8B95A1] px-1">
                        최근 본 레시피
                      </p>
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

                {filteredRecipes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <BookOpen className="w-10 h-10 text-[#8B95A1]" />
                    <p className="text-[15px] text-[#8B95A1]">
                      {searchQuery
                        ? `"${searchQuery}" 검색 결과가 없어요`
                        : "아직 등록된 레시피가 없어요"}
                    </p>
                  </div>
                ) : (
                  filteredRecipes.map((recipe) => (
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
                    </button>
                  ))
                )}
              </>
            )}
          </main>

          {canCreate && (
            <button
              onClick={() => router.push("/recipes/new")}
              className="fixed bottom-20 right-6 w-14 h-14 bg-[#3182F6] text-white rounded-full shadow-lg shadow-blue-500/30 flex items-center justify-center active:scale-95 transition-all z-40"
              aria-label="레시피 추가하기"
            >
              <Plus className="w-6 h-6" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
