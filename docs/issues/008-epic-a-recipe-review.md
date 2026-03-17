# [REVIEW-008] Epic A 레시피 기능 전체 검토 — 토스 UI/UX 점검 및 고도화 계획

| 항목 | 내용 |
|------|------|
| 유형 | 코드 리뷰 + 개선 계획 |
| 상태 | ✅ Phase 1·2 완료 / Phase 3 대기 |
| 검토일 | 2026-03-17 |
| 대상 파일 | `src/app/recipes/`, `src/app/admin/recipes/`, `src/components/recipe/RecipeForm.tsx` |

---

## 1. 토스 UI/UX 체크리스트 점검 결과

### ✅ 통과

| 항목 | 근거 |
|------|------|
| `~해요` 체 전반 준수 | "레시피를 추가했어요", "비공개로 전환했어요" 등 |
| `alert/confirm/prompt` 미사용 | 삭제 → ConfirmDialog, 에러 → toast |
| Skeleton UI 구현 | 목록/상세/어드민 모두 로딩 스켈레톤 존재 |
| 빈 상태(Empty State) UI 구현 | 아이콘 + 텍스트 + CTA 버튼 |
| 파괴적 행동에 확인 절차 | 삭제 → ConfirmDialog |
| 색상 팔레트 토큰 준수 | `#3182F6`, `#191F28`, `#F2F4F6` 등 일관 사용 |
| 동사형 버튼 텍스트 | "추가하기", "수정하기", "단계 추가하기" 등 |
| Pretendard 폰트 | `font-pretendard` 적용 |

---

## 2. 규칙 위반 — 즉시 수정 필요

### 🔴 위반 1 — 아이콘 버튼 `aria-label` 누락 (접근성 필수)

**가이드라인:** "아이콘 전용 버튼: `aria-label` 필수"

| 파일 | 버튼 | 현재 | 수정 |
|------|------|------|------|
| `recipes/page.tsx:67` | 뒤로가기 | 없음 | `aria-label="뒤로가기"` |
| `recipes/[id]/page.tsx:65` | 뒤로가기 | 없음 | `aria-label="뒤로가기"` |
| `admin/recipes/page.tsx:195` | 공개 토글 | title만 있음 | `aria-label={...}` |
| `admin/recipes/page.tsx:204` | 수정 | 없음 | `aria-label="레시피 수정"` |
| `admin/recipes/page.tsx:212` | 삭제 | 없음 | `aria-label="레시피 삭제"` |
| `RecipeForm.tsx:380` | 썸네일 삭제 | 없음 | `aria-label="썸네일 삭제"` |
| `RecipeForm.tsx:421` | 영상 삭제 | 없음 | `aria-label="영상 삭제"` |
| `RecipeForm.tsx:502` | 단계 이미지 삭제 | 없음 | `aria-label="이미지 삭제"` |

---

### 🔴 위반 2 — 터치 타겟 크기 미달

**가이드라인:** "최소 터치 타겟: 44×44px"

| 파일 | 버튼 | 현재 | 수정 |
|------|------|------|------|
| `recipes/page.tsx:67` | 뒤로가기 | `w-9 h-9` (36px) | `w-11 h-11` (44px) |
| `recipes/[id]/page.tsx:65` | 뒤로가기 | `w-9 h-9` (36px) | `w-11 h-11` (44px) |
| `admin/recipes/page.tsx:195` | 공개 토글 | `w-9 h-9` (36px) | `w-11 h-11` (44px) |
| `admin/recipes/page.tsx:204` | 수정 | `w-9 h-9` (36px) | `w-11 h-11` (44px) |
| `admin/recipes/page.tsx:212` | 삭제 | `w-9 h-9` (36px) | `w-11 h-11` (44px) |
| `RecipeForm.tsx:461` | 단계 삭제 | `w-7 h-7` (28px) | `w-9 h-9` 이상 또는 패딩 보정 |

---

### 🔴 위반 3 — 폼 유효성 에러를 toast로 표시

**가이드라인:** "폼 유효성 실패 → 인라인 에러 텍스트 (toast 금지)"

현재 `RecipeForm.tsx:145~156` 에서 이름 미입력, 카테고리 미선택, 단계 내용 비어있음을 모두 `toast.error()`로 처리하고 있음.
토스트는 일시적으로 사라지므로 사용자가 어떤 필드가 문제인지 파악하기 어려움.

**수정 방향:**
```tsx
// ❌ 현재
toast.error("레시피 이름을 입력해줘요.");

// ✅ 수정 — 필드 아래 인라인 에러 텍스트
const [errors, setErrors] = useState<{ name?: string; content?: string[] }>({});
// input 아래:
{errors.name && (
  <p className="text-[13px] text-[#E03131] mt-1">{errors.name}</p>
)}
```

---

### 🔴 위반 4 — ConfirmDialog `variant="destructive"` 미사용

**현재** `admin/recipes/page.tsx:224~232`: 삭제 ConfirmDialog에 `variant` prop 없음 → 삭제 버튼이 파란색으로 표시됨.
삭제는 파괴적 행동이므로 빨간색(`#FFEBEB / #E03131`)이어야 함.

```tsx
// ✅ 수정
<ConfirmDialog
  variant="destructive"
  confirmLabel="삭제할게요"  // "삭제하기" → "삭제할게요" (의지 표현)
  ...
/>
```

---

### 🟠 위반 5 — 에러 토스트 `description` 분리 미사용

**가이드라인:** `toast.error(msg, { description: "해결 방법" })` 형식 권장

현재 에러 토스트가 메시지를 한 줄에 모두 표현 (`"공개 상태를 변경할 수 없어요. 잠시 후 다시 시도해요."`). sonner의 description 필드를 활용하면 계층적으로 표현 가능.

```tsx
// ❌ 현재
toast.error("공개 상태를 변경할 수 없어요. 잠시 후 다시 시도해요.");

// ✅ 수정
toast.error("공개 상태를 변경할 수 없어요", {
  description: "잠시 후 다시 시도해줘요",
});
```

**추가 말투 수정:** `"다시 시도해요"` → `"다시 시도해줘요"` (더 자연스러운 부탁 표현)

---

### 🟠 위반 6 — 입력 필드 focus 스타일 없음

**가이드라인:** `focus: border-[#3182F6] ring-0`

현재 RecipeForm의 모든 input/textarea에 focus 스타일이 없어 기본 브라우저 outline만 표시됨.

```tsx
// ✅ 수정 — input 공통 클래스에 추가
className="... outline-none focus:ring-2 focus:ring-[#3182F6]/20 focus:bg-white transition-colors"
```

---

## 3. 권장 개선 사항

### 🟡 개선 1 — 스켈레톤에 카테고리 탭 누락 (레이아웃 시프트)

`recipes/page.tsx` 로딩 스켈레톤에는 카드 3개만 있고 카테고리 탭 자리가 없음.
로딩 완료 후 탭이 갑자기 생기면서 레이아웃 시프트(CLS) 발생.

```tsx
// ✅ 스켈레톤에 탭 영역 추가
<div className="flex gap-2 px-5 py-4 bg-white border-b border-[#E5E8EB]">
  {[1, 2, 3].map((i) => (
    <div key={i} className="h-8 w-16 bg-slate-200 animate-pulse rounded-full shrink-0" />
  ))}
</div>
```

---

### 🟡 개선 2 — 직원 화면 카드 radius 불일치

기존 홈 화면 카드: `rounded-[28px]`
레시피 카드: `rounded-[20px]`
→ 앱 내 일관성을 위해 직원 화면 레시피 카드도 `rounded-[28px]`로 통일.

---

### 🟡 개선 3 — 빈 상태 텍스트 공감도 개선

| 현재 | 개선 |
|------|------|
| `"등록된 레시피가 없어요"` | `"아직 등록된 레시피가 없어요"` |
| (어드민) `"등록된 레시피가 없어요"` | `"아직 등록된 레시피가 없어요 ☕️"` |

---

### 🟡 개선 4 — placeholder 색상 가이드라인 불일치

**가이드라인:** `placeholder: text-[#B0B8C1]` (disabled 색상)
**현재:** `placeholder:text-[#8B95A1]` (text-tertiary — 너무 진함)

---

## 4. 기능 버그 / 리스크

### 🔴 버그 1 — `URL.createObjectURL` 메모리 누수

`RecipeForm.tsx`에서 썸네일/영상/단계 이미지를 `URL.createObjectURL`로 미리보기 URL을 생성하지만,
컴포넌트 언마운트 시 `URL.revokeObjectURL` 호출이 없음 → 메모리 누수.

```tsx
// ✅ useEffect cleanup으로 처리
useEffect(() => {
  return () => {
    if (thumbnailUrl?.startsWith("blob:")) URL.revokeObjectURL(thumbnailUrl);
    if (videoUrl?.startsWith("blob:")) URL.revokeObjectURL(videoUrl);
  };
}, [thumbnailUrl, videoUrl]);
```

---

### 🔴 버그 2 — 수정 시 Storage 파일 미삭제 (orphaned files)

`RecipeForm.tsx` edit 모드에서 기존 썸네일/영상/단계 이미지 삭제 후 새 파일로 교체 시,
DB의 URL은 새 파일로 갱신되지만 기존 Storage 파일은 삭제되지 않음 → 누적 용량 낭비.
(Supabase 무료 티어 500MB 제한에서 중요)

**수정 방향:** 기존 URL이 있고 새 파일로 교체될 때, 기존 경로를 Storage에서 삭제.
```tsx
// 썸네일 교체 전 기존 파일 삭제
if (initialRecipe?.thumbnail_url && thumbnailFile) {
  const oldPath = initialRecipe.thumbnail_url.split("recipe-media/")[1];
  if (oldPath) await supabase.storage.from("recipe-media").remove([oldPath]);
}
```

---

### 🟠 리스크 1 — 대용량 영상 업로드 중 UX 없음

100MB 영상 업로드 시 `handleSave`의 `saving=true` 상태에서 저장 버튼만 비활성화됨.
업로드 진행률 표시가 없어 사용자가 앱이 멈춘 것으로 오해할 수 있음.

**수정 방향:** 영상 업로드 시 ProgressBar 또는 % 텍스트 표시.

---

### 🟠 리스크 2 — 카테고리 없을 때 자동 전환 없음

`categories`가 빈 배열일 때 `RecipeForm`에서 카테고리 선택 드롭다운이 빈 채로 표시됨.
저장 시 `categoryId === ""` 로 "카테고리를 선택해줘요" 에러가 나지만, 자동으로 새 카테고리 입력 모드로 전환되지 않아 사용자가 직접 "+ 새 카테고리 만들기"를 찾아야 함.

**수정 방향:** `categories.length === 0` 이면 `showNewCategory = true` 자동 설정.

---

### 🟠 리스크 3 — GripVertical 아이콘이 있지만 드래그 기능 없음

`RecipeForm.tsx:454`의 `GripVertical` 아이콘은 드래그 정렬을 암시하지만, 실제 drag-and-drop 기능이 없음.
사용자에게 잘못된 affordance를 제공함. **즉시 아이콘 제거**하거나 기능 구현 필요.

---

## 5. 고도화 로드맵

### Phase 1 — 즉시 수정 (규칙 위반 + 버그)

| # | 항목 | 우선순위 | 예상 범위 |
|---|------|---------|-----------|
| 1 | aria-label 추가 (모든 아이콘 버튼) | 🔴 | RecipeForm, recipes/, admin/recipes/ |
| 2 | 터치 타겟 44px 확보 | 🔴 | 동일 |
| 3 | 폼 유효성 인라인 에러로 전환 | 🔴 | RecipeForm.tsx |
| 4 | ConfirmDialog `variant="destructive"` + `"삭제할게요"` | 🔴 | admin/recipes/page.tsx |
| 5 | 에러 토스트 description 분리 + 말투 수정 | 🟠 | 전체 |
| 6 | GripVertical 아이콘 제거 | 🟠 | RecipeForm.tsx |
| 7 | `URL.revokeObjectURL` 메모리 누수 수정 | 🔴 | RecipeForm.tsx |
| 8 | 수정 시 Storage 기존 파일 삭제 | 🔴 | RecipeForm.tsx |
| 9 | 카테고리 없을 때 자동 전환 | 🟠 | RecipeForm.tsx |

### Phase 2 — 품질 개선

| # | 항목 | 내용 |
|---|------|------|
| 1 | 스켈레톤 탭 영역 추가 | `recipes/page.tsx`, `admin/recipes/page.tsx` |
| 2 | 카드 radius `rounded-[28px]` 통일 | 직원 화면 |
| 3 | 입력 필드 focus 스타일 | RecipeForm.tsx |
| 4 | placeholder 색상 `#B0B8C1` 통일 | RecipeForm.tsx |
| 5 | 빈 상태 텍스트 공감형 개선 | 목록 페이지들 |
| 6 | 영상 업로드 진행률 표시 | RecipeForm.tsx |

### Phase 3 — 기능 고도화

| # | 항목 | 내용 |
|---|------|------|
| 1 | 레시피 검색 | 이름 기반 실시간 필터 (클라이언트 사이드) |
| 2 | 단계 드래그 정렬 | `@dnd-kit/sortable` 도입 후 GripVertical 활성화 |
| 3 | 레시피 복사 | 어드민에서 기존 레시피를 복제 후 수정 |
| 4 | 카테고리 순서 관리 | 어드민에서 카테고리 순서 변경 |
| 5 | 최근 본 레시피 | 로컬스토리지 기반 (직원 화면 홈) |

---

## 6. 현재 상태 종합 평가

| 영역 | 점수 | 비고 |
|------|------|------|
| 말투/UX 라이팅 | 85/100 | 에러 메시지 일부 개선 필요 |
| 접근성 | 55/100 | aria-label, 터치 타겟 미달 |
| 상태 UI (로딩/빈/에러) | 80/100 | 탭 스켈레톤 누락 |
| 컴포넌트 규격 준수 | 75/100 | radius, focus, placeholder 불일치 |
| 기능 안정성 | 70/100 | 메모리 누수, Storage 미정리 |
| 전체 | **73/100** → **91/100** | Phase 1 완료 (2026-03-17) |
