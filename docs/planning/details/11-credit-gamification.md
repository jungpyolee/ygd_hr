# 11. 크레딧 게이미피케이션 & 공유 시스템 상세 설계

> **작성일**: 2026-03-25
> **상위 문서**: `docs/planning/multi-tenant-saas-blueprint.md` (D-05, D-06, 섹션 4)
> **관련 코드**: `src/lib/tier-utils.ts`, `src/lib/credit-engine.ts`, `src/app/credit-history/`

---

## 1. 전역 크레딧 철학

### 1-1. 왜 전역인가 — 포터블 근태 이력서

```
기존 세계                              출첵 세계
─────────                              ─────────
회사A 퇴사 → 근태 기록 소멸            회사A 퇴사 → 크레딧 점수 유지
회사B 입사 → "이 사람 성실한지?"        회사B 입사 → "골드 티어 — 검증된 직원"
→ 면접 인상에 의존                      → 데이터 기반 신뢰
```

**핵심 논거:**

| 관점 | 설명 |
|------|------|
| **직원 가치** | 어디서 일했든 쌓인 성실함이 점수로 남는다. 이직해도 사라지지 않는다. |
| **사장님 가치** | 신규 직원 채용 시 크레딧 점수를 참고할 수 있다. "플래티넘 티어 직원"은 면접 없이도 신뢰가 간다. |
| **플랫폼 가치** | 크레딧 데이터가 쌓일수록 출첵 플랫폼의 네트워크 효과가 강화된다. 직원은 점수를 지키려고 출첵을 계속 쓰고, 사장님은 검증된 직원풀이 있으니 출첵을 쓴다. |

### 1-2. 공정성 원칙 — 전 플랫폼 동일 규칙

크레딧 점수에 의미를 부여하려면 **모든 조직에서 같은 규칙**이 적용되어야 한다.

```
정상 출근: +3점  ← 카페에서든, 공장에서든, 식당에서든 동일
무단결근: -50점  ← 어디서 결근하든 동일한 패널티
```

**규칙 변경 권한**: master(시스템 관리자)만 전역 규칙을 변경할 수 있다.
개별 owner는 자기 조직의 점수 규칙을 바꿀 수 없다. 이것이 공정성의 핵심이다.

> 만약 owner가 "우리 매장은 결근 -10점만"이라고 바꿀 수 있다면, 그 매장 직원의 점수는 의미 없는 숫자가 된다.

### 1-3. 장기 비전 — 채용 시장 연계

```
Phase 1 (현재): 내부 게이미피케이션
  → 직원이 본인 점수를 확인하고 동기부여

Phase 2 (SaaS 전환 후): 크레딧 카드 공유
  → 직원이 "근태 프로필"을 이미지로 캡처해 카카오/인스타/이력서에 첨부

Phase 3 (장기 — 사용자 수 확보 후): 채용 연계
  → 사장님이 "출첵에서 골드 이상 직원 구합니다" 채용 공고
  → 직원이 "내 크레딧 공개" 동의 → 사장님이 점수 확인 후 초대
  → 출첵이 "아르바이트 채용 플랫폼"으로 확장
```

**Phase 3는 사용자 수에 달려 있다.** 수천 개 조직, 수만 명 직원이 모이면 자연스럽게 가능해진다.
현 단계에서는 Phase 1~2에 집중하되, DB 설계는 Phase 3를 고려해 둔다.

---

## 2. 다중 조직 환경에서의 크레딧

### 2-1. 데이터 구조

```
attendance_credits (기존 테이블 수정)
├── id                     uuid PK
├── profile_id             uuid FK → profiles
├── organization_id        uuid FK → organizations   ← 신규 추가
├── event_type             text
├── points                 integer
├── description            text
├── reference_id           uuid (nullable)
├── reference_date         date (nullable)
├── invalidated_by         uuid (nullable)
└── created_at             timestamptz

profiles
├── credit_score           integer   ← 전역 SUM (변경 없음)
├── current_streak         integer
├── longest_streak         integer
└── streak_milestones_claimed  integer[]
```

**organization_id의 역할**: 순수하게 **출처 추적용**이다. "이 +3점은 연경당에서 발생했고, 이 -50점은 홍길동 우육면에서 발생했다"는 기록만 남긴다.

### 2-2. 점수 합산은 전역

```sql
-- sync_credit_score() 트리거 (기존 — 변경 불필요)
-- attendance_credits INSERT/UPDATE/DELETE 후 자동 실행
-- WHERE invalidated_by IS NULL 조건으로 전체 SUM
-- organization_id와 무관하게 합산

UPDATE profiles
SET credit_score = (
  SELECT COALESCE(SUM(points), 0)
  FROM attendance_credits
  WHERE profile_id = NEW.profile_id
    AND invalidated_by IS NULL
) + 500   -- 기본 500점
WHERE id = NEW.profile_id;
```

**확인 사항**: 기존 `sync_credit_score()` 트리거는 `organization_id`를 참조하지 않으므로 수정이 필요 없다. organization_id 컬럼을 추가해도 트리거 로직에 영향 없음.

### 2-3. 크로스 조직 영향 시나리오

```
김직원: 조직A(카페) + 조직B(식당) 동시 소속

시나리오 1: 조직A에서 정상 출근 → +3점 (전역 반영)
시나리오 2: 조직B에서 무단결근 → -50점 (전역 반영)
           → 조직A에서 보여주는 점수도 -50점 감소

이것이 맞다. 어디서든 결근하면 "이 사람의 근태 신뢰도"가 떨어지는 것이다.
```

### 2-4. credit-engine.ts 수정 사항

```typescript
// insertCredit 헬퍼에 organization_id 추가
async function insertCredit(params: {
  profile_id: string;
  event_type: string;
  points: number;
  description: string;
  reference_id?: string;
  reference_date?: string;
  organization_id?: string;   // ← 신규
}) { ... }

// processCheckinCredit에 organizationId 파라미터 추가
export async function processCheckinCredit(
  profileId: string,
  checkinTime: string,
  slotDate: string,
  slotStartTime: string,
  organizationId: string,  // ← 신규
): Promise<{ event_type: string; points: number } | null> { ... }

// _settlementCore에 organization_id 전달
// schedule_slots 조회 시 organization_id 포함, 각 크레딧에 출처 기록
```

합산 로직(`sync_credit_score()` 트리거)은 변경 불필요.

---

## 3. 크레딧 카드 모달 상세 설계

### 3-1. 진입점

```
마이페이지(/[slug]/my)
  └── [내 근태 카드 보기] 버튼
        → CreditCardModal 오픈

크레딧 이력(/[slug]/credit-history)
  └── 티어 카드 영역 탭
        → CreditCardModal 오픈
```

### 3-2. 카드 UI 레이아웃

```
┌──────────────────────────────────────────┐
│  ┌────────────────────────────────────┐  │
│  │                                    │  │
│  │     출첵 근태 프로필               │  │
│  │                                    │  │
│  │     김민수                         │  │
│  │     ────────────────────────────   │  │
│  │                                    │  │
│  │     💎 다이아몬드 티어             │  │
│  │     크레딧 점수: 920               │  │
│  │     ████████████████████░░  92%    │  │
│  │                                    │  │
│  │     📊 근태 요약                  │  │
│  │     ├─ 총 근무일수: 342일         │  │
│  │     ├─ 정시 출근율: 96.8%         │  │
│  │     ├─ 최장 연속 출근: 87일       │  │
│  │     ├─ 결근: 2회                  │  │
│  │     └─ 활동 기간: 2024.03 ~ 현재  │  │
│  │                                    │  │
│  │     🏢 근무 이력                  │  │
│  │     ├─ 연경당 카페                │  │
│  │     │  2024.03 ~ 현재             │  │
│  │     └─ 홍길동 우육면              │  │
│  │        2025.01 ~ 2025.08          │  │
│  │                                    │  │
│  │     ─────────────────────────────  │  │
│  │     출첵 | chulchek.app            │  │
│  │     2026.03.25 기준                │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────┐ ┌────────────┐ ┌────────┐  │
│  │ 저장   │ │ 카카오 공유 │ │ 프린트 │  │
│  └────────┘ └────────────┘ └────────┘  │
│                                          │
│           [닫기]                         │
└──────────────────────────────────────────┘
```

### 3-3. 카드에 포함되는 정보

| 항목 | 출처 | 비고 |
|------|------|------|
| 이름 | `profiles.name` | |
| 티어 | `getTier(credit_score)` | 아이콘 + 색상 |
| 점수 | `profiles.credit_score` | |
| 티어 진행률 | `getTierProgress(credit_score)` | 프로그래스 바 |
| 총 근무일수 | `COUNT(DISTINCT reference_date)` from `attendance_credits` WHERE event_type IN (normal_attendance, late_minor, late_major) | |
| 정시 출근율 | `normal_attendance / (normal + late_minor + late_major) * 100` | |
| 최장 연속 출근 | `profiles.longest_streak` | |
| 결근 횟수 | `COUNT(*)` from `attendance_credits` WHERE event_type = 'no_show' AND invalidated_by IS NULL | |
| 활동 기간 | 최초 크레딧 이벤트 ~ 현재 | `MIN(created_at)` |
| 근무 이력 | `organization_memberships` JOIN `organizations` | 조직명 + 가입/퇴사일 |
| 발급일 | 현재 날짜 | |

### 3-4. 카드 데이터 조회 Server Action

```typescript
// src/lib/credit-card-data.ts
"use server";

export async function getCreditCardData(profileId: string) {
  // 1. 프로필 기본 정보
  const { data: profile } = await supabase
    .from("profiles")
    .select("name, credit_score, longest_streak")
    .eq("id", profileId)
    .single();

  // 2. 근태 통계 (전역)
  const { data: stats } = await supabase
    .from("attendance_credits")
    .select("event_type, reference_date, created_at, invalidated_by")
    .eq("profile_id", profileId)
    .in("event_type", ["normal_attendance", "late_minor", "late_major", "no_show"])
    .is("invalidated_by", null);

  // 3. 근무 이력 (조직 소속 정보)
  const { data: memberships } = await supabase
    .from("organization_memberships")
    .select(`
      join_date, terminated_at, status,
      organizations(name)
    `)
    .eq("profile_id", profileId)
    .order("join_date", { ascending: true });

  // 4. 통계 계산
  const normalCount = stats.filter(s => s.event_type === "normal_attendance").length;
  const lateCount = stats.filter(s => ["late_minor", "late_major"].includes(s.event_type)).length;
  const noShowCount = stats.filter(s => s.event_type === "no_show").length;
  const totalWorkDays = new Set(stats.filter(s => s.event_type !== "no_show").map(s => s.reference_date)).size;
  const onTimeRate = totalWorkDays > 0 ? (normalCount / (normalCount + lateCount)) * 100 : 0;
  const firstActivity = stats.length > 0 ? stats.sort((a, b) => a.created_at.localeCompare(b.created_at))[0].created_at : null;

  return {
    name: profile.name,
    creditScore: profile.credit_score,
    longestStreak: profile.longest_streak,
    totalWorkDays,
    onTimeRate: Math.round(onTimeRate * 10) / 10,
    noShowCount,
    firstActivityDate: firstActivity,
    workHistory: memberships.map(m => ({
      orgName: m.organizations.name,
      joinDate: m.join_date,
      terminatedAt: m.terminated_at,
      status: m.status,
    })),
  };
}
```

### 3-5. html2canvas 구현 전략

```typescript
// CreditCardModal.tsx 내부

import html2canvas from "html2canvas";

const cardRef = useRef<HTMLDivElement>(null);

// 이미지 캡처 & PNG 다운로드
async function handleSaveImage() {
  if (!cardRef.current) return;

  const canvas = await html2canvas(cardRef.current, {
    scale: 2,                    // Retina 해상도
    backgroundColor: "#FFFFFF",
    useCORS: true,
    logging: false,
    // 폰트 렌더링 안정화
    onclone: (doc) => {
      const card = doc.querySelector("[data-credit-card]");
      if (card) {
        (card as HTMLElement).style.fontFamily = "Pretendard, sans-serif";
      }
    },
  });

  // PNG 다운로드
  const link = document.createElement("a");
  link.download = `출첵_근태프로필_${format(new Date(), "yyyyMMdd")}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();

  toast.success("이미지가 저장되었어요");
}
```

**html2canvas 주의사항:**
- Tailwind CSS의 `backdrop-blur` 등 일부 속성은 캡처 안 될 수 있음 → 카드 영역은 단순 배경색 사용
- SVG(TierBadge)는 `html2canvas`에서 지원됨 → 별도 처리 불필요
- 폰트: `@font-face`가 로드된 상태에서 캡처해야 함 → `document.fonts.ready` 대기
- 카드 div에 고정 너비(예: 360px) 설정 → 기기 무관 일관된 출력

### 3-6. 카카오톡 공유

```typescript
// 카카오 SDK 초기화는 앱 레벨에서 1회
// _app.tsx 또는 layout.tsx에서:
// <Script src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.0/kakao.min.js" />
// Kakao.init(process.env.NEXT_PUBLIC_KAKAO_JS_KEY);

async function handleKakaoShare() {
  if (!cardRef.current) return;

  // 1. html2canvas로 이미지 생성
  const canvas = await html2canvas(cardRef.current, { scale: 2, backgroundColor: "#fff" });
  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/png")
  );

  // 2. 이미지를 임시 URL로 업로드 (Supabase Storage public 버킷 또는 imgbb 등)
  //    또는 base64 data URL 사용 (카카오 제한 주의)
  const imageUrl = await uploadTempImage(blob);

  // 3. 카카오 공유
  if (typeof window !== "undefined" && window.Kakao) {
    window.Kakao.Share.sendDefault({
      objectType: "feed",
      content: {
        title: `${name}님의 출첵 근태 프로필`,
        description: `${tier.emoji} ${tier.name} 티어 | ${creditScore}점 | 정시출근율 ${onTimeRate}%`,
        imageUrl: imageUrl,
        link: {
          mobileWebUrl: "https://chulchek.app",
          webUrl: "https://chulchek.app",
        },
      },
      buttons: [
        {
          title: "출첵 시작하기",
          link: {
            mobileWebUrl: "https://chulchek.app",
            webUrl: "https://chulchek.app",
          },
        },
      ],
    });
  }
}
```

**카카오 공유 방식 결정:**
- 카카오 공유 API의 `imageUrl`은 외부 접근 가능한 URL이어야 한다.
- 선택지 A: Supabase Storage에 임시 업로드 (public 버킷, 24시간 후 자동 삭제)
- 선택지 B: 이미지 없이 텍스트만 공유 (간단하지만 임팩트 약함)
- **권장: 선택지 A** — 카드 이미지가 카톡 대화방에 바로 보이는 게 핵심 가치

### 3-7. 프린트 CSS

```css
/* globals.css 또는 별도 print.css */
@media print {
  /* 모달 배경/버튼 숨기기 */
  body > *:not([data-credit-card-print]) {
    display: none !important;
  }

  [data-credit-card-print] {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    margin: 0;
    padding: 40px;
    background: white;
  }

  /* 카드 영역만 표시 */
  [data-credit-card] {
    width: 360px;
    margin: 0 auto;
    box-shadow: none;
    border: 1px solid #E5E8EB;
  }
}
```

```typescript
function handlePrint() {
  // data-credit-card-print 속성을 모달에 추가한 상태에서
  window.print();
}
```

---

## 4. 크레딧 이력 페이지 확장

### 4-1. 현재 상태 분석

현재 `CreditHistoryClient.tsx`는:
- 티어 카드 (점수, 티어, 프로그래스 바)
- 연속출근 진척도 (StreakProgress)
- 이번 달 크레딧 요약 (가점/감점/순변동)
- 이벤트 이력 리스트 (무한 스크롤)

### 4-2. 추가 기능: 조직별 필터

다중 조직 환경에서 "어디서 발생한 점수인지" 구분이 필요하다.

```
┌────────────────────────────────────────┐
│  크레딧 이력                           │
│                                        │
│  필터: [전체 ▾]                        │
│         ├─ 전체                        │
│         ├─ 연경당 카페                 │
│         └─ 홍길동 우육면               │
│                                        │
│  ┌────────────────────────────────────┐│
│  │ 정상 출퇴근        3/14 (목)  +3  ││
│  │ 🏷️ 연경당 카페                    ││
│  ├────────────────────────────────────┤│
│  │ 무단결근           3/12 (화) -50  ││
│  │ 🏷️ 홍길동 우육면                  ││
│  └────────────────────────────────────┘│
└────────────────────────────────────────┘
```

**구현:**
- `attendance_credits` 쿼리에 `.eq("organization_id", selectedOrgId)` 조건부 추가
- 이벤트 항목마다 조직명 표시 (작은 태그)
- 필터 드롭다운: 사용자의 `organization_memberships` 목록에서 생성

### 4-3. 추가 기능: 기간별 추이 그래프

```
┌────────────────────────────────────────┐
│  크레딧 추이                           │
│                                        │
│  650 ─                                 │
│       │         ╭──╮                   │
│  600 ─│     ╭──╯  ╰──╮    ╭──        │
│       │ ╭──╯          ╰──╯            │
│  550 ─│╯                               │
│       │                                 │
│  500 ─┼────┬────┬────┬────┬────┬──    │
│        10월  11월  12월  1월   2월  3월 │
│                                        │
│  기간: [최근 6개월 ▾]                  │
└────────────────────────────────────────┘
```

**구현 전략:**
- 별도 라이브러리 없이 SVG 직접 렌더링 (경량)
- 또는 `recharts` 사용 (이미 사용 중이라면)
- 데이터: 월별 `SUM(points)` GROUP BY `DATE_TRUNC('month', reference_date)`
- 누적 합산 그래프 (각 월의 총 점수)

### 4-4. 추가 기능: 월간 리포트 카드

```
┌────────────────────────────────────────┐
│  3월 리포트                            │
│                                        │
│  정상출근 18회 │ 지각 2회 │ 결근 0회   │
│  ██████████████│██        │             │
│       90%      │  10%     │   0%        │
│                                        │
│  순변동: +39점                         │
│  가점: +54 / 감점: -15                 │
└────────────────────────────────────────┘
```

---

## 5. 스트릭 시스템 다중 조직 처리

### 5-1. 핵심 질문

> 조직A에서 출근 + 조직B에서 출근 = 스트릭이 어떻게 되는가?

### 5-2. 설계 결정: 전역 스트릭 (권장)

```
규칙: 하루 중 어떤 조직이든 1회 이상 "정상 출근" → 스트릭 유지
     하루 전체에서 출근 기록 없음 + 스케줄 있음 → 스트릭 리셋
```

**논거:**
- 크레딧이 전역이므로 스트릭도 전역이어야 일관성이 있다
- 조직별 스트릭은 관리 복잡도만 높이고 직원 입장에서 혼란스럽다
- "매일 성실하게 출근하는 사람"이라는 의미는 조직과 무관하다

### 5-3. 스트릭 판정 로직 변경

```
현재 (단일 조직):
  출근 시 → processCheckinCredit() → normal_attendance이면 스트릭+1
  지각/결근 시 → 스트릭 리셋

변경 (다중 조직):
  출근 시 → processCheckinCredit() → normal_attendance이면:
    해당 날짜에 이미 스트릭이 증가했는지 확인
    (attendance_credits에서 해당 날짜 normal_attendance 존재 여부)
    이미 있으면 → 스트릭 증가 건너뜀 (중복 방지)
    없으면 → 스트릭+1

  일일 정산 시 (cron):
    해당 날짜에 스케줄이 있는데 전혀 출근 안 한 경우 → 스트릭 리셋
    단, 조직A에서 스케줄 있고 결근이지만 조직B에서 정상 출근했으면?
    → 스트릭은 유지 (전역 기준: 하루 1회 이상 정상 출근)
    → 단, 조직A 결근 감점(-50)은 그대로 적용
```

### 5-4. 엣지 케이스

| 시나리오 | 스트릭 | 점수 |
|---------|--------|------|
| 조직A 정상 출근, 조직B 정상 출근 | +1 (중복 증가 없음) | +3 +3 = +6 |
| 조직A 정상 출근, 조직B 결근 | 유지 (하루 1회 정상 출근 충족) | +3 -50 = -47 |
| 조직A 지각, 조직B 정상 출근 | 유지 (정상 출근 1회 이상) | -3 +3 = 0 |
| 조직A 결근, 조직B 결근 | 리셋 | -50 -50 = -100 |
| 어떤 조직에도 스케줄 없음 | 변동 없음 (당일 판정 대상 아님) | 변동 없음 |

### 5-5. updateStreak 수정 방향

```typescript
async function updateStreak(profileId: string, reset: boolean, referenceDate: string) {
  // 리셋 요청이 와도, 같은 날 다른 조직에서 정상 출근이 있었다면 리셋하지 않음
  if (reset) {
    const { data: sameDayNormal } = await adminSupabase
      .from("attendance_credits")
      .select("id")
      .eq("profile_id", profileId)
      .eq("reference_date", referenceDate)
      .eq("event_type", "normal_attendance")
      .is("invalidated_by", null)
      .limit(1);

    if (sameDayNormal && sameDayNormal.length > 0) {
      return; // 같은 날 정상 출근 존재 → 스트릭 유지
    }
  }

  // 정상 출근인 경우, 이미 오늘 스트릭을 올렸는지 확인
  if (!reset) {
    // ... 기존 스트릭 증가 + 마일스톤 로직 (중복 증가 방지 추가)
  }
}
```

---

## 6. 티어 혜택 확장

### 6-1. 현재 혜택 (기존 구현)

| 티어 | 혜택 |
|------|------|
| 다이아몬드 (900+) | 원격퇴근 자동 승인 |
| 플래티넘 (750+) | 원격퇴근 자동 승인 |
| 골드 (600+) | (없음) |
| 실버 이하 | (없음) |

### 6-2. 확장 가능한 혜택 목록

```
혜택 Type A: 플랫폼 기본 혜택 (모든 조직 동일 적용)
──────────────────────────────────────────────
다이아몬드/플래티넘: 원격퇴근 자동 승인
골드 이상: 대타 요청 시 우선 매칭 (대타 알림 먼저 수신)
실버 이상: 스케줄 희망 시간 우선 반영

혜택 Type B: owner 커스텀 혜택 (조직별 설정)
──────────────────────────────────────────────
owner가 "우리 매장 혜택" 직접 설정 가능:
  예) 다이아몬드 직원 → 음료 무료 1잔/주
  예) 골드 이상 → 월 1회 조기퇴근 허용
  예) 플래티넘 → 연차 1일 추가

→ 이 혜택은 점수 규칙과 무관 (규칙은 전역, 혜택은 조직별)
→ 보상 설정일 뿐이므로 공정성에 영향 없음
```

### 6-3. owner 커스텀 혜택 DB 설계

```sql
CREATE TABLE tier_benefits (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tier_key          text NOT NULL,          -- 'diamond'|'platinum'|'gold'|'silver'|'bronze'|'iron'
  benefit_text      text NOT NULL,          -- "음료 무료 1잔/주"
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- owner가 /[slug]/admin/settings에서 설정
-- 직원 마이페이지에서 "우리 매장 혜택" 섹션으로 표시
```

### 6-4. 혜택 표시 UI (직원 마이페이지)

```
┌────────────────────────────────────────┐
│  💎 다이아몬드 혜택                    │
│                                        │
│  🌐 플랫폼 혜택                       │
│  ├─ 원격퇴근 자동 승인                │
│  ├─ 대타 요청 우선 매칭               │
│  └─ 스케줄 희망 시간 우선 반영         │
│                                        │
│  🏢 연경당 카페 혜택                  │
│  ├─ 음료 무료 1잔/주                  │
│  └─ 월 1회 조기퇴근 허용              │
│                                        │
│  다음 티어까지: 해당 없음 (최고 등급)  │
└────────────────────────────────────────┘
```

---

## 7. 게이미피케이션 요소

### 7-1. 월별 랭킹 (조직 내)

```
/[slug]/credit-history 하단 또는 별도 탭

┌────────────────────────────────────────┐
│  3월 출근왕 랭킹                       │
│                                        │
│  🥇 김민수   +54점  (18회 정상출근)   │
│  🥈 이영희   +48점  (16회 정상출근)   │
│  🥉 박철수   +39점  (13회 정상출근)   │
│     ...                                │
│  5. 나 (본인) +21점                   │
│                                        │
│  ⚠️ 랭킹은 이번 달 순변동 기준이에요  │
└────────────────────────────────────────┘
```

**설계 결정:**
- 랭킹은 **조직 내** 한정 (전역 랭킹은 프라이버시 이슈)
- 월별 순변동(가점-감점) 기준
- owner가 랭킹 공개/비공개 설정 가능 (기본: 공개)
- 1~3위에게 배지 부여 (향후)

**쿼리:**
```sql
SELECT
  p.id, p.name,
  SUM(ac.points) as monthly_change,
  COUNT(*) FILTER (WHERE ac.event_type = 'normal_attendance') as normal_count
FROM attendance_credits ac
JOIN profiles p ON p.id = ac.profile_id
WHERE ac.organization_id = :org_id
  AND ac.reference_date >= DATE_TRUNC('month', CURRENT_DATE)
  AND ac.reference_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
  AND ac.invalidated_by IS NULL
GROUP BY p.id, p.name
ORDER BY monthly_change DESC;
```

### 7-2. 도전과제 / 배지 시스템 (Phase 2 이후)

```
배지 카테고리:
──────────────
🌅 첫 출근       : 첫 정상 출근 기록
🔥 불꽃 10일     : 연속출근 10일 달성
⚡ 번개 30일     : 연속출근 30일 달성
💫 전설 100일    : 연속출근 100일 달성
🎯 완벽한 한 달   : 한 달 전체 지각/결근 0회
🦸 대타 히어로   : 대타 수락 5회 이상
💎 다이아 등극    : 다이아몬드 티어 최초 달성
📈 V자 반등      : 한 달 내 100점 이상 회복
🏆 출근왕        : 월간 랭킹 1위 달성
```

**DB 설계 (향후):**

```sql
CREATE TABLE badges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,       -- 'first_checkin', 'streak_10', ...
  name        text NOT NULL,
  emoji       text NOT NULL,
  description text NOT NULL,
  condition   jsonb NOT NULL              -- 달성 조건 (코드에서 해석)
);

CREATE TABLE user_badges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES profiles(id),
  badge_id    uuid NOT NULL REFERENCES badges(id),
  earned_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id, badge_id)
);
```

**구현 시기**: SaaS 전환 후 사용자 피드백을 받고 Phase 2에서 도입. 지금은 DB 설계만 준비.

### 7-3. 보상 연계 가능성

```
가능한 연계 (owner 설정):
─────────────────────────
1. 급여 보너스: 다이아몬드 직원 → 시급 +500원
   → payroll_entries 계산 시 티어별 보너스 적용
   → 노무법인 확인 필요 (급여 차등 지급의 법적 근거)

2. 상품 지급: 월간 1위 → 기프티콘 등
   → 앱 내 처리 아님, owner가 직접 지급
   → 앱에서는 "이번 달 1위에요! 사장님에게 보상을 요청해 보세요" 알림만

3. 추가 휴무: 골드 이상 → 월 1회 추가 휴무 신청 가능
   → 향후 휴가 시스템 도입 시 연계
```

**현 단계 결정**: 급여 보너스 연계는 법적 이슈가 있으므로 보류. 상품/추가 휴무는 owner가 자율적으로 운영하도록 안내만 제공.

---

## 8. 악용 방지

### 8-1. 점수 조작 방지

```
위협 1: owner가 특정 직원 점수를 부당하게 올리거나 내리는 경우

대응:
  - admin_adjustment 이벤트는 audit_logs에 자동 기록
  - master 대시보드에서 비정상 조정 패턴 감지
    예) "이 조직에서 1주일에 admin_adjustment 10건 이상"
  - 전역 규칙이므로 owner가 규칙 자체를 바꿀 수 없음
  - admin_adjustment 포인트에 상한선 설정: 1회 최대 +/- 30점
```

```sql
-- admin_adjustment 감사 로그 자동 기록 (트리거)
CREATE OR REPLACE FUNCTION audit_credit_adjustment()
RETURNS trigger AS $$
BEGIN
  IF NEW.event_type = 'admin_adjustment' THEN
    INSERT INTO audit_logs (
      organization_id, actor_id, action, resource_type, resource_id, details
    ) VALUES (
      NEW.organization_id, auth.uid(), 'credit_adjustment', 'attendance_credits', NEW.id,
      jsonb_build_object(
        'target_profile_id', NEW.profile_id,
        'points', NEW.points,
        'description', NEW.description
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_audit_credit_adjustment
AFTER INSERT ON attendance_credits
FOR EACH ROW EXECUTE FUNCTION audit_credit_adjustment();
```

### 8-2. 부당한 결근 처리 → 이의신청 시스템

```
직원 플로우:
  크레딧 이력에서 "무단결근 -50점" 항목 발견
  → [이의 신청하기] 버튼 탭
  → 사유 선택:
    ├─ GPS 오류로 출근 인정 안 됨
    ├─ 앱 장애로 출근 기록 실패
    ├─ 사전에 결근 사유를 알렸는데 반영 안 됨
    └─ 기타 (직접 입력)
  → 증거 첨부 (선택): 스크린샷 등
  → 제출

owner 플로우:
  알림: "김직원이 3/12 결근 크레딧에 이의를 신청했어요"
  → 이의 내용 확인
  → [승인] → reverseCredit() 호출 → 감점 무효화 + 알림
  → [거절] → 사유 입력 → 직원에게 알림
```

**기존 구현 연계**: `reverseCredit()` 함수가 이미 감점 무효화 기능을 제공하고 있다. 이의신청 시스템은 이 함수를 호출하는 UI 레이어만 추가하면 된다.

### 8-3. 추가 악용 시나리오

| 시나리오 | 대응 |
|---------|------|
| 직원이 GPS 조작으로 허위 출근 | 현재: 위치 기반 검증. 추가: 출근 시 Wi-Fi SSID 검증 (향후) |
| owner가 유령 직원 만들어 대타 보너스 받기 | 대타 보너스는 월 2회까지만. 비정상 패턴 감지 (같은 기기에서 다른 계정 반복 출근) |
| 여러 조직에 형식적 가입 후 스트릭만 쌓기 | 스케줄이 배정된 조직에서만 크레딧 발생. 스케줄 없으면 출근 자체 불가 |

---

## 9. 데이터 프라이버시

### 9-1. 핵심 원칙: 본인 주도 공유

```
크레딧 점수는 민감한 개인 정보로 취급한다.

공유는 반드시 본인이 직접 수행한다:
  ✅ 본인이 크레딧 카드 모달에서 [이미지 저장] 또는 [카카오 공유]
  ✅ 본인이 면접에서 캡처 이미지를 보여줌

서버에서 외부 공개하는 기능은 없다:
  ❌ 공개 URL로 다른 사람 크레딧 조회 → 불가
  ❌ API로 특정 사용자 크레딧 조회 → 불가 (RLS로 차단)
  ❌ 채용 연계 시 동의 없이 점수 노출 → 불가
```

### 9-2. owner가 직원 크레딧을 볼 수 있는 범위

```
owner가 볼 수 있는 것:
  ✅ 자기 조직 소속 직원의 현재 크레딧 점수 (profiles.credit_score)
  ✅ 자기 조직에서 발생한 크레딧 이벤트 (organization_id 필터)
  ✅ 자기 조직 내 월별 랭킹

owner가 볼 수 없는 것:
  ❌ 직원이 다른 조직에서 받은 감점/가점 상세
  ❌ 직원의 다른 조직 소속 정보
  ❌ 직원의 전체 크레딧 이벤트 목록 (자기 조직 발생분만)
```

**RLS 정책:**
```sql
-- attendance_credits: owner는 자기 조직 크레딧만 조회
CREATE POLICY "org_admin_view_credits" ON attendance_credits
  FOR SELECT
  USING (
    is_org_admin(organization_id)
    OR profile_id = auth.uid()  -- 본인 것은 전체 조회 가능
  );

-- profiles.credit_score: 같은 조직 멤버이면 점수만 조회 가능
-- (점수 자체는 보이지만, 상세 이력은 자기 조직 것만)
```

### 9-3. 채용 연계 시 프라이버시 (Phase 3)

```
향후 채용 연계 시:
  1. 직원이 명시적으로 "크레딧 공개" 동의
  2. 공개 범위 선택: 점수만 / 점수+통계 / 전체 카드
  3. 동의 철회 시 즉시 비공개 전환
  4. 개인정보처리방침에 크레딧 공유 조항 추가
```

---

## 10. 구현 순서 & 체크리스트

### Phase 1: SaaS 전환 시 크레딧 마이그레이션 (블루프린트 Phase 5 포함)

```
□ attendance_credits에 organization_id 컬럼 추가
□ 기존 데이터에 연경당 organization_id 백필
□ credit-engine.ts에 organizationId 파라미터 추가
  □ insertCredit() — organization_id 포함
  □ processCheckinCredit() — organizationId 파라미터
  □ _settlementCore() — 조직별 루프 + organization_id 전달
□ updateStreak() — 다중 조직 스트릭 로직 반영
  □ 같은 날 다른 조직 정상출근 확인 → 스트릭 유지
  □ 중복 스트릭 증가 방지
□ sync_credit_score() 트리거 — 변경 불필요 확인 (테스트)
□ RLS 정책: attendance_credits에 organization_id 기반 정책 추가
```

### Phase 2: 크레딧 카드 모달 구현

```
□ getCreditCardData() Server Action 작성
  □ 프로필 기본 정보
  □ 근태 통계 (전역)
  □ 근무 이력 (organization_memberships)
□ CreditCard.tsx 컴포넌트 (카드 렌더링)
  □ 카드 디자인 구현 (섹션 3-2 참조)
  □ TierBadge, TierProgressBar 재활용
  □ 근무 이력 목록
  □ 고정 너비 360px (캡처 일관성)
□ CreditCardModal.tsx 모달 컴포넌트
  □ 카드 표시 + 하단 액션 버튼
  □ [이미지로 저장] — html2canvas → PNG 다운로드
    □ html2canvas 패키지 설치
    □ scale: 2 (Retina)
    □ document.fonts.ready 대기
  □ [카카오톡 공유] — Kakao.Share.sendDefault
    □ 카카오 SDK 초기화 (layout.tsx)
    □ 임시 이미지 업로드 (Supabase Storage public 버킷)
    □ 공유 메시지 구성
  □ [프린트] — window.print()
    □ @media print CSS 작성
□ 마이페이지에 [내 근태 카드 보기] 버튼 추가
□ 크레딧 이력 페이지에 카드 모달 진입점 추가
```

### Phase 3: 크레딧 이력 페이지 확장

```
□ 조직별 필터 드롭다운
  □ organization_memberships에서 사용자 소속 목록 조회
  □ 필터 적용 시 attendance_credits 쿼리에 organization_id 조건
  □ 이벤트 항목마다 조직명 태그 표시
□ 기간별 추이 그래프
  □ SVG 또는 recharts로 월별 누적 점수 그래프
  □ 기간 선택: 최근 3개월 / 6개월 / 1년 / 전체
□ 월간 리포트 카드 (이번 달 요약 확장)
```

### Phase 4: 게이미피케이션 요소

```
□ 월별 조직 내 랭킹
  □ 랭킹 쿼리 (월별 순변동 기준)
  □ 크레딧 이력 하단에 랭킹 섹션 추가
  □ owner 설정: 랭킹 공개/비공개
□ owner 커스텀 혜택
  □ tier_benefits 테이블 생성
  □ /[slug]/admin/settings에 혜택 설정 UI
  □ 직원 마이페이지에 혜택 표시
□ 이의신청 시스템
  □ 크레딧 이벤트 항목에 [이의 신청] 버튼
  □ 이의 제출 폼 (사유 선택 + 텍스트)
  □ owner 알림 + 승인/거절 UI
  □ reverseCredit() 연결
□ admin_adjustment 감사 트리거
```

### Phase 5: 고도화 (장기)

```
□ 도전과제/배지 시스템
  □ badges, user_badges 테이블
  □ 배지 달성 조건 판정 로직
  □ 배지 표시 UI (마이페이지, 크레딧 카드)
□ 채용 연계 (Phase 3 — 사용자 수 확보 후)
  □ "크레딧 공개" 동의 기능
  □ 공개 프로필 페이지 (opt-in)
  □ 사장님 채용 검색 UI
□ 비정상 패턴 감지 대시보드 (master)
  □ admin_adjustment 빈도 이상
  □ 같은 기기 다중 계정 패턴
  □ GPS 좌표 이상 패턴
```

---

## 부록 A: 파일 변경 매핑

### 신규 생성

| 파일 | 설명 |
|------|------|
| `src/components/CreditCard.tsx` | 크레딧 카드 렌더 컴포넌트 |
| `src/components/CreditCardModal.tsx` | 카드 모달 (캡처/공유/프린트) |
| `src/components/KakaoShareButton.tsx` | 카카오 공유 버튼 (재사용) |
| `src/lib/credit-card-data.ts` | 카드 데이터 조회 Server Action |

### 수정

| 파일 | 변경 내용 |
|------|-----------|
| `src/lib/credit-engine.ts` | organization_id 파라미터 추가, 스트릭 다중 조직 처리 |
| `src/app/credit-history/CreditHistoryClient.tsx` | 조직별 필터, 추이 그래프, 랭킹 |
| `src/app/credit-history/page.tsx` | 조직 목록 데이터 추가 전달 |
| `src/app/[slug]/my/page.tsx` | 크레딧 카드 모달 진입 버튼 |

### 패키지 추가

| 패키지 | 용도 |
|--------|------|
| `html2canvas` | 크레딧 카드 이미지 캡처 |

---

## 부록 B: 크레딧 점수 시뮬레이션

6개월간 성실한 직원 vs 불성실한 직원 점수 추이:

```
성실한 직원 (주 5일, 월 22일 근무, 지각 월 1회):
  시작: 500점
  월 1: +3×21 -3×1 = +60 → 560점
  월 2: +3×22 +15(스트릭10) = +81 → 641점 (골드 진입!)
  월 3: +3×22 +50(스트릭30) = +116 → 757점 (플래티넘!)
  월 4: +3×22 = +66 → 823점
  월 5: +3×22 +80(스트릭60) = +146 → 969점 (다이아몬드!)
  월 6: +3×22 = +66 → 1000점 (상한, 다이아몬드 유지)

불성실한 직원 (월 2회 지각, 1회 결근, 1회 당일취소):
  시작: 500점
  월 1: +3×18 -3×1 -10×1 -50×1 -20×1 = -26 → 474점
  월 2: +3×18 -3×1 -10×1 -50×1 -20×1 = -26 → 448점 (브론즈 근접)
  월 3: +3×18 -3×1 -10×1 -50×1 -20×1 = -26 → 422점 (브론즈)
  ...
  스트릭 보너스 없음 (결근/지각으로 계속 리셋)
```

이 시뮬레이션은 크레딧 정책 안내(CreditPolicyModal)에서 "예시로 알아보기" 섹션으로 추가 가능.
