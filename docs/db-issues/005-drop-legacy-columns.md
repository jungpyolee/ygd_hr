# [DB-005] 레거시/미사용 컬럼 제거

| 항목 | 내용 |
|------|------|
| 유형 | 스키마 변경 |
| 상태 | ✅ 완료 |
| 마이그레이션 | migrations/027_drop_legacy_columns.sql |
| 발견일 | 2026-03-22 |
| 완료일 | 2026-03-22 |

## 배경

코드베이스 전수 분석 결과 DB에는 존재하지만 앱 로직에서 실제로 사용되지 않는 컬럼 4개 발견.

## 원인 분석

| 컬럼 | 상태 | 이유 |
|------|------|------|
| `attendance_logs.store_id` | 레거시 | DB-003에서 `check_in_store_id` / `check_out_store_id`로 분리 이관됐지만 코드에서 계속 INSERT/SELECT되고 있었음 |
| `stores.radius_m` | 미사용 | 매장별 반경 설정 컬럼이나 코드에서 `RADIUS_METER = 100` 하드코딩 상수로 대체됨 |
| `profiles.target_in_time` | 미사용 | 어드민 직원 편집 폼에만 표시, 근태 계산/스케줄 등 어떤 로직에도 활용 안 됨 |
| `profiles.target_out_time` | 미사용 | 동일 |

## 마이그레이션

### 1. store_id 백필 (DB-003 이전 구 데이터 보호)
```sql
UPDATE attendance_logs
SET check_in_store_id = store_id
WHERE type = 'IN' AND store_id IS NOT NULL AND check_in_store_id IS NULL;

UPDATE attendance_logs
SET check_out_store_id = store_id
WHERE type = 'OUT' AND store_id IS NOT NULL AND check_out_store_id IS NULL;
```

### 2. 컬럼 DROP
```sql
ALTER TABLE attendance_logs DROP COLUMN IF EXISTS store_id;
ALTER TABLE stores           DROP COLUMN IF EXISTS radius_m;
ALTER TABLE profiles         DROP COLUMN IF EXISTS target_in_time;
ALTER TABLE profiles         DROP COLUMN IF EXISTS target_out_time;
```

## 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `src/components/AttendanceCard.tsx` | INSERT에서 `store_id` 제거 |
| `src/app/page.tsx` | SELECT 쿼리를 `check_in_store_id` / `check_out_store_id` 별칭 조인으로 변경 |
| `src/app/admin/attendance/page.tsx` | SELECT 조인을 `check_in_store_id` 기준으로 변경 |
| `src/app/admin/employees/page.tsx` | Profile 타입 및 편집 폼에서 `target_in_time`, `target_out_time` 제거 |
| `src/__tests__/db/rls.test.ts` | 관련 컬럼 참조 전부 수정 (work_defaults 잘못된 store_id도 work_location으로 교정) |

## 결과

- Dev DB 컬럼 DROP 완료 (검증: 4개 컬럼 조회 결과 0건)
- `npm run build` 통과 (에러 없음)

## schema.md 변경 사항

- `attendance_logs`: `store_id` 행 제거
- `stores`: `radius_m` 행 제거
- `profiles`: `target_in_time`, `target_out_time` 행 제거
- 개선 필요 사항 항목 #1, #5 완료 처리
