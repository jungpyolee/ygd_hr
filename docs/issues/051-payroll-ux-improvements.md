# 051. 급여 페이지 UX 개선 — 0원 직원 숨김 + 재계산 필요 경고

## 배경

급여관리 디버깅 중 두 가지 UX 문제 발견:

1. **0원 직원이 화면·엑셀에 그대로 노출** — 해당 월 근무 없는 직원·제외 대상이 카드 리스트와 세무사용 엑셀 출력에 섞여 혼잡.
2. **재계산 누락으로 인한 stale entries** — 유가온 3월 −360분, 윤서 4월 스케줄+OT 불일치, 신서연 4월 −30분 등. 관리자가 스케줄/OT 수정 후 "급여 재계산" 버튼을 누르지 않으면 `payroll_entries` 값이 과거 시점으로 고정되는 구조.

## 수정 내용

### 0원 직원 숨김
- `src/app/admin/payroll/page.tsx` 카드 리스트 필터: `entries.filter(e => e.net_salary !== 0 || staleEntryIds.has(e.id))`
- 엑셀 출력 데이터 행도 동일 필터. 합계 합에는 영향 없음(0원은 합에 영향 0).
- stale 예외: 신규 생성 스케줄로 인해 아직 재계산 안 된 직원이 숨지 않도록.

### 재계산 필요 경고
- live 집계 SWR 추가: `schedule_slots`(lunch_deduction 반영) + `overtime_requests` 월간 직원별 합계.
- entries의 `scheduled_minutes`·`overtime_minutes`와 비교해 불일치면 `staleEntryIds`에 등록.
- 카드 헤더에 **"재계산 필요"** 노란 배지 표시.
- 상단에 "**N명 재계산 필요** — 급여 재계산을 눌러 최신 값으로 갱신해주세요" 배너.
- `handleCalculate` 이후 `mutateEntries` → 배지·배너 자동 소멸.

## 결과

- 빌드 통과. 실 운영 환경에서 4월 기준 손은주·양인우·박예준·윤서 4명 배지가 점심차감 적용 전·후 차이로 떴다가 재계산 후 사라짐 확인 가능.
- 0원 필터로 카드 리스트와 엑셀 가독성 개선.
