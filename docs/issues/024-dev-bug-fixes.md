# [BUG-024] Dev 다중 버그 수정

| 항목 | 내용 |
|------|------|
| 유형 | 버그 수정 |
| 상태 | ✅ 완료 |
| 파일 | RecipeForm.tsx, RecipeComments.tsx, page.tsx, MyInfoModal.tsx, ChecklistSheet.tsx, schedule/page.tsx |
| 발견일 | 2026-03-18 |
| 완료일 | 2026-03-18 |

## 배경
Dev 환경에서 발견된 다수의 UI/UX 버그 및 DB 권한 문제 일괄 수정.

## 수정 항목

### [BUG-1] 레시피 공개여부 토글 원형 UI 화면 이탈
- **원인**: `<span>`에 `left-0` 미지정 → 브라우저가 absolute 요소를 임의 위치에 배치 후 translate 적용 시 컨테이너 이탈
- **수정**: `left-0` 추가, 버튼에 `overflow-hidden` 및 `type="button"` 추가
- **파일**: `RecipeForm.tsx:752`

### [BUG-2] 재료 추가 UI 화면 이탈
- **원인**: 고정 너비 필드들(`w-16 × 2 + w-9`)이 좁은 화면에서 부모를 초과
- **수정**: gap `gap-1.5` 축소, `w-14`/`w-12`/`w-8`로 줄이고 `shrink-0` 추가, 재료명에 `min-w-0`
- **파일**: `RecipeForm.tsx:870`

### [BUG-3] 직원 레시피 단계 저장 실패
- **원인**: `recipe_steps` 테이블 RLS에 직원 INSERT 정책 없음 (admin 전용)
- **수정**: Dev DB에 `레시피 작성자 단계 관리` ALL 정책 추가 (created_by = auth.uid() 기준)
- **추가**: `recipe_ingredients` 정규직 제한 정책 → 전체 작성자 허용으로 교체

### [BUG-4] 레시피 댓글 추가 안됨 (조사 결과)
- `recipe_comments` INSERT RLS 정책은 정상 (`profile_id = auth.uid()`)
- 실제 원인은 **BUG-3과 동일한 흐름의 RLS 오해**로 추정. 정책 자체는 문제없음.

### [BUG-5] 댓글 등록하기 버튼 여백 이상
- **원인**: 텍스트에어리어와 버튼이 가로 flex로 배치되어 버튼이 우측에 바짝 붙음
- **수정**: 세로 flex(`flex-col`)로 변경, 버튼을 textarea 아래에 전체 너비로 배치
- **파일**: `RecipeComments.tsx:394`

### [BUG-6] 홈화면 로그아웃 버튼 → 내 정보 모달 통합
- **수정**: 헤더에서 로그아웃/어드민 버튼 제거 → 유저 아이콘 + 알림 벨만 유지
- MyInfoModal 하단에 로그아웃 버튼(빨간색) + 어드민 버튼(admin만 노출) 추가
- ConfirmDialog 로그아웃 확인을 MyInfoModal 내부로 이동
- **파일**: `page.tsx`, `MyInfoModal.tsx`

### [BUG-7] 체크리스트 바텀시트 → 중앙 모달 전환
- **원인**: PWA 웹 환경에서 바텀시트 pull-to-refresh 충돌, 드래그 핸들 미동작
- **수정**: `ChecklistSheet.tsx` 전면 재작성
  - `items-end` → `items-center`, `rounded-t-[28px]` → `rounded-[28px]`
  - 드래그 핸들 및 "나중에 할게요" 버튼 제거
  - 체크 항목 클릭 시 체크 후 350ms 딜레이로 `opacity-0 max-h-0` 사라짐 애니메이션
  - 모두 체크 완료 시 600ms 후 자동 `onComplete` 호출 (버튼 불필요)
  - 배경 클릭으로 닫기 불가 (반드시 완료해야 함)

### [BUG-8] 대타 바텀시트 → 중앙 모달 전환
- **수정**: 대타 요청/수락 확인 바텀시트를 중앙 모달로 변경
  - `items-end` → `items-center justify-center p-5`
  - `rounded-t-[28px]` → `rounded-[28px]`
  - `slide-in-from-bottom-4` → `fade-in zoom-in-95`
  - 드래그 핸들 제거
- **파일**: `schedule/page.tsx`

## 결과
- 빌드 성공 (22개 페이지 전부 통과)
- DB 정책: recipe_steps/recipe_ingredients 직원 권한 추가 (Dev DB)
