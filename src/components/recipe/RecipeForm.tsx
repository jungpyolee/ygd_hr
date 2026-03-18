"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ImageIcon, Video, ChevronDown, GripVertical } from "lucide-react";
import { toast } from "sonner";
import type { RecipeCategory, RecipeIngredient, RecipeItem, RecipeStep } from "@/types/recipe";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface StepDraft {
  dndId: string;
  id?: string;
  step_number: number;
  title: string;
  content: string;
  image_url: string | null;
  imageFile?: File;
}

interface FormErrors {
  name?: string;
  category?: string;
  steps?: Record<number, string>;
}

interface IngredientDraft {
  id?: string;
  name: string;
  amount: string;
  unit: string;
}

interface RecipeFormProps {
  categories: RecipeCategory[];
  initialRecipe?: RecipeItem;
  initialSteps?: RecipeStep[];
  initialIngredients?: RecipeIngredient[];
  redirectAfterSave?: string;
  defaultPublished?: boolean;
  canCreateCategory?: boolean;
}

interface SortableStepProps {
  step: StepDraft;
  index: number;
  isOnly: boolean;
  errors?: Record<number, string>;
  onUpdate: (index: number, field: keyof StepDraft, value: unknown) => void;
  onRemove: (index: number) => void;
  onImageChange: (index: number, e: React.ChangeEvent<HTMLInputElement>) => void;
}

function SortableStep({
  step,
  index,
  isOnly,
  errors,
  onUpdate,
  onRemove,
  onImageChange,
}: SortableStepProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.dndId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border border-[#E5E8EB] rounded-xl p-4 space-y-3 bg-white"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            {...attributes}
            {...listeners}
            aria-label={`${index + 1}단계 순서 변경`}
            className="w-8 h-8 flex items-center justify-center text-[#8B95A1] cursor-grab active:cursor-grabbing touch-none"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <div className="w-6 h-6 rounded-full bg-[#3182F6] flex items-center justify-center">
            <span className="text-[12px] font-bold text-white">{index + 1}</span>
          </div>
        </div>
        {!isOnly && (
          <button
            onClick={() => onRemove(index)}
            aria-label={`${index + 1}단계 삭제`}
            className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>
        )}
      </div>

      <input
        value={step.title}
        onChange={(e) => onUpdate(index, "title", e.target.value)}
        placeholder="단계 제목 (선택)"
        className="w-full bg-[#F2F4F6] rounded-xl px-4 py-3 text-[14px] text-[#191F28] placeholder:text-[#B0B8C1] outline-none focus:ring-2 focus:ring-[#3182F6]/20 transition-colors"
      />
      <div>
        <textarea
          value={step.content}
          onChange={(e) => onUpdate(index, "content", e.target.value)}
          placeholder="단계 설명"
          rows={2}
          className={`w-full bg-[#F2F4F6] rounded-xl px-4 py-3 text-[14px] text-[#191F28] placeholder:text-[#B0B8C1] outline-none focus:ring-2 focus:ring-[#3182F6]/20 transition-colors resize-none ${
            errors?.[index] ? "ring-2 ring-[#E03131]/30" : ""
          }`}
        />
        {errors?.[index] && (
          <p className="text-[13px] text-[#E03131] mt-1">{errors[index]}</p>
        )}
      </div>

      <div>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          id={`step-img-${index}`}
          onChange={(e) => onImageChange(index, e)}
        />
        {step.image_url ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={step.image_url}
              alt={`${index + 1}단계 이미지`}
              className="w-full aspect-video object-cover rounded-xl"
            />
            <button
              onClick={() => {
                onUpdate(index, "image_url", null);
                onUpdate(index, "imageFile", undefined);
              }}
              aria-label={`${index + 1}단계 이미지 삭제`}
              className="absolute top-2 right-2 w-11 h-11 bg-black/50 rounded-full flex items-center justify-center"
            >
              <Trash2 className="w-4 h-4 text-white" />
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
  );
}

const getStoragePath = (url: string): string | null => {
  const marker = "/recipe-media/";
  const idx = url.indexOf(marker);
  return idx !== -1 ? url.slice(idx + marker.length) : null;
};

export default function RecipeForm({
  categories,
  initialRecipe,
  initialSteps = [],
  initialIngredients = [],
  redirectAfterSave = "/admin/recipes",
  defaultPublished = false,
  canCreateCategory = true,
}: RecipeFormProps) {
  const isEdit = !!initialRecipe;
  const supabase = createClient();
  const router = useRouter();

  // 기본 필드
  const [categoryId, setCategoryId] = useState(
    initialRecipe?.category_id ?? categories[0]?.id ?? ""
  );
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(
    categories.length === 0
  );
  const [name, setName] = useState(initialRecipe?.name ?? "");
  const [description, setDescription] = useState(
    initialRecipe?.description ?? ""
  );
  const [isPublished, setIsPublished] = useState(
    initialRecipe?.is_published ?? defaultPublished
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
          dndId: s.id,
          id: s.id,
          step_number: s.step_number,
          title: s.title ?? "",
          content: s.content,
          image_url: s.image_url,
        }))
      : [{ dndId: crypto.randomUUID(), step_number: 1, title: "", content: "", image_url: null }]
  );

  const [ingredients, setIngredients] = useState<IngredientDraft[]>(
    initialIngredients.length > 0
      ? initialIngredients.map((i) => ({
          id: i.id,
          name: i.name,
          amount: i.amount,
          unit: i.unit ?? "",
        }))
      : []
  );

  const addIngredient = () =>
    setIngredients((prev) => [...prev, { name: "", amount: "", unit: "" }]);

  const removeIngredient = (idx: number) =>
    setIngredients((prev) => prev.filter((_, i) => i !== idx));

  const updateIngredient = (
    idx: number,
    field: keyof IngredientDraft,
    value: string
  ) =>
    setIngredients((prev) =>
      prev.map((ing, i) => (i === idx ? { ...ing, [field]: value } : ing))
    );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSteps((prev) => {
      const oldIndex = prev.findIndex((s) => s.dndId === active.id);
      const newIndex = prev.findIndex((s) => s.dndId === over.id);
      return arrayMove(prev, oldIndex, newIndex).map((s, i) => ({
        ...s,
        step_number: i + 1,
      }));
    });
  };

  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState<number | null>(null);

  // blob URL 추적 — 언마운트 시 메모리 해제
  const blobUrlsRef = useRef<string[]>([]);
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const trackBlob = (url: string) => {
    blobUrlsRef.current.push(url);
    return url;
  };

  const uploadFile = async (
    file: File,
    path: string
  ): Promise<string | null> => {
    const { error } = await supabase.storage
      .from("recipe-media")
      .upload(path, file, { upsert: true });
    if (error) return null;
    const { data } = supabase.storage.from("recipe-media").getPublicUrl(path);
    return data.publicUrl;
  };

  const uploadVideoWithProgress = async (
    file: File,
    path: string
  ): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const uploadUrl = `${supabaseUrl}/storage/v1/object/recipe-media/${path}`;

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable)
          setVideoUploadProgress(Math.round((e.loaded / e.total) * 100));
      });
      xhr.addEventListener("load", () => {
        setVideoUploadProgress(null);
        if (xhr.status >= 200 && xhr.status < 300) {
          const { data } = supabase.storage.from("recipe-media").getPublicUrl(path);
          resolve(data.publicUrl);
        } else {
          resolve(null);
        }
      });
      xhr.addEventListener("error", () => {
        setVideoUploadProgress(null);
        resolve(null);
      });
      xhr.open("POST", uploadUrl);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      xhr.setRequestHeader("x-upsert", "true");
      xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
      xhr.send(file);
    });
  };

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setThumbnailFile(file);
    setThumbnailUrl(trackBlob(URL.createObjectURL(file)));
  };

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      toast.error("영상 크기가 너무 커요", {
        description: "100MB 이하 파일을 올려주세요",
      });
      return;
    }
    setVideoFile(file);
    setVideoUrl(trackBlob(URL.createObjectURL(file)));
  };

  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      { dndId: crypto.randomUUID(), step_number: prev.length + 1, title: "", content: "", image_url: null },
    ]);
  };

  const removeStep = (index: number) => {
    setSteps((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, step_number: i + 1 }))
    );
    setErrors((prev) => {
      const next = { ...prev };
      if (next.steps) {
        delete next.steps[index];
        // 인덱스 재정렬
        const reindexed: Record<number, string> = {};
        Object.entries(next.steps).forEach(([k, v]) => {
          const ki = Number(k);
          if (ki > index) reindexed[ki - 1] = v;
          else if (ki < index) reindexed[ki] = v;
        });
        next.steps = Object.keys(reindexed).length > 0 ? reindexed : undefined;
      }
      return next;
    });
  };

  const updateStep = (
    index: number,
    field: keyof StepDraft,
    value: unknown
  ) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
    if (field === "content") {
      setErrors((prev) => {
        if (!prev.steps?.[index]) return prev;
        const steps = { ...prev.steps };
        delete steps[index];
        return { ...prev, steps: Object.keys(steps).length > 0 ? steps : undefined };
      });
    }
  };

  const handleStepImageChange = (
    index: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = trackBlob(URL.createObjectURL(file));
    updateStep(index, "imageFile", file);
    updateStep(index, "image_url", url);
  };

  const validate = (): FormErrors => {
    const errs: FormErrors = {};
    if (!name.trim()) errs.name = "레시피 이름을 입력해줘요";
    if (showNewCategory && !newCategoryName.trim())
      errs.category = "카테고리 이름을 입력해줘요";
    if (!showNewCategory && !categoryId)
      errs.category = "카테고리를 선택해줘요";
    const stepErrs: Record<number, string> = {};
    steps.forEach((s, i) => {
      if (!s.content.trim()) stepErrs[i] = "단계 내용을 입력해줘요";
    });
    if (Object.keys(stepErrs).length > 0) errs.steps = stepErrs;
    return errs;
  };

  const handleSave = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
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
          toast.error("카테고리 생성에 실패했어요", {
            description: "다시 시도해주세요",
          });
          setSaving(false);
          return;
        }
        finalCategoryId = newCat.id;
      }

      const recipeId = initialRecipe?.id ?? crypto.randomUUID();
      let finalThumbnailUrl = thumbnailUrl;
      let finalVideoUrl = videoUrl;

      // 썸네일 처리
      if (thumbnailFile) {
        if (isEdit && initialRecipe?.thumbnail_url) {
          const oldPath = getStoragePath(initialRecipe.thumbnail_url);
          if (oldPath)
            await supabase.storage.from("recipe-media").remove([oldPath]);
        }
        const ext = thumbnailFile.name.split(".").pop();
        finalThumbnailUrl = await uploadFile(
          thumbnailFile,
          `${recipeId}/thumbnail.${ext}`
        );
      } else if (thumbnailUrl === null && isEdit && initialRecipe?.thumbnail_url) {
        const oldPath = getStoragePath(initialRecipe.thumbnail_url);
        if (oldPath)
          await supabase.storage.from("recipe-media").remove([oldPath]);
      }

      // 영상 처리
      if (videoFile) {
        if (isEdit && initialRecipe?.video_url) {
          const oldPath = getStoragePath(initialRecipe.video_url);
          if (oldPath)
            await supabase.storage.from("recipe-media").remove([oldPath]);
        }
        const ext = videoFile.name.split(".").pop();
        setVideoUploadProgress(0);
        finalVideoUrl = await uploadVideoWithProgress(
          videoFile,
          `${recipeId}/video.${ext}`
        );
      } else if (videoUrl === null && isEdit && initialRecipe?.video_url) {
        const oldPath = getStoragePath(initialRecipe.video_url);
        if (oldPath)
          await supabase.storage.from("recipe-media").remove([oldPath]);
      }

      // recipe_items 저장
      const basePayload = {
        id: recipeId,
        category_id: finalCategoryId,
        name: name.trim(),
        description: description.trim() || null,
        thumbnail_url: finalThumbnailUrl,
        video_url: finalVideoUrl,
        is_published: isPublished,
      };

      let recipeError;
      if (isEdit) {
        ({ error: recipeError } = await supabase
          .from("recipe_items")
          .update(basePayload)
          .eq("id", recipeId));
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        ({ error: recipeError } = await supabase
          .from("recipe_items")
          .insert({ ...basePayload, created_by: user?.id ?? null }));
      }

      if (recipeError) {
        toast.error("레시피 저장에 실패했어요", {
          description: "다시 시도해주세요",
        });
        setSaving(false);
        return;
      }

      // 단계 이미지 업로드
      const stepsToSave = await Promise.all(
        steps.map(async (step, i) => {
          let imageUrl = step.image_url?.startsWith("blob:")
            ? null
            : step.image_url;
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

      // 수정 시 orphaned 단계 이미지 Storage 삭제
      if (isEdit) {
        const finalImageUrls = new Set(
          stepsToSave.map((s) => s.image_url).filter(Boolean)
        );
        const orphanPaths = initialSteps
          .map((s) => s.image_url)
          .filter((url): url is string => !!url && !finalImageUrls.has(url))
          .map((url) => getStoragePath(url))
          .filter(Boolean) as string[];
        if (orphanPaths.length > 0)
          await supabase.storage.from("recipe-media").remove(orphanPaths);

        await supabase
          .from("recipe_steps")
          .delete()
          .eq("recipe_id", recipeId);
      }

      const { error: stepsError } = await supabase
        .from("recipe_steps")
        .insert(stepsToSave);

      if (stepsError) {
        toast.error("단계 저장에 실패했어요", {
          description: "레시피는 저장됐어요. 단계만 다시 시도해주세요",
        });
        setSaving(false);
        return;
      }

      // 재료 저장
      if (isEdit) {
        await supabase
          .from("recipe_ingredients")
          .delete()
          .eq("recipe_id", recipeId);
      }
      const ingredientsToSave = ingredients
        .filter((ing) => ing.name.trim() && ing.amount.trim())
        .map((ing, i) => ({
          id: ing.id ?? crypto.randomUUID(),
          recipe_id: recipeId,
          name: ing.name.trim(),
          amount: ing.amount.trim(),
          unit: ing.unit.trim() || null,
          order_index: i,
        }));
      if (ingredientsToSave.length > 0) {
        await supabase.from("recipe_ingredients").insert(ingredientsToSave);
      }

      toast.success(isEdit ? "레시피를 수정했어요" : "레시피를 추가했어요");
      router.push(redirectAfterSave);
    } catch {
      toast.error("저장 중 오류가 발생했어요", {
        description: "다시 시도해주세요",
      });
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
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setErrors((p) => ({ ...p, category: undefined }));
                }}
                className={`w-full appearance-none bg-[#F2F4F6] rounded-xl px-4 py-3 text-[15px] text-[#191F28] font-medium pr-10 outline-none focus:ring-2 focus:ring-[#3182F6]/20 transition-colors ${
                  errors.category ? "ring-2 ring-[#E03131]/30" : ""
                }`}
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B95A1] pointer-events-none" />
            </div>
            {errors.category && (
              <p className="text-[13px] text-[#E03131]">{errors.category}</p>
            )}
            {canCreateCategory && (
              <button
                onClick={() => {
                  setShowNewCategory(true);
                  setErrors((p) => ({ ...p, category: undefined }));
                }}
                className="text-[13px] text-[#3182F6] font-semibold"
              >
                + 새 카테고리 만들기
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <input
              value={newCategoryName}
              onChange={(e) => {
                setNewCategoryName(e.target.value);
                setErrors((p) => ({ ...p, category: undefined }));
              }}
              placeholder="카테고리 이름 (예: 음료)"
              className={`w-full bg-[#F2F4F6] rounded-xl px-4 py-3 text-[15px] text-[#191F28] placeholder:text-[#B0B8C1] outline-none focus:ring-2 focus:ring-[#3182F6]/20 transition-colors ${
                errors.category ? "ring-2 ring-[#E03131]/30" : ""
              }`}
            />
            {errors.category && (
              <p className="text-[13px] text-[#E03131]">{errors.category}</p>
            )}
            {categories.length > 0 && (
              <button
                onClick={() => {
                  setShowNewCategory(false);
                  setErrors((p) => ({ ...p, category: undefined }));
                }}
                className="text-[13px] text-[#8B95A1] font-semibold"
              >
                기존 카테고리 선택하기
              </button>
            )}
          </div>
        )}
      </div>

      {/* 기본 정보 */}
      <div className="bg-white rounded-[20px] p-5 border border-slate-100 space-y-4">
        <h2 className="text-[16px] font-bold text-[#191F28]">기본 정보</h2>
        <div className="space-y-3">
          <div>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setErrors((p) => ({ ...p, name: undefined }));
              }}
              placeholder="레시피 이름"
              className={`w-full bg-[#F2F4F6] rounded-xl px-4 py-3 text-[15px] text-[#191F28] placeholder:text-[#B0B8C1] outline-none focus:ring-2 focus:ring-[#3182F6]/20 transition-colors ${
                errors.name ? "ring-2 ring-[#E03131]/30" : ""
              }`}
            />
            {errors.name && (
              <p className="text-[13px] text-[#E03131] mt-1">{errors.name}</p>
            )}
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="레시피 설명 (선택)"
            rows={3}
            className="w-full bg-[#F2F4F6] rounded-xl px-4 py-3 text-[15px] text-[#191F28] placeholder:text-[#B0B8C1] outline-none focus:ring-2 focus:ring-[#3182F6]/20 transition-colors resize-none"
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
            type="button"
            onClick={() => setIsPublished((p) => !p)}
            aria-label={isPublished ? "비공개로 전환" : "공개로 전환"}
            className={`w-12 h-6 rounded-full transition-colors relative overflow-hidden ${
              isPublished ? "bg-[#3182F6]" : "bg-[#E5E8EB]"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
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
                alt="썸네일 미리보기"
                className="w-full aspect-video object-cover rounded-xl"
              />
              <button
                onClick={() => {
                  setThumbnailUrl(null);
                  setThumbnailFile(null);
                }}
                aria-label="썸네일 삭제"
                className="absolute top-2 right-2 w-11 h-11 bg-black/50 rounded-full flex items-center justify-center"
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
                aria-label="영상 삭제"
                className="absolute top-2 right-2 w-11 h-11 bg-black/50 rounded-full flex items-center justify-center"
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

      {/* 재료 */}
      <div className="bg-white rounded-[20px] p-5 border border-slate-100 space-y-3">
        <h2 className="text-[16px] font-bold text-[#191F28]">재료</h2>

        {ingredients.length > 0 && (
          <div className="space-y-2">
            <div className="flex gap-2 text-[11px] font-bold text-[#8B95A1] px-1">
              <span className="flex-1">재료명</span>
              <span className="w-16">양</span>
              <span className="w-16">단위</span>
              <span className="w-9" />
            </div>
            {ingredients.map((ing, idx) => (
              <div key={idx} className="flex gap-1.5 items-center min-w-0">
                <input
                  value={ing.name}
                  onChange={(e) => updateIngredient(idx, "name", e.target.value)}
                  placeholder="우유, 설탕 ..."
                  className="flex-1 min-w-0 bg-[#F2F4F6] rounded-xl px-3 py-2.5 text-[14px] text-[#191F28] placeholder:text-[#B0B8C1] outline-none focus:ring-2 focus:ring-[#3182F6]/20"
                />
                <input
                  value={ing.amount}
                  onChange={(e) => updateIngredient(idx, "amount", e.target.value)}
                  placeholder="200"
                  className="w-14 shrink-0 bg-[#F2F4F6] rounded-xl px-2 py-2.5 text-[14px] text-[#191F28] placeholder:text-[#B0B8C1] outline-none focus:ring-2 focus:ring-[#3182F6]/20 text-center"
                />
                <input
                  value={ing.unit}
                  onChange={(e) => updateIngredient(idx, "unit", e.target.value)}
                  placeholder="ml"
                  className="w-12 shrink-0 bg-[#F2F4F6] rounded-xl px-2 py-2.5 text-[14px] text-[#191F28] placeholder:text-[#B0B8C1] outline-none focus:ring-2 focus:ring-[#3182F6]/20 text-center"
                />
                <button
                  type="button"
                  onClick={() => removeIngredient(idx)}
                  aria-label={`${idx + 1}번째 재료 삭제`}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50 transition-colors shrink-0"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={addIngredient}
          className="w-full py-3 border-2 border-dashed border-[#E5E8EB] rounded-xl flex items-center justify-center gap-2 text-[14px] text-[#4E5968] font-semibold hover:bg-[#F2F4F6] transition-colors"
        >
          <Plus className="w-4 h-4" />
          재료 추가하기
        </button>
      </div>

      {/* 단계 */}
      <div className="bg-white rounded-[20px] p-5 border border-slate-100 space-y-4">
        <h2 className="text-[16px] font-bold text-[#191F28]">만드는 방법</h2>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={steps.map((s) => s.dndId)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-4">
              {steps.map((step, index) => (
                <SortableStep
                  key={step.dndId}
                  step={step}
                  index={index}
                  isOnly={steps.length === 1}
                  errors={errors.steps}
                  onUpdate={updateStep}
                  onRemove={removeStep}
                  onImageChange={handleStepImageChange}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <button
          onClick={addStep}
          className="w-full py-3 border-2 border-dashed border-[#E5E8EB] rounded-xl flex items-center justify-center gap-2 text-[14px] text-[#4E5968] font-semibold hover:bg-[#F2F4F6] transition-colors"
        >
          <Plus className="w-4 h-4" />
          단계 추가하기
        </button>
      </div>

      {/* 영상 업로드 진행률 */}
      {videoUploadProgress !== null && (
        <div className="bg-white rounded-[20px] p-5 border border-slate-100 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-semibold text-[#191F28]">영상 업로드 중...</p>
            <p className="text-[14px] font-bold text-[#3182F6]">{videoUploadProgress}%</p>
          </div>
          <div className="w-full bg-[#F2F4F6] rounded-full h-2 overflow-hidden">
            <div
              className="bg-[#3182F6] h-2 rounded-full transition-all duration-200"
              style={{ width: `${videoUploadProgress}%` }}
            />
          </div>
          <p className="text-[12px] text-[#8B95A1]">잠시만 기다려주세요. 창을 닫지 마세요.</p>
        </div>
      )}

      {/* 저장 버튼 */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-4 bg-[#3182F6] text-white rounded-2xl text-[16px] font-bold disabled:opacity-60 active:scale-[0.98] transition-all"
      >
        {saving
          ? isEdit
            ? "수정하는 중이에요..."
            : "추가하는 중이에요..."
          : isEdit
          ? "수정하기"
          : "레시피 추가하기"}
      </button>
    </div>
  );
}
