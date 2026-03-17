# [BUG-009] 카테고리 순서 변경 시 "순서를 변경할 수 없어요" 에러

| 항목 | 내용 |
|------|------|
| 유형 | 버그 수정 |
| 상태 | ✅ 완료 |
| 파일 | `src/app/admin/recipes/categories/page.tsx` |
| 발견일 | 2026-03-17 |
| 완료일 | 2026-03-17 |

---

## 배경

카테고리 관리 페이지(`/admin/recipes/categories`)에서 위/아래 버튼으로
카테고리 순서를 변경하면 항상 "순서를 변경할 수 없어요" 토스트가 표시되고
실제 변경은 이루어지지 않았음.

---

## 원인 분석

`moveCategory` 함수에서 두 카테고리의 `order_index`를 교환할 때
Supabase의 `.upsert()` 를 사용하고, 페이로드로 `{ id, order_index }` 만 전달했음.

```typescript
// ❌ 문제 코드
const { error } = await supabase.from("recipe_categories").upsert([
  { id: updated[index].id, order_index: index },
  { id: updated[swapIndex].id, order_index: swapIndex },
]);
```

Supabase `.upsert()` 는 내부적으로 PostgreSQL의
`INSERT ... ON CONFLICT (id) DO UPDATE SET order_index = EXCLUDED.order_index`
로 변환된다.

`recipe_categories.name` 컬럼은 `NOT NULL` 이고 DEFAULT 가 없다.
PostgreSQL은 `INSERT ... ON CONFLICT DO UPDATE` 실행 시
**conflict 감지 이전에 INSERT 단계에서 NOT NULL 제약을 먼저 검사**한다.
따라서 `name` 이 누락된 INSERT 시도는 conflict 도달 전에
`null value in column "name" violates not-null constraint` 로 실패한다.

즉, 행이 이미 존재해도 upsert 는 항상 실패하는 구조였음.

---

## 수정 내용

`upsert` 대신 두 행을 각각 `update` 로 교환.
`update` 는 기존 행에 명시한 컬럼만 덮어쓰므로 `name` 누락 문제 없음.

```typescript
// ✅ 수정 코드
const catA = categories[index];
const catB = categories[swapIndex];

const [res1, res2] = await Promise.all([
  supabase.from("recipe_categories")
    .update({ order_index: swapIndex })
    .eq("id", catA.id),
  supabase.from("recipe_categories")
    .update({ order_index: index })
    .eq("id", catB.id),
]);

const error = res1.error || res2.error;
```

---

## 테스트에서 놓친 이유 분석

Phase 3 테스트(`src/__tests__/recipe.test.tsx`) 는 다음 항목을 검증했음:
- 순수 유틸 함수 (`getStoragePath`, `validate`)
- 파일 크기 조건 (File 객체 생성)
- 레이아웃 구조 (React 컴포넌트 렌더링)
- localStorage 로직
- 검색 필터 로직

**`moveCategory` 는 테스트 대상에서 누락됐음.**

누락 이유:
1. Supabase 클라이언트 모킹이 필요한 비동기 함수는 설정 비용이 높아
   순수 함수 위주로 테스트를 설계했음.
2. `upsert` vs `update` 의 SQL 변환 차이는 DB 스키마 제약(`NOT NULL`)과
   결합해야만 드러나는 버그여서, 코드 리뷰만으로는 잡기 어려웠음.
3. Phase 3 기능 고도화 시 카테고리 관리 페이지에 대한 별도 테스트 케이스를
   추가하지 않았음.

**재발 방지:**
- Supabase 조작 함수(`insert`, `update`, `upsert`, `delete`) 를 포함한
  컴포넌트 로직을 작성할 때는 mock 기반 테스트를 함께 작성함.
- `upsert` 사용 시 반드시 페이로드에 `NOT NULL` 컬럼이 모두 포함되는지
  DB 스키마와 대조하여 확인함.

---

## 결과

- 카테고리 위/아래 이동 정상 작동 확인
- `moveCategory` 단위 테스트 추가
