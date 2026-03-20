# [FEAT-028] 주간 확정 연동 + 체크리스트 개선 (스케줄 기반 필터링 + 이탈 재개)

| 항목 | 내용 |
|------|------|
| 유형 | 버그 수정 + 기능 개선 |
| 상태 | ✅ 완료 |
| 파일 | `src/app/admin/schedules/page.tsx`, `src/components/AttendanceCard.tsx`, `src/components/ChecklistSheet.tsx`, `src/app/page.tsx`, `src/types/checklist.ts` |
| 발견일 | 2026-03-20 |
| 완료일 | 2026-03-20 |

---

## ✅ 완료된 수정

### 1. 오타 수정 — "확정ss" → "확정"
`src/app/admin/schedules/page.tsx:1446`

### 2. 주간 확정 시 confirmed_dates 자동 갱신
**배경**: `weekly_schedules.status = "confirmed"` 업데이트 시 `confirmed_dates` 미갱신.
일(日)은 주(週)의 하위 개념이므로 주 확정 시 해당 주 전체 날짜가 확정돼야 함.

**수정**: `handleConfirmSchedule`에서 `confirmed_dates: weekDates` 함께 저장.
이로써 주 확정 버튼 클릭 1회로 일별 확정 상태도 동기화됨.

---

## 🔄 대기 중인 작업

### 3. 스케줄 1슬롯 제한

**배경**: 하루에 직원 1명당 슬롯 1개가 업무 규칙.
DB는 복수 슬롯을 허용하지만 실제로는 사용하지 않음.

**수정 내용**:
- 주간 뷰 `+` 버튼: 해당 셀에 슬롯이 이미 있으면 숨기기
- `saveSlot`: 신규 추가 시 같은 직원·날짜 슬롯 존재하면 차단 (toast.error)

**파일**: `src/app/admin/schedules/page.tsx`

---

### 4. 체크리스트 스케줄 기반 필터링 + 오늘 슬롯 없으면 미표시

**배경**: 현재 `profile.work_locations / cafe_positions`(정적 배열)로 필터링.
실제로는 오늘 배정된 `schedule_slots`의 `work_location / cafe_positions` 기준이어야 함.

**수정 내용**:
- `page.tsx` → `AttendanceCard`에 `todaySlots` prop 추가 전달
- `AttendanceCard`: `userProfile` 상태 제거, `fetchChecklistItems` 로직 교체
  - `todaySlots[0]` 없으면 `[]` 반환 → 체크리스트 미표시
  - 있으면 `slot.work_location / cafe_positions`로 필터링
- `AttendanceCardProps`에 `todaySlots: TodaySlot[]` 추가

**파일**: `src/app/page.tsx`, `src/components/AttendanceCard.tsx`

---

### 5. 체크리스트 이탈 후 재개

**배경**: 체크리스트 도중 앱 종료 또는 페이지 이탈 시 체크 상태 소멸.
재진입 시 체크리스트를 이어서 진행할 수 없음.

**수정 내용**:

`types/checklist.ts`:
```typescript
export interface ChecklistDraft {
  userId: string;
  date: string;                    // "YYYY-MM-DD"
  trigger: "check_in" | "check_out";
  attendanceLogId: string | null;  // check_in만 사용
  checkedIds: string[];
}
```

`ChecklistSheet.tsx` prop 추가:
- `initialCheckedIds?: string[]` — 재개 시 pre-checked 상태로 시작
- `onCheck?: (checkedIds: string[]) => void` — 체크할 때마다 draft 갱신

`AttendanceCard.tsx`:
- localStorage draft 저장/로드/삭제 헬퍼 (`saveDraft`, `loadDraft`, `clearDraft`)
- check_in: `processAttendance` 성공 후 draft 생성 → 체크 시마다 갱신 → submission 성공 시 삭제
- check_out: 체크리스트 열릴 때 draft 생성 → 체크 시마다 갱신 → complete 시 삭제
- mount 시 재개 감지:
  - check_out: localStorage 확인 + `lastLog.type === "IN"` → 재개 배너
  - check_in: localStorage + DB `checklist_submissions` 조회 → submission 없으면 재개 배너
- 재개 배너 UI: 출퇴근 버튼 아래 "📋 [출근/퇴근] 체크리스트를 완료해 주세요 [이어서 하기]"

**localStorage key**: `checklist_draft_{userId}_{trigger}`

**파일**: `src/types/checklist.ts`, `src/components/ChecklistSheet.tsx`, `src/components/AttendanceCard.tsx`

---

## 엣지 케이스

| 케이스 | 처리 |
|--------|------|
| 오늘 슬롯 없음 | 체크리스트 미표시 |
| 날짜 바뀐 후 draft 잔존 | date 비교로 무시 + 삭제 |
| check_in submission 이미 있음 | draft 삭제, 배너 미표시 |
| 슬롯 이미 있는 날 + 버튼 | 버튼 숨김 |

## DB 변경 사항

없음 (신규 파일도 없음).
