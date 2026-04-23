# 054. 스케줄 슬롯 점심시간 차감 토글

## 배경

공장 근무지(`stores.work_location_key = 'factory'`)에서는 사장이 점심을 제공하기 때문에 점심 1시간은 급여 계산에서 빼야 한다. 현재 급여 계산(`src/app/admin/payroll/page.tsx:278` `handleCalculate`)은 `schedule_slots`의 `start_time`~`end_time` 분을 그대로 더하기만 해서, 공장 8시간 슬롯이 모두 8시간으로 계산된다.

2026-04 기준 비교 리포트에서 공장 근무자 과다 지급 사례:

| 이름 | 공장 슬롯 | 과다 분 |
|------|-----------|---------|
| 박예준 | 5 | 300분 |
| 윤서 | 4 | 240분 |
| 손은주 | 3 | 180분 |
| 양인우 | 3 | 180분 |

## 왜 store 단위가 아닌 슬롯 단위인가

> 10~13시 3시간 근무는 점심 안 먹고 일하고, 10~18시 근무는 중간에 점심을 먹는다. 시간만으로 자동 분기할 수 없어서 관리자가 **슬롯마다 판단**해서 체크해야 한다.

따라서 `stores`에 `break_minutes` 같은 전역 값을 두지 않고, `schedule_slots.lunch_deduction boolean`을 추가한다.

## 원인 분석

- `schedule_slots`에 휴게/점심 관련 컬럼 없음.
- 급여 계산 로직이 스케줄 분을 그대로 합산해서 차감 개념 자체가 없음.
- 공장 여부는 `schedule_slots.store_id` → `stores.work_location_key`로 조인해야 확인 가능.

## 수정 내용

### DB
- `schedule_slots.lunch_deduction boolean NOT NULL DEFAULT false` 컬럼 추가 (`docs/migrations/054_schedule_slots_lunch_deduction.sql`).
- 기존 행은 DEFAULT로 false 채워짐 → 기존 급여 계산 결과에 영향 없음.

### 코드
- 스케줄 편집 UI: 공장 근무지일 때만 "점심 1시간 차감" 체크박스 노출.
- 급여 계산 로직: `schedule_slots` 집계 시 `lunch_deduction = true`인 슬롯에 한해 60분 차감.

### 적용 범위
- 재계산 버튼을 눌러야 기존 entries에 반영됨 (재계산 누락 방지는 별도 이슈로).

## 결과

### DB
- Dev(`rddplpiwvmclreeblkmi`)에 `schedule_slots.lunch_deduction boolean NOT NULL DEFAULT false` 추가 완료. 기존 슬롯은 모두 false.
- Production은 dev→main 배포 시 섹션 3-1 절차로 반영.

### 코드
- `src/app/admin/calendar/page.tsx`
  - `ScheduleSlot` 타입에 `lunch_deduction: boolean` 추가.
  - `SlotBottomSheet`에 공장(`work_location_key='factory'`)일 때만 "점심 1시간 차감" 토글 노출. 근무지를 공장에서 다른 곳으로 바꾸면 자동으로 false.
  - insert/update/전주 복사/미리보기 편집 경로 모두 `lunch_deduction` 전파.
- `src/app/admin/payroll/page.tsx`
  - `handleCalculate`가 `schedule_slots` 집계 시 `lunch_deduction=true`인 슬롯은 60분 차감(`Math.max(0, raw - 60)`).
  - 관리자가 "재계산" 버튼을 눌러야 기존 entries에 반영됨.

### 사용자단 표시 반영
- `src/app/calendar/page.tsx` 월 요약 예정·실제 근무시간: `lunch_deduction=true` 슬롯 60분 차감. 실제는 해당 날짜 집합으로 매칭.
- `src/app/attendances/page.tsx` 일자별 인정시간 및 월 합계: 동일하게 반영.
- "점심차감"이란 문구는 직원에게 노출하지 않음 — 숫자만 변경됨.
- 어드민(`admin/stats`, `admin/overtime`, `admin/calendar` 타임라인)은 raw 시간 유지 (관리자 판단·실 기록 확인 용도).

### Prod 백필 (2026-04-23 실행)
- Prod에 마이그레이션 054 실행 (컬럼 추가).
- 2026-04 공장 슬롯 32건 일괄 `lunch_deduction=true` 업데이트.
- 3월(25건) / 5월(5건) 공장 슬롯은 건드리지 않음.
- 어드민은 급여 "재계산" 버튼을 눌러 기존 4월 entries를 보정해야 함.

### 빌드
- `npm run build` 통과.
