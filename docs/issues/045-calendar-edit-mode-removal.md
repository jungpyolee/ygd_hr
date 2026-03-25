# 045 — 어드민 캘린더 수정 모드/초안 제거 + 알림 glow 수정

## 배경
- 수정하기 버튼 → 수정 모드 진입 → 변경 → 저장 플로우가 불편함
- 초안(Draft) 배치 저장 방식의 복잡성
- 직원이 스케줄 알림 클릭 시 캘린더로 이동 + glow 동작 안 되는 버그

## 변경 내용

### 1. 수정 모드/초안 완전 제거 (`admin/calendar/page.tsx`)
- `mode("view"/"edit")` 상태, `DraftState`, `EMPTY_DRAFT`, `hasDraftChanges` 삭제
- "수정하기"/"저장하기"/"취소" 버튼 + 수정 모드 배너 제거
- `handleEnterEdit`, `handleSave`, `handleCancel` 제거

### 2. 즉시 편집 UX
- **빈 슬롯 클릭** → `SlotBottomSheet` 열림 (근무 추가)
- **기존 슬롯 클릭** → 새 `SlotInfoSheet` 열림 (정보 확인 + 수정/삭제 버튼)
- **DaySheet** 항상 편집 가능 (근무 추가/슬롯 클릭 수정)
- 모든 변경사항 즉시 DB 반영 + 해당 직원 알림 발송

### 3. 전주 복사 미리보기 (`CopyPreviewModal`)
- "전주 복사" 클릭 → 미리보기 모달에서 복사될 근무 목록 표시
- 각 근무별 수정(연필 아이콘) / 제거(X 아이콘) 가능
- "N개 근무 저장하기" 클릭 시 최종 DB 저장 + 알림

### 4. 알림 glow 수정 (`HomeClient.tsx`)
- `handleNotiClick`에 `schedule_updated` / `schedule_published` 케이스 추가
- `source_id`(변경된 날짜)로 `/calendar?highlight=날짜` 이동 → glow 동작
- 어드민 캘린더에서 알림 생성 시 `source_id`에 날짜 전달

## 결과
- 빌드 통과 확인
