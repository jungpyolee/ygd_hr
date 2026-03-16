# [DB-002] profiles.updated_at 자동 갱신 트리거 추가

| 항목 | 내용 |
|------|------|
| **유형** | 스키마 개선 |
| **상태** | ✅ 완료 |
| **마이그레이션** | `migrations/002_profiles_updated_at_trigger.sql` |
| **발견일** | 2026-03-16 |
| **완료일** | 2026-03-16 |

---

## 배경 (Background)

`profiles` 테이블에 `updated_at` 컬럼이 존재하지만
자동 갱신 트리거가 없어서 UPDATE 시에도 초기값(`created_at` 시점)이 유지됨.

현재 상태:
- `created_at`: `now()` 기본값 → 정상
- `updated_at`: `now()` 기본값으로 INSERT 시 설정되지만 **UPDATE 시 변경되지 않음**

---

## 원인 분석 (Investigation)

트리거 현황 확인:
```sql
SELECT trigger_name, event_object_table, action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public';
-- 결과: 없음 (auth 스키마의 on_auth_user_created만 존재)
```

`updated_at`이 갱신되어야 하는 시점:
- `MyInfoModal`에서 프로필 정보 수정 시
- 관리자가 직원 정보 수정 시
- 온보딩 완료 시

현재는 코드 레벨에서 `updated_at`을 별도로 지정하지 않으면
DB에서 자동으로 갱신되지 않아 항상 가입일 시점으로 남음.

---

## 마이그레이션 계획

### 방식
PostgreSQL 표준 패턴: `BEFORE UPDATE` 트리거로 `updated_at = now()` 자동 설정

```sql
-- 1. 범용 함수 생성 (다른 테이블에도 재사용 가능)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. profiles 테이블에 트리거 연결
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## 실행 결과

Management API로 함수 + 트리거 생성 완료. 응답: `[][]` (정상)

```sql
-- 함수 생성
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 연결
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

---

## 테스트 결과

### 테스트 1: 트리거 존재 확인
```sql
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE trigger_name = 'trg_profiles_updated_at';
-- 결과: trg_profiles_updated_at | UPDATE | BEFORE ✅
```

### 테스트 2: 기존 데이터 확인
```sql
SELECT id, name, created_at, updated_at, (updated_at > created_at) as is_updated
FROM public.profiles LIMIT 3;
-- 결과: 기존 row는 is_updated = false (트리거 생성 이전 row라 정상)
-- 이후 UPDATE 발생 시부터 자동 갱신됨 ✅
```

### 참고
- 기존 row들의 `updated_at = created_at`은 정상 — 트리거 생성 이전에 만들어진 데이터
- 앞으로 `MyInfoModal`, 관리자 직원 수정, 온보딩 완료 시 자동 갱신됨

---

## schema.md 변경 사항

`docs/schema.md` 함수 섹션에 `set_updated_at()` 추가.
트리거 섹션에 `trg_profiles_updated_at` 추가 반영.
