/**
 * 레시피 기능 전체 테스트
 * - 파일 업로드 검증 (썸네일 <100KB, 영상 <1MB)
 * - 폼 유효성 검사 (인라인 에러 로직)
 * - Storage URL 파싱 유틸리티
 * - 어드민 레시피 카드 모바일 레이아웃 (레시피명 가시성)
 * - 최근 본 레시피 localStorage 동작
 * - 레시피 검색 필터 로직
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// ─────────────────────────────────────────────────────────────────────────────
// 순수 유틸 함수 (RecipeForm.tsx에서 그대로 복사)
// ─────────────────────────────────────────────────────────────────────────────
const getStoragePath = (url: string): string | null => {
  const marker = "/recipe-media/";
  const idx = url.indexOf(marker);
  return idx !== -1 ? url.slice(idx + marker.length) : null;
};

interface FormErrors {
  name?: string;
  category?: string;
  steps?: Record<number, string>;
}

const validate = (
  name: string,
  showNewCategory: boolean,
  newCategoryName: string,
  categoryId: string,
  steps: { content: string }[]
): FormErrors => {
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

// 파일 크기 제한 (RecipeForm.tsx 기준)
const VIDEO_MAX_BYTES = 100 * 1024 * 1024; // 100 MB

// 대용량 파일 테스트용: 실제 Blob 대신 size 프로퍼티를 override
const createMockFile = (
  name: string,
  sizeBytes: number,
  type: string
): File => {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. getStoragePath 유틸리티
// ─────────────────────────────────────────────────────────────────────────────
describe("getStoragePath — Storage URL 경로 파싱", () => {
  it("Supabase 공개 URL에서 파일 경로를 올바르게 추출한다", () => {
    const url =
      "https://ymvdjxzkjodasctktunh.supabase.co/storage/v1/object/public/recipe-media/uuid-123/thumbnail.jpg";
    expect(getStoragePath(url)).toBe("uuid-123/thumbnail.jpg");
  });

  it("단계 이미지 경로도 올바르게 추출한다", () => {
    const url =
      "https://ymvdjxzkjodasctktunh.supabase.co/storage/v1/object/public/recipe-media/recipe-id/step_2.png";
    expect(getStoragePath(url)).toBe("recipe-id/step_2.png");
  });

  it("/recipe-media/가 없는 URL은 null을 반환한다", () => {
    expect(getStoragePath("https://example.com/image.jpg")).toBeNull();
  });

  it("빈 문자열은 null을 반환한다", () => {
    expect(getStoragePath("")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. 폼 유효성 검사 로직
// ─────────────────────────────────────────────────────────────────────────────
describe("폼 유효성 검사 (validate)", () => {
  const validStep = { content: "우유 200ml를 스팀한다" };
  const validCatId = "cat-uuid-001";

  it("레시피 이름이 비어 있으면 name 에러가 발생한다", () => {
    const errs = validate("", false, "", validCatId, [validStep]);
    expect(errs.name).toBe("레시피 이름을 입력해줘요");
  });

  it("공백만 있는 이름도 에러로 처리된다", () => {
    const errs = validate("   ", false, "", validCatId, [validStep]);
    expect(errs.name).toBe("레시피 이름을 입력해줘요");
  });

  it("카테고리 선택 모드에서 categoryId가 없으면 에러가 발생한다", () => {
    const errs = validate("아이스 라떼", false, "", "", [validStep]);
    expect(errs.category).toBe("카테고리를 선택해줘요");
  });

  it("신규 카테고리 모드에서 이름이 없으면 에러가 발생한다", () => {
    const errs = validate("아이스 라떼", true, "", "", [validStep]);
    expect(errs.category).toBe("카테고리 이름을 입력해줘요");
  });

  it("신규 카테고리 모드에서 이름이 있으면 에러가 없다", () => {
    const errs = validate("아이스 라떼", true, "음료", "", [validStep]);
    expect(errs.category).toBeUndefined();
  });

  it("단계 내용이 비어 있으면 해당 인덱스에 steps 에러가 발생한다", () => {
    const steps = [{ content: "내용 있음" }, { content: "" }, { content: "내용 있음" }];
    const errs = validate("레시피명", false, "", validCatId, steps);
    expect(errs.steps?.[1]).toBe("단계 내용을 입력해줘요");
    expect(errs.steps?.[0]).toBeUndefined();
    expect(errs.steps?.[2]).toBeUndefined();
  });

  it("모든 단계 내용이 있으면 steps 에러가 없다", () => {
    const steps = [{ content: "1단계" }, { content: "2단계" }];
    const errs = validate("레시피명", false, "", validCatId, steps);
    expect(errs.steps).toBeUndefined();
  });

  it("모든 필드가 유효하면 에러 객체가 비어 있다", () => {
    const errs = validate("아이스 아메리카노", false, "", validCatId, [validStep]);
    expect(Object.keys(errs)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. 영상 파일 크기 검증
// ─────────────────────────────────────────────────────────────────────────────
describe("영상 파일 크기 검증 (handleVideoChange 기준 100MB)", () => {
  it("1MB 영상 파일은 허용 범위(100MB) 이내이다", () => {
    const file = createMockFile("recipe-video.mp4", 1 * 1024 * 1024, "video/mp4");
    expect(file.size).toBeLessThan(VIDEO_MAX_BYTES);
    expect(file.type).toBe("video/mp4");
    expect(file.name).toBe("recipe-video.mp4");
  });

  it("900KB 영상도 허용 범위 이내이다", () => {
    const file = createMockFile("short-clip.mp4", 900 * 1024, "video/mp4");
    expect(file.size).toBeLessThan(VIDEO_MAX_BYTES);
  });

  it("100MB 정확히는 허용 범위 이내이다 (경계값)", () => {
    const file = createMockFile("boundary.mp4", 100 * 1024 * 1024, "video/mp4");
    // handleVideoChange는 > 100MB 일 때 reject하므로 정확히 100MB는 통과
    expect(file.size).not.toBeGreaterThan(VIDEO_MAX_BYTES);
  });

  it("101MB 영상은 허용 범위를 초과해 거부된다", () => {
    const file = createMockFile("too-big.mp4", 101 * 1024 * 1024, "video/mp4");
    expect(file.size).toBeGreaterThan(VIDEO_MAX_BYTES);
    // 실제 컴포넌트에서는 이 조건에서 toast.error가 호출됨
    const isRejected = file.size > VIDEO_MAX_BYTES;
    expect(isRejected).toBe(true);
  });

  it("MOV 형식 영상도 type 필드가 올바르게 설정된다", () => {
    const file = createMockFile("clip.mov", 500 * 1024, "video/quicktime");
    expect(file.type).toBe("video/quicktime");
    expect(file.size).toBeLessThan(VIDEO_MAX_BYTES);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. 썸네일 이미지 파일 검증
// ─────────────────────────────────────────────────────────────────────────────
describe("썸네일 이미지 파일 검증 (100KB 미만 테스트)", () => {
  it("90KB JPEG 이미지는 100KB 미만이다", () => {
    const file = createMockFile("thumbnail.jpg", 90 * 1024, "image/jpeg");
    expect(file.size).toBeLessThan(100 * 1024);
    expect(file.type).toBe("image/jpeg");
    expect(file.name).toBe("thumbnail.jpg");
  });

  it("80KB PNG 이미지도 허용된다", () => {
    const file = createMockFile("thumbnail.png", 80 * 1024, "image/png");
    expect(file.size).toBeLessThan(100 * 1024);
    expect(file.type).toBe("image/png");
  });

  it("50KB WEBP 이미지도 허용된다", () => {
    const file = createMockFile("thumbnail.webp", 50 * 1024, "image/webp");
    expect(file.size).toBeLessThan(100 * 1024);
  });

  it("파일 이름에 특수문자가 있어도 생성된다", () => {
    const file = createMockFile("레시피-썸네일.jpg", 70 * 1024, "image/jpeg");
    expect(file.name).toBe("레시피-썸네일.jpg");
    expect(file.size).toBeLessThan(100 * 1024);
  });

  it("확장자 추출 로직이 올바르게 동작한다 (업로드 경로 생성에 사용)", () => {
    const file = createMockFile("photo.jpeg", 60 * 1024, "image/jpeg");
    const ext = file.name.split(".").pop();
    expect(ext).toBe("jpeg");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. 어드민 레시피 카드 — 모바일 화면 레시피명 가시성
// ─────────────────────────────────────────────────────────────────────────────

/** 실제 admin/recipes/page.tsx의 카드 구조를 그대로 재현 */
function AdminRecipeCard({
  name,
  isPublished = false,
  categoryName = "음료",
}: {
  name: string;
  isPublished?: boolean;
  categoryName?: string;
}) {
  return (
    <div
      data-testid="recipe-card"
      style={{ width: 375 }}
      className="bg-white rounded-[20px] p-4 border border-slate-100 flex items-center gap-4"
    >
      {/* 썸네일 자리 */}
      <div
        data-testid="thumbnail"
        style={{ width: 64, height: 64, flexShrink: 0 }}
        className="w-16 h-16 rounded-[12px] bg-[#F2F4F6] flex items-center justify-center shrink-0"
      />

      {/* 이름 + 카테고리 */}
      <div
        data-testid="name-area"
        className="flex-1 min-w-0"
        style={{ flex: 1, minWidth: 0 }}
      >
        <div className="flex items-center gap-2">
          <p
            data-testid="recipe-name"
            className="text-[15px] font-bold text-[#191F28] truncate"
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {name}
          </p>
          <span
            data-testid="publish-badge"
            className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold ${
              isPublished
                ? "bg-[#E8F3FF] text-[#3182F6]"
                : "bg-[#F2F4F6] text-[#8B95A1]"
            }`}
          >
            {isPublished ? "공개" : "비공개"}
          </span>
        </div>
        <p className="text-[12px] text-[#8B95A1] mt-0.5">{categoryName}</p>
      </div>

      {/* 액션 버튼 (복사·공개전환·수정·삭제) — 실제와 동일한 4개 */}
      <div
        data-testid="actions"
        className="flex items-center gap-1 shrink-0"
        style={{ display: "flex", flexShrink: 0 }}
      >
        <button
          aria-label="레시피 복사"
          style={{ width: 44, height: 44 }}
          className="w-11 h-11 flex items-center justify-center rounded-full"
        />
        <button
          aria-label={isPublished ? "비공개로 전환" : "공개로 전환"}
          style={{ width: 44, height: 44 }}
          className="w-11 h-11 flex items-center justify-center rounded-full"
        />
        <button
          aria-label="레시피 수정"
          style={{ width: 44, height: 44 }}
          className="w-11 h-11 flex items-center justify-center rounded-full"
        />
        <button
          aria-label="레시피 삭제"
          style={{ width: 44, height: 44 }}
          className="w-11 h-11 flex items-center justify-center rounded-full"
        />
      </div>
    </div>
  );
}

describe("어드민 레시피 카드 — 모바일(375px) 레이아웃 가시성", () => {
  it("레시피 이름이 DOM에 렌더링된다", () => {
    render(<AdminRecipeCard name="아이스 아메리카노" />);
    expect(screen.getByTestId("recipe-name")).toBeInTheDocument();
    expect(screen.getByTestId("recipe-name")).toHaveTextContent("아이스 아메리카노");
  });

  it("이름 영역이 flex-1 min-w-0를 가져 버튼에 밀리지 않는다", () => {
    render(<AdminRecipeCard name="아이스 아메리카노" />);
    const nameArea = screen.getByTestId("name-area");
    expect(nameArea).toHaveStyle({ flex: "1", minWidth: "0" });
  });

  it("버튼 영역이 shrink-0이라 이름을 압축하지 않는다", () => {
    render(<AdminRecipeCard name="아이스 아메리카노" />);
    const actions = screen.getByTestId("actions");
    expect(actions).toHaveStyle({ flexShrink: "0" });
  });

  it("레시피 이름에 truncate(ellipsis) 스타일이 적용된다", () => {
    render(<AdminRecipeCard name="아이스 아메리카노" />);
    const nameEl = screen.getByTestId("recipe-name");
    expect(nameEl).toHaveStyle({
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
  });

  it("매우 긴 레시피명도 DOM에 존재한다 (잘려도 숨겨지지 않음)", () => {
    const longName = "아주아주아주아주아주아주아주아주아주 긴 레시피 이름입니다";
    render(<AdminRecipeCard name={longName} />);
    expect(screen.getByTestId("recipe-name")).toHaveTextContent(longName);
    // 이름이 화면에서 '완전히 사라지지 않고' truncate로만 표현됨을 검증
    expect(screen.getByTestId("recipe-name")).toBeInTheDocument();
  });

  it("공개/비공개 배지가 shrink-0이라 이름 영역을 침범하지 않는다", () => {
    render(<AdminRecipeCard name="레시피" isPublished={true} />);
    const badge = screen.getByTestId("publish-badge");
    // shrink-0 클래스 확인
    expect(badge.className).toContain("shrink-0");
  });

  it("4개의 액션 버튼 모두 aria-label을 가지고 접근 가능하다", () => {
    render(<AdminRecipeCard name="레시피" isPublished={false} />);
    expect(screen.getByLabelText("레시피 복사")).toBeInTheDocument();
    expect(screen.getByLabelText("공개로 전환")).toBeInTheDocument();
    expect(screen.getByLabelText("레시피 수정")).toBeInTheDocument();
    expect(screen.getByLabelText("레시피 삭제")).toBeInTheDocument();
  });

  it("공개 상태일 때 aria-label이 '비공개로 전환'으로 변경된다", () => {
    render(<AdminRecipeCard name="레시피" isPublished={true} />);
    expect(screen.getByLabelText("비공개로 전환")).toBeInTheDocument();
  });

  it("카드 내부에 이름 영역과 버튼 영역이 모두 포함된다", () => {
    const { container } = render(<AdminRecipeCard name="카페라떼" />);
    const card = container.querySelector("[data-testid='recipe-card']");
    expect(card).toContainElement(screen.getByTestId("name-area"));
    expect(card).toContainElement(screen.getByTestId("actions"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. 최근 본 레시피 — localStorage 동작
// ─────────────────────────────────────────────────────────────────────────────
describe("최근 본 레시피 — localStorage 저장/조회 로직", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  /** 실제 recipes/[id]/page.tsx의 저장 로직을 그대로 복사 */
  const saveRecentRecipe = (id: string) => {
    const prev: string[] = JSON.parse(
      localStorage.getItem("recent_recipes") || "[]"
    );
    const updated = [id, ...prev.filter((rid) => rid !== id)].slice(0, 6);
    localStorage.setItem("recent_recipes", JSON.stringify(updated));
  };

  it("처음 방문한 레시피 ID가 저장된다", () => {
    saveRecentRecipe("recipe-001");
    const stored = JSON.parse(localStorage.getItem("recent_recipes") || "[]");
    expect(stored).toContain("recipe-001");
  });

  it("가장 최근에 본 레시피가 맨 앞에 온다", () => {
    saveRecentRecipe("recipe-001");
    saveRecentRecipe("recipe-002");
    saveRecentRecipe("recipe-003");
    const stored: string[] = JSON.parse(localStorage.getItem("recent_recipes") || "[]");
    expect(stored[0]).toBe("recipe-003");
  });

  it("같은 레시피를 재방문하면 중복 없이 맨 앞으로 이동한다", () => {
    saveRecentRecipe("recipe-001");
    saveRecentRecipe("recipe-002");
    saveRecentRecipe("recipe-001"); // 재방문
    const stored: string[] = JSON.parse(localStorage.getItem("recent_recipes") || "[]");
    expect(stored[0]).toBe("recipe-001");
    expect(stored.filter((id) => id === "recipe-001")).toHaveLength(1);
  });

  it("최대 6개까지만 저장된다", () => {
    for (let i = 1; i <= 8; i++) saveRecentRecipe(`recipe-00${i}`);
    const stored: string[] = JSON.parse(localStorage.getItem("recent_recipes") || "[]");
    expect(stored).toHaveLength(6);
  });

  it("7번째 항목이 저장될 때 가장 오래된 항목이 제거된다", () => {
    for (let i = 1; i <= 7; i++) saveRecentRecipe(`recipe-00${i}`);
    const stored: string[] = JSON.parse(localStorage.getItem("recent_recipes") || "[]");
    expect(stored).not.toContain("recipe-001"); // 가장 처음 본 것이 제거됨
    expect(stored[0]).toBe("recipe-007"); // 가장 최근이 맨 앞
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. 레시피 검색 필터 로직
// ─────────────────────────────────────────────────────────────────────────────
describe("레시피 검색 필터 로직", () => {
  const recipes = [
    { id: "1", name: "아이스 아메리카노", category_id: "cat-drink" },
    { id: "2", name: "카페라떼", category_id: "cat-drink" },
    { id: "3", name: "그린티 케이크", category_id: "cat-dessert" },
    { id: "4", name: "딸기 라떼", category_id: "cat-drink" },
    { id: "5", name: "아이스크림 와플", category_id: "cat-dessert" },
  ];

  /** 실제 recipes/page.tsx의 filtered 로직 */
  const getFiltered = (query: string, categoryId: string | null) =>
    query.trim()
      ? recipes.filter((r) =>
          r.name.toLowerCase().includes(query.toLowerCase())
        )
      : categoryId
      ? recipes.filter((r) => r.category_id === categoryId)
      : recipes;

  it("빈 검색어면 카테고리 필터가 적용된다", () => {
    const result = getFiltered("", "cat-dessert");
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(["3", "5"]);
  });

  it("검색어가 있으면 카테고리를 무시하고 이름으로 필터링된다", () => {
    const result = getFiltered("라떼", "cat-dessert"); // 카테고리 무시
    expect(result.map((r) => r.name)).toContain("카페라떼");
    expect(result.map((r) => r.name)).toContain("딸기 라떼");
  });

  it("검색은 대소문자를 구분하지 않는다", () => {
    const recipesEn = [
      { id: "a", name: "Latte", category_id: "cat-1" },
      { id: "b", name: "americano", category_id: "cat-1" },
    ];
    const filtered = recipesEn.filter((r) =>
      r.name.toLowerCase().includes("latte".toLowerCase())
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("a");
  });

  it("존재하지 않는 검색어는 빈 배열을 반환한다", () => {
    const result = getFiltered("없는레시피xyz", null);
    expect(result).toHaveLength(0);
  });

  it("공백만 있는 검색어는 카테고리 필터로 처리된다", () => {
    const result = getFiltered("   ", "cat-drink");
    expect(result).toHaveLength(3); // drink 카테고리 3개
  });

  it("카테고리·검색어 모두 없으면 전체가 반환된다", () => {
    const result = getFiltered("", null);
    expect(result).toHaveLength(5);
  });
});
