# [DB-006] auth.users INSERT 트리거 Dev DB 누락

| 항목 | 내용 |
|------|------|
| 유형 | 버그 |
| 상태 | ✅ 완료 |
| 마이그레이션 | migrations/020_auth_user_created_trigger.sql |
| 발견일 | 2026-03-21 |
| 완료일 | 2026-03-21 |

## 배경

로컬 개발 환경에서 Supabase Auth로 유저 생성 시 `profiles` 테이블에 row가 자동 생성되지 않는 문제 발견.

## 원인 분석

- `handle_new_user()` 함수는 Dev DB에 존재했으나, 이를 호출하는 트리거 `on_auth_user_created`가 Dev DB의 `auth.users`에 등록되어 있지 않았음.
- 해당 트리거는 Production DB에서 Supabase 대시보드를 통해 수동 생성된 것으로 추정. migration 파일로 관리되지 않아 Dev 싱크 시 누락됨.
- CLAUDE.md 싱크 검증 체크리스트(Step 5)에 트리거 비교 항목이 없어 Dev/Prod 싱크 검증에서도 탐지되지 않음.

## 마이그레이션

```sql
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

Dev DB에 직접 실행 (Supabase Management API).

## 테스트

- Dev/Prod 트리거 전체 목록 조회 후 1:1 대조 → 완전 일치 확인

## 결과

- Dev DB `auth.users`에 `on_auth_user_created` 트리거 추가 완료
- 유저 생성 시 `profiles` 자동 생성 정상 동작

## 재발 방지

- CLAUDE.md Step 5 싱크 검증에 트리거 조회 쿼리 항목 추가 완료
  ```sql
  SELECT trigger_name, event_object_schema, event_object_table, event_manipulation, action_statement
  FROM information_schema.triggers
  ORDER BY event_object_schema, event_object_table, trigger_name;
  ```
- `020_auth_user_created_trigger.sql` migration 파일로 이력 등록
