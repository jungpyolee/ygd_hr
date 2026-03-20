# [FEAT-031] 홈 화면 UI 리뉴얼 — v1.0.1

| 항목 | 내용 |
|------|------|
| 유형 | 기능 개선 |
| 상태 | ✅ 완료 |
| 파일 | `src/app/page.tsx`, `src/components/WeeklyScheduleCard.tsx` |
| 발견일 | 2026-03-20 |
| 완료일 | 2026-03-20 |

## 배경

홈 화면 로딩 시간 단축 및 가독성 개선 요청.
- 하단 근무처까지 거리 표시 카드가 Geolocation 연산을 매 렌더마다 추가 실행해 로딩 지연 발생
- 이번 주 스케줄 카드가 너무 작아 한눈에 파악하기 어려움
- 공지사항 배너와 레시피 바로가기가 세로로 길게 나열되어 스크롤 낭비

## 수정 내용

### 제거
- `StoreDistanceList` 컴포넌트 완전 제거 (import 포함)
  - Geolocation 연산 경량화, 로딩 시간 단축
- 전체 너비 `AnnouncementBanner` 컴포넌트 교체 (파일 자체는 유지)

### 레이아웃 변경 (page.tsx)
- **공지사항 + 레시피 2열 그리드**: `grid-cols-2 gap-3` 으로 이번 주 스케줄 위에 배치
  - 공지사항 컴팩트 카드: 오렌지 Megaphone 아이콘, 미읽음 뱃지, 최신 공지 제목 미리보기
  - 레시피 컴팩트 카드: 블루 BookOpen 아이콘, 기존 텍스트 유지
- **새 레이아웃 순서**: AttendanceCard → 오늘 스케줄 → [공지|레시피] 그리드 → WeeklyScheduleCard

### WeeklyScheduleCard 리뉴얼
- 셀 높이 `min-h-[64px]` → `min-h-[88px]` 확대
- 요일 라벨 아래 **날짜 숫자** 추가 (예: 월/20)
- 위치 점 크기 `w-2` → `w-2.5`
- 시간 텍스트 `text-[9px]` → `text-[10px]`
- 근무지 레이블(카페/공장/케이터링) 셀 하단에 추가
- 날짜 계산: `weekDates[idx] = addDays(weekStartSun, idx + 1)` (월~일)
- `LOCATION_LABELS` 상수 추가

## 결과

- 홈 화면 렌더링 경량화 (StoreDistanceList 제거로 Geolocation 연산 1회 감소)
- 이번 주 스케줄 카드 가독성 대폭 향상 (날짜 숫자, 근무지 레이블 추가)
- 공지사항·레시피 진입점을 스크롤 없이 한 화면에서 확인 가능
