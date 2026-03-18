# [BUG-024] Dev 다중 버그 수정 (세션 2026-03-18)

| 항목 | 내용 |
|------|------|
| 유형 | 버그 수정 + 기능 개선 |
| 상태 | ✅ 완료 |
| 발견일 | 2026-03-18 |
| 완료일 | 2026-03-18 |

---

## DB 수정 (Dev: aayedfstvegiswgjwcuw)

### [DB-1] recipe_steps — 직원 INSERT 정책 누락
- **원인**: 어드민 ALL 정책만 존재. 직원이 레시피 저장 시 recipe_items는 저장되지만 recipe_steps INSERT가 RLS에 막혀 "단계 저장에 실패했어요" 토스트 발생
- **수정**: `레시피 작성자 단계 관리` ALL 정책 추가 — `created_by = auth.uid()` 기준

### [DB-2] recipe_ingredients — full_time 전용 제한
- **원인**: `정규직 재료 수정` 정책이 `employment_type = 'full_time'` 조건 포함 → 파트타임 직원 재료 추가 불가
- **수정**: 정책 교체 → `레시피 작성자 재료 관리` (employment_type 무관, created_by 기준)

### [DB-3] recipe_comments — DELETE 정책 누락
- **원인**: INSERT/SELECT/UPDATE 정책만 존재. DELETE 정책이 없어서 직원이 자신의 댓글/대댓글 삭제 시 RLS가 조용히 차단 (에러 없이 0행 삭제)
- **수정**: `본인 댓글 삭제` DELETE 정책 추가 — `profile_id = auth.uid()`

---

## 프론트엔드 수정

### [FE-1] 토글 스위치 thumb 화면 이탈
- **파일**: `RecipeForm.tsx`, `admin/checklists/page.tsx`
- **원인**: `<span>`에 `left-0` 미지정 → absolute 요소가 브라우저 임의 위치에 배치되어 translate 적용 시 컨테이너 이탈
- **수정**: `left-0` 추가 + 버튼에 `overflow-hidden` + `type="button"` 추가
- **통일**: 어드민 체크리스트 토글도 동일 방식으로 맞춤

### [FE-2] 재료 입력 행 화면 이탈 + 헤더-인풋 정렬 불일치
- **파일**: `RecipeForm.tsx`
- **원인**: 고정 너비 필드 합계(`w-16 × 2 + w-9 + gap`)가 모바일 컨테이너 초과. 헤더 레이블은 `w-16`인데 인풋은 `w-14`/`w-12`로 다름
- **수정**: `gap-1.5`로 축소, `w-14`/`w-12`/`w-8`로 줄임, `shrink-0` + `min-w-0` 추가. 헤더 레이블도 동일 너비로 동기화

### [FE-3] 댓글 등록 후 목록 미갱신
- **파일**: `RecipeComments.tsx`
- **원인**: INSERT 후 Supabase 실시간 구독 이벤트에만 의존. 구독이 불안정한 환경(PWA, 네트워크 지연)에서 이벤트가 오지 않으면 목록이 갱신되지 않아 유저는 "등록 실패"로 인식
- **수정**: `submitComment`, `submitReply`, `deleteComment` 각각 완료 후 `await fetchComments()` 직접 호출

### [FE-4] recipe_comments profiles 다중 FK 에러
- **파일**: `RecipeComments.tsx`
- **원인**: `recipe_comments`에 `profile_id`와 `mentioned_profile_id` 2개의 FK가 `profiles`를 참조. `.select("*, profiles(...)")` 사용 시 PGRST201 에러
- **수정**: `profiles!recipe_comments_profile_id_fkey(name, color_hex)` 로 FK 이름 명시

### [FE-5] 대댓글 입력 중 포커스 풀림
- **파일**: `RecipeComments.tsx`
- **원인**: `CommentCard`가 `RecipeComments` 렌더 함수 **내부**에 정의됨. `replyText` 상태가 바뀔 때마다 부모가 리렌더되고, 매번 새로운 함수 참조로 인식 → React가 다른 컴포넌트로 판단해 언마운트/마운트 반복 → textarea 포커스 소실
- **수정**: `CommentCard`를 파일 최상위로 이동, 필요한 값을 props로 전달

### [FE-6] 대댓글 커서 위치가 맨 앞으로 이동
- **파일**: `RecipeComments.tsx`
- **원인**: `setReplyText("@이름 ")` 후 `useEffect`에서 `el.focus()`만 호출. 일부 브라우저는 focus 시 커서를 0번 위치로 이동
- **수정**: `requestAnimationFrame` 콜백 안에서 `focus()` + `setSelectionRange(len, len)` 순서로 호출 (RAF로 DOM value 반영 보장 후 커서 이동)

### [FE-7] 대댓글 삭제 불가 (DB-3과 연계)
- 코드 자체는 정상이나 DB-3의 DELETE 정책 누락으로 RLS 차단

### [FE-8] 체크리스트 완료 버튼 동작 불가
- **파일**: `ChecklistSheet.tsx`
- **원인**: `useEffect`가 `onComplete`를 dependency로 참조. 부모 컴포넌트 리렌더 시 `onComplete`가 새 함수 참조 → useEffect 재실행 → cleanup이 이전 setTimeout 취소 → 완료 로직이 영원히 실행되지 않음
- **수정**: 자동완료 방식 제거. 모두 체크 시 완료 버튼 활성화 → 클릭으로 명시적 처리

### [FE-9] PWA 바텀시트 → 중앙 모달 전환
- **파일**: `ChecklistSheet.tsx`, `schedule/page.tsx`
- **원인**: 모바일 웹/PWA에서 바텀시트는 pull-to-refresh 제스처와 충돌, 드래그 핸들 미작동 (브라우저가 touchmove 선점)
- **수정**: `items-end` → `items-center justify-center p-5`, `rounded-t-[28px]` → `rounded-[28px]`, 드래그 핸들/나중에 하기 버튼 제거

### [FE-10] 홈 화면 개선
- 헤더에서 로그아웃/어드민 버튼 제거 → 유저 아이콘 내 MyInfoModal로 통합
- 홈 섹션 순서: 공지사항 → 오늘 스케줄 → 이번주 스케줄 → 레시피 → 거리
- 불필요 카드 제거: "내 스케줄 바로가기", "기록이 안되나요?"

### [FE-11] 공지사항 관리 카드 클릭 이동
- **파일**: `admin/announcements/page.tsx`
- 카드 전체 클릭 시 수정 페이지 이동. 개별 액션 버튼(핀/수정/삭제)은 `e.stopPropagation()` 추가

### [FE-12] 내 스케줄 페이지 헤더 + 대타 현황
- 헤더: nav 스타일 → 공지사항/레시피와 동일한 `header` 태그 스타일
- "내가 요청한 대타" 섹션 추가: 상태 배지(검토 중/구인 중/대타 확정/요청 거절) + 수락자 이름 표시

---

## 결과
- 빌드 성공 (22개 페이지)
- DB 정책 3건 수정/추가 (Dev)
