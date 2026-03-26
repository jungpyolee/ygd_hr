# 03. 프론트엔드 전환 상세 구현 계획

> **작성일**: 2026-03-25
> **대상 브랜치**: dev
> **전제**: `multi-tenant-saas-blueprint.md` v3 의사결정 확정 기준
> **기술 스택**: Next.js App Router, React 19, TypeScript, Tailwind v4, shadcn/ui, Supabase SSR

---

## 목차

1. [디렉토리 구조 변경 계획](#1-디렉토리-구조-변경-계획)
2. [라우팅 전환 상세](#2-라우팅-전환-상세)
3. [AuthContext 확장 상세 코드](#3-authcontext-확장-상세-코드)
4. [컴포넌트별 변경 목록](#4-컴포넌트별-변경-목록)
5. [신규 페이지 설계](#5-신규-페이지-설계)
6. [공통 패턴 (org_id 필터 훅)](#6-공통-패턴-org_id-필터-훅)
7. [BusinessSwitcher 컴포넌트 설계](#7-businessswitcher-컴포넌트-설계)
8. [CreditCardModal 설계](#8-creditcardmodal-설계)
9. [토스 UI/UX 가이드라인 적용 포인트](#9-토스-uiux-가이드라인-적용-포인트)
10. [체크리스트](#10-체크리스트)

---

## 1. 디렉토리 구조 변경 계획

### 1-1. 현재 구조

```
src/app/
  layout.tsx                        ← RootLayout (Providers, BottomNav, Toaster)
  page.tsx                          ← 홈 (Server Component → HomeClient)
  providers.tsx                     ← SWRConfig + AuthProvider
  loading.tsx
  globals.css
  manifest.ts
  sw.ts
  login/page.tsx                    ← @ygd.com 로그인
  calendar/page.tsx                 ← 직원 스케줄
  store/page.tsx                    ← 공지/레시피
  my/page.tsx                       ← 마이페이지
  attendances/page.tsx              ← 근무 기록
  credit-history/page.tsx           ← 크레딧 이력
  announcements/page.tsx            ← 공지 목록
  announcements/[id]/page.tsx       ← 공지 상세
  recipes/page.tsx                  ← 레시피 목록 (직원)
  recipes/[id]/page.tsx             ← 레시피 상세
  recipes/[id]/edit/page.tsx        ← 레시피 수정
  recipes/new/page.tsx              ← 레시피 작성
  guide/page.tsx + layout.tsx       ← 이용가이드
  game/page.tsx                     ← 미니게임
  admin/
    layout.tsx                      ← AdminLayout (사이드바, 알림, 모바일메뉴)
    page.tsx                        ← 대시보드
    employees/page.tsx
    attendance/page.tsx
    calendar/page.tsx
    calendar/events/page.tsx
    schedules/substitutes/page.tsx
    recipes/page.tsx
    recipes/[id]/edit/page.tsx
    recipes/new/page.tsx
    recipes/categories/page.tsx
    announcements/page.tsx
    announcements/new/page.tsx
    announcements/[id]/edit/page.tsx
    checklists/page.tsx
    overtime/page.tsx
    stats/page.tsx
    settings/page.tsx
  api/
    cron/daily-settlement/route.ts
    log-error/route.ts
    push/subscribe/route.ts
    push/preferences/route.ts
```

### 1-2. 목표 구조

```
src/app/
  layout.tsx                        ← RootLayout (전역 — Providers만)
  providers.tsx                     ← SWRConfig + AuthProvider(확장) + OrgProvider
  globals.css
  manifest.ts
  sw.ts
  loading.tsx

  ─── 인증/온보딩 (slug 없음) ───
  login/page.tsx                    ← 전면 재작성 (이메일 + 카카오 + Apple)
  signup/page.tsx                   ← [신규] 이메일 회원가입
  auth/callback/route.ts            ← [신규] OAuth 콜백
  create-organization/page.tsx      ← [신규] 사장님 온보딩 퍼널
  join/page.tsx                     ← [신규] 초대 수락
  select-organization/page.tsx      ← [신규] 다중 소속 선택

  ─── 멀티테넌트 (slug 기반) ───
  [slug]/
    layout.tsx                      ← [신규] OrgLayout (slug 검증 + BottomNav)
    page.tsx                        ← 이동: 홈
    calendar/page.tsx               ← 이동
    store/page.tsx                  ← 이동
    my/page.tsx                     ← 이동
    attendances/page.tsx            ← 이동
    credit-history/
      page.tsx                      ← 이동
      CreditHistoryClient.tsx       ← 이동
    announcements/
      page.tsx                      ← 이동
      [id]/page.tsx                 ← 이동
    recipes/
      page.tsx                      ← 이동
      [id]/page.tsx                 ← 이동
      [id]/edit/page.tsx            ← 이동
      new/page.tsx                  ← 이동
    guide/
      page.tsx                      ← 이동
      layout.tsx                    ← 이동
    game/page.tsx                   ← 이동
    admin/
      layout.tsx                    ← 이동 + 수정 (slug 인식)
      page.tsx                      ← 이동 + 수정 (org_id 필터)
      employees/page.tsx            ← 이동 + 수정 (terminate + 초대)
      attendance/page.tsx           ← 이동 + 수정
      calendar/page.tsx             ← 이동 + 수정
      calendar/events/page.tsx      ← 이동 + 수정
      schedules/substitutes/page.tsx ← 이동 + 수정
      recipes/**                    ← 이동 + 수정
      announcements/**              ← 이동 + 수정
      checklists/page.tsx           ← 이동 + 수정
      overtime/page.tsx             ← 이동 + 수정
      stats/page.tsx                ← 이동 + 수정
      settings/page.tsx             ← 이동 + 수정
      payroll/page.tsx              ← [신규] 급여 정산
      team/page.tsx                 ← [신규] 팀/초대 관리
      organization/page.tsx         ← [신규] 조직 설정

  ─── master (시스템 관리) ───
  master/
    layout.tsx                      ← [신규] MasterLayout
    page.tsx                        ← [신규] 전체 현황
    organizations/
      page.tsx                      ← [신규] 조직 관리
      [id]/page.tsx                 ← [신규] 조직 상세
    users/page.tsx                  ← [신규] 사용자 관리
    credits/page.tsx                ← [신규] 크레딧 규칙/통계
    system/page.tsx                 ← [신규] 시스템 설정

  ─── API (변경 없이 유지되는 것 + 수정) ───
  api/
    cron/daily-settlement/route.ts  ← 수정 (조직별 루프)
    log-error/route.ts              ← 유지
    push/subscribe/route.ts         ← 유지
    push/preferences/route.ts       ← 유지
```

### 1-3. 파일 이동 순서 (의존성 기반)

아래 순서를 반드시 지켜야 한다. 이전 단계의 기반 코드가 완성되어야 다음 단계의 파일이 정상 빌드된다.

```
[Phase A] 기반 코드 (다른 모든 파일이 의존)
  1. src/types/organization.ts          신규 타입 정의
  2. src/lib/auth-context.tsx            확장 (currentOrg, switchOrg 등)
  3. src/lib/hooks/useOrg.ts             신규 org_id 접근 훅
  4. src/lib/hooks/useOrgFilter.ts       신규 org_id 필터 훅
  5. src/middleware.ts                   전면 재작성

[Phase B] 루트 레이아웃 수정
  6. src/app/layout.tsx                  BottomNav 제거 (slug 레이아웃으로 이동)
  7. src/app/providers.tsx               OrgProvider 추가

[Phase C] [slug] 디렉토리 뼈대
  8. src/app/[slug]/layout.tsx           신규 — slug 검증 + BottomNav 렌더
  9. src/components/BottomNav.tsx         수정 — slug 동적 경로
  10. src/components/BusinessSwitcher.tsx  신규

[Phase D] 직원 페이지 이동 (6개)
  11. src/app/page.tsx → src/app/[slug]/page.tsx
  12. src/app/calendar/page.tsx → src/app/[slug]/calendar/page.tsx
  13. src/app/store/page.tsx → src/app/[slug]/store/page.tsx
  14. src/app/my/page.tsx → src/app/[slug]/my/page.tsx
  15. src/app/attendances/page.tsx → src/app/[slug]/attendances/page.tsx
  16. src/app/credit-history/ → src/app/[slug]/credit-history/

[Phase E] 직원 서브페이지 이동 (5개)
  17. src/app/announcements/ → src/app/[slug]/announcements/
  18. src/app/recipes/ → src/app/[slug]/recipes/
  19. src/app/guide/ → src/app/[slug]/guide/
  20. src/app/game/ → src/app/[slug]/game/

[Phase F] 어드민 이동 (전체 admin 디렉토리)
  21. src/app/admin/ → src/app/[slug]/admin/
  22. admin/layout.tsx 수정 (slug, org_id)
  23. admin 하위 모든 page.tsx 수정 (org_id 필터)

[Phase G] 신규 페이지 생성
  24. src/app/auth/callback/route.ts
  25. src/app/signup/page.tsx
  26. src/app/create-organization/page.tsx
  27. src/app/join/page.tsx
  28. src/app/select-organization/page.tsx
  29. src/app/[slug]/admin/payroll/page.tsx
  30. src/app/[slug]/admin/team/page.tsx
  31. src/app/[slug]/admin/organization/page.tsx

[Phase H] master 페이지 생성
  32. src/app/master/layout.tsx
  33. src/app/master/page.tsx
  34. src/app/master/organizations/page.tsx
  35. src/app/master/organizations/[id]/page.tsx
  36. src/app/master/users/page.tsx
  37. src/app/master/credits/page.tsx
  38. src/app/master/system/page.tsx

[Phase I] 로그인 재작성 + 원래 경로 제거
  39. src/app/login/page.tsx 전면 재작성
  40. 구 경로 파일 삭제 (Phase D~F에서 이동 완료된 원본)
  41. src/app/page.tsx 리다이렉트 전용으로 변경

[Phase J] 컴포넌트 일괄 수정
  42. 나머지 모든 컴포넌트의 하드코딩된 경로 → slug 기반으로 수정
```

### 1-4. 루트 `page.tsx` 리다이렉트 전용 전환

기존 `/` 에 있던 서버 컴포넌트(HomePage)는 `[slug]/page.tsx`로 이동하고, 루트 `page.tsx`는 리다이렉트 전용으로 교체한다.

```typescript
// src/app/page.tsx (전환 후)
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";

export default async function RootPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("primary_organization_id, role")
    .eq("id", user.id)
    .single();

  // master는 master 대시보드로
  if (profile?.role === "master") redirect("/master");

  if (!profile?.primary_organization_id) redirect("/select-organization");

  const { data: org } = await supabase
    .from("organizations")
    .select("slug")
    .eq("id", profile.primary_organization_id)
    .single();

  if (!org?.slug) redirect("/select-organization");

  redirect(`/${org.slug}`);
}
```

---

## 2. 라우팅 전환 상세

### 2-1. Next.js Dynamic Route 구현

#### `src/app/[slug]/layout.tsx`

```typescript
import { redirect, notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import BottomNav from "@/components/BottomNav";
import { OrgProvider } from "@/lib/org-context";

interface SlugLayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function SlugLayout({ children, params }: SlugLayoutProps) {
  const { slug } = await params;
  const supabase = await createServerSupabase();

  // 1. 인증 확인
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 2. slug → organization 조회
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, subscription_tier, max_employees, max_stores, logo_url")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!org) notFound();

  // 3. 멤버십 확인 (master는 모든 조직 접근 가능 — RLS에서 처리)
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isMaster = profile?.role === "master";

  if (!isMaster) {
    const { data: membership } = await supabase
      .from("organization_memberships")
      .select("id")
      .eq("organization_id", org.id)
      .eq("profile_id", user.id)
      .eq("status", "active")
      .single();

    if (!membership) redirect("/select-organization");
  }

  return (
    <OrgProvider org={org} slug={slug}>
      {children}
      <BottomNav slug={slug} />
    </OrgProvider>
  );
}
```

#### `params` 타입 규칙 (Next.js 15+)

App Router에서 `params`는 `Promise`로 전달된다. 모든 `[slug]` 하위 페이지에서 동일한 패턴을 사용한다.

```typescript
// Server Component
interface PageProps {
  params: Promise<{ slug: string }>;
}
export default async function SomePage({ params }: PageProps) {
  const { slug } = await params;
  // ...
}

// Client Component — slug는 useParams() 또는 context에서 가져옴
"use client";
import { useOrg } from "@/lib/hooks/useOrg";

export default function SomeClientPage() {
  const { slug, orgId } = useOrg();
  // ...
}
```

### 2-2. 기존 경로 -> 새 경로 매핑

| 기존 경로 | 새 경로 | 처리 방법 |
|-----------|---------|-----------|
| `/` | `/[slug]/` | middleware 리다이렉트 |
| `/calendar` | `/[slug]/calendar` | middleware 리다이렉트 |
| `/store` | `/[slug]/store` | middleware 리다이렉트 |
| `/my` | `/[slug]/my` | middleware 리다이렉트 |
| `/attendances` | `/[slug]/attendances` | middleware 리다이렉트 |
| `/credit-history` | `/[slug]/credit-history` | middleware 리다이렉트 |
| `/announcements` | `/[slug]/announcements` | middleware 리다이렉트 |
| `/announcements/[id]` | `/[slug]/announcements/[id]` | middleware 리다이렉트 |
| `/recipes` | `/[slug]/recipes` | middleware 리다이렉트 |
| `/recipes/[id]` | `/[slug]/recipes/[id]` | middleware 리다이렉트 |
| `/guide` | `/[slug]/guide` | middleware 리다이렉트 |
| `/game` | `/[slug]/game` | middleware 리다이렉트 |
| `/admin` | `/[slug]/admin` | middleware 리다이렉트 |
| `/admin/**` | `/[slug]/admin/**` | middleware 리다이렉트 |
| `/login` | `/login` | 유지 (인증 전이므로 slug 없음) |

### 2-3. middleware.ts 전면 재작성

```typescript
// src/middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// 인증 불필요 경로
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/auth/callback",
  "/join",
  "/api/",
];

// slug 없이 접근 가능한 인증 경로
const AUTH_NO_SLUG_PATHS = [
  "/create-organization",
  "/select-organization",
];

// 레거시 직원 경로 (slug 없이 접근한 경우 리다이렉트)
const LEGACY_EMPLOYEE_PATHS = [
  "/calendar",
  "/store",
  "/my",
  "/attendances",
  "/credit-history",
  "/announcements",
  "/recipes",
  "/guide",
  "/game",
];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const { pathname } = request.nextUrl;

  // --- Static/API 패스 스루 ---
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return supabaseResponse;
  }

  // --- Supabase 세션 갱신 ---
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // --- 미인증 → /login ---
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // --- 인증됐지만 slug 불필요 경로 ---
  if (AUTH_NO_SLUG_PATHS.some((p) => pathname.startsWith(p))) {
    return supabaseResponse;
  }

  // --- 프로필 조회 (역할 + primary org) ---
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, primary_organization_id")
    .eq("id", user.id)
    .single();

  // --- /master/** → master 전용 ---
  if (pathname.startsWith("/master")) {
    if (profile?.role !== "master") {
      return NextResponse.redirect(new URL("/select-organization", request.url));
    }
    return supabaseResponse;
  }

  // --- 레거시 경로 리다이렉트 (/, /calendar 등) ---
  if (pathname === "/" || LEGACY_EMPLOYEE_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    if (!profile?.primary_organization_id) {
      return NextResponse.redirect(new URL("/select-organization", request.url));
    }
    const { data: org } = await supabase
      .from("organizations")
      .select("slug")
      .eq("id", profile.primary_organization_id)
      .single();

    if (!org?.slug) {
      return NextResponse.redirect(new URL("/select-organization", request.url));
    }

    // 경로 치환: /calendar → /[slug]/calendar
    const newPath = pathname === "/" ? `/${org.slug}` : `/${org.slug}${pathname}`;
    return NextResponse.redirect(new URL(newPath, request.url));
  }

  // --- /[slug]/** → slug 검증 ---
  const slugMatch = pathname.match(/^\/([a-z0-9-]+)(\/.*)?$/);
  if (slugMatch) {
    const slug = slugMatch[1];

    // 예약어 체크 (login, signup 등은 이미 위에서 처리됨)
    const RESERVED = ["_next", "api", "favicon.ico", "manifest", "sw.js", "icons"];
    if (RESERVED.includes(slug)) return supabaseResponse;

    // slug로 organization 조회
    const { data: org } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .eq("is_active", true)
      .single();

    if (!org) {
      // 존재하지 않는 slug → 404 또는 select-organization
      return NextResponse.redirect(new URL("/select-organization", request.url));
    }

    // 멤버십 확인 (master는 우회)
    if (profile?.role !== "master") {
      const { data: membership } = await supabase
        .from("organization_memberships")
        .select("id")
        .eq("organization_id", org.id)
        .eq("profile_id", user.id)
        .eq("status", "active")
        .single();

      if (!membership) {
        return NextResponse.redirect(new URL("/select-organization", request.url));
      }
    }

    // /[slug]/admin/** → owner 확인
    const adminPath = `/${slug}/admin`;
    if (pathname.startsWith(adminPath)) {
      if (profile?.role !== "master") {
        const { data: adminRecord } = await supabase
          .from("organization_admins")
          .select("id")
          .eq("organization_id", org.id)
          .eq("profile_id", user.id)
          .single();

        if (!adminRecord) {
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

### 2-4. middleware 성능 고려사항

middleware에서 DB 쿼리가 추가되므로 성능에 주의해야 한다.

- **캐싱**: Supabase RLS가 적용된 쿼리이므로 Edge에서 캐싱 불가. 하지만 쿼리 자체가 `single()` + PK/인덱스 기반이라 1~5ms 수준
- **쿼리 최소화**: profile + org + membership 을 최대 3회 쿼리. `/login`, `/api/` 등은 쿼리 0회
- **향후 최적화**: JWT custom claim에 `primary_org_slug`를 넣어 DB 쿼리 1회로 줄일 수 있음 (Phase 8에서 검토)

---

## 3. AuthContext 확장 상세 코드

### 3-1. 타입 정의

```typescript
// src/types/organization.ts
export interface Organization {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  business_type: string | null;
  business_reg_number: string | null;
  logo_url: string | null;
  subscription_tier: "free" | "starter" | "pro";
  max_employees: number;
  max_stores: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMembership {
  id: string;
  organization_id: string;
  profile_id: string;
  status: "active" | "terminated" | "suspended";
  join_date: string;
}

export interface UserOrg {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  role: "owner" | "employee";  // 해당 조직에서의 역할
}

export type GlobalRole = "master" | "owner" | "employee";
```

### 3-2. 확장된 AuthContext

```typescript
// src/lib/auth-context.tsx
"use client";

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import type { UserOrg, GlobalRole } from "@/types/organization";

interface ProfileData {
  id: string;
  role: GlobalRole;
  name: string;
  credit_score: number;
  primary_organization_id: string | null;
}

interface AuthContextValue {
  // 기존
  user: User | null;
  isLoading: boolean;

  // 신규
  profile: ProfileData | null;
  isMaster: boolean;
  userOrgs: UserOrg[];
  isOrgsLoading: boolean;

  // 메서드
  refreshProfile: () => Promise<void>;
  refreshOrgs: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  profile: null,
  isMaster: false,
  userOrgs: [],
  isOrgsLoading: true,
  refreshProfile: async () => {},
  refreshOrgs: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [userOrgs, setUserOrgs] = useState<UserOrg[]>([]);
  const [isOrgsLoading, setIsOrgsLoading] = useState(true);

  const supabase = useMemo(() => createClient(), []);

  // 프로필 fetch
  const refreshProfile = useCallback(async () => {
    if (!user) { setProfile(null); return; }

    const { data } = await supabase
      .from("profiles")
      .select("id, role, name, credit_score, primary_organization_id")
      .eq("id", user.id)
      .single();

    setProfile(data as ProfileData | null);
  }, [user, supabase]);

  // 소속 조직 목록 fetch
  const refreshOrgs = useCallback(async () => {
    if (!user) { setUserOrgs([]); setIsOrgsLoading(false); return; }

    setIsOrgsLoading(true);

    // 멤버십 기반 조직 조회
    const { data: memberships } = await supabase
      .from("organization_memberships")
      .select(`
        organization_id,
        organizations (id, slug, name, logo_url)
      `)
      .eq("profile_id", user.id)
      .eq("status", "active");

    // admin 여부 조회
    const { data: adminRecords } = await supabase
      .from("organization_admins")
      .select("organization_id")
      .eq("profile_id", user.id);

    const adminOrgIds = new Set(adminRecords?.map((a) => a.organization_id) ?? []);

    const orgs: UserOrg[] = (memberships ?? [])
      .filter((m: any) => m.organizations)
      .map((m: any) => ({
        id: m.organizations.id,
        slug: m.organizations.slug,
        name: m.organizations.name,
        logo_url: m.organizations.logo_url,
        role: adminOrgIds.has(m.organizations.id) ? "owner" as const : "employee" as const,
      }));

    setUserOrgs(orgs);
    setIsOrgsLoading(false);
  }, [user, supabase]);

  // 초기 인증 + 프로필 로드
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  // user 변경 시 프로필 + 조직 목록 갱신
  useEffect(() => {
    if (isLoading) return;
    refreshProfile();
    refreshOrgs();
  }, [user, isLoading, refreshProfile, refreshOrgs]);

  const isMaster = profile?.role === "master";

  return (
    <AuthContext.Provider value={{
      user, isLoading,
      profile, isMaster,
      userOrgs, isOrgsLoading,
      refreshProfile, refreshOrgs,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

### 3-3. OrgContext (현재 선택된 조직)

AuthContext와 분리하여 `[slug]/layout.tsx`에서 주입한다. slug 하위 전체에서 `useOrg()`로 접근한다.

```typescript
// src/lib/org-context.tsx
"use client";

import { createContext, useContext } from "react";

interface OrgContextValue {
  orgId: string;
  slug: string;
  orgName: string;
  logoUrl: string | null;
  subscriptionTier: string;
  maxEmployees: number;
  maxStores: number;
}

const OrgContext = createContext<OrgContextValue | null>(null);

interface OrgProviderProps {
  org: {
    id: string;
    name: string;
    slug: string;
    subscription_tier: string;
    max_employees: number;
    max_stores: number;
    logo_url: string | null;
  };
  slug: string;
  children: React.ReactNode;
}

export function OrgProvider({ org, slug, children }: OrgProviderProps) {
  return (
    <OrgContext.Provider value={{
      orgId: org.id,
      slug,
      orgName: org.name,
      logoUrl: org.logo_url,
      subscriptionTier: org.subscription_tier,
      maxEmployees: org.max_employees,
      maxStores: org.max_stores,
    }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used within <OrgProvider>");
  return ctx;
}
```

### 3-4. OrgAdmin Context (admin 전용)

```typescript
// src/lib/org-admin-context.tsx
"use client";

import { createContext, useContext } from "react";

interface OrgAdminContextValue {
  isOrgAdmin: boolean;
}

const OrgAdminContext = createContext<OrgAdminContextValue>({ isOrgAdmin: false });

export function OrgAdminProvider({ isOrgAdmin, children }: { isOrgAdmin: boolean; children: React.ReactNode }) {
  return (
    <OrgAdminContext.Provider value={{ isOrgAdmin }}>
      {children}
    </OrgAdminContext.Provider>
  );
}

export const useOrgAdmin = () => useContext(OrgAdminContext);
```

---

## 4. 컴포넌트별 변경 목록

### 4-1. 전면 재작성 (3개)

| 파일 | 변경 내용 |
|------|-----------|
| `src/app/login/page.tsx` | 기존 `@ygd.com` 패턴 제거. 이메일+비밀번호, 카카오 OAuth, Apple OAuth 3가지 로그인 방식. 성공 시 `select-organization` 또는 `[slug]/` 리다이렉트 |
| `src/middleware.ts` | 섹션 2-3 전체 참조 |
| `src/lib/auth-context.tsx` | 섹션 3-2 전체 참조 |

### 4-2. 경로 이동 + org_id 필터 추가 (직원 페이지 — 11개)

모든 직원 페이지의 공통 변경 패턴:

```
1. 파일 위치: src/app/{경로} → src/app/[slug]/{경로}
2. Server Component: supabase 쿼리에 .eq("organization_id", org.id) 추가
3. Client Component: useOrg()에서 orgId를 가져와 쿼리 필터에 사용
4. 내부 router.push/Link의 href: "/경로" → `/${slug}/경로`
```

| 파일 | 추가 변경 사항 |
|------|---------------|
| `[slug]/page.tsx` (홈) | `getStores()`에 org_id 필터. `schedule_slots` 쿼리에 org_id 필터 |
| `[slug]/calendar/page.tsx` | SWR key에 orgId 포함. `schedule_slots`, `weekly_schedules` 쿼리에 org_id 필터 |
| `[slug]/store/page.tsx` | `announcements`, `recipe_categories`, `recipe_items` 쿼리에 org_id 필터 |
| `[slug]/my/page.tsx` | `profiles` 쿼리는 변경 없음 (전역). 메뉴 항목 href에 slug 접두어. `router.push("/admin")` → `router.push(\`/${slug}/admin\`)`. 급여 섹션 추가 (payroll_entries 조회) |
| `[slug]/attendances/page.tsx` | `attendance_logs` 쿼리에 org_id 필터 |
| `[slug]/credit-history/page.tsx` | `attendance_credits` 쿼리는 전역 합산이므로 필터 불필요. 단, 각 이벤트의 `organization_id`를 표시하여 "어디서 발생했는지" 보여줌 |
| `[slug]/announcements/page.tsx` | `announcements` 쿼리에 org_id 필터 |
| `[slug]/announcements/[id]/page.tsx` | 쿼리에 org_id 필터 (다른 조직 공지 접근 차단) |
| `[slug]/recipes/**` (4개 파일) | `recipe_categories`, `recipe_items` 등 쿼리에 org_id 필터 |
| `[slug]/guide/page.tsx` | 경로 변경만 (org_id 무관 — 앱 가이드 컨텐츠) |
| `[slug]/game/page.tsx` | 경로 변경만 (org_id 무관 — 미니게임) |

### 4-3. 경로 이동 + org_id 필터 추가 (어드민 페이지 — 16개)

| 파일 | 추가 변경 사항 |
|------|---------------|
| `[slug]/admin/layout.tsx` | `role === "admin"` → `organization_admins` 테이블 조회로 변경. 사이드바 메뉴 경로에 slug 접두어. Realtime 구독에 `filter: "organization_id=eq.{orgId}"` 추가. 타이틀 "연경당 HR Admin" → `${orgName} Admin` 동적 변경. 메뉴에 "팀/초대", "급여 정산", "조직 설정" 추가 |
| `[slug]/admin/page.tsx` (대시보드) | `useOrg()`에서 orgId 가져오기. 모든 SWR fetch에 org_id 필터. `WeekScheduleStrip`, `ActionRequiredBanner`, `DashboardActivityFeed` 등 하위 컴포넌트에 orgId prop 전달 |
| `[slug]/admin/employees/page.tsx` | 기존 `delete_user_admin()` → `terminate_membership()` 교체. 초대 버튼/링크 UI 추가 (`/[slug]/admin/team`으로 이동). `profiles` 대신 `organization_memberships JOIN profiles` 쿼리 |
| `[slug]/admin/attendance/page.tsx` | `attendance_logs` 쿼리에 org_id 필터 |
| `[slug]/admin/calendar/page.tsx` | `weekly_schedules`, `schedule_slots` 쿼리에 org_id 필터 |
| `[slug]/admin/calendar/events/page.tsx` | `company_events` 쿼리에 org_id 필터 |
| `[slug]/admin/schedules/substitutes/page.tsx` | `substitute_requests` 쿼리에 org_id 필터 |
| `[slug]/admin/recipes/page.tsx` | `recipe_categories`, `recipe_items` 쿼리에 org_id 필터 |
| `[slug]/admin/recipes/new/page.tsx` | insert 시 organization_id 포함 |
| `[slug]/admin/recipes/[id]/edit/page.tsx` | 수정 쿼리에 org_id 검증 |
| `[slug]/admin/recipes/categories/page.tsx` | `recipe_categories` 쿼리에 org_id 필터 |
| `[slug]/admin/announcements/page.tsx` | `announcements` 쿼리에 org_id 필터 |
| `[slug]/admin/announcements/new/page.tsx` | insert 시 organization_id 포함 |
| `[slug]/admin/announcements/[id]/edit/page.tsx` | 수정 쿼리에 org_id 검증 |
| `[slug]/admin/checklists/page.tsx` | `checklists` 관련 쿼리에 org_id 필터 |
| `[slug]/admin/overtime/page.tsx` | `overtime_requests` 쿼리에 org_id 필터 |
| `[slug]/admin/stats/page.tsx` | 모든 통계 쿼리에 org_id 필터 |
| `[slug]/admin/settings/page.tsx` | `stores` 쿼리에 org_id 필터 |

### 4-4. 공유 컴포넌트 수정 (19개)

| 파일 | 변경 내용 |
|------|-----------|
| `BottomNav.tsx` | `slug` prop 추가. `tabs` 배열의 href를 `/${slug}/`, `/${slug}/calendar` 등으로 동적 생성. `SHOW_PATHS` 를 slug 기반으로 매칭 |
| `HomeClient.tsx` | `useOrg()` 추가. 모든 `router.push("/경로")` → `router.push(\`/${slug}/경로\`)`로 변경. 알림 클릭 딥링크도 slug 포함. `getStores()` 관련 SWR에 org_id 필터. BusinessSwitcher 통합 |
| `AttendanceCard.tsx` | `useOrg()` 추가. 출퇴근 기록 insert 시 `organization_id` 포함. `sendNotification()`에 `organization_id` 전달. `processCheckinCredit()`에 `organization_id` 전달 |
| `TierCard.tsx` | `router.push("/credit-history")` → `router.push(\`/${slug}/credit-history\`)`. slug는 `useOrg()`에서 |
| `AnnouncementBanner.tsx` | `router.push("/announcements")` → slug 포함 |
| `OnboardingFunnel.tsx` | 특별한 경로 변경 없음 (부모 페이지에서 호출). `sendNotification()`에 `organization_id` 추가 |
| `StoreDistanceList.tsx` | 변경 없음 (경로 참조 없음, 데이터는 부모에서 전달) |
| `StoreSelectorSheet.tsx` | 변경 없음 |
| `WeeklyScheduleCard.tsx` | 변경 없음 |
| `CreditPolicyModal.tsx` | 변경 없음 (전역 규칙 표시) |
| `MyInfoModal.tsx` | 변경 없음 |
| `ChecklistSheet.tsx` | 변경 없음 |
| `admin/AdminQuickNav.tsx` | `tiles`의 `href` 값에 slug 접두어. `useOrg()` 추가 |
| `admin/ActionRequiredBanner.tsx` | `items`의 `href` 값에 slug 접두어. `useOrg()` 추가 |
| `admin/DashboardActivityFeed.tsx` | `getNotiRoute()` 반환값에 slug 접두어. `notifications` 쿼리에 org_id 필터. `useOrg()` 추가 |
| `admin/DashboardKPICards.tsx` | SWR fetch에 org_id 필터 |
| `admin/TeamCreditOverview.tsx` | `router.push("/admin/stats")` → slug 포함. SWR fetch에 org_id 필터 |
| `admin/WeekScheduleStrip.tsx` | `router.push(\`/admin/calendar?date=\`)` → slug 포함. SWR fetch에 org_id 필터 |
| `announcement/AnnouncementForm.tsx` | `router.push("/admin/announcements")` → slug 포함. insert/update 시 organization_id 포함 |
| `recipe/RecipeForm.tsx` | `redirectAfterSave` 경로에 slug 포함. insert/update 시 organization_id 포함 |

### 4-5. 라이브러리/훅 수정 (7개)

| 파일 | 변경 내용 |
|------|-----------|
| `lib/notifications.ts` | `CreateNotificationParams`에 `organization_id` 필드 추가. 모든 `sendNotification()` 호출부에서 org_id 전달 필수 |
| `lib/credit-engine.ts` | `processCheckinCredit()`에 `organization_id` 파라미터 추가 (점수는 전역 합산이지만 출처 기록). `requireAdmin()` → `requireOrgAdmin(orgId)` 로 변경 |
| `lib/push-server.ts` | push 알림 대상 필터에 org_id 추가 |
| `lib/hooks/useWorkplaces.ts` | `fetchWorkplaces()`에 `organization_id` 파라미터 추가. SWR key에 orgId 포함 |
| `lib/hooks/useGeolocation.ts` | 변경 없음 (위치 정보는 조직 무관) |
| `lib/tier-utils.ts` | 변경 없음 (전역 규칙) |
| `lib/logError.ts` | 변경 없음 |

### 4-6. API 라우트 수정 (1개)

| 파일 | 변경 내용 |
|------|-----------|
| `api/cron/daily-settlement/route.ts` | `processSettlementCron()`이 조직별 루프를 돌도록 변경. `organizations` 테이블에서 active 목록 조회 → 각 org_id별로 정산 |

---

## 5. 신규 페이지 설계

### 5-1. `/create-organization` — 사장님 온보딩 퍼널

**진입 조건**: 로그인 후 소속 조직이 0개인 사용자가 "사업장 만들기" 선택 시

**퍼널 구조** (4단계):

```
Step 1: 사업장 정보
  ├── 사업장 이름 (필수, 2~20자)
  ├── 업종 선택 (카페/음식점/공장/케이터링/기타) — 칩 형태
  └── 사업자등록번호 (선택, 나중에 입력 가능)

Step 2: URL 설정 (slug)
  ├── 자동 제안: 사업장 이름 → romanize (예: "연경당 카페" → "yeonggyeongdang-cafe")
  ├── 직접 입력 가능 (영문 소문자, 숫자, 하이픈만)
  ├── 실시간 중복 체크 (debounce 300ms)
  └── 프리뷰: "chulchek.app/yeonggyeongdang-cafe"

Step 3: 첫 매장 등록
  ├── 매장 이름 (필수)
  ├── 위치 설정 (지도 또는 주소 검색)
  ├── GPS 출퇴근 사용 여부 토글
  └── "나중에 설정할게요" 스킵 가능

Step 4: 완료
  ├── 축하 화면 (간단한 Lottie 또는 CSS 애니메이션)
  ├── "직원을 초대해보세요" → /[slug]/admin/team 이동
  └── "먼저 둘러볼게요" → /[slug]/admin 이동
```

**DB 작업** (Step 4 전송 시):
1. `organizations` INSERT
2. `organization_memberships` INSERT (owner 본인)
3. `organization_admins` INSERT (owner)
4. `profiles.primary_organization_id` UPDATE
5. `profiles.role` UPDATE → `owner` (기존 `employee`인 경우)
6. (Step 3 입력 시) `stores` INSERT

**UI 패턴**: 토스 스타일 퍼널 — 상단 progress bar(4단계), 하단 고정 "다음" 버튼, 뒤로가기 지원

### 5-2. `/join` — 초대 수락

**진입 경로**:
- URL: `/join?code=ABC123&org=yeonggyeongdang`
- 또는 직접 코드 입력

**플로우**:

```
1. 코드 검증
  ├── URL에 code 파라미터 → 자동 검증
  ├── 없으면 코드 입력 UI (6자리 + 자동 대문자 변환)
  ├── 유효 → 조직 정보 표시 ("연경당 카페에서 초대했어요!")
  └── 무효/만료 → 에러 메시지 ("만료되었거나 유효하지 않은 초대 코드예요")

2. 미로그인 → 로그인/가입 유도
  ├── 가입 후 자동으로 조직 가입 처리
  └── code를 세션/쿠키에 임시 저장

3. 로그인됨 → 즉시 가입
  ├── organization_memberships INSERT
  ├── tenant_invites.use_count += 1
  ├── profiles.primary_organization_id 설정 (첫 조직이면)
  └── /[slug]/ 이동
```

**UI**: 카드 형태로 조직 정보 표시 + "참여하기" 버튼. 토스 스타일 깔끔한 1페이지.

### 5-3. `/select-organization` — 조직 선택

**진입 조건**: 다중 소속 사용자가 `/` 접근 시, 또는 조직 전환 시

**UI 구조**:

```
상단: "어떤 사업장에서 시작할까요?"

카드 목록:
  ┌──────────────────────────┐
  │  [로고] 연경당 카페      │
  │  역할: 사장님             │
  │  직원 8명                │
  └──────────────────────────┘
  ┌──────────────────────────┐
  │  [로고] 홍길동 우육면    │
  │  역할: 직원              │
  │  직원 12명               │
  └──────────────────────────┘

하단:
  [+ 새 사업장 만들기] → /create-organization
```

**카드 클릭 시**:
1. `profiles.primary_organization_id` UPDATE
2. `/${slug}/` 이동

### 5-4. `/[slug]/admin/payroll` — 급여 정산

**핵심 데이터 소스**: `schedule_slots` (confirmed) 기반 근무시간 + `profiles.hourly_wage` + `profiles.insurance_type`

**UI 구조**:

```
헤더: [2026년 3월] ← →    상태: 초안

필터 바: [전체 직원 ▾]

테이블 (모바일은 카드형):
  ┌──────────────────────────────────────────────────────┐
  │ 이름     │ 근무시간 │ 시급    │ 세전     │ 공제   │ 실수령 │
  ├──────────┼─────────┼────────┼─────────┼───────┼───────┤
  │ 김직원   │ 40h 0m  │ 12,000 │ 480,000 │ 42,936│437,064│
  │ ...      │         │        │         │       │       │
  ├──────────┼─────────┼────────┼─────────┼───────┼───────┤
  │ 합계     │ 96h 0m  │        │1,120,000│ 64,056│1,055,944│
  └──────────────────────────────────────────────────────┘

행 클릭 → 바텀시트: 상세 내역 (근무일별 시간 + 공제 항목별 금액)

하단 고정:
  상태가 'draft' → [급여 확정하기] 버튼
  상태가 'confirmed' → [확정 취소] + [지급 완료 처리] 버튼
```

**계산 로직** (프론트에서 미리보기, 확정 시 DB 저장):

```typescript
function calculatePayroll(scheduledMinutes: number, hourlyWage: number, insuranceType: string) {
  const grossSalary = Math.round((scheduledMinutes / 60) * hourlyWage);

  let deductionRate: number;
  if (insuranceType === "2대보험") {
    deductionRate = 0.08945; // 국민연금 4.5% + 건강보험 3.545% + 고용보험 0.9%
  } else {
    deductionRate = 0.033; // 소득세 3.0% + 지방소득세 0.3%
  }

  const deductionAmount = Math.round(grossSalary * deductionRate);
  const netSalary = grossSalary - deductionAmount;

  return { grossSalary, deductionAmount, netSalary };
}
```

### 5-5. `/[slug]/admin/team` — 팀/초대 관리

**UI 구조**:

```
상단: "팀 관리"

━━ 초대 섹션 ━━
  [카카오톡으로 초대하기]  → 카카오 공유 API
  [초대 링크 복사하기]     → clipboard
  [초대 코드 보기]         → ABC123 표시 + 복사

  활성 초대 코드 목록:
    ABC123 | 사용 2/무제한 | 3일 남음 | [비활성화]
    T9B4MX | 사용 0/1    | 만료됨   | [삭제]

━━ 멤버 목록 ━━
  [검색 바]

  멤버 카드 (각각):
    [아바타] 김직원
    역할: 직원 | 가입일: 2024.03.15
    [역할 변경 ▾] [내보내기]

  내보내기 클릭 → ConfirmDialog
    "김직원님을 팀에서 내보내시겠어요?"
    "향후 스케줄이 삭제되고 더 이상 접근할 수 없게 돼요."
    [취소] [내보내기]
    → terminate_membership() 호출
```

### 5-6. `/[slug]/admin/organization` — 조직 설정

**UI 구조**:

```
━━ 기본 정보 ━━
  사업장 이름: [입력]
  URL (slug): yeonggyeongdang (변경 불가 — 안내 텍스트)
  업종: [선택]
  사업자등록번호: [입력] (선택)
  로고: [업로드]

━━ 요금제 ━━
  현재: Free (직원 5명, 매장 1개)
  [요금제 변경하기] → 추후 결제 연동

━━ 위험 영역 ━━
  [조직 비활성화] → ConfirmDialog (is_active = false)
```

### 5-7. `/master/**` — 마스터 페이지

#### `/master/` (대시보드)

```
KPI 카드 4개:
  전체 조직 수 | 활성 사용자 수 | 오늘 출퇴근 수 | 이번 달 신규 가입

최근 생성 조직 (5개)
최근 활동 로그 (audit_logs)
시스템 건강 상태 (에러 로그 요약)
```

#### `/master/organizations`

```
검색 + 필터 (업종, 요금제, 활성/비활성)
테이블: 조직명 | slug | 직원수 | 요금제 | 마지막 활동 | [관리]
행 클릭 → /master/organizations/[id]
```

#### `/master/organizations/[id]`

```
조직 상세 정보
[이 조직으로 들어가기] → /[slug]/admin 으로 이동 (master로서 owner 뷰 접근)
멤버 목록
최근 활동
```

#### `/master/users`

```
전체 사용자 검색
테이블: 이름 | 이메일 | 역할 | 소속 조직(들) | 크레딧 | 가입일
```

#### `/master/credits`

```
크레딧 규칙 표시/수정
티어별 인원 분포 차트
전체 크레딧 통계
```

#### `/master/system`

```
시스템 설정 (향후)
에러 로그 뷰어
Cron 실행 이력
```

---

## 6. 공통 패턴 (org_id 필터 훅)

### 6-1. `useOrg()` — 조직 컨텍스트 접근

섹션 3-3에서 정의한 `useOrg()`를 모든 `[slug]/` 하위 클라이언트 컴포넌트에서 사용한다.

```typescript
// 사용 예시
const { orgId, slug } = useOrg();
```

### 6-2. `useOrgQuery()` — org_id 자동 필터 SWR 훅

반복되는 "org_id 필터 + SWR" 패턴을 추상화한다.

```typescript
// src/lib/hooks/useOrgQuery.ts
"use client";

import useSWR, { SWRConfiguration } from "swr";
import { createClient } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";

type QueryBuilder = (
  supabase: ReturnType<typeof createClient>,
  orgId: string
) => PromiseLike<{ data: any; error: any }>;

export function useOrgQuery<T = any>(
  key: string | string[],
  queryFn: QueryBuilder,
  config?: SWRConfiguration
) {
  const { orgId } = useOrg();
  const supabase = createClient();

  const swrKey = orgId
    ? Array.isArray(key) ? [...key, orgId] : [key, orgId]
    : null;

  return useSWR<T>(
    swrKey,
    async () => {
      const { data, error } = await queryFn(supabase, orgId);
      if (error) throw error;
      return data as T;
    },
    { dedupingInterval: 60_000, revalidateOnFocus: false, ...config }
  );
}
```

사용 예시:

```typescript
// 기존 코드
const { data } = useSWR("admin-employees", async () => {
  const supabase = createClient();
  const { data } = await supabase.from("profiles").select("*");
  return data;
});

// 전환 후
const { data } = useOrgQuery<Profile[]>("admin-employees", (supabase, orgId) =>
  supabase
    .from("organization_memberships")
    .select("profiles(*)")
    .eq("organization_id", orgId)
    .eq("status", "active")
);
```

### 6-3. `useOrgNavigation()` — slug 포함 네비게이션 훅

모든 `router.push()`에 slug를 수동으로 붙이는 것은 실수가 잦다. 전용 훅을 만든다.

```typescript
// src/lib/hooks/useOrgNavigation.ts
"use client";

import { useRouter } from "next/navigation";
import { useOrg } from "@/lib/org-context";
import { useCallback } from "react";

export function useOrgNavigation() {
  const router = useRouter();
  const { slug } = useOrg();

  const push = useCallback((path: string) => {
    // path가 /로 시작하면 slug 접두어 추가
    const resolved = path.startsWith("/") ? `/${slug}${path}` : path;
    router.push(resolved);
  }, [router, slug]);

  const replace = useCallback((path: string) => {
    const resolved = path.startsWith("/") ? `/${slug}${path}` : path;
    router.replace(resolved);
  }, [router, slug]);

  /** 절대 경로 생성 (Link href용) */
  const href = useCallback((path: string) => {
    return path.startsWith("/") ? `/${slug}${path}` : path;
  }, [slug]);

  return { push, replace, href, slug };
}
```

사용 예시:

```typescript
// 기존
router.push("/admin/employees");

// 전환 후
const { push } = useOrgNavigation();
push("/admin/employees");  // → /yeonggyeongdang/admin/employees
```

### 6-4. Server Component에서의 org_id 접근 패턴

Server Component는 Context를 쓸 수 없으므로, `params.slug`를 통해 직접 조회한다.

```typescript
// Server Component 공통 패턴
export default async function SomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createServerSupabase();

  // slug → orgId 변환
  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .single();

  if (!org) notFound();

  // org.id로 쿼리
  const { data } = await supabase
    .from("some_table")
    .select("*")
    .eq("organization_id", org.id);

  return <SomeClient data={data} />;
}
```

이 패턴이 반복되므로 유틸 함수로 추출할 수 있다:

```typescript
// src/lib/server-org.ts
import { createServerSupabase } from "@/lib/supabase-server";
import { notFound } from "next/navigation";

export async function getOrgBySlug(slug: string) {
  const supabase = await createServerSupabase();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, subscription_tier, max_employees, max_stores, logo_url")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!org) notFound();
  return { supabase, org };
}
```

---

## 7. BusinessSwitcher 컴포넌트 설계

### 7-1. 용도

다중 소속 사용자가 조직을 전환하는 UI. 다음 위치에 배치:

- `[slug]/layout.tsx` 상단 헤더 (모든 직원 페이지)
- `[slug]/admin/layout.tsx` 사이드바 상단 (어드민)

### 7-2. 트리거 조건

- `userOrgs.length >= 2`일 때만 렌더 (1개 소속이면 숨김)
- master는 항상 표시 (모든 조직 접근 가능)

### 7-3. UI 설계

```
트리거 (헤더 내):
  [로고] 연경당 카페 [ChevronDown]

클릭 시 바텀시트/드롭다운:
  ┌─────────────────────────────────┐
  │  사업장 전환                    │
  │                                 │
  │  ✓ 연경당 카페     사장님      │
  │    홍길동 우육면    직원        │
  │                                 │
  │  ─────────────────────────────  │
  │  [+ 새 사업장 만들기]           │
  │  [조직 선택 페이지로]           │
  └─────────────────────────────────┘
```

### 7-4. 코드 구조

```typescript
// src/components/BusinessSwitcher.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useOrg } from "@/lib/org-context";
import { createClient } from "@/lib/supabase";
import { ChevronDown, Check, Plus, Building2 } from "lucide-react";

export default function BusinessSwitcher() {
  const router = useRouter();
  const { userOrgs, refreshOrgs, isMaster, user } = useAuth();
  const { slug: currentSlug, orgName, logoUrl } = useOrg();
  const [isOpen, setIsOpen] = useState(false);

  // 단일 소속 + master 아니면 숨김
  if (userOrgs.length < 2 && !isMaster) return null;

  const handleSwitch = async (targetSlug: string) => {
    if (targetSlug === currentSlug) {
      setIsOpen(false);
      return;
    }

    const supabase = createClient();

    // primary_organization_id 업데이트
    const targetOrg = userOrgs.find((o) => o.slug === targetSlug);
    if (targetOrg && user) {
      await supabase
        .from("profiles")
        .update({ primary_organization_id: targetOrg.id })
        .eq("id", user.id);
    }

    setIsOpen(false);
    router.push(`/${targetSlug}`);
  };

  return (
    <>
      {/* 트리거 버튼 */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-[#F2F4F6] transition-colors"
      >
        {logoUrl ? (
          <img src={logoUrl} alt="" className="w-6 h-6 rounded-lg object-cover" />
        ) : (
          <Building2 className="w-5 h-5 text-[#8B95A1]" />
        )}
        <span className="text-[15px] font-bold text-[#191F28] max-w-[140px] truncate">
          {orgName}
        </span>
        <ChevronDown className="w-4 h-4 text-[#8B95A1]" />
      </button>

      {/* 바텀시트 */}
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => setIsOpen(false)}
          />
          <div className="relative bg-white rounded-t-[32px] p-6 pt-8 pb-10 animate-in slide-in-from-bottom-full duration-300 shadow-2xl">
            <h2 className="text-[18px] font-bold text-[#191F28] mb-5">사업장 전환</h2>
            <div className="space-y-2">
              {userOrgs.map((org) => (
                <button
                  key={org.id}
                  onClick={() => handleSwitch(org.slug)}
                  className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl transition-colors ${
                    org.slug === currentSlug
                      ? "bg-[#E8F3FF] border border-[#3182F6]/20"
                      : "border border-slate-100 hover:bg-[#F2F4F6]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {org.logo_url ? (
                      <img src={org.logo_url} alt="" className="w-10 h-10 rounded-xl object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-[#F2F4F6] flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-[#8B95A1]" />
                      </div>
                    )}
                    <div className="text-left">
                      <p className="text-[15px] font-bold text-[#191F28]">{org.name}</p>
                      <p className="text-[12px] text-[#8B95A1]">
                        {org.role === "owner" ? "사장님" : "직원"}
                      </p>
                    </div>
                  </div>
                  {org.slug === currentSlug && (
                    <Check className="w-5 h-5 text-[#3182F6]" />
                  )}
                </button>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100">
              <button
                onClick={() => { setIsOpen(false); router.push("/create-organization"); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[#3182F6] hover:bg-[#F2F4F6] transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span className="text-[14px] font-bold">새 사업장 만들기</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

---

## 8. CreditCardModal 설계

### 8-1. 용도

마이페이지(`/[slug]/my`) 또는 크레딧 이력 페이지에서 "내 근태 카드 보기" 버튼을 누르면 열리는 모달. 카드 이미지를 캡처/공유/프린트할 수 있다.

### 8-2. 필요 라이브러리

```bash
npm install html2canvas
```

카카오 공유 SDK는 이미 Kakao JavaScript SDK를 로드하는 구조가 필요하다 (layout.tsx에 Script 태그 추가).

### 8-3. CreditCard 컴포넌트 (순수 렌더링)

```typescript
// src/components/CreditCard.tsx
"use client";

import { forwardRef } from "react";
import TierBadge from "@/components/TierBadge";
import { getTier } from "@/lib/tier-utils";
import { format } from "date-fns";

interface CreditCardProps {
  name: string;
  creditScore: number;
  totalWorkDays: number;
  onTimeRate: number;
  longestStreak: number;
  absentCount: number;
  activityPeriod: string;
  workHistory: Array<{ orgName: string; period: string }>;
}

const CreditCard = forwardRef<HTMLDivElement, CreditCardProps>(
  ({ name, creditScore, totalWorkDays, onTimeRate, longestStreak, absentCount, activityPeriod, workHistory }, ref) => {
    const tier = getTier(creditScore);
    const todayStr = format(new Date(), "yyyy.MM.dd");

    return (
      <div
        ref={ref}
        className="w-[340px] bg-white rounded-[24px] border border-slate-200 shadow-lg overflow-hidden"
        style={{ fontFamily: "Pretendard, sans-serif" }}
      >
        {/* 상단 그라디언트 */}
        <div
          className="px-6 pt-6 pb-4"
          style={{ background: `linear-gradient(135deg, ${tier.color}20 0%, white 100%)` }}
        >
          <p className="text-[12px] text-[#8B95A1] font-medium mb-1">출첵 근태 프로필</p>
          <p className="text-[22px] font-bold text-[#191F28]">{name}</p>
        </div>

        {/* 티어 + 점수 */}
        <div className="px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3 mb-2">
            <TierBadge score={creditScore} size="md" />
            <span className="text-[15px] font-bold" style={{ color: tier.textColor }}>
              {tier.emoji} {tier.name}
            </span>
          </div>
          <p className="text-[32px] font-bold text-[#191F28]">
            {creditScore}<span className="text-[14px] text-[#8B95A1] font-normal ml-1">점</span>
          </p>
        </div>

        {/* 근태 요약 */}
        <div className="px-6 py-4 space-y-2 border-b border-slate-100">
          <p className="text-[13px] font-bold text-[#4E5968] mb-2">근태 요약</p>
          <div className="grid grid-cols-2 gap-2 text-[13px]">
            <div><span className="text-[#8B95A1]">총 근무일수</span> <span className="font-bold text-[#191F28]">{totalWorkDays}일</span></div>
            <div><span className="text-[#8B95A1]">정시 출근율</span> <span className="font-bold text-[#191F28]">{onTimeRate}%</span></div>
            <div><span className="text-[#8B95A1]">최장 연속 출근</span> <span className="font-bold text-[#191F28]">{longestStreak}일</span></div>
            <div><span className="text-[#8B95A1]">결근</span> <span className="font-bold text-[#191F28]">{absentCount}회</span></div>
          </div>
          <p className="text-[12px] text-[#8B95A1]">활동 기간: {activityPeriod}</p>
        </div>

        {/* 근무 이력 */}
        {workHistory.length > 0 && (
          <div className="px-6 py-4 border-b border-slate-100">
            <p className="text-[13px] font-bold text-[#4E5968] mb-2">근무 이력</p>
            {workHistory.map((h, i) => (
              <p key={i} className="text-[13px] text-[#4E5968]">
                {h.orgName} <span className="text-[#8B95A1]">({h.period})</span>
              </p>
            ))}
          </div>
        )}

        {/* 푸터 */}
        <div className="px-6 py-3 flex justify-between items-center text-[11px] text-[#B0B8C1]">
          <span>출첵 | chulchek.app</span>
          <span>{todayStr} 기준</span>
        </div>
      </div>
    );
  }
);
CreditCard.displayName = "CreditCard";

export default CreditCard;
```

### 8-4. CreditCardModal 컴포넌트

```typescript
// src/components/CreditCardModal.tsx
"use client";

import { useRef, useState, useCallback } from "react";
import { X, Download, Share2, Printer } from "lucide-react";
import CreditCard from "@/components/CreditCard";
import { toast } from "sonner";

interface CreditCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  cardData: {
    name: string;
    creditScore: number;
    totalWorkDays: number;
    onTimeRate: number;
    longestStreak: number;
    absentCount: number;
    activityPeriod: string;
    workHistory: Array<{ orgName: string; period: string }>;
  };
}

export default function CreditCardModal({ isOpen, onClose, cardData }: CreditCardModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  // html2canvas로 PNG 캡처
  const captureCard = useCallback(async (): Promise<string | null> => {
    if (!cardRef.current) return null;

    setIsCapturing(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,             // 2x 해상도 (Retina)
        useCORS: true,
        logging: false,
      });
      return canvas.toDataURL("image/png");
    } catch (err) {
      toast.error("이미지 캡처에 실패했어요. 다시 시도해 주세요.");
      return null;
    } finally {
      setIsCapturing(false);
    }
  }, []);

  // 이미지로 저장
  const handleDownload = async () => {
    const dataUrl = await captureCard();
    if (!dataUrl) return;

    const link = document.createElement("a");
    link.download = `출첵_근태카드_${cardData.name}.png`;
    link.href = dataUrl;
    link.click();
    toast.success("이미지가 저장되었어요.");
  };

  // 카카오톡 공유
  const handleKakaoShare = async () => {
    const dataUrl = await captureCard();
    if (!dataUrl) return;

    // dataURL → Blob → File
    const res = await fetch(dataUrl);
    const blob = await res.blob();

    // Kakao SDK 공유 (이미지 업로드 후 공유)
    if (typeof window !== "undefined" && window.Kakao) {
      try {
        const { infos } = await window.Kakao.Share.uploadImage({ file: [blob] });
        const imageUrl = infos.original.url;

        window.Kakao.Share.sendDefault({
          objectType: "feed",
          content: {
            title: `${cardData.name}님의 출첵 근태 카드`,
            description: `${cardData.creditScore}점 | 정시 출근율 ${cardData.onTimeRate}%`,
            imageUrl,
            link: { mobileWebUrl: window.location.href, webUrl: window.location.href },
          },
          buttons: [{
            title: "출첵에서 확인하기",
            link: { mobileWebUrl: window.location.href, webUrl: window.location.href },
          }],
        });
      } catch {
        toast.error("카카오톡 공유에 실패했어요. 이미지를 저장해서 직접 전달해 주세요.");
      }
    } else {
      toast.error("카카오톡 SDK를 불러오지 못했어요.");
    }
  };

  // 프린트
  const handlePrint = () => {
    if (!cardRef.current) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("팝업이 차단되었어요. 팝업 허용 후 다시 시도해 주세요.");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>출첵 근태 카드 - ${cardData.name}</title>
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" />
          <style>
            body { display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>${cardRef.current.outerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
      printWindow.close();
    };
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center">
      {/* 오버레이 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* 모달 */}
      <div className="relative z-10 animate-in zoom-in-95 fade-in duration-300 max-h-[90vh] overflow-y-auto">
        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 카드 렌더 */}
        <CreditCard ref={cardRef} {...cardData} />

        {/* 액션 버튼 */}
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            onClick={handleDownload}
            disabled={isCapturing}
            className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-full text-[13px] font-bold text-[#191F28] shadow-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            이미지로 저장
          </button>
          <button
            onClick={handleKakaoShare}
            disabled={isCapturing}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#FEE500] rounded-full text-[13px] font-bold text-[#3B1C1C] shadow-lg hover:bg-[#FADA0A] transition-colors disabled:opacity-50"
          >
            <Share2 className="w-4 h-4" />
            카카오 공유
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-full text-[13px] font-bold text-[#191F28] shadow-lg hover:bg-slate-50 transition-colors"
          >
            <Printer className="w-4 h-4" />
            프린트
          </button>
        </div>
      </div>
    </div>
  );
}
```

### 8-5. 카카오 SDK 로드

```typescript
// src/app/layout.tsx에 추가
<Script
  src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js"
  strategy="afterInteractive"
  onLoad={() => {
    if (window.Kakao && !window.Kakao.isInitialized()) {
      window.Kakao.init(process.env.NEXT_PUBLIC_KAKAO_JS_KEY);
    }
  }}
/>
```

```typescript
// src/types/kakao.d.ts (전역 타입)
interface Window {
  Kakao: {
    init: (key: string) => void;
    isInitialized: () => boolean;
    Share: {
      sendDefault: (options: any) => void;
      uploadImage: (options: { file: Blob[] }) => Promise<{ infos: { original: { url: string } } }>;
    };
  };
}
```

---

## 9. 토스 UI/UX 가이드라인 적용 포인트

### 9-1. 전환 과정에서 절대 위반 금지 사항

| 규칙 | 적용 위치 | 점검 사항 |
|------|-----------|-----------|
| `~해요` 체 통일 | 모든 신규 페이지 (create-organization, join, select-organization, payroll, team, organization, master/**) | "만들기", "참여하기" 등 버튼 텍스트 + 모든 안내 문구 |
| `alert()/confirm()` 금지 | 직원 내보내기, 조직 비활성화, 급여 확정 등 위험 동작 | 반드시 `ConfirmDialog` 바텀시트 사용 |
| Skeleton UI 필수 | 급여 정산 테이블, master 대시보드 KPI 카드, 팀 멤버 목록 | 로딩 중 텍스트 금지 |
| 토스트 이유+해결방법 | 초대 코드 오류, 급여 확정 실패, 조직 생성 실패 등 | `toast.error("초대 코드가 만료되었어요. 사장님에게 새 코드를 요청해 주세요.")` |
| 버튼 동사형 | 모든 CTA | "확인" 금지 → "급여 확정하기", "초대하기", "참여하기", "저장하기" |

### 9-2. 신규 페이지별 UI 패턴 매핑

| 페이지 | 토스 패턴 | 구현 |
|--------|-----------|------|
| `/create-organization` | 퍼널 패턴 | 상단 progress bar + 하단 고정 버튼 + 뒤로가기 |
| `/join` | 단일 카드 패턴 | 중앙 정렬 카드 + CTA |
| `/select-organization` | 선택 목록 패턴 | 카드 목록 + 탭 가능 |
| `/[slug]/admin/payroll` | 데이터 테이블 패턴 | 모바일: 카드형 리스트 / 데스크톱: 테이블. 행 클릭 → 바텀시트 상세 |
| `/[slug]/admin/team` | 설정+목록 혼합 패턴 | 섹션 분리, 각 멤버 카드형 |
| `/[slug]/admin/organization` | 설정 패턴 | 섹션별 카드 그룹, 위험 영역 빨간 테두리 |
| `/master/**` | 대시보드 패턴 | KPI 카드 + 테이블 + 검색/필터 |
| `CreditCardModal` | 모달+액션 패턴 | 중앙 모달 + 하단 액션 버튼 3개 |
| `BusinessSwitcher` | 바텀시트 선택 패턴 | 리스트 + 체크 아이콘 |

### 9-3. 컬러 토큰 사용 규칙

신규 페이지에서도 기존 컬러 토큰을 반드시 사용한다. 임의 색상 금지.

```
primary:        #3182F6  → CTA 버튼, 활성 탭, 체크 아이콘
text-primary:   #191F28  → 제목, 강조 텍스트
text-secondary: #4E5968  → 본문
text-tertiary:  #8B95A1  → 보조 설명, 비활성 텍스트
bg-default:     #F2F4F6  → 입력 필드 배경, 비활성 영역
border:         #E5E8EB  → 카드 테두리
primary-light:  #E8F3FF  → 활성 카드 배경
error:          #F04438  → 에러, 위험 영역 (추가)
success:        #00B761  → 성공, 확인 (추가)
warning:        #F59E0B  → 경고 (추가)
```

### 9-4. 애니메이션 규칙

- 모든 바텀시트: `animate-in slide-in-from-bottom-full duration-300`
- 모든 모달: `animate-in zoom-in-95 fade-in duration-300`
- 오버레이: `animate-in fade-in duration-300`
- 버튼 탭: `active:scale-[0.98] transition-transform`
- 카드 탭: `active:scale-[0.99] transition-transform`

---

## 10. 체크리스트

### Phase A: 기반 코드

- [ ] `src/types/organization.ts` 생성
- [ ] `src/types/kakao.d.ts` 생성 (카카오 SDK 전역 타입)
- [ ] `src/lib/auth-context.tsx` 확장 (profile, userOrgs, isMaster)
- [ ] `src/lib/org-context.tsx` 생성
- [ ] `src/lib/org-admin-context.tsx` 생성
- [ ] `src/lib/hooks/useOrgQuery.ts` 생성
- [ ] `src/lib/hooks/useOrgNavigation.ts` 생성
- [ ] `src/lib/server-org.ts` 생성
- [ ] `src/middleware.ts` 전면 재작성
- [ ] `npm run build` 통과 확인

### Phase B: 루트 레이아웃

- [ ] `src/app/layout.tsx` — BottomNav 제거, 카카오 SDK Script 추가
- [ ] `src/app/providers.tsx` — 변경 없음 (AuthProvider가 이미 확장됨)
- [ ] `src/app/page.tsx` — 리다이렉트 전용으로 전환

### Phase C: [slug] 뼈대

- [ ] `src/app/[slug]/layout.tsx` 생성 (OrgProvider + BottomNav)
- [ ] `src/components/BottomNav.tsx` 수정 (slug prop)
- [ ] `src/components/BusinessSwitcher.tsx` 생성
- [ ] `npm run build` 통과 확인

### Phase D: 직원 페이지 이동

- [ ] `[slug]/page.tsx` (홈)
- [ ] `[slug]/calendar/page.tsx`
- [ ] `[slug]/store/page.tsx`
- [ ] `[slug]/my/page.tsx`
- [ ] `[slug]/attendances/page.tsx`
- [ ] `[slug]/credit-history/page.tsx` + `CreditHistoryClient.tsx`
- [ ] 원본 파일 삭제 (calendar, store, my, attendances, credit-history)
- [ ] `npm run build` 통과 확인

### Phase E: 직원 서브페이지 이동

- [ ] `[slug]/announcements/page.tsx` + `[id]/page.tsx`
- [ ] `[slug]/recipes/page.tsx` + `[id]/page.tsx` + `[id]/edit/page.tsx` + `new/page.tsx`
- [ ] `[slug]/guide/page.tsx` + `layout.tsx`
- [ ] `[slug]/game/page.tsx`
- [ ] 원본 파일 삭제
- [ ] `npm run build` 통과 확인

### Phase F: 어드민 이동

- [ ] `[slug]/admin/layout.tsx` (slug + org_id + BusinessSwitcher)
- [ ] `[slug]/admin/page.tsx` (대시보드)
- [ ] `[slug]/admin/employees/page.tsx` (terminate + 초대 링크)
- [ ] `[slug]/admin/attendance/page.tsx`
- [ ] `[slug]/admin/calendar/page.tsx` + `events/page.tsx`
- [ ] `[slug]/admin/schedules/substitutes/page.tsx`
- [ ] `[slug]/admin/recipes/**` (4개 파일)
- [ ] `[slug]/admin/announcements/**` (3개 파일)
- [ ] `[slug]/admin/checklists/page.tsx`
- [ ] `[slug]/admin/overtime/page.tsx`
- [ ] `[slug]/admin/stats/page.tsx`
- [ ] `[slug]/admin/settings/page.tsx`
- [ ] 원본 admin 디렉토리 삭제
- [ ] `npm run build` 통과 확인

### Phase G: 신규 페이지

- [ ] `src/app/auth/callback/route.ts`
- [ ] `src/app/signup/page.tsx`
- [ ] `src/app/create-organization/page.tsx` (4단계 퍼널)
- [ ] `src/app/join/page.tsx` (초대 수락)
- [ ] `src/app/select-organization/page.tsx` (조직 선택)
- [ ] `src/app/[slug]/admin/payroll/page.tsx` (급여 정산)
- [ ] `src/app/[slug]/admin/team/page.tsx` (팀/초대)
- [ ] `src/app/[slug]/admin/organization/page.tsx` (조직 설정)
- [ ] `src/components/CreditCard.tsx`
- [ ] `src/components/CreditCardModal.tsx`
- [ ] `npm run build` 통과 확인

### Phase H: master 페이지

- [ ] `src/app/master/layout.tsx`
- [ ] `src/app/master/page.tsx`
- [ ] `src/app/master/organizations/page.tsx`
- [ ] `src/app/master/organizations/[id]/page.tsx`
- [ ] `src/app/master/users/page.tsx`
- [ ] `src/app/master/credits/page.tsx`
- [ ] `src/app/master/system/page.tsx`
- [ ] `npm run build` 통과 확인

### Phase I: 로그인 재작성

- [ ] `src/app/login/page.tsx` 전면 재작성 (이메일 + 카카오 + Apple)
- [ ] `npm run build` 통과 확인

### Phase J: 공유 컴포넌트 일괄 수정

- [ ] `HomeClient.tsx` (경로 + org_id + BusinessSwitcher)
- [ ] `AttendanceCard.tsx` (org_id insert)
- [ ] `TierCard.tsx` (경로)
- [ ] `AnnouncementBanner.tsx` (경로)
- [ ] `OnboardingFunnel.tsx` (org_id)
- [ ] `admin/AdminQuickNav.tsx` (경로)
- [ ] `admin/ActionRequiredBanner.tsx` (경로)
- [ ] `admin/DashboardActivityFeed.tsx` (경로 + org_id)
- [ ] `admin/DashboardKPICards.tsx` (org_id)
- [ ] `admin/TeamCreditOverview.tsx` (경로 + org_id)
- [ ] `admin/WeekScheduleStrip.tsx` (경로 + org_id)
- [ ] `announcement/AnnouncementForm.tsx` (경로 + org_id)
- [ ] `recipe/RecipeForm.tsx` (경로 + org_id)
- [ ] `npm run build` 통과 확인

### Phase K: 라이브러리/API 수정

- [ ] `lib/notifications.ts` (organization_id 파라미터)
- [ ] `lib/credit-engine.ts` (organization_id + requireOrgAdmin)
- [ ] `lib/push-server.ts` (org_id 필터)
- [ ] `lib/hooks/useWorkplaces.ts` (org_id 필터)
- [ ] `api/cron/daily-settlement/route.ts` (조직별 루프)
- [ ] `npm run build` 통과 확인

### Phase L: 최종 검증

- [ ] 레거시 경로 리다이렉트 동작 확인 (/, /calendar 등)
- [ ] 하드코딩된 경로 누락 검색 (`grep -r '"/admin' --include="*.tsx"`)
- [ ] 하드코딩된 경로 누락 검색 (`grep -r '"/calendar' --include="*.tsx"`)
- [ ] 크레딧 전역 합산 정확성 확인
- [ ] org_id 필터 누락 테이블 점검 (모든 쿼리 리뷰)
- [ ] 데이터 격리 테스트 (조직A 데이터가 조직B에서 안 보이는지)
- [ ] master 접근 제어 테스트
- [ ] owner 접근 제어 테스트 (타 조직 admin 접근 차단)
- [ ] `npm run build` 최종 통과
- [ ] PWA manifest 업데이트 (앱 이름 "출첵"으로 변경)
- [ ] OG 이미지/메타데이터 업데이트

---

## 부록: 총 파일 변경 규모 요약

| 카테고리 | 파일 수 | 비고 |
|----------|---------|------|
| 전면 재작성 | 3 | login, middleware, auth-context |
| 신규 생성 | 25 | types 2, lib 4, 페이지 12, 컴포넌트 4, master 5, auth 1 |
| 경로 이동 + 수정 | 27 | 직원 11 + 어드민 16 |
| 컴포넌트 수정 | 19 | 경로/org_id 변경 |
| 라이브러리 수정 | 5 | notifications, credit-engine, push-server, useWorkplaces, cron |
| 삭제 | ~20 | 이동 완료 후 원본 삭제 |
| **합계** | **~99** | |
