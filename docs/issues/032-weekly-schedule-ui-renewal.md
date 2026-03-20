# [FEAT-032] 주간 스케줄 UI 리뉴얼 — 텍스트 overflow 수정 + 전체 클릭 영역

| 항목 | 내용 |
|------|------|
| 유형 | 버그 수정 + UI 개선 |
| 상태 | ✅ 완료 |
| 파일 | `src/components/WeeklyScheduleCard.tsx`, `src/components/HomeClient.tsx` |
| 발견일 | 2026-03-21 |
| 완료일 | 2026-03-21 |

## 배경

직원 메인 페이지의 스케줄 UI 두 곳에서 문제가 발생했다.

1. `WeeklyScheduleCard` — 7열 그리드의 셀 너비가 약 36px에 불과한데, 각 셀에 시간 텍스트(`HH:MM`, `~HH:MM`, 위치 레이블)를 9~10px 폰트로 표시해 텍스트 overflow 및 가독성 저하 발생.
2. 오늘 스케줄 섹션 — `<section>` 태그로 감싸져 있어 클릭 영역이 없었음. 사용자가 터치해도 스케줄 상세로 이동 불가.

## 원인 분석

- **WeeklyScheduleCard**: 7열 그리드에서 셀당 가용 너비 ≈ (375 - 40 - 6×4) / 7 ≈ 46px → 패딩 제외 시 약 36px. `HH:MM` 5글자 × 10px 폰트(≈ 6px/글자) ≈ 30px으로 아슬아슬하게 들어가나, 위치 레이블 `text-[9px]`은 "케이터링"(4글자)에서 overflow. 모바일 소폰트 = 가독성 심각하게 저하.
- **클릭 영역**: `WeeklyScheduleCard`는 헤더 `<Link>` 만, 오늘 스케줄 섹션은 클릭 핸들러 자체가 없었음.

## 수정 내용

### WeeklyScheduleCard.tsx

- **날짜 스트립 재설계**: 7열 그리드 셀에서 시간/위치 텍스트 제거 → 위치 컬러 도트(1.5px 원)만 표시해 overflow 원천 차단.
- **오늘 날짜 강조**: 날짜 숫자를 파란 원형(`bg-[#3182F6] text-white w-8 h-8 rounded-full`)으로 표시.
- **하단 스케줄 리스트 추가**: 오늘 이후 최대 3개 일정을 충분한 너비의 리스트로 표시. 요일 레이블 + 컬러 도트 + 시간(`tabular-nums`) + 위치 배지.
- **전체 클릭 영역**: `<section>` 전체를 `<Link href="/schedule">` 로 감싸고 `active:scale-[0.99]` 피드백 추가.

### HomeClient.tsx — 오늘 스케줄 섹션

- `<section>` → `<button onClick={() => router.push("/schedule")}>` 로 교체해 전체 카드 클릭 가능.
- 좌측 위치 컬러 바(세로 라인, `w-1 rounded-full`) 추가 — 시각적 위치 구분.
- 시간 폰트 `text-[17px]` → `text-[18px] tabular-nums`.
- 포지션 배지 `rounded-md` → `rounded-full` 통일.
- `Clock` 아이콘 제거 (색상 바로 대체), 미사용 import 정리.

## 결과

- `npm run build` 통과.
- 7열 그리드 overflow 없음 — 어떤 화면 너비에서도 안전.
- 오늘 스케줄 + 주간 스케줄 카드 모두 전체 영역 클릭 가능.
- 토스 UX 기준 준수: 충분한 터치 영역, `tabular-nums` 숫자 정렬, 위치 컬러 토큰 일관 적용.
