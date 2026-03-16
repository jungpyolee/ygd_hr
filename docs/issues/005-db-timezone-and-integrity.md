# [DB-004] 시간대 KST 통일 + 데이터 무결성 강화

| 항목 | 내용 |
|------|------|
| **유형** | DB 운영 / 데이터 정합성 |
| **상태** | ✅ 완료 |
| **발견일** | 2026-03-16 |
| **완료일** | 2026-03-16 |
| **마이그레이션** | `docs/migrations/004_timezone_and_data_integrity.sql` |

---

## 발견된 문제 4가지

### 1. DB 시간대 UTC → KST

**문제**: DB 기본 timezone이 UTC라 `DATE_TRUNC`, `CURRENT_DATE` 등 날짜 함수가 UTC 기준 동작.
Epic B(급여 자동 계산) 구현 시 `DATE_TRUNC('month', created_at)` 가 KST 기준으로 동작해야 3월 급여가 올바르게 집계됨.

**예시**: KST 2026-03-01 00:30 = UTC 2026-02-28 15:30 → UTC 기준 집계 시 2월로 분류됨.

**해결**: 모든 Supabase 롤에 `timezone = 'Asia/Seoul'` 적용.
```sql
ALTER DATABASE postgres SET timezone TO 'Asia/Seoul';
ALTER ROLE authenticator SET timezone TO 'Asia/Seoul';
ALTER ROLE authenticated SET timezone TO 'Asia/Seoul';
ALTER ROLE anon SET timezone TO 'Asia/Seoul';
ALTER ROLE service_role SET timezone TO 'Asia/Seoul';
```

**참고**: `timestamptz` 컬럼은 내부 저장은 여전히 UTC. JS 앱 코드는 변경 불필요 (`.toISOString()` → UTC 전달, `new Date()` → KST 표시 — 기존과 동일하게 정상 동작).

---

### 2. check_in/out_store_id 의미론적 오염

**문제**: Migration 003에서 기존 데이터를 `check_in_store_id = check_out_store_id = store_id` 로 일괄 복사.
IN 로그에 `check_out_store_id`가 채워지고, OUT 로그에 `check_in_store_id`가 채워지는 의미 오류.

**해결**:
```sql
UPDATE attendance_logs SET check_out_store_id = NULL WHERE type = 'IN';
UPDATE attendance_logs SET check_in_store_id = NULL WHERE type = 'OUT';
```

**결과**:
- IN 로그: `check_in_store_id = 매장ID`, `check_out_store_id = NULL` ✅
- OUT 로그: `check_in_store_id = NULL`, `check_out_store_id = 매장ID` ✅

---

### 3. 이정표 계정 테스트 더미 데이터

**문제**: 개발 테스트 중 이정표(개발자) 계정에 3/14~15 총 46건의 더미 로그 발생.
1~2초 간격 IN/OUT 반복 패턴. Epic B 급여 계산 구현 시 오염된 데이터 포함 위험.

**해결**: 이정표 계정(`51eb939e-...`) 전체 attendance_logs 삭제.

---

### 4. DB 레벨 중복 출퇴근 방지 없음

**문제**: 출근/퇴근 버튼 중복 차단이 UI(`disabled` 속성)에만 의존.
빠른 연속 탭, 다중 탭, 기기 변경 시 IN→IN 또는 OUT→OUT 중복 삽입 가능.

**해결**: BEFORE INSERT 트리거 추가.
```sql
-- IN→IN, OUT→OUT 차단
-- 출근 없이 퇴근 차단
CREATE TRIGGER trg_prevent_duplicate_attendance
BEFORE INSERT ON attendance_logs
FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_attendance();
```

**에러 코드**: `P0001`
- `DUPLICATE_ATTENDANCE_TYPE` → "이미 출근/퇴근 상태예요"
- `INVALID_CHECKOUT_NO_CHECKIN` → "출근 기록이 없어요"

AttendanceCard.tsx에서 에러 코드별 사용자 친화적 메시지 처리 추가.

---

## 시간대 처리 원칙 (향후 적용 기준)

| 계층 | 방식 |
|------|------|
| DB 저장 | `timestamptz DEFAULT now()` (UTC 저장, KST 표시) |
| DB 날짜 함수 | KST 기준 자동 적용 (DB timezone = Asia/Seoul) |
| JS → DB | `.toISOString()` UTC 문자열 전달 |
| DB → JS | `new Date(timestamptz)` → 로컬 KST 자동 변환 |
| 서버사이드 집계 | `DATE_TRUNC('month', created_at)` KST 기준 |

> 신규 테이블 추가 시 `timestamptz DEFAULT now()` 패턴 유지.

---

## 변경 파일 목록

| 파일 | 변경 유형 |
|------|----------|
| `docs/migrations/004_timezone_and_data_integrity.sql` | 신규 생성 |
| `src/components/AttendanceCard.tsx` | 트리거 에러 처리 추가 |
| `docs/schema.md` | 시간대 원칙, 트리거 목록, 개선 항목 갱신 |
