# 05. 인프라 설계 — 출첵 SaaS 플랫폼

> **작성일**: 2026-03-25
> **문서 버전**: v1.0
> **현재 상태**: 연경당 전용 → 멀티테넌트 SaaS 전환 준비
> **관련 문서**: `multi-tenant-saas-blueprint.md`

---

## 현재 인프라 현황

| 항목 | 현재 구성 |
|------|-----------|
| **프레임워크** | Next.js 16.1.6 (App Router) + React 19 + TypeScript |
| **호스팅** | Vercel (main=Production, dev=Preview) |
| **DB/Auth** | Supabase (Dev: `rddplpiwvmclreeblkmi`, Prod: `ymvdjxzkjodasctktunh`) |
| **PWA** | Serwist (개발 모드 비활성) |
| **Cron** | Vercel Cron (`/api/cron/daily-settlement`, 매일 00:00 UTC) |
| **이메일** | Resend (에러 로깅용, `onboarding@resend.dev` 발신) |
| **푸시** | Web Push (web-push 라이브러리) |
| **도메인** | Vercel 기본 도메인 (커스텀 도메인 미설정) |
| **DB 연결** | Supabase Management API (psql 불가 - IPv6 전용) |

---

## 1. 도메인 전략

### 1-1. 후보 도메인 비교

| 도메인 | 장점 | 단점 | 연간 비용 (예상) |
|--------|------|------|------------------|
| `chulchek.app` | 글로벌 TLD, PWA 앱 느낌, HSTS 기본 포함 | 가격 높음, 영문 발음 어색 | ~$20 |
| `chulchek.kr` | 한국 서비스 명확, 저렴 | .kr TLD 신뢰도 보통 | ~$12,000원 |
| `chulchek.co.kr` | 사업자용 정식 TLD | URL 길이, 입력 번거로움 | ~$15,000원 |
| `chulchek.io` | 기술/SaaS 느낌 | 가격 높음, 한국 대중에게 생소 | ~$40 |

### 1-2. 권장 도메인

**1순위: `chulchek.app`**

```
근거:
- .app TLD는 HSTS preload 목록에 포함 → HTTPS 강제 (보안 이점)
- PWA 앱 정체성과 일치
- 짧고 기억하기 쉬움
- 카카오 공유 링크에서 "chulchek.app/join?code=ABC123" 깔끔함
- 글로벌 확장 가능성 (해외 유학생/워홀 알바 등)
```

**2순위: `chulchek.kr`** (비용 우선 시)

### 1-3. DNS 설정 (Vercel Custom Domain)

```
도메인 등록 후 Vercel 연결 절차:

1. 도메인 등록 (Google Domains / Namecheap / 가비아)
2. Vercel 프로젝트 → Settings → Domains → Add Domain
3. DNS 레코드 설정:

   # A 레코드 (루트 도메인)
   @       A       76.76.21.21

   # CNAME 레코드 (www 서브도메인)
   www     CNAME   cname.vercel-dns.com

   # 또는 Vercel Nameserver 위임 (권장)
   ns1.vercel-dns.com
   ns2.vercel-dns.com

4. Vercel에서 자동 SSL 인증서 발급 (Let's Encrypt)
5. www → 루트 도메인 리다이렉트 설정
```

### 1-4. SSL 인증서

```
Vercel 자동 관리:
- Let's Encrypt 기반 무료 SSL
- 자동 갱신 (만료 전 자동 처리)
- .app TLD는 HSTS preload → HTTP 접속 자체 불가 (보안 극대화)
- 별도 설정 불필요
```

### 1-5. OAuth Redirect URL 영향

도메인 확정 시 아래 모든 곳에 URL 업데이트 필요:

| 위치 | 현재 | 변경 후 |
|------|------|---------|
| **Supabase Auth** → Site URL | Vercel 기본 도메인 | `https://chulchek.app` |
| **Supabase Auth** → Redirect URLs | 기본 도메인 | `https://chulchek.app/**` |
| **카카오 디벨로퍼스** → Redirect URI | (미설정) | `https://chulchek.app/auth/callback` |
| **카카오 디벨로퍼스** → 사이트 도메인 | (미설정) | `https://chulchek.app` |
| **Apple Developer** → Return URLs | (미설정) | `https://chulchek.app/auth/callback` |
| **코드** → `origin` 기반 redirect | 동적 | 동적 유지 (`window.location.origin`) |

```
주의사항:
- Supabase Redirect URLs에 Preview 도메인도 추가해야 함
  예: https://*.vercel.app/**
- 카카오/Apple은 정확한 URL만 허용 (와일드카드 불가)
  → Production: chulchek.app
  → Dev 테스트: localhost:3000 (카카오는 localhost 허용)
```

### 1-6. 서브도메인 계획

```
chulchek.app              메인 앱 (Vercel)
api.chulchek.app          향후 별도 API 분리 시 (현재 불필요 - API Routes 사용)
docs.chulchek.app         향후 개발자 문서 (현재 불필요)
status.chulchek.app       향후 상태 페이지 (Betterstack 등 연동 시)
```

현재는 루트 도메인만 사용. 서브도메인은 필요 시 추가.

---

## 2. Vercel 프로젝트 설정

### 2-1. 환경변수 관리

#### 현재 환경변수 (추정)

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY

# Resend
RESEND_API_KEY

# Push
NEXT_PUBLIC_VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY

# Cron
CRON_SECRET
```

#### SaaS 전환 후 추가 필요

```
# Kakao OAuth (Supabase Auth Provider에 설정, 코드에는 불필요)
# → Supabase Dashboard > Auth > Providers > Kakao에서 설정

# Kakao SDK (카카오 공유 API용 - 프론트엔드)
NEXT_PUBLIC_KAKAO_JS_KEY=<카카오 JavaScript 키>

# Apple OAuth (Supabase Auth Provider에 설정)
# → Supabase Dashboard > Auth > Providers > Apple에서 설정

# 이메일 발송 (초대/급여 알림용)
RESEND_API_KEY=<기존 키 재사용 또는 신규 발급>
RESEND_FROM_EMAIL=noreply@chulchek.app

# Master 보안 (선택)
MASTER_USER_ID=<정표 계정 UUID>
```

#### Vercel 환경변수 설정 방법

```
Vercel Dashboard → Project → Settings → Environment Variables

각 변수별 스코프 설정:
- Production: main 브랜치 배포에만 적용
- Preview: dev 등 PR 브랜치에 적용
- Development: vercel dev 로컬 실행 시 적용

DB URL 분리:
- Production 환경: Prod Supabase URL/Key
- Preview/Development 환경: Dev Supabase URL/Key
```

### 2-2. Cron Job 설정

#### 현재 vercel.json

```json
{
  "crons": [
    {
      "path": "/api/cron/daily-settlement",
      "schedule": "0 0 * * *"
    }
  ]
}
```

#### SaaS 전환 후 확장

```json
{
  "crons": [
    {
      "path": "/api/cron/daily-settlement",
      "schedule": "0 15 * * *"
    },
    {
      "path": "/api/cron/expire-invites",
      "schedule": "0 0 * * *"
    },
    {
      "path": "/api/cron/payroll-reminder",
      "schedule": "0 0 25 * *"
    },
    {
      "path": "/api/cron/cleanup-sessions",
      "schedule": "0 3 * * 0"
    }
  ]
}
```

| Cron Job | 스케줄 | 설명 |
|----------|--------|------|
| `daily-settlement` | 매일 15:00 UTC (00:00 KST) | 전일 근태 크레딧 정산 (조직별 루프) |
| `expire-invites` | 매일 00:00 UTC (09:00 KST) | 만료된 초대 코드 status='expired' 처리 |
| `payroll-reminder` | 매월 25일 00:00 UTC | 급여 정산 미확정 시 owner에게 알림 |
| `cleanup-sessions` | 매주 일요일 03:00 UTC | 오래된 세션/임시 데이터 정리 |

```
Vercel Cron 제한 (Hobby 플랜):
- 최대 2개 Cron Job
- 일 1회 실행 (daily 단위)
- Pro 플랜: 최대 40개, 분 단위 스케줄 가능

→ SaaS 전환 시 Vercel Pro 플랜 필수 (Cron 4개 이상 필요)
```

### 2-3. Edge / Serverless Function 설정

#### 현재 API Routes

```
/api/cron/daily-settlement    → runtime: "nodejs"
/api/push/subscribe           → Serverless
/api/push/preferences         → Serverless
/api/log-error                → Serverless (Resend 이메일 발송)
```

#### SaaS 전환 후 추가 API Routes

```
/api/cron/expire-invites      → runtime: "nodejs"
/api/cron/payroll-reminder    → runtime: "nodejs"
/api/cron/cleanup-sessions    → runtime: "nodejs"
/api/email/send-invite        → runtime: "nodejs" (Resend)
/api/email/send-payroll       → runtime: "nodejs" (Resend)
/api/webhooks/supabase        → runtime: "nodejs" (향후 Supabase Webhook 수신)
```

#### Function 설정 권장

```typescript
// 모든 API Route 기본 설정
export const runtime = "nodejs";        // Edge 아닌 Node.js (Supabase SDK 호환)
export const dynamic = "force-dynamic"; // 캐싱 비활성 (동적 데이터)
export const maxDuration = 30;          // 최대 30초 (Hobby: 10초, Pro: 60초)
```

```
Edge Runtime vs Node.js Runtime:
- Edge: 빠른 cold start, 제한된 API (crypto, 일부 Node.js API 미지원)
- Node.js: 느린 cold start, 완전한 Node.js API 지원

권장: Node.js Runtime 유지
이유: Supabase SDK, Resend SDK, web-push 모두 Node.js 환경 필요
```

### 2-4. 빌드 최적화

#### 현재 빌드 설정

```json
// package.json
"build": "next build --webpack"
```

```typescript
// next.config.ts
reactCompiler: true,  // React Compiler 활성화
```

#### 추가 최적화 권장

```typescript
// next.config.ts 확장
const nextConfig: NextConfig = {
  reactCompiler: true,
  webpack: (config) => config,

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ymvdjxzkjodasctktunh.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },

  // SaaS 전환 후 추가
  experimental: {
    // 필요 시 추가
  },

  // 빌드 시 정적 페이지 생성 제외 (모든 페이지 동적)
  // [slug] 동적 라우트이므로 ISR/SSG 불가 → 기본 동작 유지

  // 헤더 보안 강화
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none';"
          },
        ],
      },
    ];
  },
};
```

#### 빌드 캐시

```
Vercel 빌드 캐시 전략:
- node_modules: 자동 캐시 (package-lock.json 해시 기반)
- .next/cache: 자동 캐시 (빌드 간 재사용)
- 수동 캐시 무효화: Vercel Dashboard → Deployments → Redeploy without cache
```

---

## 3. Supabase 프로젝트 관리

### 3-1. Dev/Prod 프로젝트 분리 전략

```
현재 구조 (유지):

┌──────────────────────────────────────────────┐
│  Dev Supabase (rddplpiwvmclreeblkmi)         │
│  ├── 개발/테스트 데이터                       │
│  ├── 스키마 변경 우선 적용                     │
│  ├── Auth Provider 테스트 (카카오/Apple)       │
│  └── Preview 배포 연결                        │
└──────────────────────────────────────────────┘
         │ 검증 완료 후 마이그레이션
         ▼
┌──────────────────────────────────────────────┐
│  Prod Supabase (ymvdjxzkjodasctktunh)        │
│  ├── 실제 운영 데이터                         │
│  ├── Production 배포 연결                     │
│  ├── 마이그레이션은 CLAUDE.md 절차 준수        │
│  └── Supabase Management API로만 SQL 실행     │
└──────────────────────────────────────────────┘
```

#### 환경별 Supabase 설정

| 설정 | Dev | Prod |
|------|-----|------|
| **Site URL** | `http://localhost:3000` | `https://chulchek.app` |
| **Redirect URLs** | `http://localhost:3000/**`, `https://*-dev.vercel.app/**` | `https://chulchek.app/**` |
| **Kakao OAuth** | 테스트 앱 키 | 정식 앱 키 |
| **Apple OAuth** | 테스트 Service ID | 정식 Service ID |
| **Email Templates** | 기본 | 커스텀 (출첵 브랜딩) |
| **Rate Limiting** | 느슨 | 엄격 |

### 3-2. Realtime 설정 (테넌트 필터)

```
현재: 전체 테이블 구독 (단일 테넌트)
변경: organization_id 기반 필터링

Supabase Realtime Channel 패턴:
```

```typescript
// 현재 (전체 구독)
supabase
  .channel('attendance')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, handler)
  .subscribe();

// SaaS 전환 후 (조직별 필터)
supabase
  .channel(`attendance-${organizationId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'attendance_logs',
    filter: `organization_id=eq.${organizationId}`
  }, handler)
  .subscribe();
```

```
Realtime 성능 고려:
- Supabase Free: 동시 연결 200개
- Supabase Pro: 동시 연결 500개 (추가 가능)
- 필터 사용 시 서버 부하 감소 (불필요한 이벤트 전파 차단)

Realtime Publication 테이블:
- attendance_logs (organization_id 필터 필수)
- notifications (organization_id 필터 필수)
- schedule_slots (organization_id 필터 필수)
- substitute_requests (organization_id 필터 필수)
```

### 3-3. Storage 버킷 정책

#### 현재 버킷

| 버킷 | 접근 | 용도 |
|------|------|------|
| `hr-documents` | Private (서명 URL 60초) | 직원 서류 |
| `avatars` | Public | 프로필 이미지 |

#### SaaS 전환 후

```
Storage 경로 패턴 변경:
현재: hr-documents/{userId}/file.pdf
변경: hr-documents/{organizationId}/{userId}/file.pdf

이유: 조직별 데이터 격리 + RLS 정책 적용 용이
```

```sql
-- Storage RLS 정책 패턴 (조직별 격리)
-- INSERT: 본인 폴더에만 업로드
CREATE POLICY "org_member_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'hr-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM organizations
      WHERE id IN (SELECT organization_id FROM organization_memberships
                   WHERE profile_id = auth.uid() AND status = 'active')
    )
  );

-- SELECT: 같은 조직 멤버만 조회
CREATE POLICY "org_member_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'hr-documents'
    AND is_org_member((storage.foldername(name))[1]::uuid)
  );

-- master는 전체 접근
CREATE POLICY "master_storage_bypass" ON storage.objects
  FOR ALL USING (is_master());
```

### 3-4. Database Connection Pooling

```
Supabase Connection 구조:
- Direct Connection: IPv6 전용 (psql 불가 — IPv4 환경)
- Supabase Client (supabase-js): REST API 기반 (HTTP) → 커넥션 풀 불필요
- Supabase Management API: REST API (SQL 실행용)

현재 앱:
- 모든 DB 접근은 supabase-js (REST API) → PostgREST 통해 자동 커넥션 풀링
- Serverless Function에서도 supabase-js 사용 → cold start 시 새 클라이언트 생성

성능 고려:
- Supabase Free: PostgREST 기본 풀 크기 (충분)
- Supabase Pro: pgBouncer 활성화 가능 (Transaction mode)
  → 동시 접속 많을 때 DB 커넥션 절약

SaaS 전환 후 권장:
- Pro 플랜 전환 시 pgBouncer Transaction mode 활성화
- Supabase Dashboard → Settings → Database → Connection Pooling → ON
```

### 3-5. Edge Functions 활용 여부

```
Supabase Edge Functions vs Vercel API Routes:

현재: Vercel API Routes 사용 중 (Cron, Push, Email)
판단: Vercel API Routes 유지

이유:
1. 이미 Vercel에 배포 중 — API Routes가 자연스러움
2. Vercel Cron → API Routes 직접 호출 (Supabase Edge Functions 호출은 추가 레이어)
3. 코드 일관성 (프론트엔드 + API 한 프로젝트)
4. Supabase Edge Functions는 Deno 런타임 — npm 패키지 호환 이슈 가능

Supabase Edge Functions 사용 고려 시점:
- Database Webhook 처리 (DB 이벤트 → 즉시 실행)
- Supabase Storage Trigger (파일 업로드 후 처리)
- Vercel 외부에서 독립 실행 필요 시

당분간은 불필요.
```

---

## 4. 이메일 발송 인프라

### 4-1. 서비스 비교

| 항목 | Resend | SendGrid | Supabase Email |
|------|--------|----------|----------------|
| **무료** | 100건/일 | 100건/일 | Auth 이메일만 (비밀번호 리셋 등) |
| **가격** | $20/월 (50K건) | $15/월 (40K건) | 포함 |
| **DX** | 최고 (TypeScript SDK, React Email) | 보통 | 제한적 (Auth용) |
| **한국 배송률** | 높음 | 높음 | 보통 |
| **커스텀 도메인** | 지원 | 지원 | 미지원 |
| **React Email** | 네이티브 지원 | 미지원 | 미지원 |

#### 권장: Resend 유지

```
근거:
1. 이미 프로젝트에 Resend 의존성 있음 (package.json: "resend": "^6.9.4")
2. TypeScript 네이티브 — Next.js와 궁합 최고
3. React Email 지원 — JSX로 이메일 템플릿 작성 가능
4. 커스텀 도메인 발신 지원 (noreply@chulchek.app)
5. 무료 100건/일 — 초기 SaaS에 충분
```

### 4-2. 이메일 용도별 정리

| 용도 | 발신자 | 발송 시점 | 구현 |
|------|--------|-----------|------|
| **초대 이메일** | noreply@chulchek.app | owner가 직원 초대 시 (선택) | API Route |
| **급여 확정 알림** | noreply@chulchek.app | owner가 급여 확정 시 | API Route |
| **비밀번호 리셋** | Supabase 기본 | 사용자 요청 시 | Supabase Auth |
| **이메일 인증** | Supabase 기본 | 회원가입 시 | Supabase Auth |
| **에러 알림** | noreply@chulchek.app | 시스템 에러 시 (master에게) | API Route |
| **월간 리포트** | noreply@chulchek.app | 매월 초 (향후) | Cron + API Route |

### 4-3. 발송 도메인 설정 (SPF/DKIM/DMARC)

```
커스텀 도메인 설정 (chulchek.app 기준):

1. Resend Dashboard → Domains → Add Domain → chulchek.app
2. DNS에 아래 레코드 추가:

   # SPF (이메일 발신 서버 인증)
   @       TXT     "v=spf1 include:_spf.resend.com ~all"

   # DKIM (이메일 서명 검증) — Resend가 제공하는 값
   resend._domainkey  CNAME   <resend에서 제공하는 값>

   # DMARC (SPF+DKIM 정책)
   _dmarc  TXT     "v=DMARC1; p=quarantine; rua=mailto:dmarc@chulchek.app"

3. Resend에서 도메인 인증 완료 확인
4. 발신 주소 변경: onboarding@resend.dev → noreply@chulchek.app
```

```
설정 후 효과:
- 스팸 분류 확률 대폭 감소
- "보낸 사람: 출첵 <noreply@chulchek.app>" 정상 표시
- 카카오메일/네이버메일/Gmail 모두 정상 수신
```

### 4-4. 이메일 발송량 추정

```
시나리오: 조직 10개, 각 조직 직원 10명 = 총 100명

월간 추정:
- 초대 이메일: ~20건 (신규 직원)
- 급여 알림: ~100건 (월 1회 × 100명)
- 에러 알림: ~5건
- 기타: ~10건
합계: ~135건/월

Resend 무료 플랜 (100건/일) 내 충분.
유료 전환 시점: 월 3,000건 이상 (조직 30+ 개)
```

---

## 5. 모니터링 & 로깅

### 5-1. Vercel Analytics

```
설정: Vercel Dashboard → Project → Analytics → Enable

제공 지표:
- Web Vitals (LCP, FID, CLS, TTFB)
- 페이지별 방문 수
- 지역별 트래픽
- 디바이스 유형 (모바일/데스크탑)

비용:
- Hobby: 기본 Analytics 포함 (제한적)
- Pro: Speed Insights + Web Analytics ($10/월 추가)

권장: Pro 전환 시 활성화
```

### 5-2. Sentry (에러 추적)

```
설치:
npm install @sentry/nextjs

설정:
npx @sentry/wizard -i nextjs

주요 기능:
- 프론트엔드 + API Route 에러 자동 캡처
- Source Map 업로드 (디버깅 용이)
- 사용자 컨텍스트 (userId, organizationId)
- 성능 모니터링 (트랜잭션)

환경변수:
NEXT_PUBLIC_SENTRY_DSN=<DSN>
SENTRY_AUTH_TOKEN=<빌드 시 Source Map 업로드용>
SENTRY_ORG=chulchek
SENTRY_PROJECT=chulchek-web

비용:
- Developer (무료): 5K 이벤트/월
- Team ($26/월): 50K 이벤트/월
→ 초기 무료 플랜으로 충분
```

#### Sentry 컨텍스트 설정

```typescript
// 사용자 식별 + 조직 컨텍스트
Sentry.setUser({
  id: profile.id,
  email: user.email,
});

Sentry.setTag("organization_id", currentOrg.id);
Sentry.setTag("organization_slug", currentOrg.slug);
Sentry.setTag("user_role", profile.role);
```

### 5-3. Supabase Dashboard 모니터링

```
Supabase Dashboard에서 확인 가능한 항목:

Database:
- 테이블 크기, 행 수
- 쿼리 성능 (pg_stat_statements)
- 커넥션 수

Auth:
- 일일 가입/로그인 수
- Provider별 사용자 수
- 실패한 인증 시도

Realtime:
- 동시 연결 수
- 메시지 발행 수

Storage:
- 버킷별 사용량
- 대역폭 사용량

API:
- 요청 수, 지연 시간
- 에러율

주의: Free 플랜은 로그 보관 1일, Pro 플랜은 7일
```

### 5-4. 커스텀 대시보드 (master 전용)

```
/master/ 페이지에서 표시할 KPI:

시스템 지표:
- 총 조직 수 / 활성 조직 수
- 총 사용자 수 / 일일 활성 사용자 (DAU)
- 일일 출퇴근 기록 수
- Cron Job 마지막 실행 시간 + 결과

조직별 건강도:
- 최근 7일 활동 없는 조직 경고
- 직원 수 / 매장 수 / 구독 티어
- 마지막 출퇴근 기록 일시

에러 모니터링:
- 최근 24시간 에러 수 (audit_logs 테이블)
- 정산 실패 건 (daily-settlement 결과)

데이터 소스: 모두 Supabase 쿼리 (별도 모니터링 DB 불필요)
```

### 5-5. Uptime 모니터링 (선택)

```
서비스: Betterstack (구 Better Uptime)
비용: 무료 (모니터 5개, 체크 3분 간격)

모니터 설정:
- https://chulchek.app (메인 페이지)
- https://chulchek.app/api/cron/daily-settlement (Cron 헬스)
- Supabase API 엔드포인트

알림: 슬랙 / 이메일 / SMS
→ 정식 출시 후 설정 권장
```

---

## 6. CI/CD 파이프라인

### 6-1. 현재 배포 흐름

```
현재:
dev push → Vercel Preview 자동 배포
main push → Vercel Production 자동 배포
DB 마이그레이션 → 수동 (CLAUDE.md 절차)
```

### 6-2. SaaS 전환 후 배포 흐름

```
┌──────────────────────────────────────────────────────────────┐
│                     CI/CD 파이프라인                          │
│                                                              │
│  [dev 브랜치]                                                │
│    │                                                         │
│    ├─ push → GitHub Actions                                  │
│    │   ├── npm run lint                                      │
│    │   ├── npm run test (vitest)                             │
│    │   ├── npm run build                                     │
│    │   └── 결과 → GitHub PR Check                            │
│    │                                                         │
│    ├─ push → Vercel Preview 자동 배포                        │
│    │   └── Preview URL로 수동 QA                             │
│    │                                                         │
│    └─ dev → main PR 생성                                     │
│        │                                                     │
│        ├── PR Check 통과 확인                                │
│        ├── DB 마이그레이션 실행 (CLAUDE.md STEP 2~3)         │
│        ├── PR Merge                                          │
│        └── Vercel Production 자동 배포                       │
│                                                              │
│  [Hotfix]                                                    │
│    hotfix/* → main 직접 PR (긴급 시)                         │
└──────────────────────────────────────────────────────────────┘
```

### 6-3. GitHub Actions 설정

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [dev, main]
  pull_request:
    branches: [main]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run test
      - run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.DEV_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.DEV_SUPABASE_ANON_KEY }}
```

### 6-4. DB 마이그레이션 자동화 방안

```
현재: 수동 실행 (CLAUDE.md 절차 준수)
향후 고려: 반자동화

방안 1: GitHub Actions + Supabase Management API (권장)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PR에 "migration" 라벨 시 자동 실행:

1. docs/migrations/ 디렉토리에서 신규 .sql 파일 감지
2. Dev DB에 자동 실행 + 검증
3. PR 코멘트로 결과 보고
4. main 머지 시 Prod DB에 자동 실행

주의: Production 자동 실행은 위험 → 승인 게이트 필수
현실적으로 당분간은 수동 실행 유지 (CLAUDE.md 절차)

방안 2: Supabase CLI Migrations (향후)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Supabase CLI로 로컬 → Dev → Prod 마이그레이션 관리
현재 psql 불가(IPv6)이므로 Management API 경유 필요
Supabase CLI가 Management API 지원 시 전환 고려
```

### 6-5. 환경별 배포 전략

| 환경 | 브랜치 | URL | DB | 용도 |
|------|--------|-----|-----|------|
| **Development** | 로컬 | localhost:3000 | Dev Supabase | 개발 |
| **Preview** | dev, feature/* | *.vercel.app | Dev Supabase | QA/리뷰 |
| **Production** | main | chulchek.app | Prod Supabase | 실서비스 |

---

## 7. 보안

### 7-1. 환경변수 관리

```
비밀 키 저장 위치:
- 로컬: .env.local (gitignore됨)
- Vercel: Dashboard → Environment Variables (암호화 저장)
- GitHub Actions: Repository Secrets (CI용)

절대 커밋 금지:
- .env.local
- Supabase Access Token
- CRON_SECRET
- RESEND_API_KEY
- VAPID_PRIVATE_KEY
- Kakao Secret Key
- Apple Secret Key

확인 장치:
- .gitignore에 .env* 패턴 포함
- .githooks/pre-commit: 커밋 계정 검증 (jungpyolee만 허용)
- 추가 권장: pre-commit 훅에 env 파일 커밋 차단 로직
```

### 7-2. API 키 로테이션

```
정기 로테이션 대상:

| 키 | 로테이션 주기 | 방법 |
|-----|-------------|------|
| CRON_SECRET | 6개월 | Vercel 환경변수 + vercel.json |
| RESEND_API_KEY | 12개월 | Resend 대시보드에서 재발급 |
| VAPID 키 | 변경 불가 | 변경 시 모든 Push 구독 무효화 → 유지 |
| Supabase ANON_KEY | 변경 시 영향 큼 | JWT Secret 변경 시 전체 재발급 → 신중히 |
| Kakao Secret | 12개월 | 카카오 디벨로퍼스에서 재발급 |
| Apple Secret | 6개월 | Apple Developer에서 재발급 (키 만료 주의) |

로테이션 절차:
1. 새 키 발급
2. Vercel 환경변수에 새 키 설정 (Production + Preview)
3. 재배포 (자동 또는 수동 트리거)
4. 정상 동작 확인
5. 이전 키 폐기
```

### 7-3. CORS 설정

```
현재: Next.js API Routes는 same-origin → CORS 이슈 없음
Supabase: 클라이언트 SDK가 CORS 처리

SaaS 전환 후:
- 카카오 SDK: 카카오 디벨로퍼스에서 허용 도메인 등록 필요
  → chulchek.app, localhost:3000
- Supabase: Auth → URL Configuration → Redirect URLs에 도메인 등록
- 별도 CORS 설정 불필요 (API Routes는 same-origin)

향후 외부 API 제공 시:
```

```typescript
// API Route에서 CORS 헤더 추가 (필요 시)
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "https://chulchek.app",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
```

### 7-4. Rate Limiting

```
계층별 Rate Limiting:

1. Vercel 레벨 (자동)
   - Hobby: 100 req/sec
   - Pro: 1000 req/sec
   - DDoS 보호 기본 포함

2. Supabase 레벨 (자동)
   - PostgREST: 기본 rate limit 활성
   - Auth: 이메일 발송 횟수 제한
   - Realtime: 동시 연결 제한

3. 애플리케이션 레벨 (구현 필요)
```

```typescript
// API Route Rate Limiting (간단 구현)
// 방법: Vercel KV (Redis) 또는 인메모리 (단일 인스턴스)
// 권장: 정식 출시 시 Vercel KV 사용

// 초대 코드 시도 제한 (브루트포스 방지)
// /api/join → IP당 10회/분

// Cron Secret 검증 (기존)
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
```

```
특히 보호해야 할 엔드포인트:
- /api/cron/* → CRON_SECRET 검증 (기존 구현)
- /join → 초대 코드 브루트포스 방지
- /login → 로그인 시도 제한 (Supabase Auth 기본 제공)
- /api/email/* → 이메일 발송 악용 방지
```

### 7-5. 추가 보안 고려

```
1. RLS (Row Level Security)
   - 모든 테이블 활성화 (기존 유지)
   - organization_id 기반 격리 필수
   - is_master() / is_org_admin() / is_org_member() 함수 활용
   - 정기 RLS 감사 (조직 간 데이터 누출 테스트)

2. HTTPS 강제
   - .app TLD: HSTS preload (자동)
   - Vercel: HTTPS 강제 (자동)

3. CSP (Content Security Policy)
   - next.config.ts headers에서 설정
   - 카카오 SDK 도메인 허용 필요: *.kakao.com, *.kakaocdn.net

4. 인증 보안
   - Supabase 세션 관리 (httpOnly 쿠키 - SSR 기반)
   - 세션 만료: 기본 1시간 (Refresh Token으로 자동 갱신)
   - master 계정: 향후 2FA 적용 권장

5. 입력 검증
   - slug: 영소문자/숫자/하이픈만 허용 (SQL Injection 방지)
   - 초대 코드: 6자리 영숫자만 허용
   - 모든 사용자 입력: Supabase RPC 또는 parameterized query
```

---

## 8. 확장성 고려

### 8-1. Supabase 플랜 전환 시점

| 지표 | Free | Pro ($25/월) | 전환 트리거 |
|------|------|-------------|-------------|
| **DB 크기** | 500MB | 8GB | 400MB 도달 시 |
| **Storage** | 1GB | 100GB | 800MB 도달 시 |
| **대역폭** | 2GB/월 | 250GB/월 | 1.5GB/월 도달 시 |
| **Realtime 연결** | 200 | 500 | 150 동시 접속 시 |
| **Auth 사용자** | 50K MAU | 100K MAU | 제한 없음 (초기) |
| **Edge Functions** | 500K 호출/월 | 2M 호출/월 | 미사용 |
| **로그 보관** | 1일 | 7일 | 디버깅 필요 시 |
| **일일 백업** | 미지원 | 7일 보관 | 정식 출시 전 필수 |
| **Point-in-Time Recovery** | 미지원 | 지원 | 데이터 안전성 |

```
권장 전환 시점:
- 정식 출시 (베타 종료) 전에 Pro 전환 필수
- 이유: 일일 백업 + 로그 보관 + Realtime 연결 수 + 안정성
- 최소 출시 2주 전 전환하여 안정성 확인
```

### 8-2. Vercel 플랜 전환 시점

| 지표 | Hobby (무료) | Pro ($20/월) | 전환 트리거 |
|------|-------------|-------------|-------------|
| **대역폭** | 100GB/월 | 1TB/월 | 80GB/월 도달 시 |
| **빌드 시간** | 100시간/월 | 400시간/월 | 빌드 많을 때 |
| **Serverless 실행** | 100GB-hr/월 | 1000GB-hr/월 | Cron 다수 시 |
| **Cron Jobs** | 2개, daily | 40개, 분단위 | SaaS 전환 즉시 |
| **팀 멤버** | 1명 | 무제한 | 미해당 (1인) |
| **Serverless Timeout** | 10초 | 60초 | 정산 로직 복잡화 시 |
| **Analytics** | 기본 | Speed Insights | 출시 후 |
| **DDoS 보호** | 기본 | 고급 | 출시 후 |

```
권장 전환 시점:
- SaaS 전환 작업 시작 시 Pro 전환 (Cron 4개 필요)
- 또는 최소 정식 출시 전

Vercel Pro 필수 이유:
1. Cron Jobs 4개 이상 (daily-settlement, expire-invites, payroll-reminder, cleanup)
2. Serverless Timeout 60초 (조직 수 증가 시 정산 시간 증가)
3. 커스텀 도메인 + SSL (Hobby에서도 가능하나 Pro가 안정적)
```

### 8-3. 트래픽 예상

```
Phase 1: 베타 (출시 후 1~3개월)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 조직: 1개 (연경당) + 테스트 2~3개
- 사용자: ~15명 (기존 직원)
- DAU: ~10명
- 월 페이지뷰: ~3,000
- 월 API 호출: ~10,000
→ Hobby 플랜 충분

Phase 2: 초기 확장 (3~6개월)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 조직: 5~10개
- 사용자: ~100명
- DAU: ~50명
- 월 페이지뷰: ~15,000
- 월 API 호출: ~50,000
→ Vercel Pro + Supabase Pro 필요

Phase 3: 성장기 (6~12개월)
━━━━━━━━━━━━━━━━━━━━━━━━━
- 조직: 30~50개
- 사용자: ~500명
- DAU: ~200명
- 월 페이지뷰: ~100,000
- 월 API 호출: ~300,000
→ Pro 플랜 내 충분
```

---

## 9. 비용 추정 (월별)

### Phase 1: 베타 기간 (0원 목표)

| 항목 | 서비스 | 플랜 | 월 비용 |
|------|--------|------|---------|
| 호스팅 | Vercel | Hobby | $0 |
| DB/Auth | Supabase (Prod) | Free | $0 |
| DB/Auth | Supabase (Dev) | Free | $0 |
| 이메일 | Resend | Free (100건/일) | $0 |
| 도메인 | chulchek.app | 연 $20 | ~$1.67 |
| 에러 추적 | Sentry | Developer | $0 |
| 모니터링 | Betterstack | Free | $0 |
| **합계** | | | **~$2/월** |

### Phase 2: 정식 출시 (Pro 전환)

| 항목 | 서비스 | 플랜 | 월 비용 |
|------|--------|------|---------|
| 호스팅 | Vercel | Pro | $20 |
| DB/Auth | Supabase (Prod) | Pro | $25 |
| DB/Auth | Supabase (Dev) | Free | $0 |
| 이메일 | Resend | Free 또는 Pro | $0~$20 |
| 도메인 | chulchek.app | 연 $20 | ~$1.67 |
| 에러 추적 | Sentry | Developer | $0 |
| 모니터링 | Betterstack | Free | $0 |
| **합계** | | | **~$47~67/월** |

### Phase 3: 성장기

| 항목 | 서비스 | 플랜 | 월 비용 |
|------|--------|------|---------|
| 호스팅 | Vercel | Pro | $20 |
| DB/Auth | Supabase (Prod) | Pro | $25 |
| DB/Auth | Supabase (Dev) | Free | $0 |
| 이메일 | Resend | Pro | $20 |
| 도메인 | chulchek.app | 연 $20 | ~$1.67 |
| 에러 추적 | Sentry | Team | $26 |
| 모니터링 | Betterstack | Free | $0 |
| **합계** | | | **~$93/월** |

```
손익 분기점 추정:
- 월 고정비: ~$67 (Phase 2)
- Starter 플랜 가격: 예상 ₩19,900/월
- 손익분기: 유료 조직 5개 시 (₩99,500 > ~₩87,000)
- 현실적 목표: 정식 출시 6개월 내 유료 조직 10개
```

---

## 10. 체크리스트

### Phase 0: 사전 준비 (SaaS 개발 시작 전)

```
도메인:
□ 도메인 확정 (chulchek.app 또는 대안)
□ 도메인 구매
□ Vercel 커스텀 도메인 연결
□ DNS A/CNAME 레코드 설정
□ SSL 인증서 자동 발급 확인
□ www → 루트 리다이렉트 확인

OAuth Provider 등록:
□ 카카오 디벨로퍼스 앱 생성
□ 카카오 로그인 활성화 + Redirect URI 설정
□ 카카오 SDK JavaScript 키 발급
□ Apple Developer Service ID 생성
□ Apple 로그인 설정 + Return URL 설정
□ Supabase Auth → Kakao Provider 활성화 (Dev)
□ Supabase Auth → Apple Provider 활성화 (Dev)

이메일:
□ Resend 커스텀 도메인 등록 (chulchek.app)
□ DNS SPF/DKIM/DMARC 레코드 추가
□ 도메인 인증 완료 확인
□ 테스트 이메일 발송 확인

환경변수:
□ NEXT_PUBLIC_KAKAO_JS_KEY 설정 (Vercel)
□ RESEND_FROM_EMAIL 설정 (Vercel)
□ 기존 환경변수 Dev/Prod 분리 확인
```

### Phase 1: 개발 단계

```
Vercel:
□ vercel.json Cron Jobs 업데이트
□ next.config.ts 보안 헤더 추가
□ API Routes 추가 (email, webhooks)
□ 빌드 정상 확인

Supabase (Dev):
□ Realtime publication 테이블 확인
□ Storage 버킷 RLS 정책 업데이트
□ Auth Provider 로그인 테스트 (카카오/Apple)
□ Redirect URL 설정 확인

보안:
□ 초대 코드 rate limiting 구현
□ CRON_SECRET 검증 (기존 유지)
□ RLS organization_id 격리 테스트
□ CSP 헤더에 카카오 SDK 도메인 추가
```

### Phase 2: 정식 출시 전

```
인프라 업그레이드:
□ Vercel Pro 플랜 전환
□ Supabase Pro 플랜 전환 (Prod)
□ Supabase 일일 백업 확인

Production DB:
□ 마이그레이션 전체 실행 (CLAUDE.md 절차)
□ Dev/Prod 스키마 일치 확인
□ RLS 정책 일치 확인
□ Realtime publication 일치 확인

모니터링:
□ Sentry 설치 + 설정
□ Vercel Analytics 활성화
□ Betterstack Uptime 모니터 설정
□ master 대시보드 KPI 확인

도메인:
□ Supabase Prod Site URL → chulchek.app 변경
□ Supabase Prod Redirect URLs 설정
□ 카카오 디벨로퍼스 정식 앱 키로 교체 (Prod)
□ Apple Developer Prod Return URL 설정
□ OG 이미지 / Favicon / Manifest 업데이트
```

### Phase 3: 출시 후

```
운영:
□ API 키 로테이션 일정 설정 (캘린더)
□ 월간 비용 모니터링
□ Supabase 용량 모니터링 (DB/Storage/대역폭)
□ Vercel 대역폭/실행시간 모니터링

확장 트리거 모니터링:
□ Supabase DB 400MB 도달 알림
□ Supabase Realtime 동시 연결 150개 도달 알림
□ Vercel 대역폭 80GB/월 도달 알림
□ Resend 일 80건 도달 알림
```

---

## 부록: 인프라 다이어그램

```
┌─────────────────────────────────────────────────────────────────────┐
│                          사용자 (PWA)                               │
│                    https://chulchek.app                             │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Vercel Edge Network                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐    │
│  │ Static/SSR  │  │ API Routes  │  │ Cron Jobs               │    │
│  │ (Next.js)   │  │ (Node.js)   │  │ (Vercel Cron Scheduler) │    │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘    │
│         │                │                      │                   │
└─────────┼────────────────┼──────────────────────┼───────────────────┘
          │                │                      │
          ▼                ▼                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Supabase (Production)                           │
│  ┌───────────┐  ┌───────────┐  ┌─────────┐  ┌─────────────────┐  │
│  │ PostgreSQL │  │   Auth    │  │ Storage │  │   Realtime      │  │
│  │ (RLS)     │  │ (Kakao/   │  │ (Private│  │ (org_id filter) │  │
│  │           │  │  Apple)   │  │  +Public)│  │                 │  │
│  └───────────┘  └───────────┘  └─────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
          │
          │ 외부 서비스
          ▼
┌───────────────────────────────────────┐
│  Resend         → 이메일 발송          │
│  Kakao SDK      → 카카오 공유          │
│  Web Push       → 푸시 알림            │
│  Sentry         → 에러 추적            │
│  Betterstack    → Uptime 모니터링      │
└───────────────────────────────────────┘
```
