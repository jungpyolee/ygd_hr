# [FEAT-013] 직원 대타 수락 UX — 알림 딥링크 + 바텀시트

| 항목 | 내용 |
|------|------|
| 유형 | 기능 추가 |
| 상태 | ✅ 완료 |
| 파일 | `src/app/schedule/page.tsx`, `src/app/page.tsx` |
| 발견일 | 2026-03-18 |
| 완료일 | 2026-03-18 |

---

## 배경

어드민이 대타 요청을 승인하면 대상 직원들에게 `substitute_approved` 알림이 발송된다.
직원은 `/schedule` 페이지의 "나에게 온 대타 요청" 섹션에서 수락/거절 가능하지만, 현재 구조에는 두 가지가 빠져 있다.

1. **알림 클릭 딥링크**: 직원 측 알림 핸들러에서 `substitute_approved` 타입 클릭 시 `/schedule?request_id=xxx` 로 이동하는 로직이 없음
2. **바텀시트**: "나에게 온 대타 요청" 섹션의 카드가 인라인 수락/거절 버튼만 있고, 상세 바텀시트 없음

어드민 레이아웃(`admin/layout.tsx`)에는 `handleNotiClick`의 타입별 `router.push()` 딥링크가 이미 구현되어 있다. 직원 측에는 동일한 알림 패널이 없어 알림을 클릭해서 해당 요청으로 바로 이동하는 UX가 완성되지 않은 상태이다.

---

## 현재 구현 상태

### 이미 구현된 것

| 위치 | 내용 |
|------|------|
| `schedule/page.tsx` | `incomingRequests` fetch (승인됨 + eligible + 미응답 필터링) |
| `schedule/page.tsx` | `handleAcceptSubstitute` — `accept_substitute` RPC 호출, 알림 발송 |
| `schedule/page.tsx` | `handleDeclineSubstitute` — `substitute_responses` insert |
| `schedule/page.tsx` | "나에게 온 대타 요청" 섹션 (카드 인라인 수락/거절 버튼) |
| `admin/schedules/substitutes/page.tsx` | `substitute_approved` 알림에 `source_id: approveTarget.id` 포함 |

### 빠진 것

1. 직원 측 알림 패널 / 알림 클릭 핸들러 (직원 홈 또는 레이아웃에 없음)
2. `substitute_approved` 클릭 → `/schedule?request_id={substitute_request_id}` 딥링크
3. `/schedule` 페이지에서 URL 파라미터 `request_id`를 읽고 해당 요청의 바텀시트를 자동으로 여는 로직
4. 수락/거절 액션을 담은 **대타 요청 상세 바텀시트** 컴포넌트

---

## 설계

### UX 흐름

```
[어드민 승인]
  → substitute_approved 알림 발송 (source_id = substitute_request_id)

[직원: 알림 수신]
  → 알림 패널에서 해당 알림 클릭
  → router.push(`/schedule?request_id=${noti.source_id}`)
  → URL 파라미터 읽기 (useSearchParams)
  → incomingRequests 중 해당 id의 요청 찾기
  → 바텀시트 자동 오픈

[직원: 바텀시트 내용]
  → 날짜 / 장소 / 시간 / 요청자 / 사유 표시
  → "수락하기" 버튼 → handleAcceptSubstitute
  → "거절하기" 버튼 → handleDeclineSubstitute
  → 처리 후 바텀시트 닫힘, URL 파라미터 제거
```

### URL 파라미터 처리

```
/schedule?request_id=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

- `useSearchParams()`로 `request_id` 읽기
- `incomingRequests` 로드 완료 후 해당 id가 있으면 `setActiveRequest(req)`
- 처리 완료(수락/거절) 후 `router.replace("/schedule")` — URL 파라미터 제거

### 상태 추가

```typescript
// 현재 (인라인 카드)
const [respondingId, setRespondingId] = useState<string | null>(null);

// 추가 필요
const [activeRequest, setActiveRequest] = useState<SubstituteRequest | null>(null);
```

### 바텀시트 UI 구조

```
┌────────────────────────────────────┐
│          ── (핸들)                  │
│  대타 요청 확인            [×]      │
│                                    │
│  [카페 뱃지]  M월 d일 (요일)        │
│  HH:MM ~ HH:MM                     │
│  OOO님의 요청                       │
│  "사유 텍스트" (있을 때)             │
│                                    │
│  [거절하기]    [수락하기]            │
└────────────────────────────────────┘
```

- 수락하기: `bg-[#3182F6] text-white`, `<Check />` 아이콘
- 거절하기: `bg-[#F2F4F6] text-[#4E5968]`
- 처리 중: 버튼 disabled + "처리하는 중이에요" 텍스트

### 카드 목록 변경

"나에게 온 대타 요청" 섹션의 인라인 수락/거절 버튼을 **"확인하기" 단일 버튼**으로 교체 → 클릭 시 바텀시트 오픈.

```
[기존] 카드 안에 [거절하기] [수락하기] 버튼 2개
[변경] 카드 안에 [확인하기] 버튼 1개 → 바텀시트 팝업
```

---

## 직원 알림 패널 연동

현재 직원 측에는 알림 패널이 없다. 두 가지 선택지가 있다.

### 옵션 A — 직원 레이아웃 알림 패널 추가 (선행 작업)

직원 홈 또는 공용 레이아웃에 어드민 `layout.tsx`와 유사한 알림 벨 + 드롭다운 패널을 추가한다.
`handleNotiClick`에서 `substitute_approved` 타입 처리:

```typescript
case "substitute_approved":
  router.push(`/schedule?request_id=${noti.source_id}`);
  break;
```

### 옵션 B — 알림 배너만 추가 (최소 작업)

직원 홈에 미읽음 `substitute_approved` 알림 개수 배너만 표시하고, 클릭 시 `/schedule`로 이동.
상세 딥링크는 제공하지 않음.

> **권장: 옵션 A** — source_id가 이미 포함되어 있어 딥링크 구현 비용이 낮고 UX 완성도가 높음.

---

## 구현 순서

1. `schedule/page.tsx`
   - `useSearchParams` 추가
   - `activeRequest` 상태 추가
   - `incomingRequests` 로드 후 URL `request_id` 매칭 → `setActiveRequest`
   - 카드 목록: 인라인 버튼 → "확인하기" 단일 버튼 변경
   - 대타 요청 상세 바텀시트 추가 (수락/거절 포함)
   - 처리 완료 후 `router.replace("/schedule")`

2. 직원 알림 패널 (옵션 A 선택 시)
   - 홈(`/`) 또는 직원 공용 레이아웃에 알림 벨 + 드롭다운 추가
   - `substitute_approved` → `/schedule?request_id=xxx` 딥링크

3. `npm run build` 빌드 확인

---

## 관련 파일

| 파일 | 역할 |
|------|------|
| `src/app/schedule/page.tsx` | 바텀시트 + URL 파라미터 처리 |
| `src/app/page.tsx` | 직원 홈 — 알림 패널 추가 위치 (옵션 A) |
| `src/app/admin/layout.tsx` | 어드민 알림 패널 참고 구현체 |
| `src/app/admin/schedules/substitutes/page.tsx` | `substitute_approved` 알림 발송 시 `source_id` 확인 |

## 관련 DB

| 테이블 | 용도 |
|--------|------|
| `substitute_requests` | 상태: `approved` → 직원 수락 대기 |
| `substitute_responses` | 거절 기록 (중복 방지) |
| `notifications` | `type: "substitute_approved"`, `source_id: request_id` |
