# 056. tax_category 값 재명명 — 공제 방식 기준

## 배경

055에서 `tax_category`를 `'business' | 'daily' | 'regular'` 세 값으로 도입했어요. 하지만 이 네이밍은 **직원 분류(사업/일용/근로)** 관점이라 실제 사용자(관리자·세무사)가 보는 공제 방식(3.3%/2대보험/4대보험)과 거리가 있어요.

UI에서도 어차피 "3.3%", "2대보험", "4대보험"이라고 표시하고 싶고, 엑셀 시트 이름도 그대로 쓰고 있어서 **값 자체를 공제 방식으로 바꾸는 게 라벨 맵 없이 일관성 있어요**.

## 수정 내용

### DB (migration 056)
- `profiles.tax_category` / `payroll_entries.tax_category` 값 UPDATE
  - `'business'` → `'3.3%'`
  - `'daily'` → `'2대보험'`
  - `'regular'` → `'4대보험'`
- CHECK 제약 재생성.

### 코드
- `TaxCategory` 타입: `"3.3%" | "2대보험" | "4대보험"`.
- `payroll-calc.ts` 분기 비교 교체.
- `admin/payroll` 배지·공제 상세 패널·편집 셀렉트·엑셀 시트 필터 교체.
- `admin/employees` 세금 유형 버튼 옵션 교체.
- `EmployeeProfileModal` 공제 유형 셀렉트 교체. 라벨 맵 제거(값 그대로 노출).
- vitest 테스트 값 교체.

## 결과

- Dev 실행 완료, 매핑 검증 완료 (`3.3%` 8명 / `4대보험` 4명 / null 2명).
- `npm run build` 통과.
- 단위 테스트 통과.
- Prod은 배포 절차로 반영.
