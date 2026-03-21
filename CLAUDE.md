# CLAUDE.md — YGD HR 프로젝트 지침

> 연경당 통합 근태 관리 시스템 (위치 기반 출퇴근 + 관리자 모니터링 PWA)

---

## 1. 프로젝트 개요

| 항목 | 값 |
|------|-----|
| **GitHub** | `jungpyolee/ygd_hr` |
| **Git 계정** | `jungpyolee` / `jungpyo5789@gmail.com` |
| **Supabase Production** | `ymvdjxzkjodasctktunh` / `https://ymvdjxzkjodasctktunh.supabase.co` |
| **Supabase Dev** | `rddplpiwvmclreeblkmi` / `https://rddplpiwvmclreeblkmi.supabase.co` |
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

## 3-1. dev → main 배포 절차 (반드시 준수)

> ⚠️ 이 절차를 건너뛰면 Production DB와 코드 간 불일치가 발생할 수 있다.

```
[STEP 1] 코드 준비
  - dev 브랜치 변경사항 모두 커밋 + push
  - npm run build 빌드 통과 확인

[STEP 2] 신규 마이그레이션 파악
  - docs/migrations/ 에서 마지막 prod 배포 이후 추가된 NNN_*.sql 파일 목록 확인
  - 각 마이그레이션의 Production 적용 여부 확인
    (Production DB에 해당 컬럼/테이블/정책 존재 여부 쿼리)

[STEP 3] Production DB 마이그레이션 실행
  - source .env.local 로 토큰 로드
  - 신규 마이그레이션을 번호 순서대로 Production에 실행
  - 각 실행 후 검증 쿼리로 적용 확인

[STEP 4] dev → main 머지 & push
  - git checkout main && git pull origin main
  - git merge dev --no-edit
  - git push origin main

[STEP 5] Dev / Production 싱크 검증
  1. 테이블 목록 일치 확인
     SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
  2. 핵심 테이블 컬럼 일치 확인
  3. RLS 정책 전체 목록 일치 확인
     SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public' ORDER BY tablename, cmd, policyname;
  4. Realtime publication 테이블 확인
     SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime';
  5. 트리거 목록 일치 확인 ← 누락 방지 (auth 스키마 포함)
     SELECT trigger_name, event_object_schema, event_object_table, action_statement
     FROM information_schema.triggers
     ORDER BY event_object_schema, event_object_table, trigger_name;
  6. 데이터 무결성 확인 (필요 시)
```

### Production 마이그레이션 실행 명령어

```bash
source .env.local

curl -s -X POST "https://api.supabase.com/v1/projects/ymvdjxzkjodasctktunh/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SQL HERE"}'
```

> Production 마이그레이션은 Claude Code가 직접 실행한다. `SUPABASE_ACCESS_TOKEN` 하나로 Dev/Prod 모두 접근 가능.

---

## 4. DB 작업 방식

psql 직접 연결 불가. **Supabase Management API**로 SQL 실행.

> ⚠️ **반드시 Dev DB에서만 실행할 것. Production은 절대 직접 건드리지 않는다.**

```bash
source .env.local

# ✅ Dev (기본 — 항상 이걸 사용)
curl -s -X POST "https://api.supabase.com/v1/projects/rddplpiwvmclreeblkmi/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SQL HERE"}'

# ✅ Production (배포 시 — 섹션 3-1 절차에 따라 실행, SUPABASE_PROD_ACCESS_TOKEN 사용)
# curl -s -X POST "https://api.supabase.com/v1/projects/ymvdjxzkjodasctktunh/database/query" \
#   -H "Authorization: Bearer $SUPABASE_PROD_ACCESS_TOKEN" \
```

### DB 스키마 변경 플로우

```
1. docs/db-issues/NNN-제목.md 작성 (배경, 원인, 계획)
2. docs/migrations/NNN_설명.sql 작성
3. Dev DB에 SQL 실행 (rddplpiwvmclreeblkmi)
4. Dev에서 검증 SQL 실행
5. docs/db-issues/NNN-제목.md 결과 기록
6. docs/schema.md 갱신
7. Production 반영은 배포 시 섹션 3-1 절차에 따라 Claude Code가 직접 실행
```

### ⚠️ Storage 버킷 생성 시 필수 체크리스트

Storage 버킷을 새로 만들 때 **반드시** 아래 4개 정책을 함께 생성해야 한다.
버킷이 `public`이어도 `storage.objects` RLS 정책이 없으면 업로드(INSERT)가 전면 차단된다.

```sql
-- 1. 업로드 (어드민 전용이면 is_admin(), 전 직원이면 true)
CREATE POLICY "업로드" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'YOUR_BUCKET' AND is_admin());

-- 2. 수정 (upsert 지원)
CREATE POLICY "수정" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'YOUR_BUCKET' AND is_admin());

-- 3. 삭제 (orphan 파일 정리)
CREATE POLICY "삭제" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'YOUR_BUCKET' AND is_admin());

-- 4. 조회 (public 버킷도 명시적으로)
CREATE POLICY "조회" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'YOUR_BUCKET');
```

정책 생성 후 반드시 검증:
```sql
SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'objects' AND schemaname = 'storage'
  AND policyname LIKE '%YOUR_BUCKET%';
-- → INSERT / UPDATE / DELETE / SELECT 4개 모두 확인
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

## 5-1. 이용가이드 버전 업데이트 플로우 (반드시 준수)

이용가이드 버전을 올릴 때 **두 파일을 반드시 동시에** 수정한다.
하나라도 빠지면 레드닷이 잘못 동작한다.

| 파일 | 수정 내용 |
|------|-----------|
| `src/app/guide/page.tsx` | `CURRENT_VERSION` 상수를 새 버전으로 변경 |
| `src/components/HomeClient.tsx` | `seen !== "vX.X.X"` 비교 문자열을 새 버전으로 변경 |

```typescript
// src/app/guide/page.tsx
const CURRENT_VERSION = "v1.0.X"; // ← 새 버전

// src/components/HomeClient.tsx
setShowGuideRedDot(seen !== "v1.0.X"); // ← 동일한 새 버전
```

> ⚠️ 비교 문자열을 이전 버전으로 두면, 이전 버전까지 읽은 사람에게 레드닷이 뜨지 않는 버그 발생.

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

## 7. 카드 레이아웃 — 액션 버튼 추가 시 필수 공간 계산

카드 안에 아이콘 버튼을 추가하거나 제거할 때마다 **이름 영역 가용 너비를 반드시 재계산**한다.

```
가용 너비 = 화면 너비 - 패딩 - 썸네일 - gap 합계 - (버튼 수 × 44px) - 버튼간 gap
```

### 어드민 레시피 카드 기준 (375px)

| 요소 | 크기 |
|------|------|
| 좌우 패딩 | 32px |
| 썸네일 | 64px |
| gap(썸네일↔이름, 이름↔버튼) | 32px |
| 버튼 4개 + gap 3개 | 188px |
| **이름 가용 너비** | **59px** |

> 59px는 매우 좁다. 이 안에 배지(badge)나 다른 `shrink-0` 요소를 함께 두면
> 이름이 한 글자만 보이는 BUG-010이 재발한다.

### 규칙

1. **버튼 추가/제거 시** 위 계산표를 갱신하고 이름 가용 너비를 확인한다.
2. **이름 행에 shrink-0 요소를 추가하지 않는다.** 배지·태그 등은 반드시 두 번째 줄로 분리한다.
3. **테스트에서** 버튼 개수 × 44px 기준 이름 가용 너비와, 이름/배지 행 분리 여부를 함께 검증한다.

---

## 9. UI/UX 규칙 (토스 기준)

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

## 10. 보안 주의사항

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
