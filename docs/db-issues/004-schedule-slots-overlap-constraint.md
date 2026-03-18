# [DB-004] schedule_slots 시간 겹침 DB 수준 방지

| 항목 | 내용 |
|------|------|
| 유형 | 스키마 변경 (보안/무결성) |
| 상태 | ✅ 완료 |
| 마이그레이션 | migrations/014_schedule_slots_no_overlap.sql |
| 발견일 | 2026-03-18 |
| 완료일 | 2026-03-18 |

## 배경

QA 분석에서 `schedule_slots` 테이블의 시간 겹침 방지가 클라이언트 코드에서만 처리되고 있음을 발견.
직접 API 호출이나 어드민 슬롯 생성 시 겹치는 슬롯이 DB에 삽입 가능한 상태였음.

## 원인 분석

- `admin/schedules/page.tsx`에서 클라이언트 사이드 겹침 체크만 존재
- DB에 UNIQUE 또는 EXCLUSION 제약이 없어서 RLS/트리거 없이도 중복 삽입 가능
- `schema.md`에 "유효성: 같은 profile_id·slot_date 시간 겹침 클라이언트 차단"으로만 명시됨

## 마이그레이션

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE schedule_slots
ADD CONSTRAINT no_overlapping_slots
EXCLUDE USING gist (
  profile_id WITH =,
  tsrange(
    (slot_date + start_time)::timestamp,
    (slot_date + end_time)::timestamp
  ) WITH &&
) WHERE (status = 'active');
```

- `btree_gist` 확장: UUID 타입을 gist 인덱스에서 = 연산자로 사용하기 위해 필요
- `tsrange + &&`: 두 시간 범위가 겹치면 true
- `WHERE (status = 'active')`: cancelled/substituted 슬롯은 체크 제외

## 테스트

```sql
SELECT conname, contype FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
WHERE t.relname = 'schedule_slots' AND conname = 'no_overlapping_slots';
-- → {conname: 'no_overlapping_slots', contype: 'x'} 확인
```

## 결과

- Production DB에 EXCLUSION CONSTRAINT 적용 완료
- status='active'인 슬롯에 한해 같은 profile_id에서 시간이 겹치면 DB 레벨에서 INSERT/UPDATE 거부
- 클라이언트 검증과 이중 방어로 안전성 강화

## schema.md 변경 사항

`schedule_slots` 유효성 섹션에 다음 추가:
- `no_overlapping_slots`: EXCLUSION CONSTRAINT — status=active 슬롯 시간 겹침 DB 수준 차단
