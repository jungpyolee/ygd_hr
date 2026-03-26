# 출첵 SaaS 전환 — 최종 종합 보고서

> **작성일**: 2026-03-25
> **프로젝트**: 연경당 HR → 출첵 (멀티테넌트 SaaS)
> **총 세부계획 문서**: 12개 (총 611KB)

---

## 프로젝트 한 줄 요약

**연경당 카페 전용 HR 앱을 "출첵"이라는 브랜드로 카페/식당 사장님 누구나 쓸 수 있는 SaaS 플랫폼으로 전환한다.**

---

## 1. 문서 인덱스

| # | 문서 | 분야 | 핵심 내용 |
|---|------|------|----------|
| 01 | [01-auth-oauth.md](./01-auth-oauth.md) | 인증/OAuth | 카카오/Apple 로그인 설정, @ygd.com 마이그레이션, 코드 구현 |
| 02 | [02-database-migration.md](./02-database-migration.md) | DB/백엔드 | 마이그레이션 SQL 9개 파일, RLS 전면 재작성, 롤백 계획 |
| 03 | [03-frontend-transition.md](./03-frontend-transition.md) | 프론트엔드 | 라우팅 전환, 99개 파일 변경, 신규 페이지 설계 |
| 04 | [04-mobile-app.md](./04-mobile-app.md) | 모바일 앱 | PWA→네이티브(React Native Expo), 앱스토어 준비 |
| 05 | [05-infrastructure.md](./05-infrastructure.md) | 인프라/DevOps | 도메인, Vercel/Supabase 설정, 모니터링, 비용 |
| 06 | [06-legal-compliance.md](./06-legal-compliance.md) | 법무/컴플라이언스 | 사업자등록, 개인정보보호법, 위치정보법, 이용약관 |
| 07 | [07-marketing.md](./07-marketing.md) | 마케팅 | 페르소나, 채널 전략, 바이럴, 크레딧 마케팅 |
| 08 | [08-finance.md](./08-finance.md) | 자금/재무 | 초기 비용 150~300만원, BEP 5개 매장, 12개월 캐시플로우 |
| 09 | [09-design-branding.md](./09-design-branding.md) | 디자인/브랜딩 | 로고, 컬러, 앱아이콘, 크레딧 카드 디자인 |
| 10 | [10-payroll.md](./10-payroll.md) | 급여/정산 | 계산 로직, 공제, 노동법 검증, 엣지 케이스 |
| 11 | [11-credit-gamification.md](./11-credit-gamification.md) | 크레딧/게이미피케이션 | 전역 크레딧, 카드 모달, 스트릭, 악용 방지 |
| 12 | [12-qa-testing.md](./12-qa-testing.md) | QA/테스트 | RLS 격리 테스트, 급여 정확성, E2E, 보안 |

---

## 2. 확정된 의사결정 요약

| 영역 | 결정 |
|------|------|
| 앱 이름 | **출첵** (가칭) |
| 인증 | 이메일 + 카카오 + Apple (Google 안 함) |
| 기존 계정 | SNS 안정화 후 전환 유도 |
| 역할 | **master**(정표) / **owner**(사장님) / **employee**(직원) |
| 크레딧 | **전역 통합** (포터블 근태 이력서), 규칙 전 플랫폼 동일 |
| 크레딧 카드 | 모달 UI → 이미지 캡처/카카오 공유/프린트 |
| 직원 초대 | 카카오 딥링크 + 초대코드(6자리) |
| 직원 삭제 | 소프트 삭제 (auth.users 유지) |
| 급여 정산 | **출시 전 MVP 포함** (스케줄 기반 자동계산 + 관리자 확인) |
| Storage | 기존 구조 유지 |
| 레시피 | 전 플랜 무료 |
| 사업자번호 | 선택 입력 |
| 요금제 | 베타 무료 → Free/Starter(29,900)/Pro(79,900) |
| URL | slug 방식 (`/[slug]/admin`) |
| 도메인 | 미정 |
| 네이티브 앱 | React Native (Expo) 추천, SaaS 전환 완료 후 |

---

## 3. 아키텍처 변경 요약

### Before (현재)

```
단일 관리자 (연경이)
  └── @ygd.com 가짜 이메일 인증
  └── profiles.role = 'admin' | 'employee'
  └── is_admin() 전역 bypass
  └── 19개 테이블 (테넌트 개념 없음)
  └── delete_user_admin() = CASCADE 전체 삭제
```

### After (출첵)

```
master (정표)
  ├── /master/** 전체 모니터링
  └── is_master() = 모든 데이터 bypass

owner (사장님) × N
  ├── organizations 테이블
  ├── 카카오/Apple/이메일 로그인
  ├── /[slug]/admin/** 본인 조직만
  ├── is_org_admin(org_id) 조직별 bypass
  └── 급여 정산 (payroll_periods + entries)

employee × N (다중 조직 소속 가능)
  ├── organization_memberships (soft delete)
  ├── 전역 크레딧 점수 (포터블)
  ├── 크레딧 카드 모달 (공유/프린트)
  └── 초대코드/카카오 딥링크로 가입
```

### DB 변경 규모

| 항목 | 수량 |
|------|------|
| 신규 테이블 | 7개 (organizations, memberships, admins, invites, payroll×2, audit_logs) |
| 수정 테이블 | 19개 (organization_id FK 추가) |
| 신규 함수 | 4개 (is_master, is_org_admin, is_org_member, terminate_membership) |
| 수정 함수 | 3개 (is_admin, handle_new_user, delete_user_admin 폐기) |
| RLS 정책 | 전면 재작성 (모든 테이블) |
| 마이그레이션 SQL | 9개 파일 (042~050) |

---

## 4. 비용 요약

### 초기 투자 (출시까지)

| 항목 | 비용 |
|------|------|
| 인프라 (Supabase, Vercel, 도메인) | ~5만원 |
| 외부 서비스 (Apple Developer $99 등) | ~20만원 |
| 법무 (이용약관, 개인정보처리방침) | ~50~150만원 |
| 디자인 (로고, 아이콘) | 0~50만원 |
| 앱스토어 (Google $25, Apple 공유) | ~3만원 |
| **합계** | **~150~300만원** (인건비 제외) |

### 월간 운영비 (런칭 후)

| 항목 | 비용 |
|------|------|
| Supabase Pro | $25 (~33,000원) |
| Vercel Pro | $20 (~26,000원) |
| 도메인 | ~1,000원 |
| 기타 (이메일, 모니터링) | ~10,000원 |
| **합계** | **~73,000원/월** |

### 손익분기점

**유료 매장 5개** (Starter 기준) → 월 수입 149,500원 > 월 비용 73,000원

---

## 5. 타임라인

### Phase 1: SaaS 기반 구축 (4~6주)

```
Week 1-2: DB 마이그레이션 + 인증 전환
  - 신규 테이블 생성 (042~045)
  - 기존 테이블 organization_id 추가 (046)
  - 함수/RLS 재작성 (047~048)
  - 데이터 마이그레이션 (049~050)
  - 카카오/Apple OAuth 설정 + 로그인 페이지 재작성
  - AuthContext 확장

Week 3-4: 프론트엔드 전환
  - app/[slug]/ 라우팅 구조
  - 모든 쿼리 organization_id 필터
  - 미들웨어 재작성
  - 직원 삭제 → 소프트 삭제

Week 5-6: 신규 기능
  - /create-organization (사장님 온보딩)
  - /join (초대 수락)
  - /[slug]/admin/team (팀/초대 관리)
  - /[slug]/admin/payroll (급여 정산)
  - /master/** (master 대시보드)
  - CreditCardModal (크레딧 카드)
  - BusinessSwitcher
```

### Phase 2: 안정화 & 베타 (2~4주)

```
  - RLS 데이터 격리 테스트
  - 급여 계산 정확성 검증
  - 인증 플로우 테스트 (카카오/Apple)
  - 기존 연경당 회귀 테스트
  - 브랜딩 변경 (출첵 로고, manifest)
  - 법무 서류 준비 (이용약관, 개인정보처리방침)
  - 베타 테스터 모집 시작
```

### Phase 3: 정식 출시 (이후)

```
  - 결제 시스템 연동 (토스페이먼츠)
  - 사업자 등록 + 통신판매업 신고
  - 마케팅 시작
  - 네이티브 앱 개발 (React Native Expo, ~12주)
```

---

## 6. 핵심 리스크 & 대응

| 순위 | 리스크 | 영향 | 대응 |
|------|--------|------|------|
| 1 | RLS 누락 → 타 조직 데이터 노출 | 치명 | 모든 테이블 격리 테스트 + SQL 검증 스크립트 |
| 2 | 급여 계산 오류 | 높음 | 관리자 확인 필수 + 25개 테스트 시나리오 + 노무법인 검토 |
| 3 | OAuth 설정 오류 | 높음 | Dev에서 충분한 테스트 후 Prod |
| 4 | 크레딧 전역 합산 오류 | 중간 | sync_credit_score 트리거 검증 |
| 5 | 기존 직원 혼란 | 중간 | 기존 경로 리다이렉트 + 이용가이드 업데이트 |
| 6 | 법적 미준수 | 중간 | 출시 전 법무 체크리스트 완료 |

---

## 7. 법무 필수 사항 (출시 전)

| 항목 | 시점 | 비용 |
|------|------|------|
| 개인정보처리방침 작성 | 베타 전 | 30~80만원 |
| 이용약관 작성 | 베타 전 | 30~50만원 |
| 위치정보 이용약관 | 베타 전 | 포함 |
| 통신판매업 신고 | 유료화 전 | 무료 |
| 부가통신사업자 신고 | 출시 전 | 무료 |
| 급여 로직 노무법인 검토 | 유료화 전 | 30~50만원 |

---

## 8. 마케팅 핵심 전략

- **연경당 2년 실운영 사례**가 최강의 마케팅 자산
- 직원 초대 구조 자체가 바이럴 (카카오 딥링크 → 자연 노출)
- 크레딧 카드 공유 = 무료 앱 홍보
- 1차 채널: 카페 사장님 카카오 오픈채팅/인스타 커뮤니티
- 목표: 베타 3개월 100개 매장 → 정식 6개월 500개 → 12개월 1,000개

---

## 9. 크레딧 시스템 비전

```
Phase 1 (MVP): 조직 내 게이미피케이션
  → 출퇴근 동기부여, 티어 경쟁

Phase 2 (출시 후): 크레딧 카드 공유
  → 모달 캡처 → 카카오/이미지 공유
  → "나의 근태 이력서"

Phase 3 (장기): 채용 시장 연계
  → 사장님이 지원자 크레딧 확인
  → "이 사람 다이아몬드 티어? 바로 채용!"
```

---

## 10. 네이티브 앱 전환 요약

| 항목 | 내용 |
|------|------|
| 추천 스택 | React Native (Expo) |
| 타이밍 | SaaS 전환 완료 후 |
| 개발 기간 | ~12주 |
| 핵심 네이티브 기능 | GPS(expo-location), 푸시(FCM/APNs), 카카오 SDK, Apple Sign In |
| 앱스토어 비용 | Apple $99/년 + Google $25 일회 |
| PWA 병행 | 유지 (웹도 계속 사용 가능) |

---

## 11. 즉시 실행 항목 (Action Items)

### 이번 주 (D+0)

- [ ] 카카오 디벨로퍼스 앱 등록 + OAuth 설정
- [ ] Apple Developer Program 가입 ($99)
- [ ] Supabase Dev에 Kakao/Apple Provider 활성화
- [ ] 도메인 후보 확보 검토

### 다음 주 (D+7)

- [ ] DB 마이그레이션 042~045 (신규 테이블) Dev 실행
- [ ] login/page.tsx 재작성 시작
- [ ] 법무법인 컨택 (이용약관/개인정보처리방침)

### 2주 후 (D+14)

- [ ] DB 마이그레이션 046~050 (기존 테이블 수정) Dev 실행
- [ ] app/[slug]/ 라우팅 전환 시작
- [ ] 로고/아이콘 작업 시작

---

## 부록: 전체 문서 구조

```
docs/planning/
├── multi-tenant-saas-analysis.md       (v1 초기 분석 — 참고용)
├── multi-tenant-saas-blueprint.md      (v3 블루프린트 — 마스터 문서)
└── details/
    ├── 00-executive-summary.md         (이 문서 — 최종 종합 보고서)
    ├── 01-auth-oauth.md                (인증/OAuth)
    ├── 02-database-migration.md        (DB 마이그레이션)
    ├── 03-frontend-transition.md       (프론트엔드)
    ├── 04-mobile-app.md                (모바일 앱)
    ├── 05-infrastructure.md            (인프라)
    ├── 06-legal-compliance.md          (법무)
    ├── 07-marketing.md                 (마케팅)
    ├── 08-finance.md                   (재무)
    ├── 09-design-branding.md           (디자인)
    ├── 10-payroll.md                   (급여)
    ├── 11-credit-gamification.md       (크레딧)
    └── 12-qa-testing.md                (QA/테스트)
```
