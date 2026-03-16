# YGD HR - 프로젝트 상세 분석 보고서

> **연경당 통합 근태 관리 시스템**
> 위치 기반 출퇴근 기록 + 관리자 실시간 모니터링 PWA

---

## 1. 전체 디렉토리 구조

```
/ygd_hr/
├── src/
│   ├── app/
│   │   ├── layout.tsx                  # Root Layout (PWA, 메타데이터)
│   │   ├── page.tsx                    # 메인 홈페이지 (직원용)
│   │   ├── login/
│   │   │   └── page.tsx                # 로그인/회원가입
│   │   ├── attendances/
│   │   │   └── page.tsx                # 근무 기록 조회
│   │   ├── admin/
│   │   │   ├── layout.tsx              # 관리자 레이아웃 (사이드바, 알림)
│   │   │   ├── page.tsx                # 관리자 대시보드
│   │   │   ├── employees/
│   │   │   │   └── page.tsx            # 직원 관리
│   │   │   └── attendance/
│   │   │       └── page.tsx            # 근태 캘린더
│   │   └── sw.ts                       # Service Worker (Serwist)
│   ├── components/
│   │   ├── AttendanceCard.tsx          # 출퇴근 기능 카드 (핵심)
│   │   ├── Clock.tsx                   # 실시간 시계
│   │   ├── IosInstallPrompt.tsx        # iOS 앱 설치 안내
│   │   ├── KakaoEscape.tsx             # 카카오 인앱 브라우저 탈출
│   │   ├── MyInfoModal.tsx             # 내 정보 수정 모달
│   │   ├── OnboardingFunnel.tsx        # 신규 직원 온보딩 퍼널
│   │   ├── PWAInstallPrompt.tsx        # PWA 설치 프롬프트
│   │   ├── StoreDistanceList.tsx       # 매장 거리 표시
│   │   ├── WeeklyWorkStats.tsx         # 주간 근무 통계 그래프
│   │   └── ui/                         # shadcn/ui 컴포넌트
│   │       ├── button.tsx
│   │       ├── calendar.tsx
│   │       ├── card.tsx
│   │       ├── date-picker.tsx
│   │       ├── input.tsx
│   │       ├── label.tsx
│   │       ├── popover.tsx
│   │       └── sonner.tsx
│   └── lib/
│       ├── supabase.ts                 # Supabase 브라우저 클라이언트
│       ├── notifications.ts            # 알림 발송 함수
│       └── utils/
│           ├── cn.ts                   # Tailwind 클래스 병합
│           └── distance.ts             # Haversine 거리 계산
├── public/
│   ├── manifest.json                   # PWA 매니페스트
│   ├── icons/                          # 앱 아이콘
│   ├── og-image.png                    # OG 이미지
│   └── sw.js                           # 빌드된 Service Worker
├── docs/                               # 프로젝트 문서
├── .githooks/
│   └── pre-commit                      # jungpyolee 계정 강제
├── middleware.ts                        # 인증 미들웨어
├── next.config.ts                       # Next.js + Serwist 설정
├── package.json
└── tsconfig.json
```

---

## 2. 기술 스택

| 구분 | 기술 | 버전 |
|------|------|------|
| **프레임워크** | Next.js | 16.1.6 |
| **UI 라이브러리** | React | 19.2.3 |
| **언어** | TypeScript | 5.x |
| **인증 & DB** | Supabase | 2.99.1 |
| **SSR 인증** | @supabase/ssr | 0.9.0 |
| **스타일링** | Tailwind CSS | 4.x |
| **UI 컴포넌트** | shadcn/ui + radix-ui | 1.4.3 |
| **PWA** | Serwist | 9.5.6 |
| **날짜 처리** | date-fns | 4.1.0 |
| **캘린더** | react-day-picker | 9.14.0 |
| **아이콘** | lucide-react | 0.577.0 |
| **Toast** | sonner | 2.0.7 |
| **테마** | next-themes | 0.4.6 |
| **폰트** | Pretendard | 1.3.9 |
| **배포** | Vercel | - |

---

## 3. 라우팅 구조

```
/                       메인 홈 (직원용 출퇴근 화면)
├─ /login               로그인 / 회원가입
├─ /attendances         내 근무 기록 조회 (주간/월간)
└─ /admin               관리자 영역 (권한 확인)
    ├─ /                대시보드 (실시간 현황 4가지 지표)
    ├─ /employees       직원 관리 (정보 수정, 서류, 삭제)
    └─ /attendance      근태 캘린더 (주간/월간 뷰)
```

**미들웨어 보호**: 비인증 사용자 → `/login` 자동 리다이렉트
**관리자 보호**: `admin/layout.tsx`에서 `role !== 'admin'` → `/` 리다이렉트

---

## 4. 인증 흐름

### 회원가입
```
ID 입력 (영문/숫자만)
  → 비밀번호 설정
  → 필수 동의 (개인정보, 위치정보)
  → Supabase auth.signUp()
     이메일: {userId}@ygd.com (사내 도메인 강제)
  → 성공 시 자동 로그인 유도
```

### 로그인
```
ID + 비밀번호 입력
  → Supabase auth.signInWithPassword()
  → / 로 이동
```

### 온보딩 (신규 직원)
```
메인 페이지 로드 시 profiles.name / .phone 비어있으면
  → OnboardingFunnel 표시
     Step 1: 이름 (2~4자)
     Step 2: 전화번호 (010-XXXX-XXXX 자동 포맷)
     Step 3: 입사일 (선택)
     Step 4: 서류 업로드 (선택)
  → 완료 시 profiles 업데이트 + 관리자 알림 발송
```

### 세션 관리
- Supabase SSR 클라이언트 (쿠키 기반)
- `middleware.ts`에서 매 요청마다 세션 확인

---

## 5. Supabase 데이터베이스 구조

### `profiles` - 사용자 프로필
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID (PK) | auth.users와 연결 |
| email | text | {userId}@ygd.com |
| name | text | 직원 이름 |
| phone | text | 연락처 |
| department | text | 부서 |
| position | text | 직급 |
| role | text | 'admin' / 'user' |
| color_hex | text | 아바타 배경색 |
| employment_contract_url | text | 근로계약서 경로 |
| bank_account_copy_url | text | 통장사본 경로 |
| resident_register_url | text | 주민등록등본 경로 |
| health_cert_url | text | 보건증 경로 |
| health_cert_date | date | 보건증 만료일 |
| health_cert_verified | boolean | 실물 확인 여부 |
| account_number | text | 계좌번호 |
| bank_name | text | 은행명 |
| target_in_time | time | 기본 출근 시간 |
| target_out_time | time | 기본 퇴근 시간 |
| join_date | date | 입사일 |
| created_at | timestamp | 가입일 |

### `attendance_logs` - 출퇴근 기록
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID (PK) | - |
| profile_id | UUID (FK) | profiles 참조 |
| store_id | UUID (FK) | stores 참조 |
| type | text | 'IN' / 'OUT' |
| user_lat | float | 기록 시 위도 |
| user_lng | float | 기록 시 경도 |
| distance_m | float | 매장까지 거리 (미터) |
| created_at | timestamp | 기록 시각 |

### `stores` - 매장 정보
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID (PK) | - |
| name | text | 매장명 |
| lat | float | 매장 위도 |
| lng | float | 매장 경도 |

### `notifications` - 알림
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID (PK) | - |
| profile_id | UUID | 발신자 |
| target_role | text | 'admin' / 'employee' / 'all' |
| type | text | 알림 종류 |
| title | text | 제목 |
| content | text | 내용 |
| source_id | UUID | 관련 리소스 ID |
| is_read | boolean | 읽음 여부 |
| created_at | timestamp | 발송 시각 |

### RPC 함수
- `delete_user_admin(target_user_id)`: 직원 + 관련 기록 삭제 (관리자 전용)

### 파일 저장소
- **버킷**: `hr-documents` (Private)
- **경로**: `{userId}/{column}_{timestamp}.{ext}`
- **접근**: 서명된 URL (60초 만료)

---

## 6. 핵심 컴포넌트 상세

### 6.1 AttendanceCard (출퇴근 핵심)
위치 기반 출퇴근 기록의 핵심 컴포넌트.

**출퇴근 로직**:
1. Geolocation API로 현재 위치 획득 (`enableHighAccuracy: true`)
2. 모든 매장과의 거리 계산 (Haversine 공식)
3. 가장 가까운 매장 선택
4. 반경 100m 이내 여부 확인
5. `attendance_logs` 테이블에 INSERT
6. 관리자 알림 발송
7. 부모 컴포넌트 데이터 새로고침

**상태**:
- IN 상태: "OO 매장 근무 중" (파란 점 애니메이션)
- OUT/없음: "출근 전이에요"

### 6.2 OnboardingFunnel (신규 직원 등록)
4단계 퍼널 형태의 온보딩 UI.

| 단계 | 내용 | 필수 여부 |
|------|------|-----------|
| Step 1 | 이름 (2~4자) | 필수 |
| Step 2 | 전화번호 (010 자동 포맷) | 필수 |
| Step 3 | 입사일 | 선택 (건너뛰기 가능) |
| Step 4 | 서류 업로드 (보건증, 통장, 등본) | 선택 |

완료 시 → `profiles` 업데이트 + 관리자 알림 (`type: "onboarding"`)

### 6.3 Admin Dashboard - 4가지 핵심 지표
| 지표 | 조건 |
|------|------|
| 현재 근무 중 | 오늘 IN 기록 있고 OUT 기록 없는 직원 |
| 오늘 총 출근 | 오늘 IN 기록 있는 직원 (중복 제거) |
| 서류 미비/만료 | 계약서·통장·등본 미제출 또는 보건증 만료 |
| 기록 이상 | 마지막 로그가 IN (퇴근 누락 의심) |

### 6.4 실시간 알림 시스템
`admin/layout.tsx`에서 Supabase Realtime 구독.

```
notifications 테이블 INSERT 이벤트 구독
  필터: target_role = 'admin' OR target_role = 'all'
  → 미읽음 카운트 업데이트
  → 알림 목록 실시간 갱신
  → 클릭 시 딥링크 이동
     onboarding → /admin/employees
     attendance_in/out → /admin/attendance
```

---

## 7. 라이브러리 / 유틸리티

### `src/lib/supabase.ts`
```typescript
// SSR 친화적 브라우저 클라이언트 생성
export const createClient = () =>
  createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

### `src/lib/notifications.ts`
```typescript
// notifications 테이블에 알림 INSERT
sendNotification({
  profile_id?,      // 발신자 ID
  target_role,      // 'admin' | 'employee' | 'all'
  type,             // 알림 종류
  title,            // 제목
  content,          // 내용
  source_id?        // 관련 리소스 ID
})
```

### `src/lib/utils/distance.ts`
```typescript
// Haversine 공식으로 두 좌표 사이 거리 계산 (미터 단위)
getDistance(lat1, lon1, lat2, lon2): number
```

### `src/lib/utils/cn.ts`
```typescript
// Tailwind 클래스 충돌 자동 해결
cn(...inputs: ClassValue[]): string
```

---

## 8. 미들웨어 (`middleware.ts`)

**역할**: 인증 상태 확인 후 비인증 사용자 차단

**보호 경로**: `/`, `/attendances`, `/admin/**` 및 모든 일반 경로

**제외 패턴** (정적 파일):
```
_next/static, _next/image, favicon.ico, manifest.json,
sw.js, icons/*, *.png, *.jpg, *.svg, *.webp
```

**흐름**:
```
요청 수신
  → 정적 파일? → 통과
  → Supabase 세션 확인
  → 세션 없음? → /login 리다이렉트
  → 세션 있음? → 통과
```

---

## 9. PWA 구성

**Service Worker**: Serwist 9.5 (개발 모드에서 비활성화)
**매니페스트**: `public/manifest.json`

**설치 흐름**:
- Android/Chrome: `beforeinstallprompt` 이벤트 → `PWAInstallPrompt.tsx`
- iOS Safari: 수동 안내 3단계 → `IosInstallPrompt.tsx`
- 카카오 인앱 브라우저: 외부 브라우저 유도 → `KakaoEscape.tsx`

**"오늘 하루 보지 않기"**: localStorage + 자정 기준 초기화

---

## 10. 앱 전체 사용자 여정

```
[비회원]
  ↓ 회원가입 (ID, 비밀번호, 동의)
[직원 계정]
  ↓ 로그인
[메인 화면]
  ├─ 신규 직원 → [온보딩 퍼널] (이름, 연락처, 입사일, 서류)
  │                → 완료 후 메인
  ├─ [출퇴근] ← GPS 100m 이내 매장 자동 감지
  │    ↓ 출근/퇴근 기록 + 관리자 알림
  ├─ [근무 기록 조회] → /attendances (주간/월간)
  ├─ [내 정보 수정] → 연락처, 은행정보, 보건증, 서류
  └─ [어드민 모드] (관리자만)
       ├─ 대시보드 (실시간 4가지 지표)
       ├─ 직원 관리 (정보 수정, 서류, 삭제)
       └─ 근태 캘린더 (주간/월간)
```

---

## 11. 보안

- **인증**: Supabase Auth (JWT 기반)
- **세션**: SSR 쿠키 기반
- **파일**: Private 버킷 + 60초 만료 서명 URL
- **DB**: Row Level Security (Supabase RLS)
- **API**: ANON Key만 사용 (서버 키 미노출)
- **Git**: pre-commit 훅으로 jungpyolee 계정 강제

---

## 12. 알려진 이슈

| 이슈 | 설명 | 심각도 |
|------|------|--------|
| `sw.ts` import 에러 | `Serwist`가 `@serwist/sw`에서 export 안 됨 | 낮음 (빌드 통과) |
| middleware 경고 | "middleware" 파일 컨벤션 deprecated → "proxy" 권장 | 낮음 |
| workspace root 경고 | `outputFileTracingRoot` 미설정으로 루트 오감지 | 낮음 |

---

*분석 일자: 2026-03-16*
