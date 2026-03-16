# 프로젝트 작업 플로우 가이드

> 이 문서는 새로운 환경(다른 노트북, 다른 Claude Code 세션)에서도
> 동일한 방식으로 작업이 진행될 수 있도록 전체 플로우를 명시합니다.

---

## 1. 초기 세팅 (새 환경에서 클론 후 최초 1회)

```bash
# 1. 저장소 클론
gh repo clone jungpyolee/ygd_hr

# 2. git 계정 설정 (jungpyolee 전용)
cd ygd_hr
git config user.name jungpyolee
git config user.email jungpyo5789@gmail.com
git config core.hooksPath .githooks

# 3. 패키지 설치
npm install

# 4. 환경변수 설정 (.env.local 생성)
# 아래 값들을 직접 입력
```

**.env.local 필수 항목:**
```
NEXT_PUBLIC_SUPABASE_URL=https://ymvdjxzkjodasctktunh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_ACCESS_TOKEN=<personal access token>
```

- **Anon Key**: Supabase 대시보드 → Settings → API → anon public
- **Access Token**: supabase.com → 우측 상단 프로필 → Account → Access Tokens → Generate

---

## 2. 문서 구조

```
docs/
├── WORKFLOW.md              # 이 파일 (작업 플로우 전체 가이드)
├── project-analysis.md      # 프로젝트 전체 분석
├── schema.md                # DB 스키마 현재 상태 (항상 최신 유지)
├── db-management-plan.md    # DB 연결 방식 및 관리 전략
├── issues/                  # 코드 관련 이슈 (버그, 기능)
│   └── NNN-제목.md
├── db-issues/               # DB 관련 이슈 (마이그레이션, 성능)
│   └── NNN-제목.md
└── migrations/              # 실제 실행된 SQL 파일 이력
    └── NNN_설명.sql
```

---

## 3. DB 작업 방식

### DB 연결 (Supabase Management API)

psql 직접 연결은 IPv6 전용이라 일반 환경에서 불가.
**Management API**를 통해 HTTP로 SQL을 실행한다.

```bash
# 환경변수에서 토큰 로드 후 실행
source .env.local  # 또는 TOKEN을 직접 지정

curl -s -X POST "https://api.supabase.com/v1/projects/ymvdjxzkjodasctktunh/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "YOUR SQL HERE"}'
```

### 스키마 변경 플로우

```
1. docs/db-issues/NNN-제목.md 작성 (배경, 원인, 계획)
2. docs/migrations/NNN_설명.sql 작성
3. Management API로 SQL 실행
4. 테스트 SQL 실행으로 검증
5. docs/db-issues/NNN-제목.md 결과 기록
6. docs/schema.md 갱신
```

### 스키마 최신화

```bash
# 테이블 목록 확인
curl -s -X POST "https://api.supabase.com/v1/projects/ymvdjxzkjodasctktunh/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT table_name FROM information_schema.tables WHERE table_schema = '"'"'public'"'"' ORDER BY table_name"}'

# 인덱스 확인
curl -s -X POST "https://api.supabase.com/v1/projects/ymvdjxzkjodasctktunh/database/query" \
  -H "Authorization: Bearer sbp_xxx" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT indexname, tablename, indexdef FROM pg_indexes WHERE schemaname = '"'"'public'"'"' ORDER BY tablename"}'
```

---

## 4. 코드 이슈 작업 방식

```
1. docs/issues/NNN-제목.md 작성 (배경, 원인 분석)
2. 코드 수정
3. npm run build 로 빌드 확인
4. docs/issues/NNN-제목.md 결과 기록
```

---

## 5. 이슈 문서 템플릿

### 코드 이슈 (docs/issues/NNN-제목.md)
```markdown
# [BUG/FEAT-NNN] 제목

| 항목 | 내용 |
|------|------|
| 유형 | 버그 수정 / 기능 추가 |
| 상태 | 🔄 진행 중 / ✅ 완료 |
| 파일 | 변경된 파일 경로 |
| 발견일 | YYYY-MM-DD |
| 완료일 | YYYY-MM-DD |

## 배경
## 원인 분석
## 수정 내용
## 결과
```

### DB 이슈 (docs/db-issues/NNN-제목.md)
```markdown
# [DB-NNN] 제목

| 항목 | 내용 |
|------|------|
| 유형 | 성능 / 버그 / 스키마 변경 |
| 상태 | 🔄 진행 중 / ✅ 완료 |
| 마이그레이션 | migrations/NNN_설명.sql |
| 발견일 | YYYY-MM-DD |
| 완료일 | YYYY-MM-DD |

## 배경
## 원인 분석
## 마이그레이션
## 테스트
## 결과
## schema.md 변경 사항
```

---

## 6. 프로젝트 주요 정보

| 항목 | 값 |
|------|-----|
| **Supabase 프로젝트 ref** | `ymvdjxzkjodasctktunh` |
| **Supabase URL** | `https://ymvdjxzkjodasctktunh.supabase.co` |
| **GitHub 저장소** | `jungpyolee/ygd_hr` |
| **배포** | Vercel |
| **Git 계정** | `jungpyolee` / `jungpyo5789@gmail.com` |
| **DB 연결** | Management API (IPv6 우회) |
