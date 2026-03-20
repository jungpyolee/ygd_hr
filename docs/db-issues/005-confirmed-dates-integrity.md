# [DB-005] weekly_schedules confirmed_dates 무결성 복구

| 항목 | 내용 |
|------|------|
| 유형 | 버그 / 데이터 무결성 |
| 상태 | ✅ 완료 (Dev) / ⏳ Production 배포 대기 |
| 마이그레이션 | `migrations/017_fix_confirmed_dates_integrity.sql` |
| 발견일 | 2026-03-20 |
| 완료일 | 2026-03-20 (Dev) |

## 배경

`weekly_schedules.status = 'confirmed'`로 설정된 row 중
`confirmed_dates` 배열이 비어있거나 7일 미만인 데이터 존재.

관련 기능인 관리자 일간 뷰의 "확정됨 / 미확정" 표시와
홈화면의 오늘 스케줄 위젯이 `confirmed_dates`를 기준으로 동작하므로
주 확정 후에도 일별로 "미확정"으로 표시되는 오작동 발생.

## 원인 분석

기존 `handleConfirmSchedule` 로직이 `status = 'confirmed'`만 업데이트하고
`confirmed_dates`를 갱신하지 않음. (FEAT-028에서 코드 수정 완료)

Dev DB 발견 현황:
| week_start   | confirmed_dates 상태     |
|--------------|--------------------------|
| 2026-03-15   | 2개만 있음 (수동 일별 확정 이력) |
| 2026-03-22   | 빈 배열                   |
| 2026-03-29   | 빈 배열                   |
| 2027-02-07   | 빈 배열                   |

## 마이그레이션

```sql
UPDATE weekly_schedules
SET confirmed_dates = ARRAY(
  SELECT (week_start::date + i)::date
  FROM generate_series(0, 6) AS i
)
WHERE status = 'confirmed'
  AND (confirmed_dates IS NULL OR coalesce(array_length(confirmed_dates, 1), 0) < 7);
```

**주의**: `confirmed_dates`는 `date[]` 타입. 빈 배열의 `array_length`는 `NULL`을 반환하므로 `coalesce(..., 0)` 필수.

**멱등성**: 이미 7개 있는 row는 건드리지 않음. 여러 번 실행해도 안전.

## 테스트 (Dev)

```sql
SELECT id, week_start, status,
       coalesce(array_length(confirmed_dates, 1), 0) AS dates_count,
       confirmed_dates
FROM weekly_schedules
WHERE status = 'confirmed'
ORDER BY week_start;
```

결과: 전체 4행 모두 `dates_count = 7` 확인 ✅

## 배포 시 Production 적용 지침

> ⚠️ Production(`ymvdjxzkjodasctktunh`)에는 직접 실행 금지.
> 배포 시 아래 SQL을 관리자가 직접 Supabase SQL Editor에서 실행.

```sql
-- Production 적용 쿼리 (017_fix_confirmed_dates_integrity.sql 동일)
UPDATE weekly_schedules
SET confirmed_dates = ARRAY(
  SELECT (week_start::date + i)::date
  FROM generate_series(0, 6) AS i
)
WHERE status = 'confirmed'
  AND (confirmed_dates IS NULL OR coalesce(array_length(confirmed_dates, 1), 0) < 7);

-- 실행 후 검증
SELECT id, week_start, coalesce(array_length(confirmed_dates, 1), 0) AS dates_count
FROM weekly_schedules
WHERE status = 'confirmed'
ORDER BY week_start;
-- 모든 row의 dates_count = 7 이어야 함
```

## schema.md 변경 사항

없음 (컬럼 구조 변경 없음, 데이터 정합성 복구만).
