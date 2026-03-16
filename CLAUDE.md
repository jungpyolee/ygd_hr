# CLAUDE.md — YGD HR 프로젝트 지침

> 연경당 통합 근태 관리 시스템 (위치 기반 출퇴근 + 관리자 모니터링 PWA)

---

## 1. 프로젝트 개요

| 항목 | 값 |
|------|-----|
| **GitHub** | `jungpyolee/ygd_hr` |
| **Git 계정** | `jungpyolee` / `jungpyo5789@gmail.com` |
| **Supabase 프로젝트** | `ymvdjxzkjodasctktunh` |
| **Supabase URL** | `https://ymvdjxzkjodasctktunh.supabase.co` |
| **배포** | Vercel |
| **DB 연결** | Supabase Management API (psql 불가 — IPv6 전용) |

---

## 2. 기술 스택

- **Framework**: Next.js (App Router) + React 19 + TypeScript
- **Auth & DB**: Supabase (SSR 쿠키 기반 세션)
- **Styling**: Tailwind CSS v4 + shadcn/ui + Pretendard 폰트
- **PWA**: Serwist (개발 모드 비활성)
- **Toast**: sonner
- **날짜**: date-fns
- **빌드**: `npm run build --webpack` (webpack 강제)

---

## 3. 주요 명령어

```bash
npm run dev        # 개발 서버
npm run build      # 빌드 검증 (코드 수정 후 항상 실행)
npm run lint       # ESLint
```

---

## 4. DB 작업 방식

psql 직접 연결 불가. **Supabase Management API**로 SQL 실행.

```bash
source .env.local

curl -s -X POST "https://api.supabase.com/v1/projects/ymvdjxzkjodasctktunh/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SQL HERE"}'
```

### DB 스키마 변경 플로우

```
1. docs/db-issues/NNN-제목.md 작성 (배경, 원인, 계획)
2. docs/migrations/NNN_설명.sql 작성
3. Management API로 SQL 실행
4. 검증 SQL 실행
5. docs/db-issues/NNN-제목.md 결과 기록
6. docs/schema.md 갱신
```

> Claude Code가 `.env.local`의 `SUPABASE_ACCESS_TOKEN`을 사용해 직접 실행한다. 사용자가 직접 실행할 필요 없음.

---

## 5. 코드 이슈 작업 플로우

```
1. docs/issues/NNN-제목.md 작성 (배경, 원인 분석)
2. 코드 수정
3. npm run build 로 빌드 확인
4. docs/issues/NNN-제목.md 결과 기록
```

---

## 6. 이슈 문서 템플릿

### 코드 이슈 (`docs/issues/NNN-제목.md`)

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

### DB 이슈 (`docs/db-issues/NNN-제목.md`)

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

## 7. UI/UX 규칙 (토스 기준)

전체 가이드: `docs/toss-ui-ux-guidelines.md`

### 핵심 규칙 (절대 위반 금지)

1. **말투**: `~해요` 체 통일. `~합니다/~했습니다` 금지.
2. **다이얼로그**: `alert()`, `confirm()`, `window.prompt()` 절대 금지 → 커스텀 바텀시트/모달 사용
3. **로딩**: "로딩 중..." 텍스트 금지 → Skeleton UI 필수
4. **토스트**: `toast.error("저장 실패")` 처럼 단어만 금지 → 이유 + 해결방법 명시
5. **폰트**: Pretendard 단일 사용
6. **버튼 텍스트**: 동사형 (`"저장하기"`, `"출근하기"`)

### 컬러 토큰

| 토큰 | 값 |
|------|-----|
| primary | `#3182F6` |
| text-primary | `#191F28` |
| text-secondary | `#4E5968` |
| text-tertiary | `#8B95A1` |
| bg-default | `#F2F4F6` |
| border | `#E5E8EB` |
| primary-light | `#E8F3FF` |

---

## 8. 데이터베이스 핵심 사항

- **시간대**: DB timezone `Asia/Seoul` (KST). `timestamptz`는 UTC 저장, 날짜 함수는 KST 기준.
- **JS → DB**: `.toISOString()` (UTC ISO) 전달
- **DB → JS**: `new Date(timestamptz)` 로컬 변환 (KST 자동)
- **중복 출퇴근 방지**: `prevent_duplicate_attendance()` 트리거 — 같은 타입 연속 차단
- **RLS**: 모든 테이블 활성화. `is_admin()` 함수로 관리자 우회.

### 주요 테이블

| 테이블 | 설명 |
|--------|------|
| `profiles` | 사용자 프로필 (auth.users 1:1) |
| `attendance_logs` | 출퇴근 기록 (IN/OUT, attendance_type) |
| `stores` | 매장 위치 정보 |
| `notifications` | 실시간 알림 |

`attendance_logs.attendance_type` 값: `regular` / `remote_out` / `business_trip_in` / `business_trip_out`

---

## 9. 보안 주의사항

- `.env.local`에 Supabase ANON Key, Access Token 있음 — 절대 커밋 금지
- Git pre-commit 훅: `jungpyolee` 계정 외 커밋 차단 (`.githooks/pre-commit`)
- Private 버킷 `hr-documents`: 서명된 URL(60초 만료)로만 접근

---

## 10. 참고 문서 (docs/)

| 파일 | 내용 |
|------|------|
| `WORKFLOW.md` | 초기 세팅, 전체 작업 플로우 |
| `project-analysis.md` | 프로젝트 전체 분석 (구조, 흐름, 컴포넌트) |
| `schema.md` | DB 스키마 현재 상태 (항상 최신 유지) |
| `toss-ui-ux-guidelines.md` | UI/UX 개발 기준 전체 |
| `db-management-plan.md` | DB 연결 방식 및 관리 전략 |
| `issues/` | 코드 이슈 기록 (NNN-제목.md) |
| `db-issues/` | DB 이슈 기록 (NNN-제목.md) |
| `migrations/` | 실행된 SQL 파일 이력 |
