# 043 — 근태 크레딧(티어) 시스템 구현

**작성일**: 2026-03-25
**상태**: 구현 완료 (Phase 2)

---

## 배경

기획서(043-attendance-tier-system-planning.md)에 정의된 크레딧 점수 기반 티어 시스템을 구현.
출퇴근 이벤트마다 점수가 증감되고, 누적 점수로 6단계 티어(다이아~아이언)가 결정된다.

## 수정 내용

### DB 마이그레이션 (041)
- `attendance_credits` 테이블 생성 (이벤트 소싱)
- `profiles` 컬럼 추가: credit_score, current_streak, longest_streak, streak_shield_used_at, streak_milestones_claimed
- `sync_credit_score()` 트리거: 크레딧 INSERT/DELETE 시 profiles.credit_score 자동 동기화
- RLS, 인덱스, Realtime 설정

### 새 파일
| 파일 | 설명 |
|------|------|
| `src/lib/tier-utils.ts` | 티어 판정, 색상, 라벨, 점수 정책 상수 |
| `src/lib/credit-engine.ts` | 크레딧 처리 Server Action (출근/정산/수동조정) |
| `src/components/TierBadge.tsx` | Rounded Hexagon SVG 티어 배지 |
| `src/components/TierProgressBar.tsx` | 티어 내 진행률 바 |
| `src/components/TierCard.tsx` | 직원 홈 화면 티어 카드 |
| `src/components/AdjustCreditSheet.tsx` | 관리자 수동 점수 조정 바텀시트 |
| `src/app/credit-history/page.tsx` | 직원 크레딧 이력 페이지 |

### 수정 파일
| 파일 | 변경 |
|------|------|
| `src/app/admin/stats/page.tsx` | 완전 재작성 (크레딧 리더보드, 티어 분포, 상세 패널, 정산 버튼) |
| `src/components/HomeClient.tsx` | TierCard 삽입 |
| `src/components/AttendanceCard.tsx` | 출근 성공 후 processCheckinCredit 호출 |

### 티어 구조
| 티어 | 점수 범위 | 색상 |
|------|---------|------|
| 다이아몬드 | 900~1000 | #B8D4F5 |
| 플래티넘 | 750~899 | #C8D4DC |
| 골드 | 600~749 | #C9A84C |
| 실버 | 450~599 (시작점 500) | #9BAAB8 |
| 브론즈 | 300~449 | #9E7A5A |
| 아이언 | 300 미만 | #78828C |

### 점수 정책
- 정상 출퇴근: +3, 지각(5~10분): -3, 지각(10분+): -10
- 무단결근: -50, 조기퇴근: -8, 퇴근 미기록: -5
- 대타(월2회): +10, 초과분: +3
- 스트릭 보너스: 10회+15, 30회+50, 60회+80, 100회+150
- 보호권: 월 1회 자동 지급, 지각 시 스트릭 유지

## 결과

- `npm run build` 통과
- Dev DB 마이그레이션 완료 (041)
- 어드민 크레딧 리더보드 + 수동 조정 동작
- 직원 홈 티어 카드 + 크레딧 이력 페이지 동작
- 출근 시 자동 크레딧 처리 연동
