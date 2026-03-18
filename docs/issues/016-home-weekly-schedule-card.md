# [FEAT-016] 직원 홈 — 주간 근무시간 통계 → 이번 주 스케줄 시간표

| 항목 | 내용 |
|------|------|
| 유형 | 기능 교체 |
| 상태 | ✅ 완료 |
| 파일 | `src/app/page.tsx`, `src/components/WeeklyWorkStats.tsx` (삭제), `src/components/WeeklyScheduleCard.tsx` (신규) |
| 발견일 | 2026-03-18 |
| 완료일 | 2026-03-18 |

## 배경

대표 통화에서 "이번 주 근무시간 통계는 별로 안 중요할 것 같다. 요일별로 몇 시부터 몇 시까지 일해야 하는지 앞에 보이는 게 나을 것 같다"고 확인.

현재 `WeeklyWorkStats`는 실제 근태 기록 기반 누적 근무 시간을 막대 그래프로 표시.
이를 `schedule_slots` 기반 이번 주 예정 스케줄 시간표로 교체.

## 현재 상태

- `WeeklyWorkStats.tsx`: 이번 주 IN/OUT 로그 집계 → 요일별 막대 + 총 시간 표시
- `page.tsx`: `todaySlots` 상태는 이미 있음 (오늘 슬롯 fetch 중)
- `/schedule` 페이지: 이미 주간 스케줄 전체 뷰 존재

## 수정 계획

### 삭제

- `src/components/WeeklyWorkStats.tsx` — 파일 삭제
- `page.tsx`에서 `import WeeklyWorkStats` 제거

### 신규 컴포넌트: `WeeklyScheduleCard.tsx`

**데이터 소스**: `schedule_slots` JOIN `weekly_schedules` (status = 'confirmed', 이번 주 날짜 범위)

**표시 구조**:
```
[이번 주 스케줄]

월  10:00 – 18:00  카페
화  10:00 – 18:00  카페
수  휴무
목  10:00 – 18:00  카페
금  10:00 – 18:00  카페
토  12:00 – 20:00  공장
일  휴무

[스케줄 전체 보기 →]  ← /schedule 링크
```

**빈 상태**: 이번 주 확정 스케줄이 없을 때
```
"이번 주 스케줄이 아직 없어요."
"스케줄이 확정되면 여기서 확인할 수 있어요."
```

**로딩**: Skeleton (7행 가로 줄무늬)

### 컬러 토큰 활용

| 요일 | 근무 있음 | 오늘 |
|------|-----------|------|
| 텍스트 | `text-[#191F28]` | `text-[#3182F6] font-bold` |
| 휴무 | `text-[#8B95A1]` | - |

### page.tsx 변경

- `WeeklyWorkStats` import 제거
- `WeeklyScheduleCard` import 추가 (위치는 AttendanceCard 아래)

## UI/UX 라이팅

| 요소 | 텍스트 |
|------|--------|
| 카드 제목 | "이번 주 스케줄" |
| 빈 상태 제목 | "이번 주 스케줄이 아직 없어요." |
| 빈 상태 설명 | "스케줄이 확정되면 여기서 확인할 수 있어요." |
| 링크 버튼 | "전체 스케줄 보기" |
| 로케이션 라벨 | 카페 / 공장 / 케이터링 |

## 결과

- [ ] `WeeklyWorkStats.tsx` 삭제
- [ ] `WeeklyScheduleCard.tsx` 신규 생성
- [ ] `page.tsx` import 교체
- [ ] 확정 스케줄 없을 때 빈 상태 표시 확인
- [ ] 오늘 요일 강조 확인
- [ ] `/schedule` 링크 이동 확인
- [ ] 빌드 통과
