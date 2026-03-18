# [FEAT-019] 레시피 댓글/대댓글 + 알림

| 항목 | 내용 |
|------|------|
| 유형 | 기능 추가 |
| 상태 | 🔄 미시작 |
| 파일 | `src/app/recipes/[id]/page.tsx`, `src/components/recipe/RecipeComments.tsx` (신규) |
| 발견일 | 2026-03-18 |
| 완료일 | - |

## 배경

대표 통화에서 "레시피 하단에 댓글로 질문 같은 거 남길 수 있게, 대댓글도 달 수 있게, 대댓글 시에는 어떤 댓글을 향하는 건지 그 작성자가 태그될 수 있도록, 댓글 관련 알림이 잘 가도록" 확인.

직원들이 레시피에 대해 질문/메모를 남기고, 서로 응답할 수 있는 소통 채널로 활용.

## DB 설계

```sql
CREATE TABLE recipe_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES recipe_items(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES recipe_comments(id) ON DELETE CASCADE, -- NULL이면 최상위 댓글
  content text NOT NULL,
  mentioned_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL, -- 대댓글 시 @태그 대상
  is_deleted boolean NOT NULL DEFAULT false, -- soft delete (대댓글 있으면 내용만 숨김)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 인덱스
CREATE INDEX ON recipe_comments(recipe_id, parent_id, created_at);

-- updated_at 트리거 재사용
CREATE TRIGGER trg_recipe_comments_updated_at
  BEFORE UPDATE ON recipe_comments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE recipe_comments ENABLE ROW LEVEL SECURITY;

-- 전 직원 조회 (published 레시피 댓글만)
CREATE POLICY "직원 댓글 조회" ON recipe_comments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recipe_items ri
      WHERE ri.id = recipe_id AND ri.is_published = true
    )
    OR is_admin()
  );

-- 인증 직원 댓글 작성
CREATE POLICY "직원 댓글 작성" ON recipe_comments FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

-- 본인 댓글 수정/삭제
CREATE POLICY "본인 댓글 수정" ON recipe_comments FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid());

-- 어드민 ALL
CREATE POLICY "어드민 댓글 관리" ON recipe_comments FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
```

## 알림 설계

### 발송 규칙

| 상황 | 발신 | 수신 | type |
|------|------|------|------|
| 레시피에 최상위 댓글 작성 | 댓글 작성자 | 레시피 작성자 (본인 제외) | `recipe_comment` |
| 댓글에 대댓글 작성 | 대댓글 작성자 | 부모 댓글 작성자 (본인 제외) | `recipe_reply` |
| @멘션 포함 | 댓글/대댓글 작성자 | 멘션된 사람 (본인 제외, 부모 작성자와 다른 경우만) | `recipe_mention` |

### 중복 방지

- 레시피 작성자 = 댓글 작성자 본인이면 skip
- 부모 댓글 작성자 = 멘션 대상이 같으면 `recipe_reply` 1개만 발송

### 알림 내용 예시

```
recipe_comment:
  제목: "레시피에 새 댓글이 달렸어요"
  내용: "{댓글작성자}님: {댓글내용 앞 30자}..."

recipe_reply:
  제목: "{대댓글작성자}님이 답글을 달았어요"
  내용: "{대댓글내용 앞 30자}..."

recipe_mention:
  제목: "{작성자}님이 회원님을 언급했어요"
  내용: "{댓글내용 앞 30자}..."
```

## 코드 설계

### 컴포넌트: `RecipeComments.tsx`

```
RecipeComments (레시피 ID prop)
├── 댓글 입력창 (상단 또는 목록 하단)
├── 댓글 목록 (최상위 댓글 최신순 또는 오래된순)
│   └── 댓글 카드
│       ├── 아바타 + 이름 + 시간
│       ├── 댓글 내용
│       ├── "답글 달기" 버튼
│       ├── 본인/어드민: 삭제 버튼
│       └── 대댓글 목록 (들여쓰기)
│           └── 대댓글 카드
│               ├── @{부모댓글작성자} 태그 (파란색)
│               ├── 아바타 + 이름 + 시간
│               └── 내용
└── 빈 상태: "첫 댓글을 남겨보세요."
```

### 대댓글 입력 UX

1. "답글 달기" 클릭 → 해당 댓글 바로 아래 인라인 입력창 펼침
2. 입력창 첫 줄에 `@{부모댓글작성자이름} ` 자동 삽입 (편집 가능)
3. 제출 시 `mentioned_profile_id`에 부모 작성자 ID 저장

### Soft Delete 처리

- 본인이 댓글 삭제 → `is_deleted = true`
- 대댓글 없으면 UI에서 완전 제거
- 대댓글 있으면 `"삭제된 댓글이에요."` 회색 텍스트로 표시 (대댓글은 유지)

### 페이지 (`/recipes/[id]`) 수정

- `<RecipeComments recipeId={id} />` 스텝 목록 하단에 추가
- 댓글 수 표시: 레시피 헤더에 `💬 3` 뱃지

## UI/UX 라이팅

| 요소 | 텍스트 |
|------|--------|
| 섹션 제목 | "댓글 {N}개" |
| 입력창 placeholder | "궁금한 점이나 메모를 남겨보세요." |
| 제출 버튼 | "등록하기" |
| 빈 상태 | "첫 댓글을 남겨보세요." |
| 답글 버튼 | "답글 달기" |
| 삭제 확인 | 바텀시트 — "댓글을 삭제할까요?" / "삭제하기" / "취소" |
| 삭제된 댓글 | "삭제된 댓글이에요." |
| 대댓글 @태그 | `@홍길동` (파란색 `text-[#3182F6]`) |

## 결과

- [ ] DB 마이그레이션 실행 (`recipe_comments`)
- [ ] RLS 4종 생성
- [ ] updated_at 트리거 생성
- [ ] `RecipeComments.tsx` 컴포넌트 신규 생성
- [ ] 대댓글 @태그 자동 삽입 및 표시
- [ ] Soft delete 처리
- [ ] 알림 3종 발송 (recipe_comment, recipe_reply, recipe_mention)
- [ ] 알림 딥링크 → `/recipes/{id}` 이동
- [ ] schema.md 갱신 (테이블, 알림 type)
- [ ] 빌드 통과
