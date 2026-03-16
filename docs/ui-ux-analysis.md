# UI/UX 코드 감사 보고서

> **기준**: `docs/toss-ui-ux-guidelines.md`
> **분석 대상**: `src/app/**`, `src/components/**`
> **작성일**: 2026-03-16
> **분석 범위**: 전체 프론트엔드 코드 완전 탐독 후 작성

---

## 요약

| 분류 | 건수 |
|------|------|
| 🔴 Critical (즉시 수정) | 5건 |
| 🟡 Warning (조속 수정) | 7건 |
| 🟢 Good (잘 된 것) | 11건 |

---

## 🔴 Critical — 즉시 수정 필요

### C-001 네이티브 다이얼로그 4곳 사용

브라우저 기본 `alert()` / `confirm()` 는 토스 디자인 원칙과 완전히 충돌한다. 디자인 제어 불가, 모바일에서 UX 파괴적.

| 파일 | 줄 | 현재 코드 | 문제 |
|------|----|-----------|------|
| `src/app/admin/layout.tsx` | 80 | `alert("접근 권한이 없습니다.")` | native alert + 습니다체 |
| `src/app/page.tsx` | 181 | `confirm("로그아웃 하시겠어요?")` | native confirm |
| `src/app/admin/employees/page.tsx` | 88 | `window.confirm(...)` | native confirm (직원 삭제) |
| `src/app/admin/employees/page.tsx` | 206 | `window.confirm("첨부된 서류를 삭제하시겠습니까?")` | native confirm + 합니까체 |

**수정 방향**: 커스텀 확인 모달 또는 바텀 시트로 대체. 삭제처럼 되돌릴 수 없는 액션은 반드시 커스텀 다이얼로그.

```tsx
// ❌ 현재
const isConfirmed = window.confirm(`정말 [${name}] 직원을 삭제하시겠어요?...`);
if (!isConfirmed) return;

// ✅ 수정 후 — 커스텀 Confirm 상태로 관리
const [confirmTarget, setConfirmTarget] = useState<{id: string, name: string} | null>(null);
// 바텀시트 or 모달로 확인 UI 표시
```

---

### C-002 습니다체 혼용 — 7곳

토스의 핵심 원칙: **모든 문구는 `~해요` 체 통일**.

| 파일 | 줄 | 현재 문구 | 수정 |
|------|----|-----------|------|
| `src/app/admin/layout.tsx` | 287 | `"새로운 알림이 없습니다."` | `"새 알림이 없어요"` |
| `src/app/admin/page.tsx` | 156 | `"해당하는 직원이 없습니다."` | `"해당하는 직원이 없어요"` |
| `src/app/admin/employees/page.tsx` | 96 | `"${name} 직원이 완전히 삭제되었습니다."` | `"${name}님이 삭제됐어요"` |
| `src/app/admin/employees/page.tsx` | 99 | `"삭제 중 오류가 발생했습니다."` | `"삭제에 실패했어요. 다시 시도해주세요"` |
| `src/app/admin/employees/page.tsx` | 122 | `"정보 수정에 실패했습니다."` | `"수정에 실패했어요. 다시 시도해주세요"` |
| `src/app/admin/employees/page.tsx` | 132 | `"정보가 성공적으로 수정되었습니다."` | `"정보를 수정했어요"` |
| `src/app/admin/employees/page.tsx` | 172 | `"서류가 성공적으로 업로드되었습니다."` | `"서류를 업로드했어요"` |
| `src/components/MyInfoModal.tsx` | 176 | `"정보가 수정되었습니다."` | `"정보를 수정했어요"` |

---

### C-003 에러 Toast에 description 없음

`toast.error("에러")` 단독으로 사용 시 사용자가 왜 실패했는지, 어떻게 해결해야 하는지 알 수 없다.

| 파일 | 줄 | 현재 코드 | 수정 |
|------|----|-----------|------|
| `src/components/MyInfoModal.tsx` | 72 | `toast.error("업로드 실패")` | `toast.error("서류 업로드에 실패했어요", { description: "잠시 후 다시 시도해주세요" })` |
| `src/components/MyInfoModal.tsx` | 121 | `toast.error("저장 실패")` | `toast.error("저장에 실패했어요", { description: "잠시 후 다시 시도해주세요" })` |

---

### C-004 페이지 로딩 — Skeleton 없이 텍스트만 표시

`src/app/page.tsx:142-147`
```tsx
// ❌ 현재
if (loading)
  return (
    <div className="min-h-screen bg-[#F2F4F6] flex items-center justify-center">
      로딩 중...
    </div>
  );
```

빈 화면 + 텍스트만 보여주는 것은 토스 패턴과 완전히 다르다. 실제 레이아웃을 반영한 Skeleton UI가 필요하다.

```tsx
// ✅ 수정 방향
if (loading)
  return (
    <div className="flex min-h-screen flex-col bg-[#F2F4F6] font-pretendard">
      <div className="h-[60px] bg-[#F2F4F6]/80" /> {/* nav skeleton */}
      <main className="flex-1 px-5 pb-10 space-y-4">
        <div className="py-6 px-1">
          <div className="h-8 w-40 bg-slate-200 animate-pulse rounded-lg mb-2" />
          <div className="h-5 w-24 bg-slate-200 animate-pulse rounded-lg" />
        </div>
        <div className="bg-white rounded-[28px] p-6 h-[180px] animate-pulse" />
        <div className="bg-white rounded-[28px] p-6 h-[140px] animate-pulse" />
      </main>
    </div>
  );
```

---

### C-005 근무 시간 표기 불일치 — 영문 단위 혼용

`src/app/attendances/page.tsx:198-200`
```tsx
// ❌ 현재 — 영문 단위
{`${Math.floor(session.duration / 60)}h ${session.duration % 60}m`}

// ✅ 수정 — 한국어 단위로 통일
{`${Math.floor(session.duration / 60)}시간 ${session.duration % 60}분`}
```

비교: `admin/attendance/page.tsx:369-370`에서는 `${hours}시간 ${minutes}분` 올바르게 사용 중.

---

## 🟡 Warning — 조속 수정 권장

### W-001 불필요한 폰트 로드 (Geist)

`src/app/layout.tsx` — `geistSans`, `geistMono` 폰트를 import하고 CSS 변수로 설정하지만 실제 컴포넌트 어디서도 `font-sans`나 `--font-geist-*` 를 사용하지 않는다. `font-pretendard`만 사용 중.

```tsx
// ❌ 사용하지 않는 폰트 import (번들 크기 낭비)
import { Geist, Geist_Mono } from "next/font/google";
const geistSans = Geist({ variable: "--font-geist-sans", ... });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", ... });

// ✅ Pretendard만 유지
```

---

### W-002 MyInfoModal CTA 버튼 텍스트

`src/components/MyInfoModal.tsx:357`
```tsx
// ❌ 현재 — "수정 완료"는 결과 상태 표현 (버튼에 부적절)
<Save className="w-5 h-5" /> 수정 완료

// ✅ 수정 — 동작을 나타내는 동사형으로
저장하기
// 또는 아이콘 없이 간단하게
```

참고: `admin/employees/page.tsx:684`의 "정보 저장하기"는 올바른 패턴.

---

### W-003 직원 관리 버튼 레이블 불명확

`src/app/admin/employees/page.tsx:358`
```tsx
// ❌ 현재 — "관리"는 너무 모호
<Edit2 className="w-4 h-4 text-[#8B95A1]" />
<span>관리</span>

// ✅ 수정 — 구체적인 행동 명시
<span>수정하기</span>
// 또는 공간이 좁으면
<span>수정</span>
```

---

### W-004 출퇴근 Toast에 한국어 문장체 부재

`src/components/AttendanceCard.tsx:93`
```tsx
// ⚠️ 현재 — 감탄사로 끝남
toast.success(`${nearestStore.name} ${type === "IN" ? "출근" : "퇴근"} 완료!`)

// ✅ 수정 — 토스 스타일 자연스러운 문장
toast.success(
  type === "IN"
    ? `${nearestStore.name}으로 출근했어요`
    : `${nearestStore.name}에서 퇴근했어요`
)
```

---

### W-005 admin/page 서브헤더 날짜 표현 어색

`src/app/admin/page.tsx:244`
```tsx
// ⚠️ 현재
<p>오늘은 {todayText}입니다. 각 항목을 눌러 상세 명단을 확인하세요.</p>

// ✅ 수정 — 습니다체 제거, 자연스럽게
<p>{todayText} · 항목을 탭해서 상세 명단을 확인하세요.</p>
```

---

### W-006 admin/layout.tsx — 알림 텍스트 개선

`src/app/admin/layout.tsx:286-288`
```tsx
// ⚠️ 현재 — 습니다체 + italic 스타일 (토스에서 italic 거의 안 씀)
<div className="p-12 text-center text-[#8B95A1] text-sm italic">
  새로운 알림이 없습니다.
</div>

// ✅ 수정
<div className="p-12 text-center text-[#8B95A1] text-[14px]">
  새 알림이 없어요
</div>
```

---

### W-007 MyInfoModal — 에러 메시지 tone 개선

`src/components/MyInfoModal.tsx:106`
```tsx
// ⚠️ 현재 — 지시형
return toast.error("이름은 필수입니다.");

// ✅ 수정 — 안내형
return toast.error("이름을 입력해주세요");
```

---

## 🟢 Good — 잘 구현된 부분

코드 분석 중 토스 디자인 기준에 잘 맞게 구현된 패턴들. 신규 개발 시 참고 모델로 활용.

| # | 파일 | 내용 |
|---|------|------|
| 1 | `src/app/login/page.tsx` | `"연경당 합류를 환영해요!"`, `"아이디나 비밀번호가 맞지 않아요."` — `~해요` 체 완벽 |
| 2 | `src/components/AttendanceCard.tsx:42-48` | `toast.error("매장 근처가 아니에요", { description: "약 150m 거리에 있어요" })` — 이유+해결법 포함 |
| 3 | `src/components/WeeklyWorkStats.tsx:95` | `<div className="h-9 w-32 bg-slate-100 animate-pulse rounded-lg" />` — Skeleton 패턴 |
| 4 | `src/app/admin/attendance/page.tsx:349` | `"이 날은 출근 기록이 없어요."` — 공감형 빈 상태 문구 |
| 5 | `src/app/attendances/page.tsx:165,209` | `"데이터를 분석 중이에요..."`, `"기록된 근무 내역이 없어요 ☕️"` — 구체적 로딩/빈 상태 |
| 6 | `src/components/OnboardingFunnel.tsx` | 단계별 퍼널, 하단 고정 CTA, 인라인 유효성 검사 — 토스 퍼널 패턴 완벽 구현 |
| 7 | `src/app/admin/layout.tsx:148-151` | 로딩 시 스피너 (`animate-spin`) — full page loading에 적절 |
| 8 | `src/app/admin/employees/page.tsx:222-227` | 로딩 시 스피너 사용 — 리스트 로딩에 적절 |
| 9 | `src/app/admin/attendance/page.tsx:341-342` | `"총 {X}시간 {Y}분 근무했어요"` — 사용자 친화적 문장형 |
| 10 | `src/components/MyInfoModal.tsx:158-173` | 변경된 항목 자동 감지 후 "연락처와 계좌번호 정보를 수정했어요" 생성 — 상세한 사용자 알림 |
| 11 | 전반 | 색상 팔레트 `#3182F6`, `#191F28`, `#8B95A1`, `#F2F4F6` — 토스 컬러 시스템 일관 적용 |

---

## 수정 우선순위 로드맵

```
1주차 (Critical):
  C-001  네이티브 다이얼로그 4곳 → 커스텀 모달로 교체
  C-002  습니다체 8곳 → 해요체로 일괄 변경
  C-003  Toast 빈약 에러 2곳 → description 추가
  C-005  영문 시간 단위 → 한국어 단위로 수정

2주차 (Warning):
  C-004  로딩 Skeleton 구현 (page.tsx)
  W-001  Geist 폰트 제거
  W-002~W-007  텍스트/레이블 개선
```

---

## 신규 기능 개발 시 참고

위 분석 결과를 바탕으로 새 화면 개발 시 다음을 체크리스트로 활용:

1. **습니다체 없는가?** → 전체 grep: `grep -r "습니다\|했습니다\|되었습니다\|없습니다\|있습니다" src/`
2. **native dialog 없는가?** → `grep -r "alert\|confirm\|prompt" src/`
3. **toast.error에 description 있는가?**
4. **로딩 상태에 Skeleton이 있는가?**
5. **CTA 버튼이 동사형인가?** (`~하기`, `~하다`)
