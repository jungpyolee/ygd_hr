# 01. 인증/OAuth 구현 상세 계획

> **작성일**: 2026-03-25
> **상위 문서**: `docs/planning/multi-tenant-saas-blueprint.md` (섹션 2, Phase 0/3)
> **대상 Supabase**: Dev `rddplpiwvmclreeblkmi` / Prod `ymvdjxzkjodasctktunh`
> **의사결정 참조**: D-01 (이메일+카카오+Apple), D-02 (기존 직원 마이그레이션), D-18 (Google 안 함)

---

## 목차

1. [현재 상태 분석](#1-현재-상태-분석)
2. [카카오 디벨로퍼스 설정](#2-카카오-디벨로퍼스-설정)
3. [Apple Developer 설정](#3-apple-developer-설정)
4. [Supabase Auth Provider 설정](#4-supabase-auth-provider-설정)
5. [코드 구현 계획](#5-코드-구현-계획)
6. [기존 @ygd.com 마이그레이션 플랜](#6-기존-ygdcom-마이그레이션-플랜)
7. [보안 고려사항](#7-보안-고려사항)
8. [체크리스트](#8-체크리스트)

---

## 1. 현재 상태 분석

### 1-1. 현재 인증 구조

현재 `src/app/login/page.tsx`에서 fake email 패턴을 사용하고 있다.

```
사용자 입력: userId (영문/숫자)
내부 변환: `${userId}@ygd.com`
Supabase: signInWithPassword({ email: fakeEmail, password })
```

**문제점:**
- `@ygd.com`은 실제 도메인이 아니므로 이메일 인증/비밀번호 재설정 불가
- SNS 연동 불가 (실제 이메일이 아니므로 identity linking 제한)
- SaaS 전환 시 다른 조직 사용자가 같은 userId를 원할 경우 충돌

### 1-2. 현재 파일 구조

| 파일 | 역할 | 전환 시 변경 |
|------|------|-------------|
| `src/app/login/page.tsx` | 로그인/회원가입 (fake email) | **전면 재작성** |
| `src/lib/auth-context.tsx` | User 상태 관리 | **확장** (profile, org 추가) |
| `src/middleware.ts` | 인증 + admin 라우트 보호 | **전면 재작성** (slug, master, org 검증) |
| `src/lib/supabase.ts` | 브라우저 클라이언트 | 변경 없음 |
| `src/lib/supabase-server.ts` | 서버 클라이언트 | 변경 없음 |
| `src/app/auth/callback/` | (없음) | **신규 생성** |
| `src/app/signup/` | (없음) | **신규 생성** |

### 1-3. 전환 목표 인증 수단

| 수단 | Provider | 우선순위 | 비고 |
|------|----------|---------|------|
| 이메일/비밀번호 | Supabase Email | 1순위 | 실제 이메일 사용 |
| 카카오 | OAuth 2.0 | 1순위 | 한국 사용자 대부분 보유 |
| Apple | OAuth 2.0 (OIDC) | 2순위 | iOS PWA 사용자 대응 |
| Google | - | **안 함** (D-18) | - |

---

## 2. 카카오 디벨로퍼스 설정

### 2-1. 사전 준비

- 카카오 계정 필요 (개인 계정 사용 가능)
- 비즈 앱 전환: **초기에는 불필요**. 일반 앱으로도 카카오 로그인 가능
  - 비즈 앱 전환이 필요한 경우: 이메일 동의항목을 "필수"로 설정하려 할 때
  - 일반 앱에서는 이메일을 "선택" 동의로만 받을 수 있음
  - 비즈 앱 전환 = 사업자등록증 제출 (무료)

### 2-2. 앱 등록 절차

**Step 1: 애플리케이션 생성**

1. https://developers.kakao.com 접속 및 로그인
2. "내 애플리케이션" > "애플리케이션 추가하기"
3. 입력 항목:
   - 앱 이름: `출첵` (또는 `ChulChek`)
   - 사업자명: (개인 개발자일 경우 본명)
   - 카테고리: `비즈니스/생산성 도구` 또는 `유틸리티`
4. "저장" 클릭
5. 생성 후 "앱 키" 탭에서 **REST API 키** 확인 (= Supabase의 Client ID)

**Step 2: 플랫폼 등록**

1. "앱 설정" > "플랫폼"
2. "Web 플랫폼 등록" 클릭
3. 사이트 도메인 추가:
   - Dev: `http://localhost:3000`
   - Dev Supabase: `https://rddplpiwvmclreeblkmi.supabase.co`
   - Prod: `https://{출첵 도메인}` (도메인 확정 후)
   - Prod Supabase: `https://ymvdjxzkjodasctktunh.supabase.co`

> 카카오는 등록된 도메인에서만 API 호출을 허용한다. Supabase Auth를 통해 카카오 인증이 이루어지므로 Supabase 도메인도 반드시 등록해야 한다.

**Step 3: 카카오 로그인 활성화**

1. "제품 설정" > "카카오 로그인"
2. "활성화 설정" ON으로 변경
3. "Redirect URI" 설정:
   - Dev: `https://rddplpiwvmclreeblkmi.supabase.co/auth/v1/callback`
   - Prod: `https://ymvdjxzkjodasctktunh.supabase.co/auth/v1/callback`

> Supabase가 OAuth 플로우를 중개하므로 Redirect URI는 Supabase Auth 서버의 콜백 엔드포인트를 가리켜야 한다. 앱의 `/auth/callback`이 아니다.

**Step 4: 동의항목 설정**

1. "제품 설정" > "카카오 로그인" > "동의항목"
2. 설정할 항목:

| 항목 | ID | 동의 수준 | 필수 여부 | 비고 |
|------|-----|----------|----------|------|
| 닉네임 | `profile_nickname` | 필수 동의 | 필수 | 프로필 이름으로 사용 |
| 프로필 사진 | `profile_image` | 선택 동의 | 선택 | 프로필 이미지용 |
| 카카오계정(이메일) | `account_email` | 선택 동의 | **선택** | 일반 앱은 선택만 가능 |

> **중요**: 이메일을 "필수"로 받으려면 비즈 앱 전환이 필요하다. 다만 Supabase Auth는 카카오가 이메일을 주지 않아도 `kakao` provider의 identity를 생성하므로, 이메일 필수가 아니어도 로그인 자체는 가능하다. 이메일이 없는 사용자는 가입 후 이메일 보완 입력 UI를 보여주면 된다.

**Step 5: Client Secret 발급**

1. "제품 설정" > "카카오 로그인" > "보안"
2. "Client Secret" 발급 클릭
3. 코드 생성 → 복사해 안전한 곳에 보관
4. "활성화 상태"를 **사용함**으로 변경

> Supabase 설정에 이 Client Secret이 필요하다.

**Step 6: OpenID Connect 활성화 (권장)**

1. "제품 설정" > "카카오 로그인" > "OpenID Connect"
2. "활성화 설정" ON
3. Supabase가 OIDC id_token을 통해 사용자 정보를 직접 검증할 수 있어 보안이 강화된다

### 2-3. 최종 확인 값

| 항목 | 위치 | 용도 |
|------|------|------|
| REST API 키 | "앱 키" 탭 | Supabase Client ID |
| Client Secret | "카카오 로그인 > 보안" | Supabase Client Secret |
| Redirect URI | "카카오 로그인 > Redirect URI" | `https://{supabase-ref}.supabase.co/auth/v1/callback` |

### 2-4. 비즈 앱 전환 (선택, 권장)

필수는 아니지만 정식 서비스 출시 전 전환을 권장한다.

1. "앱 설정" > "비즈니스" > "비즈 앱 전환"
2. 사업자등록증 업로드
3. 심사 (보통 1~3 영업일)
4. 승인 후:
   - 이메일 동의항목을 "필수"로 변경 가능
   - 카카오 공유 API 일일 호출 한도 증가
   - 서비스 약관 커스텀 가능

---

## 3. Apple Developer 설정

### 3-1. 사전 준비

- **Apple Developer Program 가입 필수**
  - 비용: **연 $99 USD** (약 13만원, 매년 갱신)
  - 가입: https://developer.apple.com/programs/
  - 개인 또는 조직으로 가입 가능
  - 조직 가입 시 D-U-N-S 번호 필요 (한국 기업의 경우 별도 신청)
  - 개인 가입 권장 (초기 단계에서는 빠르게 진행 가능)
  - 심사 기간: 보통 24~48시간

> Apple Sign In 기능은 유료 Developer Program 멤버십이 있어야 사용 가능하다. 무료 개발자 계정으로는 불가.

### 3-2. App ID 생성 (Identifier)

**Step 1: Certificates, Identifiers & Profiles 접속**

1. https://developer.apple.com/account 로그인
2. "Certificates, Identifiers & Profiles" 클릭

**Step 2: App ID 등록**

1. "Identifiers" > "+" 버튼
2. "App IDs" 선택 > Continue
3. "App" 선택 > Continue
4. 입력:
   - Description: `ChulChek` 또는 `출첵`
   - Bundle ID: `com.chulchek.app` (Explicit)
5. Capabilities 목록에서 **"Sign In with Apple"** 체크
6. Continue > Register

### 3-3. Service ID 생성

> Supabase OAuth에 필요한 것은 Service ID이다. App ID가 아님에 주의.

**Step 1: Service ID 등록**

1. "Identifiers" > "+" 버튼
2. **"Services IDs"** 선택 > Continue
3. 입력:
   - Description: `ChulChek Web Login`
   - Identifier: `com.chulchek.auth` (App ID와 다른 값)
4. Continue > Register

**Step 2: Service ID 설정**

1. 방금 생성한 Service ID 클릭
2. **"Sign In with Apple"** 체크 > Configure
3. 설정:
   - Primary App ID: 위에서 만든 `com.chulchek.app` 선택
   - Domains and Subdomains:
     - `rddplpiwvmclreeblkmi.supabase.co` (Dev)
     - `ymvdjxzkjodasctktunh.supabase.co` (Prod)
     - `{출첵 도메인}` (도메인 확정 후 추가)
   - Return URLs:
     - `https://rddplpiwvmclreeblkmi.supabase.co/auth/v1/callback` (Dev)
     - `https://ymvdjxzkjodasctktunh.supabase.co/auth/v1/callback` (Prod)
4. Save > Continue > Save

### 3-4. Key 생성 (Private Key)

**Step 1:**

1. "Keys" > "+" 버튼
2. Key Name: `ChulChek Auth Key`
3. **"Sign In with Apple"** 체크 > Configure
4. Primary App ID: `com.chulchek.app` 선택
5. Save > Continue > Register

**Step 2: 키 다운로드**

1. **Download** 클릭 (`.p8` 파일)
2. **Key ID** 기록 (10자리 영숫자)

> .p8 파일은 한 번만 다운로드 가능하다. 분실하면 키를 삭제하고 새로 생성해야 한다. 안전한 곳에 보관 필수.

### 3-5. Supabase에 필요한 정보 정리

| 항목 | 값 | 확인 위치 |
|------|-----|----------|
| Service ID (Client ID) | `com.chulchek.auth` | Identifiers > Services IDs |
| Key ID | 10자리 영숫자 | Keys 목록 |
| Private Key (.p8 내용) | `-----BEGIN PRIVATE KEY-----\n...` | 다운로드한 .p8 파일 내용 |
| Team ID | 10자리 영숫자 | 우상단 계정 이름 옆 또는 Membership 페이지 |

> Supabase는 Apple Provider 설정 시 `Secret Key` 필드에 이 4개 값을 조합한 JWT를 넣거나, 개별 필드로 입력한다. Supabase 대시보드 UI에 따라 다르지만, 현재(2026) Supabase는 **Secret Key 대신 개별 필드**(Service ID, Team ID, Key ID, Private Key)를 각각 입력하는 방식을 지원한다.

---

## 4. Supabase Auth Provider 설정

### 4-1. Kakao Provider 활성화

**Supabase 대시보드에서:**

1. Authentication > Providers > Kakao
2. "Enable Kakao provider" 토글 ON
3. 입력:
   - **Client ID**: 카카오 REST API 키
   - **Client Secret**: 카카오에서 발급한 Client Secret
4. "Callback URL (for OAuth)" 값 확인:
   - Dev: `https://rddplpiwvmclreeblkmi.supabase.co/auth/v1/callback`
   - Prod: `https://ymvdjxzkjodasctktunh.supabase.co/auth/v1/callback`
   - 이 URL이 카카오 디벨로퍼스의 Redirect URI에 등록되어 있는지 재확인
5. Save

> **Dev와 Prod 각각 설정해야 한다.** 카카오 디벨로퍼스에서 앱을 1개만 쓰되 Redirect URI를 두 개(Dev/Prod Supabase) 모두 등록하거나, Dev/Prod용 카카오 앱을 분리한다. 권장은 **1개 앱 + Redirect URI 2개 등록**.

### 4-2. Apple Provider 활성화

**Supabase 대시보드에서:**

1. Authentication > Providers > Apple
2. "Enable Apple provider" 토글 ON
3. 입력:
   - **Client ID (Service ID)**: `com.chulchek.auth`
   - **Secret Key**: .p8 파일의 전체 내용 (-----BEGIN PRIVATE KEY----- 포함)
   - **Key ID**: Apple에서 발급한 Key ID (10자리)
   - **Team ID**: Apple Developer Team ID (10자리)
4. "Callback URL" 확인 (카카오와 동일한 패턴)
5. Save

### 4-3. Email Provider 설정 확인

기본적으로 활성화되어 있지만 확인 필요:

1. Authentication > Providers > Email
2. "Enable Email provider" ON 확인
3. 설정 검토:
   - **Confirm email**: ON (이메일 인증 활성화)
   - **Double confirm email changes**: ON (이메일 변경 시 이중 확인)
   - **Enable email confirmations**: 개발 중에는 OFF 가능, 운영 시 ON

> 현재 `@ygd.com` 패턴에서는 이메일 인증이 불필요했으나, 실제 이메일 사용 시 인증 플로우 도입을 고려해야 한다. 초기 베타 단계에서는 이메일 인증 없이 바로 로그인 허용하고, 안정화 이후 인증 활성화를 권장한다.

### 4-4. Redirect URL 정리

Supabase Auth 플로우에서 사용되는 URL 경로 정리:

```
[사용자] → [출첵 앱 /login]
  → supabase.auth.signInWithOAuth({ provider: 'kakao' })
    → 카카오 인증 페이지로 리다이렉트
      → 사용자 인증 완료
        → 카카오가 Supabase 콜백으로 리다이렉트
          → https://{supabase-ref}.supabase.co/auth/v1/callback
            → Supabase가 code exchange 처리
              → 앱의 redirectTo URL로 최종 리다이렉트
                → https://{출첵 도메인}/auth/callback
                  → 앱에서 세션 확인 후 적절한 페이지로 이동
```

**핵심 구분:**
- `https://{supabase-ref}.supabase.co/auth/v1/callback` : Supabase 내부 처리용 (카카오/Apple에 등록)
- `https://{출첵 도메인}/auth/callback` : 앱 내부 라우트 (signInWithOAuth의 redirectTo에 지정)

### 4-5. Supabase Authentication 추가 설정

**Site URL 설정:**

1. Authentication > URL Configuration
2. Site URL: `https://{출첵 도메인}` (Prod), `http://localhost:3000` (Dev)
3. Redirect URLs (허용 목록):
   - `http://localhost:3000/auth/callback`
   - `https://{출첵 도메인}/auth/callback`
   - `http://localhost:3000/**` (Dev 편의)

---

## 5. 코드 구현 계획

### 5-1. login/page.tsx 전면 재작성

현재 fake email 패턴을 완전히 제거하고, 이메일 로그인 + SNS 로그인 버튼으로 교체한다.

**새 로그인 페이지 구조:**

```
┌────────────────────────────────────┐
│                                    │
│         출첵 로고 + 타이틀          │
│     "간편하게 시작하세요"            │
│                                    │
│  ┌──────────────────────────────┐  │
│  │  카카오로 시작하기             │  │  ← 노란색 (#FEE500)
│  └──────────────────────────────┘  │
│                                    │
│  ┌──────────────────────────────┐  │
│  │  Apple로 시작하기              │  │  ← 검은색 (#000000)
│  └──────────────────────────────┘  │
│                                    │
│  ──────── 또는 ────────            │
│                                    │
│  ┌──────────────────────────────┐  │
│  │  이메일로 시작하기             │  │  ← 흰색 + border
│  └──────────────────────────────┘  │
│                                    │
│  기존 직원 로그인 →                 │  ← @ygd.com 레거시 (마이그레이션 기간)
│                                    │
└────────────────────────────────────┘
```

**구현 코드:**

```tsx
// src/app/login/page.tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import IosInstallPrompt from "@/components/IosInstallPrompt";

export default function LoginPage() {
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [showLegacyForm, setShowLegacyForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();

  // --- SNS 로그인 ---
  const handleOAuthLogin = async (provider: "kakao" | "apple") => {
    setOauthLoading(provider);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      toast.error("로그인에 실패했어요. 잠시 후 다시 시도해주세요.");
      setOauthLoading(null);
    }
    // 성공 시 외부 페이지로 리다이렉트되므로 여기서 로딩 해제 불필요
  };

  // --- 이메일 로그인 ---
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      toast.error("이메일이나 비밀번호가 맞지 않아요. 다시 확인해주세요.");
      setLoading(false);
    } else {
      router.push("/auth/callback");
    }
  };

  // --- 레거시 @ygd.com 로그인 (마이그레이션 기간용) ---
  const handleLegacyLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const fakeEmail = `${email.trim()}@ygd.com`;
    const { error } = await supabase.auth.signInWithPassword({
      email: fakeEmail,
      password,
    });

    if (error) {
      toast.error("아이디나 비밀번호가 맞지 않아요.");
      setLoading(false);
    } else {
      router.push("/");
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col justify-center px-6 font-pretendard">
      <div className="w-full max-w-sm mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">

        {/* 로고 + 타이틀 */}
        <div className="mb-10 text-center">
          {/* TODO: 출첵 로고 이미지 */}
          <h1 className="text-[28px] font-bold text-[#191F28] mb-2">출첵</h1>
          <p className="text-[15px] text-[#8B95A1]">간편하게 시작하세요</p>
        </div>

        {/* SNS 로그인 버튼 */}
        <div className="space-y-3">
          {/* 카카오 로그인 */}
          <button
            onClick={() => handleOAuthLogin("kakao")}
            disabled={!!oauthLoading}
            className="w-full h-14 bg-[#FEE500] text-[#191919] font-bold text-[16px] rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            {oauthLoading === "kakao" ? (
              "연결 중..."
            ) : (
              <>
                {/* 카카오 아이콘 SVG */}
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 3C5.58 3 2 5.79 2 9.21c0 2.17 1.45 4.08 3.63 5.17l-.93 3.43c-.08.3.26.55.52.38l4.1-2.72c.22.02.44.03.68.03 4.42 0 8-2.79 8-6.29S14.42 3 10 3z" fill="#191919"/>
                </svg>
                카카오로 시작하기
              </>
            )}
          </button>

          {/* Apple 로그인 */}
          <button
            onClick={() => handleOAuthLogin("apple")}
            disabled={!!oauthLoading}
            className="w-full h-14 bg-black text-white font-bold text-[16px] rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            {oauthLoading === "apple" ? (
              "연결 중..."
            ) : (
              <>
                {/* Apple 아이콘 SVG */}
                <svg width="20" height="20" viewBox="0 0 20 20" fill="white">
                  <path d="M15.1 10.58c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.62-1.7-3.19-1.73-1.36-.14-2.65.8-3.34.8s-1.75-.78-2.88-.76c-1.48.02-2.85.86-3.61 2.19-1.54 2.67-.39 6.63 1.11 8.8.73 1.06 1.61 2.25 2.76 2.21 1.11-.04 1.53-.72 2.87-.72 1.34 0 1.72.72 2.89.7 1.19-.02 1.95-1.08 2.68-2.15.84-1.23 1.19-2.42 1.21-2.48-.03-.01-2.32-.89-2.38-3.55zM12.88 4.18c.61-.74 1.02-1.77.91-2.8-.88.04-1.94.59-2.57 1.33-.57.66-1.06 1.71-.93 2.72.98.08 1.98-.5 2.59-1.25z"/>
                </svg>
                Apple로 시작하기
              </>
            )}
          </button>
        </div>

        {/* 구분선 */}
        <div className="flex items-center my-6">
          <div className="flex-1 h-px bg-[#E5E8EB]" />
          <span className="px-4 text-[13px] text-[#8B95A1]">또는</span>
          <div className="flex-1 h-px bg-[#E5E8EB]" />
        </div>

        {/* 이메일 로그인 */}
        {!showEmailForm ? (
          <button
            onClick={() => setShowEmailForm(true)}
            className="w-full h-14 bg-white text-[#4E5968] font-bold text-[16px] rounded-2xl border border-[#E5E8EB] active:scale-[0.98] transition-transform"
          >
            이메일로 시작하기
          </button>
        ) : (
          <form onSubmit={handleEmailLogin} className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일 주소"
              required
              autoFocus
              className="w-full h-14 bg-[#F2F4F6] rounded-2xl px-4 text-[#191F28] font-medium placeholder:text-[#B0B8C1] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30 transition-all"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              required
              className="w-full h-14 bg-[#F2F4F6] rounded-2xl px-4 text-[#191F28] font-medium placeholder:text-[#B0B8C1] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30 transition-all"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full h-14 bg-[#3182F6] text-white font-bold text-[16px] rounded-2xl active:scale-[0.98] transition-transform disabled:bg-[#D1D6DB]"
            >
              {loading ? "처리 중..." : "로그인"}
            </button>
            <div className="text-center">
              <button
                type="button"
                onClick={() => router.push("/signup")}
                className="text-[14px] font-semibold text-[#3182F6]"
              >
                이메일로 회원가입
              </button>
            </div>
          </form>
        )}

        {/* 레거시 @ygd.com 로그인 (마이그레이션 기간 한정) */}
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setShowLegacyForm(!showLegacyForm)}
            className="text-[13px] text-[#B0B8C1] underline"
          >
            기존 연경당 직원 로그인
          </button>
        </div>

        {showLegacyForm && (
          <form onSubmit={handleLegacyLogin} className="mt-4 space-y-3 animate-in fade-in duration-300 p-4 bg-[#F9FAFB] rounded-2xl border border-[#E5E8EB]">
            <p className="text-[12px] text-[#8B95A1] mb-2">
              기존 아이디(@ygd.com)로 로그인할 수 있어요.
              빠른 시일 내에 카카오 또는 이메일로 전환해주세요.
            </p>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
              placeholder="아이디 (영문/숫자)"
              required
              className="w-full h-12 bg-white rounded-xl px-4 text-[#191F28] text-[14px] placeholder:text-[#B0B8C1] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              required
              className="w-full h-12 bg-white rounded-xl px-4 text-[#191F28] text-[14px] placeholder:text-[#B0B8C1] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-[#4E5968] text-white font-semibold text-[14px] rounded-xl disabled:bg-[#D1D6DB]"
            >
              {loading ? "처리 중..." : "로그인"}
            </button>
          </form>
        )}

      </div>
      <IosInstallPrompt />
    </div>
  );
}
```

**주요 변경 사항:**
- `userId@ygd.com` fake email 패턴 제거
- 카카오/Apple OAuth 버튼 추가 (`signInWithOAuth`)
- 이메일 로그인은 실제 이메일 사용
- 레거시 `@ygd.com` 로그인은 마이그레이션 기간 동안만 하단에 작게 노출
- 회원가입은 별도 `/signup` 페이지로 분리

### 5-2. /auth/callback 라우트 구현

OAuth 인증 완료 후 Supabase가 앱으로 리다이렉트하는 엔드포인트이다. Server-side에서 code exchange를 처리해야 한다.

```ts
// src/app/auth/callback/route.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    // code를 세션으로 교환
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // 사용자 정보 확인
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // 프로필 존재 여부 확인
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, primary_organization_id, role, name")
          .eq("id", user.id)
          .single();

        // 프로필이 없거나 이름이 없으면 → 온보딩으로
        if (!profile || !profile.name) {
          return NextResponse.redirect(new URL("/onboarding", origin));
        }

        // 조직 소속 확인
        const { data: memberships } = await supabase
          .from("organization_memberships")
          .select("organization_id, organizations(slug)")
          .eq("profile_id", user.id)
          .eq("status", "active");

        if (!memberships || memberships.length === 0) {
          // 소속 조직 없음 → 조직 생성 또는 초대 수락 페이지
          return NextResponse.redirect(new URL("/create-organization", origin));
        }

        if (memberships.length === 1) {
          // 소속 1개 → 바로 해당 조직으로
          const org = memberships[0].organizations as { slug: string };
          return NextResponse.redirect(new URL(`/${org.slug}`, origin));
        }

        // 소속 N개 → 조직 선택 페이지
        return NextResponse.redirect(new URL("/select-organization", origin));
      }
    }
  }

  // 에러 시 로그인 페이지로
  return NextResponse.redirect(new URL("/login?error=auth_failed", origin));
}
```

**핵심 로직:**
1. Supabase가 전달한 `code` 파라미터로 `exchangeCodeForSession()` 호출
2. 세션 생성 후 사용자 프로필/조직 소속 확인
3. 상태에 따라 적절한 페이지로 리다이렉트:
   - 프로필 미완성 → `/onboarding`
   - 조직 없음 → `/create-organization`
   - 조직 1개 → `/[slug]`
   - 조직 N개 → `/select-organization`

### 5-3. /signup 페이지 구현

이메일 회원가입 전용 페이지. 기존 login/page.tsx의 가입 부분을 분리하되, 실제 이메일을 사용하도록 변경한다.

```tsx
// src/app/signup/page.tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      toast.error("비밀번호는 6자 이상이어야 해요.");
      return;
    }
    if (password !== passwordConfirm) {
      toast.error("비밀번호가 서로 달라요. 다시 확인해주세요.");
      return;
    }
    if (!agreeTerms) {
      toast.error("필수 동의 항목에 체크해 주세요.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          name: name.trim(),  // user_metadata에 저장 → handle_new_user 트리거에서 profiles.name으로 복사
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      if (error.message.includes("already registered")) {
        toast.error("이미 가입된 이메일이에요. 로그인을 시도해주세요.");
      } else if (error.message.includes("rate_limit")) {
        toast.error("너무 많은 시도가 있었어요. 잠시 후 다시 시도해주세요.");
      } else {
        toast.error("가입에 실패했어요. 이메일 형식을 확인해주세요.");
      }
      setLoading(false);
      return;
    }

    toast.success("가입이 완료되었어요! 로그인해주세요.");
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-white flex flex-col justify-center px-6 font-pretendard">
      <div className="w-full max-w-sm mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="mb-10">
          <h1 className="text-[26px] font-bold text-[#191F28] leading-tight mb-2">
            출첵에 오신 것을 환영해요!
            <br />
            계정을 만들어주세요
          </h1>
          <p className="text-[15px] text-[#8B95A1]">
            이름과 이메일, 비밀번호를 입력해주세요.
          </p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          {/* 이름 */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-[#4E5968] px-1">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="실명을 입력해주세요"
              required
              className="w-full h-14 bg-[#F2F4F6] rounded-2xl px-4 text-[#191F28] font-medium placeholder:text-[#B0B8C1] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30 transition-all"
            />
          </div>

          {/* 이메일 */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-[#4E5968] px-1">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              required
              className="w-full h-14 bg-[#F2F4F6] rounded-2xl px-4 text-[#191F28] font-medium placeholder:text-[#B0B8C1] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30 transition-all"
            />
          </div>

          {/* 비밀번호 */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-[#4E5968] px-1">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6자 이상"
              required
              className="w-full h-14 bg-[#F2F4F6] rounded-2xl px-4 text-[#191F28] font-medium placeholder:text-[#B0B8C1] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30 transition-all"
            />
          </div>

          {/* 비밀번호 확인 */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-[#4E5968] px-1">비밀번호 확인</label>
            <input
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              placeholder="비밀번호를 한 번 더 입력해주세요"
              required
              className="w-full h-14 bg-[#F2F4F6] rounded-2xl px-4 text-[#191F28] font-medium placeholder:text-[#B0B8C1] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30 transition-all"
            />
          </div>

          {/* 약관 동의 */}
          <button
            type="button"
            onClick={() => setAgreeTerms(!agreeTerms)}
            className="w-full flex items-center gap-3 p-4 bg-[#F9FAFB] rounded-2xl border border-slate-100 transition-colors active:scale-[0.98]"
          >
            <CheckCircle2 className={`w-6 h-6 ${agreeTerms ? "text-[#3182F6]" : "text-[#D1D6DB]"}`} />
            <span className="text-[14px] font-semibold text-[#4E5968] text-left">
              [필수] 개인정보 수집·이용 및 위치정보 제공 동의
            </span>
          </button>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-14 mt-8 bg-[#3182F6] text-white font-bold text-[16px] rounded-2xl active:scale-[0.98] transition-transform disabled:bg-[#D1D6DB]"
          >
            {loading ? "처리 중..." : "가입하기"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="text-[14px] font-semibold text-[#8B95A1] hover:text-[#4E5968] transition-colors"
          >
            이미 계정이 있으신가요? 로그인
          </button>
        </div>
      </div>
    </div>
  );
}
```

**변경 사항:**
- `name` 필드 추가 (signUp의 `data.name`으로 전달 → `handle_new_user()` 트리거에서 profiles로 복사)
- 실제 이메일 입력 (`type="email"`)
- `emailRedirectTo` 설정 (이메일 인증 시 사용)

### 5-4. handle_new_user() 트리거 수정

SNS 가입 시에도 profiles가 올바르게 생성되도록 트리거를 확장해야 한다.

```sql
-- 기존 handle_new_user() 수정
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_name text;
  v_avatar_url text;
BEGIN
  -- 이름 결정 (우선순위: user_metadata.name → 카카오 닉네임 → Apple fullName → 이메일 앞부분)
  v_name := COALESCE(
    NEW.raw_user_meta_data->>'name',                           -- 이메일 가입 시 직접 입력한 이름
    NEW.raw_user_meta_data->>'full_name',                      -- Apple
    NEW.raw_user_meta_data->'kakao_account'->'profile'->>'nickname',  -- 카카오
    NEW.raw_user_meta_data->>'user_name',                      -- 일반적인 SNS
    split_part(NEW.email, '@', 1)                              -- 최후 수단: 이메일 앞부분
  );

  -- 프로필 이미지 (카카오/Apple에서 제공하는 경우)
  v_avatar_url := COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->'kakao_account'->'profile'->>'profile_image_url'
  );

  INSERT INTO public.profiles (id, email, name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    v_name,
    v_avatar_url,
    'employee'  -- 기본 역할
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = COALESCE(profiles.name, EXCLUDED.name),  -- 기존 이름이 있으면 유지
    avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**핵심 포인트:**
- 카카오: `raw_user_meta_data.kakao_account.profile.nickname` 경로에서 닉네임을 가져옴
- Apple: `raw_user_meta_data.full_name` 또는 `name`에서 이름을 가져옴 (Apple은 최초 로그인 시에만 이름을 제공하므로 ON CONFLICT DO UPDATE에서 기존 이름을 유지해야 함)
- 이메일: `signUp({ data: { name } })`으로 전달된 값이 `raw_user_meta_data.name`에 저장됨

### 5-5. AuthContext 확장

```tsx
// src/lib/auth-context.tsx
"use client";

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

interface Profile {
  id: string;
  role: "master" | "owner" | "employee";
  name: string;
  email: string;
  credit_score: number;
  avatar_url: string | null;
}

interface OrgInfo {
  id: string;
  slug: string;
  name: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;

  // 신규 필드
  profile: Profile | null;
  currentOrg: OrgInfo | null;
  userOrgs: OrgInfo[];
  isOrgAdmin: boolean;
  isMaster: boolean;
  switchOrg: (slug: string) => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  profile: null,
  currentOrg: null,
  userOrgs: [],
  isOrgAdmin: false,
  isMaster: false,
  switchOrg: () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userOrgs, setUserOrgs] = useState<OrgInfo[]>([]);
  const [currentOrg, setCurrentOrg] = useState<OrgInfo | null>(null);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = useMemo(() => createClient(), []);

  const isMaster = profile?.role === "master";

  // 프로필 + 조직 정보 로드
  const loadProfile = useCallback(async (userId: string) => {
    // 프로필 조회
    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, role, name, email, credit_score, avatar_url, primary_organization_id")
      .eq("id", userId)
      .single();

    if (profileData) {
      setProfile(profileData as Profile);

      // 소속 조직 목록 조회
      const { data: memberships } = await supabase
        .from("organization_memberships")
        .select("organization_id, organizations(id, slug, name)")
        .eq("profile_id", userId)
        .eq("status", "active");

      const orgs: OrgInfo[] = (memberships ?? [])
        .map((m) => m.organizations as unknown as OrgInfo)
        .filter(Boolean);
      setUserOrgs(orgs);

      // 현재 조직 결정 (URL의 slug 기반, 또는 primary, 또는 첫 번째)
      // 이 부분은 slug context에서 결정됨 (slug layout에서 setCurrentOrg 호출)
      if (orgs.length === 1) {
        setCurrentOrg(orgs[0]);
      } else if (profileData.primary_organization_id) {
        const primary = orgs.find((o) => o.id === profileData.primary_organization_id);
        if (primary) setCurrentOrg(primary);
      }

      // 현재 조직의 admin 여부 확인
      if (currentOrg) {
        const { data: adminData } = await supabase
          .from("organization_admins")
          .select("id")
          .eq("profile_id", userId)
          .eq("organization_id", currentOrg.id)
          .single();
        setIsOrgAdmin(!!adminData);
      }
    }
  }, [supabase, currentOrg]);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id);
  }, [user, loadProfile]);

  const switchOrg = useCallback((slug: string) => {
    const org = userOrgs.find((o) => o.slug === slug);
    if (org) {
      setCurrentOrg(org);
      // admin 여부 재확인은 org 변경 시 effect에서 처리
    }
  }, [userOrgs]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user) {
        loadProfile(user.id).then(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUser = session?.user ?? null;
      setUser(newUser);
      if (newUser) {
        loadProfile(newUser.id);
      } else {
        setProfile(null);
        setUserOrgs([]);
        setCurrentOrg(null);
        setIsOrgAdmin(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, loadProfile]);

  // currentOrg 변경 시 admin 여부 재확인
  useEffect(() => {
    if (!user || !currentOrg) {
      setIsOrgAdmin(false);
      return;
    }
    supabase
      .from("organization_admins")
      .select("id")
      .eq("profile_id", user.id)
      .eq("organization_id", currentOrg.id)
      .single()
      .then(({ data }) => setIsOrgAdmin(!!data));
  }, [supabase, user, currentOrg]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        profile,
        currentOrg,
        userOrgs,
        isOrgAdmin,
        isMaster,
        switchOrg,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

**확장 사항:**
- `profile`: 이름, 역할, 크레딧 점수 등 프로필 정보
- `currentOrg` / `userOrgs`: 현재 선택된 조직과 전체 소속 조직 목록
- `isOrgAdmin` / `isMaster`: 역할 기반 접근 제어
- `switchOrg()`: 다중 소속 시 조직 전환
- `refreshProfile()`: 프로필 변경 후 재로드

### 5-6. middleware.ts 변경

```ts
// src/middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// 인증 불필요 경로
const PUBLIC_PATHS = ["/login", "/auth/callback", "/signup", "/join"];

// 인증 필요하지만 조직 불필요 경로
const AUTH_ONLY_PATHS = ["/create-organization", "/select-organization", "/onboarding"];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // --- 1. 공개 경로: 인증 불필요 ---
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    // 이미 로그인된 상태에서 /login 접근 시 → 홈으로 리다이렉트
    if (user && pathname.startsWith("/login")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return supabaseResponse;
  }

  // --- 2. 미인증 → /login ---
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // --- 3. 인증만 필요한 경로 (조직 소속 불필요) ---
  if (AUTH_ONLY_PATHS.some((p) => pathname.startsWith(p))) {
    return supabaseResponse;
  }

  // --- 4. /master/** → master role 확인 ---
  if (pathname.startsWith("/master")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "master") {
      return NextResponse.redirect(new URL("/select-organization", request.url));
    }
    return supabaseResponse;
  }

  // --- 5. / (루트) → 적절한 조직으로 리다이렉트 ---
  if (pathname === "/") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("primary_organization_id, role")
      .eq("id", user.id)
      .single();

    // master는 /master로
    if (profile?.role === "master") {
      return NextResponse.redirect(new URL("/master", request.url));
    }

    // primary_organization_id가 있으면 해당 조직으로
    if (profile?.primary_organization_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select("slug")
        .eq("id", profile.primary_organization_id)
        .single();

      if (org) {
        return NextResponse.redirect(new URL(`/${org.slug}`, request.url));
      }
    }

    // 소속 조직 조회
    const { data: memberships } = await supabase
      .from("organization_memberships")
      .select("organizations(slug)")
      .eq("profile_id", user.id)
      .eq("status", "active");

    if (!memberships || memberships.length === 0) {
      return NextResponse.redirect(new URL("/create-organization", request.url));
    }

    if (memberships.length === 1) {
      const org = memberships[0].organizations as { slug: string };
      return NextResponse.redirect(new URL(`/${org.slug}`, request.url));
    }

    return NextResponse.redirect(new URL("/select-organization", request.url));
  }

  // --- 6. /[slug]/** → 조직 멤버십 확인 ---
  const slugMatch = pathname.match(/^\/([a-z0-9-]+)(\/|$)/);
  if (slugMatch) {
    const slug = slugMatch[1];

    // 예약 경로 스킵 (static 등)
    const RESERVED_SLUGS = ["api", "_next", "master"];
    if (RESERVED_SLUGS.includes(slug)) {
      return supabaseResponse;
    }

    // 조직 존재 확인
    const { data: org } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .single();

    if (!org) {
      return NextResponse.redirect(new URL("/select-organization", request.url));
    }

    // master는 모든 조직 접근 가능
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "master") {
      // 멤버십 확인
      const { data: membership } = await supabase
        .from("organization_memberships")
        .select("id")
        .eq("profile_id", user.id)
        .eq("organization_id", org.id)
        .eq("status", "active")
        .single();

      if (!membership) {
        return NextResponse.redirect(new URL("/select-organization", request.url));
      }
    }

    // /[slug]/admin/** → organization_admins 확인
    if (pathname.includes("/admin")) {
      if (profile?.role !== "master") {
        const { data: adminEntry } = await supabase
          .from("organization_admins")
          .select("id")
          .eq("profile_id", user.id)
          .eq("organization_id", org.id)
          .single();

        if (!adminEntry) {
          return NextResponse.redirect(new URL(`/${slug}`, request.url));
        }
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|manifest.webmanifest|sw.js|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

**변경 요약:**
- 공개 경로 확장: `/login`, `/auth/callback`, `/signup`, `/join`
- 루트(`/`) 접근 시 조직 소속에 따라 자동 리다이렉트
- `/master/**` 경로의 master role 검증
- `/[slug]/**` 경로의 조직 멤버십 검증
- `/[slug]/admin/**` 경로의 organization_admins 검증
- 기존 단순 `admin` role 체크 → 조직별 역할 체크로 전환

### 5-7. 환경 변수 변경사항

기존 `.env.local`에 추가 환경 변수는 없다. Supabase의 OAuth Provider 설정은 Supabase 대시보드에서 관리되며, 클라이언트 코드에서는 기존 `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_ANON_KEY`만으로 OAuth를 호출할 수 있다.

다만, 카카오 공유 API(SDK)를 위해 추후 필요:

```env
# .env.local (추후 카카오 공유 기능 구현 시)
NEXT_PUBLIC_KAKAO_JS_KEY=카카오_JavaScript_키
```

---

## 6. 기존 @ygd.com 마이그레이션 플랜

### 6-1. 마이그레이션 원칙

1. **기존 기능 즉시 차단 금지** — 기존 `@ygd.com` 로그인은 유예 기간 동안 계속 작동
2. **점진적 전환 유도** — 강제가 아닌 안내 + 편의 제공으로 자발적 전환
3. **데이터 무손실** — 기존 출퇴근 기록, 크레딧, 스케줄 등 모든 데이터 보존
4. **SNS 안정화 먼저** — 신규 가입자 대상으로 SNS 로그인이 안정적으로 동작하는 것을 확인한 후 기존 사용자 전환 시작

### 6-2. SNS 안정화 판단 기준

다음 조건을 **모두** 만족할 때 "안정화"로 판단한다:

| # | 기준 | 측정 방법 |
|---|------|----------|
| 1 | 카카오 로그인 성공률 99% 이상 | audit_logs 기반 로그인 성공/실패 비율 |
| 2 | Apple 로그인 성공률 99% 이상 | 동일 |
| 3 | OAuth 콜백 에러 0건 (7일 연속) | 서버 로그 모니터링 |
| 4 | 신규 가입자 10명 이상이 SNS로 정상 가입 | profiles + auth.users 조회 |
| 5 | Dev/Prod 모두 동일 동작 확인 | 수동 테스트 |

> 최소 2주간 안정적 운영 후 기존 직원 마이그레이션 시작.

### 6-3. Phase별 전환 계획

#### Phase 1: 안내 배너 표시

SNS 안정화 확인 후 즉시.

**HomeClient.tsx에 전환 유도 배너 추가:**

```tsx
// 기존 @ygd.com 사용자 판별
const isLegacyUser = user?.email?.endsWith("@ygd.com");

// 배너 UI
{isLegacyUser && (
  <div className="mx-4 mt-3 p-4 bg-[#E8F3FF] rounded-2xl border border-[#3182F6]/20">
    <p className="text-[14px] font-semibold text-[#191F28] mb-1">
      계정을 업그레이드해주세요
    </p>
    <p className="text-[13px] text-[#4E5968] mb-3">
      카카오 또는 Apple 계정을 연동하면 더 안전하고 편리하게 로그인할 수 있어요.
    </p>
    <button
      onClick={() => router.push(`/${slug}/my/account`)}
      className="text-[13px] font-bold text-[#3182F6]"
    >
      지금 연동하기 →
    </button>
  </div>
)}
```

#### Phase 2: 마이페이지 계정 연동 기능

**`/[slug]/my/account` 페이지 신규 생성:**

```
┌────────────────────────────────────┐
│  계정 관리                          │
│                                     │
│  현재 로그인 방식                    │
│  ┌─────────────────────────────┐   │
│  │ 📧 jungpyo@ygd.com (레거시)  │   │
│  └─────────────────────────────┘   │
│                                     │
│  계정 연동                           │
│  ┌─────────────────────────────┐   │
│  │ 💬 카카오 연동하기            │   │  ← linkIdentity
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │ 🍎 Apple 연동하기             │   │  ← linkIdentity
│  └─────────────────────────────┘   │
│                                     │
│  이메일 변경                         │
│  ┌─────────────────────────────┐   │
│  │ jungpyo@ygd.com → [실제이메일]│   │  ← updateUser
│  └─────────────────────────────┘   │
│                                     │
└────────────────────────────────────┘
```

**SNS 연동 (Identity Linking) 코드:**

```tsx
// 카카오 연동
const handleLinkKakao = async () => {
  const { error } = await supabase.auth.linkIdentity({
    provider: "kakao",
    options: {
      redirectTo: `${window.location.origin}/auth/callback?next=/my/account`,
    },
  });
  if (error) {
    toast.error("카카오 연동에 실패했어요. 이미 다른 계정에 연동된 카카오일 수 있어요.");
  }
};

// Apple 연동
const handleLinkApple = async () => {
  const { error } = await supabase.auth.linkIdentity({
    provider: "apple",
    options: {
      redirectTo: `${window.location.origin}/auth/callback?next=/my/account`,
    },
  });
  if (error) {
    toast.error("Apple 연동에 실패했어요. 이미 다른 계정에 연동된 Apple ID일 수 있어요.");
  }
};
```

**이메일 변경 코드:**

```tsx
// 기존 fake email → 실제 이메일로 변경
const handleEmailChange = async (newEmail: string) => {
  const { error } = await supabase.auth.updateUser({
    email: newEmail,
  });

  if (error) {
    toast.error("이메일 변경에 실패했어요. 이미 사용 중인 이메일일 수 있어요.");
  } else {
    toast.success("인증 메일을 보냈어요. 메일함을 확인해주세요.");
    // Supabase는 새 이메일로 확인 메일을 발송함
    // 확인 완료 시 auth.users.email이 변경됨
  }
};
```

**주의**: `auth.updateUser({ email })` 호출 시:
- Supabase가 새 이메일로 확인 메일을 발송
- 사용자가 메일 내 링크를 클릭해야 변경 완료
- 변경 완료 전까지는 기존 `@ygd.com` 이메일로 로그인 가능
- `profiles.email`도 동기화 필요 → `on_auth_user_updated` 트리거로 처리

#### Phase 3: 유예 기간 운영

**유예 기간 로드맵:**

| 시점 | 조치 |
|------|------|
| D+0 (안정화 확인) | Phase 1 배너 활성화 |
| D+14 | Phase 2 계정 연동 기능 출시 |
| D+30 | 미전환 사용자에게 개별 카카오톡 안내 (수동) |
| D+45 | 로그인 페이지에서 레거시 로그인 경고 메시지 강화 |
| D+60 | 레거시 로그인 폼 제거 (API 레벨 차단은 아님) |
| D+90 | `@ygd.com` 계정 비밀번호 로그인 완전 차단 |

**D+90 차단 방법:**

```sql
-- Supabase Auth Hook 또는 Edge Function으로 구현
-- 또는 middleware에서 처리
-- @ygd.com 이메일로 signInWithPassword 시도 시 차단

-- 방법 1: profiles에 플래그
ALTER TABLE profiles ADD COLUMN legacy_login_blocked boolean DEFAULT false;

-- 방법 2: middleware에서 로그인 후 체크
-- user.email이 @ygd.com이고 연동된 identity가 email만 있으면 → 강제 전환 페이지로
```

### 6-4. 데이터 보존 보장

계정 전환 시 다음이 자동으로 보존된다:

| 데이터 | 보존 방법 |
|--------|----------|
| auth.users.id (UUID) | 변경 없음 — email 변경해도 UUID 유지 |
| profiles 전체 | id = auth.users.id이므로 자동 유지 |
| attendance_logs | profile_id FK로 연결 → 유지 |
| attendance_credits | profile_id FK로 연결 → 유지 |
| schedule_slots | profile_id FK로 연결 → 유지 |
| 기타 모든 관련 테이블 | profile_id FK → 유지 |

> `auth.updateUser({ email })` 또는 `linkIdentity()`는 auth.users.id를 변경하지 않는다. identity만 추가/변경되므로 기존 데이터 참조가 깨지지 않는다.

---

## 7. 보안 고려사항

### 7-1. OAuth state parameter

Supabase Auth가 OAuth state parameter를 자동 관리한다. 별도 구현 불필요.

**동작 원리:**
1. `signInWithOAuth()` 호출 시 Supabase가 랜덤 `state` 값 생성
2. 사용자가 카카오/Apple 인증 완료 후 콜백 시 `state` 값 포함
3. Supabase가 `state` 값 검증 → 일치하지 않으면 세션 생성 거부

> CSRF(Cross-Site Request Forgery) 방어에 해당. 직접 구현할 필요 없지만, Supabase의 `state` 검증이 정상 동작하는지 Dev 환경에서 확인 필수.

### 7-2. PKCE (Proof Key for Code Exchange) Flow

Supabase Auth는 기본적으로 **PKCE flow**를 사용한다 (Authorization Code Flow with PKCE).

**PKCE 동작:**
1. 클라이언트가 `code_verifier`(랜덤 문자열)와 `code_challenge`(SHA-256 해시) 생성
2. OAuth 요청 시 `code_challenge` 전송
3. 콜백에서 받은 `code`와 `code_verifier`로 토큰 교환
4. 서버가 `code_verifier`를 검증 → 일치해야 토큰 발급

```
[클라이언트] code_verifier 생성 → SHA256 → code_challenge
[클라이언트 → 카카오] code_challenge 전달
[카카오 → Supabase] authorization code 전달
[앱 → Supabase] code + code_verifier 전달 (exchangeCodeForSession)
[Supabase] code_verifier 검증 → 세션 발급
```

> Supabase의 `@supabase/ssr` 패키지가 PKCE를 자동 처리한다. `exchangeCodeForSession()` 호출이 이 과정의 마지막 단계. 우리 코드의 `/auth/callback/route.ts`에서 이 함수를 호출하므로 PKCE가 자동 적용된다.

**주의**: PKCE가 동작하려면 OAuth 요청을 시작한 브라우저와 콜백을 받는 브라우저가 **같은 세션**이어야 한다. 크로스 브라우저(예: 카카오 인앱 브라우저 → 사파리)에서 문제 발생 가능성이 있으므로 테스트 필수.

### 7-3. 세션 관리

**현재 구조 (유지):**

- Supabase SSR 쿠키 기반 세션 (HttpOnly, Secure, SameSite=Lax)
- `middleware.ts`에서 `getUser()`로 세션 갱신 (토큰 refresh 자동 처리)
- 클라이언트 `auth-context.tsx`에서 `onAuthStateChange`로 실시간 세션 감지

**추가 고려사항:**

| 항목 | 현재 | 변경 |
|------|------|------|
| Access Token 만료 | 1시간 (Supabase 기본) | 유지 (middleware가 자동 갱신) |
| Refresh Token 만료 | 7일 (Supabase 기본) | 유지 또는 30일로 연장 (PWA 특성상 장기 세션 필요) |
| 세션 쿠키 Secure 플래그 | Supabase SSR 자동 설정 | HTTPS 필수 확인 |
| 다중 디바이스 세션 | 허용 (Supabase 기본) | 유지 |
| 로그아웃 시 세션 정리 | `supabase.auth.signOut()` | 모든 디바이스 로그아웃 옵션 추가 고려 |

**Refresh Token 연장 방법 (필요 시):**

Supabase 대시보드 > Authentication > Settings > "JWT expiry" (Access Token)
Supabase 대시보드 > Authentication > Settings > "Refresh token rotation" 설정 확인

### 7-4. 추가 보안 권장사항

**1. Rate Limiting:**
- Supabase Auth에 기본 Rate Limit 있음 (회원가입 시간당 3건 등)
- 프로덕션에서는 Supabase Pro 플랜의 커스텀 Rate Limit 설정 검토

**2. 이메일 인증 (Email Confirmation):**
- 초기 베타: OFF (빠른 가입을 위해)
- 정식 출시: ON 권장 (스팸 계정 방지)
- Supabase 대시보드 > Authentication > Settings > "Enable email confirmations"

**3. 비밀번호 정책:**
- Supabase 기본: 6자 이상
- 권장: 프론트엔드에서 추가 검증 (영문+숫자 조합 등)

**4. OAuth Provider 토큰 관리:**
- 카카오/Apple의 Client Secret은 Supabase 대시보드에만 저장
- 앱 코드나 환경 변수에 노출되지 않음 (Supabase 서버가 관리)
- `.env.local`에 OAuth Secret을 넣을 필요 없음

**5. Apple 로그인 특이사항:**
- Apple은 최초 로그인 시에만 사용자 이름을 제공
- "Hide My Email" 선택 시 프록시 이메일이 전달됨 (예: `abc123@privaterelay.appleid.com`)
- 이 프록시 이메일로도 Supabase identity가 생성되므로 별도 처리 불필요
- 단, 사용자에게 실제 이메일 보완 입력을 유도하면 좋음

---

## 8. 체크리스트

### 8-1. 사전 준비 (코드 작성 전)

```
□ Apple Developer Program 가입 ($99/year) 및 승인 대기
□ 카카오 디벨로퍼스 앱 등록
  □ 앱 생성 + REST API 키 확인
  □ 플랫폼(Web) 등록 (localhost + Supabase 도메인)
  □ 카카오 로그인 활성화
  □ Redirect URI 설정 (Dev/Prod Supabase 콜백)
  □ 동의항목 설정 (닉네임 필수, 이메일 선택)
  □ Client Secret 발급 + 활성화
  □ OpenID Connect 활성화
□ Apple Developer 설정
  □ App ID 생성 (Sign In with Apple 활성화)
  □ Service ID 생성 + Sign In with Apple Configure
    □ Domains 등록 (Supabase 도메인)
    □ Return URLs 등록 (Supabase 콜백)
  □ Key 생성 + .p8 파일 다운로드 + Key ID 기록
  □ Team ID 확인
□ Supabase 대시보드 설정 (Dev)
  □ Kakao Provider 활성화 + Client ID/Secret 입력
  □ Apple Provider 활성화 + Service ID/Key ID/Team ID/Private Key 입력
  □ Site URL 설정 (http://localhost:3000)
  □ Redirect URLs 추가 (http://localhost:3000/auth/callback)
  □ Email Provider 설정 확인
□ Supabase 대시보드 설정 (Prod)
  □ 위와 동일 (Prod 도메인으로)
```

### 8-2. 개발

```
□ DB 변경
  □ handle_new_user() 트리거 수정 (카카오/Apple 대응)
  □ organizations, organization_memberships, organization_admins 테이블 (선행 필요)
□ 코드 구현
  □ /auth/callback/route.ts 생성
  □ /login/page.tsx 전면 재작성
  □ /signup/page.tsx 생성
  □ auth-context.tsx 확장
  □ middleware.ts 재작성
  □ 레거시 @ygd.com 로그인 폼 (마이그레이션 기간용)
□ 마이그레이션 기능
  □ /[slug]/my/account 페이지 (계정 연동)
  □ linkIdentity() 카카오/Apple 연동
  □ updateUser({ email }) 이메일 변경
  □ 전환 유도 배너 (HomeClient)
□ npm run build 통과 확인
```

### 8-3. 테스트

```
□ 카카오 로그인 (Dev)
  □ 신규 가입 → profiles 생성 확인
  □ 기존 카카오 계정으로 재로그인
  □ 닉네임, 프로필 이미지 정상 수신 확인
  □ 이메일 동의 거부 시에도 로그인 가능한지 확인
  □ iOS Safari에서 카카오 로그인 (인앱 브라우저 문제 없는지)
  □ Android Chrome에서 카카오 로그인
□ Apple 로그인 (Dev)
  □ 신규 가입 → profiles 생성 확인
  □ 이름 수신 확인 (최초 1회만)
  □ "Hide My Email" 선택 시 프록시 이메일 처리
  □ iOS Safari에서 Apple 로그인
  □ macOS Safari에서 Apple 로그인
□ 이메일 로그인 (Dev)
  □ 신규 가입 → profiles 생성 확인
  □ 로그인 → 세션 생성 확인
  □ 비밀번호 틀림 시 에러 메시지
  □ 중복 이메일 가입 시도 시 에러 메시지
□ 레거시 @ygd.com 로그인
  □ 기존 계정으로 로그인 정상 동작
  □ 전환 유도 배너 표시 확인
□ /auth/callback 라우트
  □ 카카오 콜백 정상 처리
  □ Apple 콜백 정상 처리
  □ 에러 시 /login으로 리다이렉트
  □ 조직 소속에 따른 적절한 리다이렉트 (1개/N개/없음)
□ middleware.ts
  □ 미인증 → /login 리다이렉트
  □ /master 경로 master role 체크
  □ /[slug] 경로 멤버십 체크
  □ /[slug]/admin 경로 admin 체크
  □ / (루트) → 적절한 조직으로 리다이렉트
□ 계정 연동 (마이그레이션)
  □ @ygd.com 계정에 카카오 연동 (linkIdentity)
  □ @ygd.com 계정에 Apple 연동 (linkIdentity)
  □ 이메일 변경 (updateUser)
  □ 연동 후 기존 데이터 정상 접근 확인
□ 보안
  □ PKCE flow 정상 동작 (네트워크 탭에서 code_challenge 확인)
  □ state parameter 변조 시 에러 발생 확인
  □ 다른 조직 데이터 접근 불가 확인 (RLS)
□ Prod 배포 전 확인
  □ Supabase Prod에 Kakao/Apple Provider 설정 완료
  □ 카카오 디벨로퍼스에 Prod Redirect URI 추가
  □ Apple Developer에 Prod Return URL 추가
  □ Prod 도메인에서 전체 플로우 E2E 테스트
```

---

## 부록 A: 파일 변경 목록

| 파일 | 작업 |
|------|------|
| `src/app/login/page.tsx` | **전면 재작성** |
| `src/app/auth/callback/route.ts` | **신규 생성** |
| `src/app/signup/page.tsx` | **신규 생성** |
| `src/app/onboarding/page.tsx` | **신규 생성** (프로필 보완 입력) |
| `src/lib/auth-context.tsx` | **확장** (profile, org, master 등) |
| `src/middleware.ts` | **전면 재작성** |
| `src/app/[slug]/my/account/page.tsx` | **신규 생성** (계정 연동/이메일 변경) |
| `src/components/HomeClient.tsx` | **수정** (전환 유도 배너 추가) |
| DB: `handle_new_user()` | **수정** (SNS 가입 대응) |

## 부록 B: 비용 요약

| 항목 | 비용 | 주기 |
|------|------|------|
| Apple Developer Program | $99 (약 13만원) | 연간 |
| 카카오 디벨로퍼스 | 무료 | - |
| Supabase Auth (프로 플랜 기준) | Supabase 구독에 포함 | - |

## 부록 C: 타임라인 추정

| 단계 | 예상 소요 | 비고 |
|------|----------|------|
| 사전 준비 (카카오/Apple 설정) | 2~5일 | Apple 심사 대기 포함 |
| DB 변경 (handle_new_user 등) | 0.5일 | |
| 코드 구현 (로그인/콜백/미들웨어) | 2~3일 | |
| AuthContext 확장 | 1일 | |
| 테스트 (Dev) | 2~3일 | |
| Prod 설정 + 배포 | 1일 | |
| 마이그레이션 기능 (계정 연동 등) | 1~2일 | SNS 안정화 이후 |
| **합계** | **약 10~15일** | |

> 이 타임라인은 DB 스키마 변경(organizations 등)이 별도 문서에서 먼저 처리된다는 전제이다. 인증 전환은 organizations 테이블이 있어야 /auth/callback의 조직 라우팅이 동작하므로, DB 마이그레이션과 병행 또는 직후에 진행해야 한다.
