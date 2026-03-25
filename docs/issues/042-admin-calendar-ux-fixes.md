# 042 — 어드민 통합캘린더 UX 버그 8종 수정

> 작성일: 2026-03-25
> 상태: 완료

---

## 이슈 목록

### #1 당일 출근시간 이전인데 "결근" 표시
**원인:** `isFutureDay = !isDayPast && !isTodayDate` 이므로 오늘은 `isFutureDay=false` → 출근 전이어도 `is_absent=true`인 경우 "✗ 결근" 표시됨.
**수정:** 슬롯 start_time 기준으로 `isPastScheduledStart = isDayPast || (isTodayDate && now >= slotStartDt)` 계산 후 이 조건일 때만 결근/미출근 표시.
- 과거 + is_absent → "✗ 결근"
- 오늘 + is_absent + 출근시간 이후 → "✗ 미출근"
- 오늘 + is_absent + 출근시간 이전 → 표시 없음 (예정으로 간주)

### #2 출근시간 찍힌 슬롯과 없는 슬롯 간 height 불일치
**원인:** `✓ HH:mm` / `✗ 결근` 라인이 조건부로 렌더링되어 슬롯 카드 높이가 다름.
**수정:** 세 번째 줄을 항상 `h-[12px]` 고정 div로 감싸고, 내용만 조건부 렌더링.

### #3 모바일에서 직원 행 height 너무 큼
**원인:** `min-h-[68px]`, `py-3` 등 여백 과도.
**수정:** `min-h-[54px]` 축소, td `py-1`, 슬롯 버튼 `py-1` 로 컴팩트.

### #4 슬롯 클릭 시 전체 직원 DaySheet 열림
**원인:** view 모드 슬롯 클릭 시 `setSelectedDay(d)`로 전체 직원 시트가 열림.
**수정:**
- 슬롯 클릭 → `selectedSlotInfo: { profileId, dateStr }` 설정 → DaySheet에 `filterProfileId` 전달해 단일 직원 표시
- 날짜 헤더(th) 클릭 → 기존 전체 직원 DaySheet

### #5 레이어 토글 새로고침 시 초기화됨 + 색상 개선
**원인:** `layers` state가 메모리에만 있음.
**수정:** localStorage `"admin_calendar_layers"` 키로 저장/복원. 활성 색상 `bg-[#191F28]`로 통일 (직원 탭과 동일).

### #6 "오늘" 버튼 위치/사용성 개선
**원인:** 네비게이션 안에 파묻혀 눈에 안 띔.
**수정:** 컨트롤 바(뷰 전환 토글 오른쪽)으로 이동, 현재 뷰에 오늘이 포함돼 있으면 비활성 스타일.

### #7 월간뷰 어드민 포함 여부 미적용
**원인:** `attMap` 초기화 시 슬롯 기반으로 profileMap에 없는 직원(어드민)도 항목 생성됨. 로그 반영 단계에서도 동일.
**수정:** `slots.forEach`, `logsData.forEach` 초입에 `if (!profileMap[slot.profile_id]) return;` 추가.

### #8 근무 추가 모달 직원 기본값 문제
**원인:** `profile_id: defaultProfileId || profiles[0]?.id || ""`로 첫 직원이 기본 선택됨.
**수정:** `profile_id: defaultProfileId || ""`로 변경. select에 빈 placeholder option 추가.

---

## 수정 파일

| 파일 | 이슈 |
|------|------|
| `src/app/admin/calendar/page.tsx` | 전체 8종 |
