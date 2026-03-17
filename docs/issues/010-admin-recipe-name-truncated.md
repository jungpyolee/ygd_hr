# [BUG-010] 어드민 레시피 카드 — 모바일에서 레시피명이 한 글자만 보임

| 항목 | 내용 |
|------|------|
| 유형 | 버그 수정 (UI 레이아웃) |
| 상태 | ✅ 완료 |
| 파일 | `src/app/admin/recipes/page.tsx` |
| 발견일 | 2026-03-17 |
| 완료일 | 2026-03-17 |

---

## 배경

모바일(375px) 어드민 레시피 목록에서 레시피명이 첫 글자("밀") 만 표시되고
나머지가 잘려 거의 보이지 않는 문제.

---

## 원인 분석

Phase 3에서 레시피 복사 기능 추가 시 Copy 버튼을 카드 액션 영역에 삽입해
버튼이 3개 → 4개(각 44px)로 늘어났음.

### 공간 계산 (375px 기준)

| 요소 | 크기 |
|------|------|
| 카드 좌우 패딩 | 32px |
| 썸네일 | 64px |
| 썸네일↔이름 gap | 16px |
| 이름↔버튼 gap | 16px |
| 액션 버튼 4개+gaps | 188px |
| **합계 (고정)** | **316px** |
| **이름 영역 가용** | **59px** |

이름 행(`flex items-center gap-2`)에 레시피명(`truncate`)과
"공개" 배지(`shrink-0`, ~40px)가 함께 있어,
실제 이름이 사용할 수 있는 공간이 **19px** 밖에 남지 않음.
→ 첫 글자 한두 자만 표시됨.

---

## 수정 내용

"공개/비공개" 배지를 이름과 같은 행에서 분리,
카테고리명과 함께 두 번째 줄로 이동.

```tsx
// ❌ 수정 전: 이름 + 배지 같은 행
<div className="flex items-center gap-2">
  <p className="... truncate">{recipe.name}</p>
  <span className="shrink-0 ...">공개</span>
</div>
{recipe.recipe_categories && (
  <p className="text-[12px] ...">{recipe.recipe_categories.name}</p>
)}

// ✅ 수정 후: 이름 단독 행 / 배지 + 카테고리 두 번째 행
<p className="... truncate">{recipe.name}</p>
<div className="flex items-center gap-1.5 mt-0.5">
  <span className="shrink-0 ...">공개</span>
  {recipe.recipe_categories && (
    <p className="text-[12px] ... truncate">{recipe.recipe_categories.name}</p>
  )}
</div>
```

---

## 왜 테스트에서 못 잡았나

`어드민 레시피 카드 — 모바일(375px) 레이아웃 가시성` 테스트에서
`flex-1 min-w-0` / `shrink-0` / `truncate` 클래스 존재 여부만 확인했음.

실제 픽셀 레벨의 가용 너비(59px 계산) 검증이 없었고,
Phase 3에서 버튼 1개 추가로 공간이 더 줄어든 상황을 테스트가 반영하지 못했음.

**재발 방지:**
액션 버튼 수 변경 시 이름 영역 가용 너비를 재계산하고,
테스트에서 버튼 개수 × 44px 기준 최소 이름 영역 너비도 검증함.

---

## 결과

레시피명이 이름 영역(~59px) 전체를 사용해 정상 표시됨.
배지와 카테고리명은 두 번째 줄에서 함께 표시.
