# [DB-001] attendance_logs 성능 인덱스 추가

| 항목 | 내용 |
|------|------|
| **유형** | 성능 개선 |
| **상태** | ✅ 완료 |
| **마이그레이션** | `migrations/001_attendance_logs_indexes.sql` |
| **발견일** | 2026-03-16 |
| **완료일** | 2026-03-16 |

---

## 배경 (Background)

`attendance_logs` 테이블에 PK(`id`) 인덱스만 존재하고
실제 쿼리에서 자주 사용되는 컬럼에 인덱스가 없음.

현재 코드에서 발생하는 주요 쿼리 패턴:
```sql
-- page.tsx: 사용자의 최근 출퇴근 기록 조회
SELECT * FROM attendance_logs
WHERE profile_id = $1
ORDER BY created_at DESC
LIMIT 1;

-- attendances/page.tsx: 주간/월간 기록 조회
SELECT * FROM attendance_logs
WHERE profile_id = $1
  AND created_at >= $2
ORDER BY created_at ASC;

-- admin/page.tsx: 오늘 출근자 전체 조회
SELECT * FROM attendance_logs
WHERE created_at >= '오늘 00:00'
ORDER BY created_at DESC;

-- admin/attendance/page.tsx: 특정 기간 전체 직원 기록 조회
SELECT * FROM attendance_logs
WHERE created_at >= $1 AND created_at <= $2;
```

---

## 원인 분석 (Investigation)

현재 인덱스 현황 (schema.md 기준):
```
attendance_logs_pkey  →  UNIQUE (id)  만 존재
```

`profile_id`, `created_at` 컬럼에 인덱스가 없으면:
- Full Table Scan 발생
- 직원 수 및 기록 증가 시 쿼리 성능 선형 저하
- 특히 관리자 대시보드의 "오늘 출근자", "기록 이상" 쿼리에서 영향 큼

---

## 마이그레이션 계획

### 추가할 인덱스

| 인덱스명 | 컬럼 | 이유 |
|---------|------|------|
| `idx_attendance_logs_profile_id` | `profile_id` | 직원별 기록 조회 |
| `idx_attendance_logs_created_at` | `created_at` | 날짜 범위 조회 |
| `idx_attendance_logs_profile_created` | `(profile_id, created_at)` | 직원+날짜 복합 조회 (가장 빈번) |

복합 인덱스 `(profile_id, created_at)`가 있으면 단일 인덱스 2개를 대부분 커버하므로
단일 인덱스는 관리자 대시보드의 날짜 범위 전체 조회를 위해 별도 추가.

---

## 실행 결과

Management API로 3개 인덱스 생성 완료. 응답: `[]` (정상)

```sql
CREATE INDEX IF NOT EXISTS idx_attendance_logs_profile_id
  ON public.attendance_logs (profile_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_created_at
  ON public.attendance_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_profile_created
  ON public.attendance_logs (profile_id, created_at DESC);
```

---

## 테스트 결과

### 테스트 1: 인덱스 3개 존재 확인
```sql
SELECT COUNT(*) as index_count
FROM pg_indexes
WHERE tablename = 'attendance_logs' AND indexname LIKE 'idx_%';
-- 결과: index_count = 3 ✅
```

### 테스트 2: 인덱스 상세 확인
```
idx_attendance_logs_profile_id      → btree (profile_id)           ✅
idx_attendance_logs_created_at      → btree (created_at DESC)       ✅
idx_attendance_logs_profile_created → btree (profile_id, created_at DESC) ✅
```

---

## schema.md 변경 사항

`docs/schema.md` 인덱스 섹션에 3개 인덱스 추가 반영.
