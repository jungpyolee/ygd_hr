# 유저 분석 & 에러 처리 가이드

> YGD HR 프로젝트의 사용자 행동 분석 및 에러 모니터링 방식 정리

---

## 1. 전체 구조

```
사용자 접속
    ↓
GTM (GTM-5PTDK39H)  ← layout.tsx에 afterInteractive로 삽입
    ├── GA4 태그      → Google Analytics 수집
    └── Clarity 태그  → 세션 녹화 / 히트맵 수집

에러 발생
    ↓
logError() 헬퍼     ← 각 catch 블록에서 호출
    ↓
POST /api/log-error  ← Next.js API Route (서버)
    ├── error_logs 테이블 저장 (Supabase)
    └── 이메일 발송 (Resend → jungpyo5789@gmail.com)
```

---

## 2. 유저 분석

### 2-1. Google Tag Manager

| 항목 | 값 |
|------|-----|
| 컨테이너 ID | `GTM-5PTDK39H` |
| 삽입 위치 | `src/app/layout.tsx` (Next.js Script, afterInteractive) |
| 관리 URL | https://tagmanager.google.com |

GTM을 허브로 GA4, Clarity 두 도구를 관리한다.
코드 배포 없이 GTM 대시보드에서 태그 추가/수정/제거 가능.

### 2-2. GA4 (Google Analytics 4)

| 항목 | 값 |
|------|-----|
| 측정 ID | `G-KW1ZWVM5B6` |
| GTM 태그 유형 | Google 애널리틱스: GA4 구성 |
| 트리거 | All Pages |
| 결과 확인 | https://analytics.google.com |

**볼 수 있는 것:**
- 페이지뷰, 세션 수, 사용자 수
- 유입 경로 (직접 / 검색 / 링크)
- 기기 / OS / 브라우저 분포
- 실시간 접속자

### 2-3. Microsoft Clarity

| 항목 | 값 |
|------|-----|
| 프로젝트 ID | `vzjar7izsb` |
| GTM 태그 유형 | 맞춤 HTML |
| 트리거 | All Pages |
| 결과 확인 | https://clarity.microsoft.com |

**볼 수 있는 것:**
- **세션 녹화** — 실제 사용자 행동을 영상으로 재생
- **히트맵** — 페이지별 클릭/스크롤 집중 구간
- **분노 클릭** — 반응 없는 UI를 반복 클릭한 구간 → UX 개선 포인트
- **데드 클릭** — 링크/버튼이 아닌 곳 클릭

> ⚠️ Clarity는 개인정보를 자동 마스킹 처리하므로 별도 설정 불필요.

---

## 3. 에러 처리

### 3-1. 구성 요소

| 파일 | 역할 |
|------|------|
| `src/lib/logError.ts` | 클라이언트 헬퍼. 에러 발생 시 API Route로 전송 |
| `src/app/api/log-error/route.ts` | 서버. DB 저장 + 이메일 발송 |
| `error_logs` 테이블 | Supabase. 에러 영구 저장 |
| Resend | 이메일 발송 서비스 (무료 3,000건/월) |

### 3-2. error_logs 테이블 스키마

```sql
error_logs (
  id          UUID        PK
  created_at  TIMESTAMPTZ DEFAULT NOW()
  level       TEXT        'error' | 'warn' | 'info'
  message     TEXT        에러 메시지
  stack       TEXT        스택 트레이스
  source      TEXT        발생 위치 (파일/함수명)
  context     JSONB       추가 정보 (profileId, slotId 등)
  profile_id  UUID        에러 발생 사용자
  url         TEXT        발생 페이지 URL
  resolved    BOOLEAN     처리 완료 여부 (기본 false)
)
```

RLS: `is_admin()`만 SELECT / UPDATE 가능. INSERT는 서비스 롤(API Route)만.

### 3-3. 사용법

```typescript
import { logError } from "@/lib/logError";

// catch 블록에서 한 줄 추가
} catch (err) {
  logError({
    message: "슬롯 저장 실패",      // 필수: 에러 제목
    error: err,                      // 스택 자동 추출
    source: "schedules/handleSave",  // 발생 위치
    context: { slotId, profileId },  // 재현에 필요한 데이터
    level: "error",                  // 기본값. warn/info도 가능
  });
  toast.error("저장에 실패했어요");
}
```

**레벨별 동작:**

| level | DB 저장 | 이메일 발송 |
|-------|---------|------------|
| `error` | ✅ | ✅ (5분 내 중복 제외) |
| `warn` | ✅ | ❌ |
| `info` | ✅ | ❌ |

### 3-4. 이메일 알림

| 항목 | 값 |
|------|-----|
| 서비스 | Resend |
| 발신 | `YGD HR <onboarding@resend.dev>` |
| 수신 | `jungpyo5789@gmail.com` |
| 중복 방지 | 동일 message 5분 내 재발송 차단 |
| 환경변수 | `RESEND_API_KEY`, `ERROR_ALERT_EMAIL` |

### 3-5. 현재 연결된 위치

| 파일 | 연결된 에러 |
|------|------------|
| `admin/schedules/page.tsx` | 주차 생성, 슬롯 추가/수정/삭제, 복사, 기본 패턴 채우기, 주/일 확정 |
| `admin/schedules/substitutes/page.tsx` | 대타 반려, 대타 승인 |
| `admin/employees/page.tsx` | 직원 색상 변경, 삭제, 근무 패턴 추가/수정/삭제, 정보 수정 |
| `components/AttendanceCard.tsx` | 출퇴근 기록 실패 |
| `components/OnboardingFunnel.tsx` | 온보딩 저장 실패 |

### 3-6. 에러 로그 조회

**Supabase 대시보드 → Table Editor → error_logs**

또는 SQL:
```sql
-- 미처리 에러 목록
SELECT created_at, message, source, context, url
FROM error_logs
WHERE resolved = false
ORDER BY created_at DESC;

-- 처리 완료 표시
UPDATE error_logs SET resolved = true WHERE id = '...';
```

---

## 4. 환경변수 목록

| 키 | 위치 | 용도 |
|----|------|------|
| `RESEND_API_KEY` | `.env.local` + Vercel | 이메일 발송 |
| `ERROR_ALERT_EMAIL` | `.env.local` + Vercel | 수신 이메일 주소 |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` + Vercel | API Route에서 DB 직접 접근 |

---

## 5. 향후 확장 포인트

- **React Error Boundary** 추가 → 렌더링 에러도 자동 캡처
- **전역 unhandledrejection 리스너** → 놓친 비동기 에러 포착
- **관리자 에러 대시보드** → Supabase 조회 대신 인앱 UI로 확인
- **Clarity + GA4 연동** → Clarity에서 GA4 이벤트 기반 세그먼트 필터링
