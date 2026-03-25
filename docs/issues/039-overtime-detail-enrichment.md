# 039 — 어드민 추가근무 상세 정보 강화

> **작성일**: 2026-03-24
> **상태**: 기획 완료, 구현 대기
> **관련 페이지**: `src/app/admin/overtime/page.tsx`
> **부수 작업**: `docs/schema.md` — `attendance_type` 값 목록 보강 필요

---

## 배경

현재 추가근무 관리 페이지는 인정완료/넘김 처리 후 카드가 1줄 요약으로 축소되어,
어떤 스케줄이었는지, 어디서 출퇴근했는지, 원격퇴근 여부, 사유 등
**처리 근거가 되는 핵심 정보**를 더 이상 확인할 수 없다.

관리자 입장에서 처리 후에도 "왜 이게 인정됐지?" 또는 "이게 원격퇴근이었나?"를
다시 확인할 수 없어 운영 신뢰도 저하로 이어진다.

---

## 사전 조사 결과

### attendance_type 실제 사용 값 (schema.md 미등록 포함)

| 값 | 설명 | 기록 주체 | 비고 |
|----|------|-----------|------|
| `regular` | 일반 출퇴근 (GPS 반경 내) | 직원 앱 | |
| `remote_out` | 원격퇴근 (반경 밖, 사유 필수) | 직원 앱 | |
| `business_trip_in` | 출장출근 (반경 밖 출근) | 직원 앱 | |
| `business_trip_out` | 출장퇴근 (출장출근 후 반경 밖 퇴근) | 직원 앱 | |
| `fallback_in` | **수동출근** — GPS 실패 후 매장 직접 선택 | 직원 앱 | schema.md 미등록 |
| `fallback_out` | **수동퇴근** — GPS 실패 후 매장 직접 선택, 또는 관리자 직접 처리 | 직원 앱 / 관리자 | schema.md 미등록 |

> **수동퇴근 두 가지 케이스 구분 방법**:
> - 직원 GPS 실패: `distance_m = 0`, `reason = null`
> - 관리자 직접 처리: `distance_m = null`, `reason = "관리자 수동 처리"`

→ **schema.md에 `fallback_in` / `fallback_out` 추가 필요** (DB ENUM 변경 불필요, text 타입)

---

## 현재 상태 (AS-IS)

### 현재 fetch하는 데이터
- `attendance_logs`: `profile_id`, `type`, `created_at`, `profiles(name, color_hex)` 만 조회
- `schedule_slots`: `profile_id`, `slot_date`, `start_time`, `end_time` 만 조회
- **누락**: `attendance_type`, `reason`, `distance_m`, `check_in/out_store_id`, `position_keys`

### 현재 EmpDay 인터페이스
```ts
interface EmpDay {
  actual_in: string;        // "HH:mm"
  actual_out: string;
  schedule_start/end: string;
  late_out_minutes: number;
  early_in_minutes: number;  // overtime_include_early=false면 항상 0
  // 위치/타입/사유/지각 없음
}
```

### 현재 UI 문제
| 상태 | 표시 내용 | 문제 |
|------|-----------|------|
| pending | 스케줄 시간 / 실제 시간 / 늦게퇴근·일찍출근 분수 | 위치·타입·사유 없음 |
| approved | 이름 + "N시간 M분 인정됨" | 근거 정보 전혀 없음 |
| dismissed | 이름 + "늦게퇴근 +N분" | 근거 정보 전혀 없음 |

---

## 목표 (TO-BE)

### 1. 데이터 레이어 확장

#### attendance_logs 쿼리 추가 필드
```ts
attendance_type,       // 전체 타입 (fallback_in/out 포함)
reason,                // 원격퇴근/수동처리 사유
distance_m,            // 매장까지 거리 (meter)
check_in_store_id(stores(name, label)),
check_out_store_id(stores(name, label))
```

#### schedule_slots 쿼리 추가 필드
```ts
store_id(stores(name, label)),
position_keys          // ['hall', 'kitchen'] 등
```

#### EmpDay 인터페이스 신규 필드
```ts
// 출근 관련
check_in_type: string;               // attendance_type of IN log
check_in_store_name: string | null;  // 출근한 매장명 (fallback_in이면 직원 선택 매장)
check_in_distance_m: number | null;  // 출근 시 거리 (fallback_in이면 0)

// 퇴근 관련
check_out_type: string;              // attendance_type of OUT log
check_out_store_name: string | null; // 퇴근한 매장명 (원격/출장이면 null)
check_out_distance_m: number | null; // 퇴근 시 거리 (수동처리면 null)
check_out_reason: string | null;     // 원격퇴근/수동처리 사유

// 스케줄 관련
schedule_store_name: string | null;  // 스케줄 매장명
schedule_position_keys: string[];    // 스케줄 포지션

// 지각 (신규 계산값)
late_in_minutes: number;             // 스케줄보다 늦게 출근한 분 (지각)

// early_in 정책 분리
early_in_raw_minutes: number;        // 실제 일찍 출근한 분 (설정 무관, 항상 계산)
early_in_counted: boolean;           // overtime_include_early 설정으로 집계에 포함됐는지
```

> `early_in_minutes` (기존) = `early_in_counted ? early_in_raw_minutes : 0`
> `early_in_raw_minutes`는 **항상 계산**. UI에서는 항상 표시하되
> `early_in_counted=false`이면 "(집계 제외)" 라벨 붙여 구분.

---

### 2. 지각(late_in) 계산 추가

```ts
// Case A에서만 의미있음
late_in_minutes = Math.max(0, timeToMins(actual_in) - timeToMins(schedule_start))
```

> `early_in_raw_minutes` > 0이면 `late_in_minutes`는 반드시 0. 둘은 동시에 존재 불가.

---

### 3. 한 줄 요약(summary) 생성 로직

```ts
function generateSummary(emp: EmpDay, includeEarly: boolean): string
```

#### 규칙 (순서대로 조합)

**① 근태 시간 파트** (Case A — 스케줄 있음)

| 조건 | 문구 |
|------|------|
| `late_in_minutes > 0` | `"N분 지각"` |
| `early_in_raw_minutes > 0` | `"N분 일찍 출근"` |
| `late_out_minutes > 0` | `"N분 늦게 퇴근"` |
| 두 가지 이상 | 쉼표로 연결 |

**① 근태 시간 파트** (Case B — 스케줄 없음)

| 조건 | 문구 |
|------|------|
| 항상 | `"스케줄 없이 N시간 M분 근무"` |

**② 근태 타입 접미사**

| 조건 | 접미 문구 |
|------|----------|
| `check_out_type === 'remote_out'` | `"원격퇴근이라 정확하지 않을 수 있어요"` |
| `check_in_type === 'business_trip_in'` | `"출장출근이에요"` |
| `check_out_type === 'business_trip_out'` | `"출장퇴근이에요"` |
| `check_in_type === 'fallback_in'` (관리자 처리 아닌 경우) | `"수동 출근이에요"` |
| `check_out_type === 'fallback_out'` + `reason === '관리자 수동 처리'` | `"관리자가 퇴근 처리했어요"` |
| `check_out_type === 'fallback_out'` + `reason !== '관리자 수동 처리'` | `"수동 퇴근이에요"` |

**완성 예시:**
```
"10분 지각, 30분 늦게 퇴근했어요"
"15분 일찍 출근, 20분 늦게 퇴근했어요"
"스케줄 없이 3시간 근무했어요"
"30분 늦게 퇴근했어요 · 원격퇴근이라 정확하지 않을 수 있어요"
"스케줄 없이 4시간 근무했어요 · 출장출근이에요"
"20분 늦게 퇴근했어요 · 관리자가 퇴근 처리했어요"
"10분 지각 · 수동 출근이에요"
```

---

### 4. UI 변경 상세

#### 4-1. Pending 카드 (확인 필요)

```
┌─────────────────────────────────────────────────┐
│ [아바타] 홍길동                    스케줄 초과   │
│                                                  │
│ 📅 스케줄   10:00~18:00  [카페] [홀]             │
│ ⏱ 실제     09:45~18:35                           │
│    일찍 출근  +15분  (집계 제외)  ← include=false │
│    늦게 퇴근  +35분                               │
│                                                  │
│ 📍 출근     카페 (15m)                            │
│ 📍 퇴근     원격퇴근  250m  [사유: 외부 미팅]     │
│   ↑ 또는: 수동퇴근  [사유: —]                     │
│   ↑ 또는: 관리자 처리                             │
│                                                  │
│ 💬 "35분 늦게 퇴근했어요 ·                        │
│     원격퇴근이라 정확하지 않을 수 있어요"          │
│                                                  │
│ [넘기기]   [30분]   [60분]   [직접입력]            │
└─────────────────────────────────────────────────┘
```

#### 4-2. Approved 카드 (추가근무 인정) — 인라인 토글 상세

```
[접힘]
┌──────────────────────────────────────────────────┐
│ [아] 홍길동   1시간 인정됨   [상세 ▼]  [취소]     │
└──────────────────────────────────────────────────┘

[펼침]
┌──────────────────────────────────────────────────┐
│ [아] 홍길동   1시간 인정됨   [상세 ▲]  [취소]     │
│ ─────────────────────────────────────────────────│
│ 📅 스케줄   10:00~18:00  카페  홀                 │
│ ⏱ 실제     09:45~18:35                            │
│    일찍 출근  +15분  (집계 제외)                   │
│    늦게 퇴근  +35분                                │
│ 📍 출근     카페 (15m)                             │
│ 📍 퇴근     원격퇴근  250m                         │
│    사유: 외부 미팅 마치고 바로 퇴근                 │
│ 💬 "35분 늦게 퇴근했어요 ·                         │
│     원격퇴근이라 정확하지 않을 수 있어요"           │
└──────────────────────────────────────────────────┘
```

#### 4-3. Dismissed 카드 (넘김) — 동일 패턴

```
[접힘]
┌──────────────────────────────────────────────────┐
│ [아] 홍길동   넘김   [상세 ▼]  [추가근무로]        │
└──────────────────────────────────────────────────┘
```

---

### 5. 위치 정보 표시 규칙

| `attendance_type` | 표시 방식 |
|-------------------|-----------|
| `regular` | `[매장명]  (Nm)` |
| `remote_out` | `원격퇴근  Nm` + 주황 경고 뱃지 |
| `business_trip_in` | `출장출근` 노란 뱃지 (매장명 없음) |
| `business_trip_out` | `출장퇴근` 노란 뱃지 (매장명 없음) |
| `fallback_in` (직원) | `[매장명]  수동출근` 보라 뱃지 |
| `fallback_out` (직원) | `[매장명]  수동퇴근` 보라 뱃지 |
| `fallback_out` (관리자) | `관리자 처리` 보라 뱃지 (거리 없음) |
| `distance_m = null` | 거리 숫자 표시 안 함 |

> 구분 기준: `fallback_out` + `reason === "관리자 수동 처리"` → 관리자 처리

#### 거리 표시 형식
```
< 1,000m  → "NNNm"
≥ 1,000m  → "N.Nkm"
```

---

### 6. early_in 설정 분리 표시 정책

| `overtime_include_early` | `early_in_raw_minutes` | 표시 방식 |
|--------------------------|------------------------|-----------|
| `true` | > 0 | `일찍 출근 +N분` (주황, 추가근무 집계 포함) |
| `false` | > 0 | `일찍 출근 +N분 (집계 제외)` (회색, 정보성) |
| — | 0 | 표시 안 함 |

→ 설정과 무관하게 사실 자체는 항상 표시. 정책이 "무시"를 선택했더라도
  관리자는 여전히 "언제 왔는지"를 알아야 한다.

---

### 7. 포지션 뱃지

```ts
const POSITION_LABELS: Record<string, string> = {
  hall: '홀',
  kitchen: '주방',
  showroom: '쇼룸',
}
```

스케줄 매장명 옆에 작은 뱃지로 표시.

---

## 구현 범위 정리

| 항목 | 우선순위 | 비고 |
|------|---------|------|
| schema.md에 `fallback_in` / `fallback_out` 추가 | 높음 | 문서 작업만 |
| `attendance_logs` 쿼리 확장 (타입/사유/거리/매장) | 높음 | |
| `schedule_slots` 쿼리 확장 (매장/포지션) | 높음 | |
| EmpDay 인터페이스 확장 | 높음 | |
| `early_in_raw_minutes` 항상 계산 (설정 분리) | 높음 | |
| 지각(`late_in_minutes`) 계산 추가 | 높음 | |
| 한 줄 요약(`generateSummary`) 함수 | 높음 | |
| Pending 카드 UI 확장 | 높음 | |
| Approved/Dismissed 카드 인라인 토글 | 중간 | |
| 포지션 뱃지 표시 | 낮음 | |

---

## 결과 (구현 완료 후 기록)

> 완료: 2026-03-24

- `attendance_logs` 쿼리에 `attendance_type`, `reason`, `distance_m`, `check_in_store`, `check_out_store` 추가
- `schedule_slots` 쿼리에 `store`, `position_keys` 추가
- EmpDay 인터페이스 전면 확장 (14개 신규 필드)
- `early_in_raw_minutes` / `early_in_counted` 분리 계산 — 설정 무관하게 항상 사실 표시
- `late_in_minutes` (지각) 계산 추가
- `generateSummary()` 한 줄 요약 함수 구현 (fallback 타입 포함 전체 6가지 케이스 처리)
- `AttendanceBadge` 컴포넌트 — 6개 타입 색상 뱃지 (관리자 처리 vs 직원 수동 구분)
- `AttendanceDetailPanel` 컴포넌트 — Pending/Approved/Dismissed 공유 상세 패널
- Approved/Dismissed 카드에 ▼/▲ 인라인 토글 추가 — 처리 후에도 근거 정보 확인 가능
- schema.md `attendance_type` 값 목록에 `fallback_in` / `fallback_out` 보강
- 빌드 통과 확인
