# DB 관리 전략 계획서

## 개요

Claude Code 내에서 Supabase PostgreSQL DB의 스키마 파악, 문서화,
마이그레이션 실행을 모두 처리할 수 있는 워크플로우 구축.

---

## 구조

```
docs/
├── db-management-plan.md     # 이 파일 (전략 계획)
├── schema.md                 # 현재 DB 스키마 전체 (자동 갱신)
└── migrations/
    ├── 001_init.sql          # 마이그레이션 SQL 파일들
    ├── 002_xxx.sql
    └── ...
```

---

## 도구

| 도구 | 역할 |
|------|------|
| `psql` | DB 직접 접속, 스키마 조회, SQL 실행 |
| `docs/schema.md` | 현재 스키마 문서 (항상 최신 상태 유지) |
| `docs/migrations/NNN_설명.sql` | 변경 SQL 파일로 이력 관리 |
| `docs/issues/NNN-*.md` | DB 변경이 포함된 이슈 문서 |

---

## 워크플로우

### 스키마 파악 시
```
psql로 접속
  → \d+ 로 전체 테이블/컬럼/타입/제약조건 조회
  → docs/schema.md 갱신
```

### DB 변경 필요 시
```
docs/migrations/NNN_설명.sql 작성
  → psql로 실행
  → docs/schema.md 갱신
  → 관련 이슈 docs/issues/NNN-*.md 에 기록
```

---

## 연결 방식

**Supabase Management API** (HTTP, IPv6 우회)

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/ymvdjxzkjodasctktunh/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT ..."}'
```

> psql 직접 연결은 DB 호스트가 IPv6 전용이라 일반 네트워크에서 불가.
> Management API는 HTTP로 동작해 IPv6 문제 없음.

프로젝트 ref: `ymvdjxzkjodasctktunh`
액세스 토큰: `.env.local`의 `SUPABASE_ACCESS_TOKEN` 참조

---

## 현재 상태

- [x] Management API 연결 확인
- [x] 전체 스키마 조회 → `docs/schema.md` 생성
- [x] RLS 정책 파악
- [x] 인덱스 현황 파악
- [x] 함수/트리거 파악
- [x] Storage 버킷 구조 파악
