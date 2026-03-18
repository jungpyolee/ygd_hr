# [DB-003] Dev DB 분리 세팅 및 스키마 동기화

| 항목 | 내용 |
|------|------|
| 유형 | 스키마 변경 |
| 상태 | ✅ 완료 |
| 마이그레이션 | migrations/000_full_schema_dump.sql, migrations/012_dev_rls_auto_enable.sql |
| 발견일 | 2026-03-18 |
| 완료일 | 2026-03-18 |

## 배경

Production DB(main 브랜치)와 Dev DB(dev 브랜치)를 완전 분리하기 위해 새 Supabase 프로젝트를 생성했다.
- Production: `ymvdjxzkjodasctktunh` (https://ymvdjxzkjodasctktunh.supabase.co)
- Dev: `aayedfstvegiswgjwcuw` (https://aayedfstvegiswgjwcuw.supabase.co)

Vercel 환경변수도 분리:
- production target → prod Supabase
- preview + development target → dev Supabase

## 원인 분석

기존에는 main/dev 브랜치가 동일한 Supabase 프로젝트를 공유해서 dev 작업이 실 서비스 데이터에 영향을 줄 수 있었다.

## 마이그레이션

### 1단계: 전체 스키마 덤프 및 dev DB 적용 (000_full_schema_dump.sql)

prod DB 스키마를 Management API로 추출 후 dev DB에 그대로 적용:
- 함수 6개 (is_admin, set_updated_at, handle_new_user, prevent_duplicate_attendance, delete_user_admin, accept_substitute)
- 테이블 12개
- 트리거 7개
- 인덱스 14개
- RLS 활성화 12개 + RLS 정책 32개
- Storage 버킷 2개 (hr-documents private, recipe-media public) + 정책 8개
- stores 기초 데이터 복사 (공장, 목동, 카페)

### 2단계: rls_auto_enable 동기화 (012_dev_rls_auto_enable.sql)

prod에는 있고 dev에 없던 `rls_auto_enable` 함수 + `ensure_rls` 이벤트 트리거 추가.
이 트리거는 public 스키마에 새 테이블 생성 시 자동으로 RLS를 활성화한다.

## 테스트

```sql
-- dev DB에서 확인
SELECT evtname FROM pg_event_trigger WHERE evtname = 'ensure_rls';
-- → ensure_rls 반환 확인
```

컬럼, 함수, 인덱스 전체 diff 결과:
- 테이블/컬럼: 완전 동일
- 함수: 완전 동일 (rls_auto_enable 추가 후)
- 인덱스: 기능 동일 (substitute_requests 유니크 인덱스 이름만 상이 — 무해)

## 결과

prod/dev DB 스키마 실질적으로 동일. 이후 마이그레이션은 dev에서 먼저 적용·검증 후 prod에 반영하는 방식으로 진행.
