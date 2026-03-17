"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Plus, Trash2, GripVertical, ImageIcon, Video, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import type { RecipeCategory, RecipeItem, RecipeStep } from "@/types/recipe";

interface StepDraft {
  id?: string;
  step_number: number;
  title: string;
  content: string;
  image_url: string | null;
  imageFile?: File;
}

interface RecipeFormProps {
  categories: RecipeCategory[];
  initialRecipe?: RecipeItem;
  initialSteps?: RecipeStep[];
}

export default function RecipeForm({
  categories,
  initialRecipe,
  initialSteps = [],
}: RecipeFormProps) {
  const isEdit = !!initialRecipe;
  const supabase = createClient();
  const router = useRouter();

  // 기본 필드
  const [categoryId, setCategoryId] = useState(
    initialRecipe?.category_id ?? categories[0]?.id ?? ""
  );
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [name, setName] = useState(initialRecipe?.name ?? "");
  const [description, setDescription] = useState(
    initialRecipe?.description ?? ""
  );
  const [isPublished, setIsPublished] = useState(
    initialRecipe?.is_published ?? false
  );

  // 썸네일
  const [thumbnailUrl, setThumbnailUrl] = useState(
    initialRecipe?.thumbnail_url ?? null
  );
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const thumbnailRef = useRef<HTMLInputElement>(null);

  // 영상
  const [videoUrl, setVideoUrl] = useState(initialRecipe?.video_url ?? null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  // 단계
  const [steps, setSteps] = useState<StepDraft[]>(
    initialSteps.length > 0
      ? initialSteps.map((s) => ({
          id: s.id,
          step_number: s.step_number,
          title: s.title ?? "",
          content: s.content,
          image_url: s.image_url,
        }))
      : [{ step_number: 1, title: "", content: "", image_url: null }]
  );

  const [saving, setSaving] = useState(false);

  const uploadFile = async (
    file: File,
    path: string
  ): Promise<string | null> => {
    const { error } = await supabase.storage
      .from("recipe-media")
      .upload(path, file, { upsert: true });
    if (error) return null;

    const { data } = supabase.storage
      .from("recipe-media")
      .getPublicUrl(path);
    return data.publicUrl;
  };

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setThumbnailFile(file);
    setThumbnailUrl(URL.createObjectURL(file));
  };

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      toast.error("영상 크기가 너무 커요. 100MB 이하로 올려줘요.");
      return;
    }
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
  };

  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      {
        step_number: prev.length + 1,
        title: "",
        content: "",
        image_url: null,
      },
    ]);
  };

  const removeStep = (index: number) => {
    setSteps((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, step_number: i + 1 }))
    );
  };

  const updateStep = (index: number, field: keyof StepDraft, value: unknown) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  };

  const handleStepImageChange = (
    index: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    updateStep(index, "imageFile", file);
    updateStep(index, "image_url", URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("레시피 이름을 입력해줘요.");
      return;
    }
    if (!categoryId) {
      toast.error("카테고리를 선택해줘요.");
      return;
    }
    if (steps.some((s) => !s.content.trim())) {
      toast.error("모든 단계의 내용을 입력해줘요.");
      return;
    }

    setSaving(true);

    try {
      // 새 카테고리 생성
      let finalCategoryId = categoryId;
      if (showNewCategory && newCategoryName.trim()) {
        const maxOrder = categories.reduce(
          (max, c) => Math.max(max, c.order_index),
          -1
        );
        const { data: newCat, error } = await supabase
          .from("recipe_categories")
          .insert({ name: newCategoryName.trim(), order_index: maxOrder + 1 })
          .select()
          .single();
        if (error || !newCat) {
          toast.error("카테고리 생성에 실패했어요. 다시 시도해줘요.");
          setSaving(false);
          return;
        }
        finalCategoryId = newCat.id;
      }

      // 파일 업로드
      const recipeId = initialRecipe?.id ?? crypto.randomUUID();
      let finalThumbnailUrl = thumbnailUrl;
      let finalVideoUrl = videoUrl;

      if (thumbnailFile) {
        const ext = thumbnailFile.name.split(".").pop();
        finalThumbnailUrl = await uploadFile(
          thumbnailFile,
          `${recipeId}/thumbnail.${ext}`
        );
      }
      if (videoFile) {
        const ext = videoFile.name.split(".").pop();
        finalVideoUrl = await uploadFile(
          videoFile,
          `${recipeId}/video.${ext}`
        );
      }

      // recipe_items upsert
      const recipePayload = {
        id: recipeId,
        category_id: finalCategoryId,
        name: name.trim(),
        description: description.trim() || null,
        thumbnail_url: finalThumbnailUrl,
        video_url: finalVideoUrl,
        is_published: isPublished,
      };

      const { error: recipeError } = isEdit
        ? await supabase.from("recipe_items").update(recipePayload).eq("id", recipeId)
        : await supabase.from("recipe_items").insert(recipePayload);

      if (recipeError) {
        toast.error("레시피 저장에 실패했어요. 다시 시도해줘요.");
        setSaving(false);
        return;
      }

      // 단계 이미지 업로드 후 steps upsert
      const stepsToSave = await Promise.all(
        steps.map(async (step, i) => {
          let imageUrl = step.image_url;
          if (step.imageFile) {
            const ext = step.imageFile.name.split(".").pop();
            imageUrl = await uploadFile(
              step.imageFile,
              `${recipeId}/step_${i + 1}.${ext}`
            );
          }
          return {
            id: step.id ?? crypto.randomUUID(),
            recipe_id: recipeId,
            step_number: i + 1,
            title: step.title.trim() || null,
            content: step.content.trim(),
            image_url: imageUrl,
          };
        })
      );

      // 기존 단계 삭제 후 재삽입
      if (isEdit) {
        await supabase.from("recipe_steps").delete().eq("recipe_id", recipeId);
      }
      const { error: stepsError } = await supabase
        .from("recipe_steps")
        .insert(stepsToSave);

      if (stepsError) {
        toast.error("단계 저장에 실패했어요. 레시피는 저장됐으니 다시 시도해줘요.");
        setSaving(false);
        return;
      }

      toast.success(isEdit ? "레시피를 수정했어요" : "레시피를 추가했어요");
      router.push("/admin/recipes");
    } catch {
      toast.error("저장 중 오류가 발생했어요. 다시 시도해줘요.");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 pb-10">
      {/* 카테고리 */}
      <div className="bg-white rounded-[20px] p-5 border border-slate-100 space-y-4">
        <h2 className="text-[16px] font-bold text-[#191F28]">카테고리</h2>

        {!showNewCategory ? (
          <div className="space-y-2">
            <div className="relative">
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full appearance-none bg-[#F2F4F6] rounded-xl px-4 py-3 text-[15px] text-[#191F28] font-medium pr-10"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B95A1] pointer-events-none" />
            </div>
            <button
              onClick={() => setShowNewCategory(true)}
              className="text-[13px] text-[#3182F6] font-semibold"
            >
              + 새 카테고리 만들기
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="카테고리 이름 (예: 음료)"
              className="w-full bg-[#F2F4F6] rounded-xl px-4 py-3 text-[15px] text-[#191F28] placeholder:text-[#8B95A1]"
            />
            <button
              onClick={() => setShowNewCategory(false)}
              className="text-[13px] text-[#8B95A1] font-semibold"
            >
              기존 카테고리 선택하기
            </button>
          </div>
        )}
      </div>

      {/* 기본 정보 */}
      <div className="bg-white rounded-[20px] p-5 border border-slate-100 space-y-4">
        <h2 className="text-[16px] font-bold text-[#191F28]">기본 정보</h2>
        <div className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="레시피 이름"
            className="w-full bg-[#F2F4F6] rounded-xl px-4 py-3 text-[15px] text-[#191F28] placeholder:text-[#8B95A1]"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="레시피 설명 (선택)"
            rows={3}
            className="w-full bg-[#F2F4F6] rounded-xl px-4 py-3 text-[15px] text-[#191F28] placeholder:text-[#8B95A1] resize-none"
          />
        </div>

        {/* 공개 여부 */}
        <div className="flex items-center justify-between pt-2 border-t border-[#E5E8EB]">
          <div>
            <p className="text-[15px] font-semibold text-[#191F28]">공개 여부</p>
            <p className="text-[12px] text-[#8B95A1]">
              공개 시 직원들이 볼 수 있어요
            </p>
          </div>
          <button
            onClick={() => setIsPublished((p) => !p)}
            className={`w-12 h-6 rounded-full transition-colors relative ${
              isPublished ? "bg-[#3182F6]" : "bg-[#E5E8EB]"
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
                isPublished ? "translate-x-6" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>

      {/* 미디어 */}
      <div className="bg-white rounded-[20px] p-5 border border-slate-100 space-y-4">
        <h2 className="text-[16px] font-bold text-[#191F28]">미디어</h2>

        {/* 썸네일 */}
        <div>
          <p className="text-[13px] font-semibold text-[#4E5968] mb-2">
            썸네일 이미지
          </p>
          <input
            ref={thumbnailRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleThumbnailChange}
          />
          {thumbnailUrl ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbnailUrl}
                alt="thumbnail"
                className="w-full aspect-video object-cover rounded-xl"
              />
              <button
                onClick={() => {
                  setThumbnailUrl(null);
                  setThumbnailFile(null);
                }}
                className="absolute top-2 right-2 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center"
              >
                <Trash2 className="w-4 h-4 text-white" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => thumbnailRef.current?.click()}
              className="w-full aspect-video bg-[#F2F4F6] rounded-xl flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[#E5E8EB]"
            >
              <ImageIcon className="w-8 h-8 text-[#8B95A1]" />
              <span className="text-[13px] text-[#8B95A1]">이미지 추가하기</span>
            </button>
          )}
        </div>

        {/* 영상 */}
        <div>
          <p className="text-[13px] font-semibold text-[#4E5968] mb-2">
            영상 (선택 · 최대 100MB)
          </p>
          <input
            ref={videoRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleVideoChange}
          />
          {videoUrl ? (
            <div className="relative">
              <video
                src={videoUrl}
                controls
                playsInline
                className="w-full aspect-video rounded-xl bg-black object-contain"
              />
              <button
                onClick={() => {
                  setVideoUrl(null);
                  setVideoFile(null);
                }}
                className="absolute top-2 right-2 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center"
              >
                <Trash2 className="w-4 h-4 text-white" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => videoRef.current?.click()}
              className="w-full py-5 bg-[#F2F4F6] rounded-xl flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[#E5E8EB]"
            >
              <Video className="w-8 h-8 text-[#8B95A1]" />
              <span className="text-[13px] text-[#8B95A1]">영상 추가하기</span>
            </button>
          )}
        </div>
      </div>

      {/* 단계 */}
      <div className="bg-white rounded-[20px] p-5 border border-slate-100 space-y-4">
        <h2 className="text-[16px] font-bold text-[#191F28]">만드는 방법</h2>

        <div className="space-y-4">
          {steps.map((step, index) => (
            <div
              key={index}
              className="border border-[#E5E8EB] rounded-xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GripVertical className="w-4 h-4 text-[#8B95A1]" />
                  <div className="w-6 h-6 rounded-full bg-[#3182F6] flex items-center justify-center">
                    <span className="text-[12px] font-bold text-white">
                      {index + 1}
                    </span>
                  </div>
                </div>
                {steps.length > 1 && (
                  <button
                    onClick={() => removeStep(index)}
                    className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                )}
              </div>

              <input
                value={step.title}
                onChange={(e) => updateStep(index, "title", e.target.value)}
                placeholder="단계 제목 (선택)"
                className="w-full bg-[#F2F4F6] rounded-xl px-4 py-3 text-[14px] text-[#191F28] placeholder:text-[#8B95A1]"
              />
              <textarea
                value={step.content}
                onChange={(e) => updateStep(index, "content", e.target.value)}
                placeholder="단계 설명"
                rows={2}
                className="w-full bg-[#F2F4F6] rounded-xl px-4 py-3 text-[14px] text-[#191F28] placeholder:text-[#8B95A1] resize-none"
              />

              {/* 단계 이미지 */}
              <div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  id={`step-img-${index}`}
                  onChange={(e) => handleStepImageChange(index, e)}
                />
                {step.image_url ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={step.image_url}
                      alt={`step ${index + 1}`}
                      className="w-full aspect-video object-cover rounded-xl"
                    />
                    <button
                      onClick={() => {
                        updateStep(index, "image_url", null);
                        updateStep(index, "imageFile", undefined);
                      }}
                      className="absolute top-2 right-2 w-7 h-7 bg-black/50 rounded-full flex items-center justify-center"
                    >
                      <Trash2 className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ) : (
                  <label
                    htmlFor={`step-img-${index}`}
                    className="flex items-center gap-2 text-[12px] text-[#3182F6] font-semibold cursor-pointer"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    이미지 추가하기
                  </label>
                )}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={addStep}
          className="w-full py-3 border-2 border-dashed border-[#E5E8EB] rounded-xl flex items-center justify-center gap-2 text-[14px] text-[#4E5968] font-semibold hover:bg-[#F2F4F6] transition-colors"
        >
          <Plus className="w-4 h-4" />
          단계 추가하기
        </button>
      </div>

      {/* 저장 버튼 */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-4 bg-[#3182F6] text-white rounded-2xl text-[16px] font-bold disabled:opacity-60 active:scale-[0.98] transition-all"
      >
        {saving ? "저장 중..." : isEdit ? "수정하기" : "레시피 추가하기"}
      </button>
    </div>
  );
}
