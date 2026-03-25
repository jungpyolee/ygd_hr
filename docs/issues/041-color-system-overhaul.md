# 041 — 색상 시스템 전면 개편 (근무지 색상 프리셋 + 스케줄 UX 개선)

> 작성일: 2026-03-25
> 상태: 계획

---

## 배경

스크린샷(KakaoTalk_Photo_2026-03-25) 기반으로 분석한 결과, 현재 앱 전반에서 **색상 역할이 충돌**하고 있음.
특히 직원 스케줄 탭과 관리자 주간 캘린더에서 가독성이 현저히 떨어짐.

---

## 근본 원인 분석

### 1. 색상 역할 충돌 (Critical)

| 색상 | 역할 A (UI 의미) | 역할 B (근무지) |
|------|-----------------|----------------|
| `#3182F6` 파랑 | "내 스케줄" 필터 버튼, primary 액션 | 카페 (`stores.color`) |
| `#00B761` 초록 | "내 근무(출근완료)" 필터 버튼, 정상출근 | 공장 (`stores.color`) |

→ 달력에서 파란 블록이 **"내 스케줄인가? 카페 근무인가?"** 구분 불가.
→ 초록 블록이 **"출근 완료인가? 공장 근무인가?"** 구분 불가.
→ 필터 범례가 있어도 사용자가 직관적으로 해석할 수 없는 구조.

### 2. 관리자 주간 뷰 — 카드 채색 강도 과부하

```
현재: backgroundColor = byId[slot.store_id]?.color  (진한 색상 100% 배경)
      텍스트 = "text-white" (흰색)
```

- 카페(파랑)/공장(초록) 블록이 100% 진한 배경으로 가득 채워짐
- 직원이 많을수록 셀이 강렬한 컬러 블록으로 뒤덮여 정보 위계가 사라짐
- 근태 상태(정상/지각/결근) border-left 색상이 진한 배경 위에서 잘 안 보임

### 3. 직원 달력 — 도트/블록 복잡도

- 레이어 4개(내 스케줄/내 근무/팀/회사)가 동시 on 시, 하루 셀에 블록 + 도트 최대 5개 이상 겹침
- 달력 블록 예정/출근중 모두 진한 storeColor 배경 → 퇴근완료(연한 초록)와 대비가 급격해 통일감 없음

### 4. 근무지 색상 관리 UI 없음

- `stores.color` / `stores.bg_color` 컬럼은 DB에 존재
- 하지만 `admin/settings/page.tsx`는 초과근무/보건증 설정만 다루며, 색상 변경 UI가 **전혀 없음**
- 현재 DB에 박혀있는 파랑/초록이 수정 방법 없이 고정

---

## 개선 계획

---

## WORK A — 근무지 색상 프리셋 + 관리자 설정 UI

### A-1. 프리셋 색상 설계 원칙

- `#3182F6`(primary blue), `#00B761`(success green)과 **절대 겹치지 않는** 색상
- 달력 블록에서 읽기 쉬운 중간 채도
- `bg_color`는 color의 연한 버전 (투명도 `"15"` ~ `"20"` 수준)

### A-2. 프리셋 목록 (8종)

| 프리셋명 | `color` | `bg_color` | 비고 |
|---------|---------|-----------|------|
| 인디고 | `#4F46E5` | `#EEF2FF` | 보라 계열 파랑, primary blue와 확실히 다름 |
| 바이올렛 | `#7C3AED` | `#F5F3FF` | 보라 |
| 로즈 | `#E11D48` | `#FFF1F2` | 선명한 분홍-빨강 |
| 앰버 | `#D97706` | `#FFFBEB` | 따뜻한 황색 |
| 틸 | `#0891B2` | `#ECFEFF` | 시안/틸, 파랑과 다른 계열 |
| 슬레이트 | `#475569` | `#F1F5F9` | 어두운 회색 (중립) |
| 에메랄드 | `#059669` | `#ECFDF5` | 짙은 초록 (success green `#00B761`과 다른 톤) |
| 오렌지 | `#EA580C` | `#FFF7ED` | 진한 주황 |

→ 현재 카페/공장/케이터링에 초기값으로 각각 인디고/틸/앰버 권장

### A-3. 프론트 수정 사항

**파일: `src/app/admin/settings/page.tsx`**

| 항목 | 현재 | 변경 |
|------|------|------|
| `StoreSettings` 인터페이스 | `color`, `bg_color` 없음 | `color: string`, `bg_color: string` 추가 |
| SWR fetch | `limit(1).single()` — 첫 매장만 | `order("display_order")` — 전체 매장 배열로 변경 |
| 렌더링 | 단일 섹션 | 매장별 섹션 반복 렌더링 |
| 색상 설정 UI | 없음 | 각 매장에 프리셋 8종 색상 선택 버튼 추가 |
| 저장 로직 | 없음 | 선택 시 `stores.color` / `stores.bg_color` UPDATE |

**UI 컴포넌트 설계 (settings 내 추가 섹션):**
```
[근무지 색상]
연경당 카페 ──────────────────
  ● ● ● ● ● ● ● ●   ← 8종 프리셋 동그라미 선택기
  (선택된 것은 check 표시 + 외곽선)
  미리보기: [카페] 라벨 (선택 색상 적용)

연경당 공장 ──────────────────
  ● ● ● ● ● ● ● ●

연경당 케이터링 ───────────────
  ● ● ● ● ● ● ● ●
```

**캐시 무효화:**
- `useWorkplaces` 훅의 SWR 키: `"workplaces"` — 색상 저장 후 `mutate("workplaces")` 호출로 전역 갱신

### A-4. 백엔드 수정 사항

- DB 변경 없음 (`color`, `bg_color` 컬럼 이미 존재)
- RLS: 기존 `is_admin()` 조건으로 UPDATE 가능 여부 확인 필요

---

## WORK B — 관리자 주간 뷰 카드 스타일 개선

### B-1. 현재 코드 (admin/calendar/page.tsx:1432~1459)

```jsx
// 문제: 진한 배경 100% 채움
style={{
  backgroundColor: isSubstituted ? "#F2F4F6" : byId[slot.store_id]?.color || "#8B95A1",
  borderLeft: borderColor ? `3px solid ${borderColor}` : undefined,
}}
className={`... ${isSubstituted ? "text-[#8B95A1] line-through" : "text-white"}`}
```

### B-2. 개선 후 (연한 배경 + 왼쪽 보더 방식)

```jsx
// 연한 배경(18% 투명도) + 왼쪽 보더로 상태 표현
const storeColor = byId[slot.store_id]?.color || "#8B95A1";
const bgColor = isSubstituted ? "#F2F4F6" : storeColor + "18";
const activeBorderColor = borderColor || storeColor;  // 근태 없으면 근무지 색

style={{
  backgroundColor: bgColor,
  borderLeft: `3px solid ${isSubstituted ? "#D1D6DB" : activeBorderColor}`,
}}
className={`... ${isSubstituted ? "text-[#8B95A1] line-through" : "text-[#191F28]"}`}
```

### B-3. 텍스트 색상 조정

| 항목 | 현재 | 변경 |
|------|------|------|
| 근무지 라벨 | `text-white` (흰색, 배경과 동화) | `font-bold` + storeColor 인라인 |
| 시간 텍스트 | `opacity-90` 흰색 | `text-[#4E5968]` |
| 출근 시간 | `opacity-80` 흰색 | `text-[#6B7684]` |
| 결근 표시 | `text-red-200` | `text-[#EF4444]` |

### B-4. 효과

- 셀 전체가 강렬한 컬러 블록 → 여백감 있는 카드로 변경
- borderLeft 색상(근태 상태)이 연한 배경 위에서 명확히 보임
- 텍스트 가독성 향상 (흰배경 위 어두운 텍스트)

---

## WORK C — 직원 스케줄 탭 필터 버튼 + 달력 블록 색상 재정의

### C-1. 필터 버튼 색상 문제

**현재 (calendar/page.tsx:477~481):**
```js
{ key: "mySchedule",   label: "내 스케줄", color: "#3182F6" },  // primary blue
{ key: "myAttendance", label: "내 근무",   color: "#00B761" },  // success green
{ key: "team",         label: "팀 스케줄", color: "#8B95A1" },  // gray
{ key: "events",       label: "회사일정",  color: "#F97316" },  // orange
```

**개선:** 필터 버튼은 "레이어 on/off" 역할만. 근무지 팔레트와 완전 분리.

```js
{ key: "mySchedule",   label: "내 스케줄", color: "#191F28" },  // 검정 (중립)
{ key: "myAttendance", label: "내 근무",   color: "#191F28" },  // 검정 (중립)
{ key: "team",         label: "팀 스케줄", color: "#4E5968" },  // 어두운 회색
{ key: "events",       label: "회사일정",  color: "#F97316" },  // 주황 (유지 - 독립적)
```

**버튼 스타일 변경:**
- 비활성: `bg-white border border-slate-200 text-[#8B95A1]` (현재와 동일)
- 활성: `bg-[#191F28] text-white border-transparent` (색상 없이 dark on/off)
- 내 스케줄/내 근무는 도트 대신 아이콘 또는 도트 제거

### C-2. 달력 블록 색상 개선

**현재:** 예정/출근중 모두 `storeColor` 진한 배경 → 블록이 너무 강렬

**개선 후:**
```
예정 (미래):     bg_color (연한 배경) + borderLeft storeColor
출근 중:        storeColor + "30" (30% 투명) + borderLeft storeColor
퇴근 완료:      #DCFCE7 / #16A34A (현재 유지)
결근:           #FEE2E2 / #EF4444 (현재 유지)
```

→ 달력 블록이 연해지면, 필터 버튼의 진한 색상(`#191F28`)과 자연스럽게 분리

### C-3. 범례 텍스트 조정

현재 하단 범례:
```
● 예정근무  ● 출근완료  ● 결근  ●● 팀동료
```

개선 후:
```
예정근무  ✓ 출근완료  × 결근  ●● 팀동료
```
→ 근무지 색과 혼동되는 범례 도트 제거, 텍스트+아이콘 기반으로

---

## 수정 파일 목록

| 파일 | 작업 | 난이도 |
|------|------|--------|
| `src/app/admin/settings/page.tsx` | 근무지 색상 프리셋 UI 추가 (A) | 중 |
| `src/app/admin/calendar/page.tsx` | 주간 뷰 카드 스타일 개선 (B) | 하 |
| `src/app/calendar/page.tsx` | 필터 버튼 + 달력 블록 색상 (C) | 하 |

**DB 변경: 없음** (color/bg_color 컬럼 이미 존재)
**마이그레이션: 없음**

---

## 작업 순서 (권장)

```
[STEP 1] DB에 신규 색상값 반영 (API로 직접 UPDATE)
  → 카페: 인디고 #4F46E5 / 공장: 틸 #0891B2 / 케이터링: 앰버 #D97706

[STEP 2] WORK B — 관리자 주간 뷰 카드 스타일 (줄 수정 적음, 효과 즉각)

[STEP 3] WORK C — 직원 달력 블록 + 필터 버튼 색상 (연한 배경 전환)

[STEP 4] WORK A — 관리자 settings 색상 설정 UI 추가 (이후 색상 변경 자유롭게)

[STEP 5] 빌드 확인 + 배포
```

---

## 기대 효과

| 문제 | 개선 후 |
|------|--------|
| 파랑=스케줄=카페 충돌 | 근무지 인디고/틸/앰버로 분리, 충돌 해소 |
| 강렬한 카드 배경 | 연한 배경 + 보더 방식으로 시각 피로 감소 |
| 도트 과부하 | 근무지 색상 연해져서 여러 레이어 겹쳐도 읽기 쉬워짐 |
| 색상 변경 방법 없음 | 관리자 settings에서 언제든 프리셋 선택 가능 |
