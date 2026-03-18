# [BUG-014] 스케줄 일간 뷰 버그 수정 + 일간 확정 + 대체근무 개선

| 항목 | 내용 |
|------|------|
| 유형 | 버그 수정 + 기능 추가 |
| 상태 | ✅ 완료 |
| 파일 | `src/app/admin/schedules/page.tsx`, `src/app/schedule/page.tsx` |
| 발견일 | 2026-03-18 |
| 완료일 | 2026-03-18 |

## 버그 목록

### BUG-1: 일간 뷰 확정 상태 오표시
`weeklySchedule` 상태가 `weekStart` 기반으로 fetch되어 일간 탭에서 다른 주의 확정 상태를 보여줌.

### BUG-2: 일간에서 확정 누르면 엉뚱한 주 확정
`handleConfirmSchedule`이 `weekStartStr` (weekStart 기반) 으로 weekly_schedule을 확정해서,
주간 탭에서 다른 주를 보다가 일간 탭으로 오면 그 주가 확정됨.

### BUG-3: 일간 슬롯 추가 후 UI 미갱신
`handleSaveSlot` 후 `fetchAll()`만 호출하고 `dailySlotsData`는 갱신하지 않음.

### BUG-4: 일반 유저 대체근무 데이터 조회 불가
`schedule_slots` RLS 정책 `ss_emp_own`이 `profile_id = auth.uid()` 조건이라
대체근무 요청의 JOIN 시 다른 직원 슬롯을 조회할 수 없어 전체 데이터가 null로 반환됨.

## 기능 추가

### FEAT-A: 일간 확정 단위
- 일간 뷰에서 "이 날 확정하기" 버튼 추가
- `weekly_schedules` 테이블에 `confirmed_dates date[]` 컬럼 추가
- 주간 뷰 날짜 헤더에 확정된 날 표시 (체크마크)

### FEAT-B: 대체근무 수락 시 겹치는 스케줄 방지
- `handleAcceptSubstitute`에서 대체근무 날짜/시간과 기존 슬롯 겹침 검사
- 겹치면 toast 에러 표시 후 수락 불가

## DB 마이그레이션

```sql
-- 1. 일간 확정용 컬럼 추가
ALTER TABLE weekly_schedules ADD COLUMN IF NOT EXISTS confirmed_dates date[] DEFAULT '{}';

-- 2. schedule_slots RLS 수정 — 확정 주의 모든 슬롯 + 대체근무 eligible 슬롯 조회 허용
DROP POLICY IF EXISTS "ss_emp_own" ON schedule_slots;
CREATE POLICY "ss_emp_confirmed" ON schedule_slots FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM weekly_schedules ws
    WHERE ws.id = schedule_slots.weekly_schedule_id
      AND ws.status = 'confirmed'
  )
  OR EXISTS (
    SELECT 1 FROM substitute_requests sr
    WHERE sr.slot_id = schedule_slots.id
      AND auth.uid() = ANY(sr.eligible_profile_ids)
  )
);
```
