# DB-041: 근태 크레딧(티어) 시스템 테이블 추가

**작성일**: 2026-03-25
**상태**: 실행 완료

---

## 배경

기획서(043)에 정의된 크레딧 점수 기반 티어 시스템 구현을 위해 DB 스키마를 추가한다.
정상 출퇴근 +3점, 지각 -3~-10점, 결근 -50점 등 이벤트 기반 점수를 누적하여
다이아몬드(900+) ~ 아이언(300 미만) 6단계 티어로 직원을 분류한다.

## 변경 내용

### 1. attendance_credits 테이블 (신규)
- 모든 점수 변동 이벤트를 기록하는 이벤트 소싱 테이블
- profile_id, event_type, points, description, reference_id, reference_date

### 2. profiles 컬럼 추가
- `credit_score` (int, default 500) — 비정규화된 현재 점수
- `current_streak` (int, default 0) — 현재 연속 출근
- `longest_streak` (int, default 0) — 최장 연속 출근
- `streak_shield_used_at` (date) — 보호권 사용월 추적
- `streak_milestones_claimed` (int[], default '{}') — 달성한 마일스톤

### 3. 트리거
- `sync_credit_score()`: attendance_credits INSERT/DELETE 시 profiles.credit_score 동기화

### 4. RLS + 인덱스

## 마이그레이션 파일
- `docs/migrations/041_attendance_credits.sql`

## 검증 쿼리
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'attendance_credits'
ORDER BY ordinal_position;

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
AND column_name IN ('credit_score', 'current_streak', 'longest_streak', 'streak_shield_used_at', 'streak_milestones_claimed');
```

## 결과

(실행 후 기록)
