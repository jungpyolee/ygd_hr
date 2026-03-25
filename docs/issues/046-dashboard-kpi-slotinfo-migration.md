# 046 — 대시보드 매장별 출근현황 + SlotInfoSheet 근태정보 이관

## 배경
- 대시보드 KPI 카드의 왼쪽 음영 border 스타일이 토스 UI와 맞지 않음
- 미출근/처리필요 카드 불필요 → 매장별 출근율+지각으로 교체
- 빠른이동의 "근태 기록"은 스마트근태 캘린더(레거시)로 연결 → 제거
- 통합 캘린더 SlotInfoSheet에 스마트근태 캘린더의 상세 정보 이관 필요

## 변경 내용

### 1. DashboardKPICards.tsx — 매장별 출근 현황 (토스 UI)
- 기존 4개 가로스크롤 KPI 카드 (borderLeftWidth 스타일) 전면 제거
- 매장별 카드로 교체: `bg-white rounded-[28px] border border-slate-100 p-5`
- 매장별 표시: 출근율 %, 출근 X/Y명, 지각 N명 (평균 +M분)
- 출근율 색상: ≥90% 초록, 70-89% 주황, <70% 빨강

### 2. AdminQuickNav.tsx — 근태 기록 타일 제거
- "근태 기록" (/admin/attendance) 타일 제거
- 5개 타일 3+2 배치

### 3. SlotInfoSheet — 스마트근태 캘린더 정보 이관
- 출퇴근 타임라인 (HH:mm ▶ HH:mm / 근무 중 / 기록없음)
- 근무 시간 (총 Xh Ym)
- 지각/조기퇴근 뱃지
- 출퇴근 거리 (MapPin)
- 근무 유형 뱃지 (출장/원격/수동)
- 퇴근 사유
- 미출근 표시 (과거 날짜)
- 수동 퇴근 처리 버튼 + 모달 (DaySheet 패턴 재사용)

## 결과
- 빌드 통과 확인
