# [FEAT-012] 결근자 노출 + 스케줄 일간 뷰 근태 레이어

| 항목 | 내용 |
|------|------|
| 유형 | 기능 개선 |
| 상태 | ✅ 완료 |
| 파일 | `src/app/admin/attendance/page.tsx`, `src/app/admin/schedules/page.tsx` |
| 발견일 | 2026-03-18 |
| 완료일 | 2026-03-18 |

---

## QA 호환성 검토 (스케줄 QA P1~P4 기반)

> 스케줄 QA 완료(커밋 `e0d419b`, `7695aae`) 결과와 아래 구현 계획을 교차 검증한 결과.

### ✅ 충돌 없음 — 그대로 진행 가능

| 항목 | 근거 |
|------|------|
| `substituted` 슬롯 처리 | base 맵 구성 시 `.eq("status", "active")` 사용 → 원본 슬롯 소유자(대타 구한 사람)는 결근 대상에서 정확히 제외됨. 대타자의 신규 슬롯은 `active`이므로 정상 포함. |
| 일간 뷰 `dailySlotsData` state | 기존 useEffect가 이미 daily 탭 기준으로 슬롯 fetch. 012 추가 useEffect(`fetchDailyAttendance`)와 독립적으로 동작, 충돌 없음. |
| `renderDailyView` 행 높이 변경 | Phase 4에서 daily 뷰 row 구조 변경 없음(min-h-[52px] 유지). 012 계획의 h-[72px] 변경 그대로 적용 가능. |
| KST 날짜 경계 처리 | `fetchDailyAttendance`의 `+09:00` 명시 방식은 `attendance_logs.created_at` (timestamptz) 조회에 적합. P1-02에서 고친 `T00:00:00` 패턴과 용도가 다름(date-only string vs timestamp range). |
| admin RLS bypass | `attendance_logs`의 Admin Bypass 정책으로 어드민은 전 직원 로그 조회 가능. `fetchDailyAttendance`가 admin 화면에서 실행되므로 권한 문제 없음. |

### ⚠️ 수정 필요 — 계획 업데이트 항목

#### 수정 1. attendance/page.tsx — supabase 클라이언트 싱글턴화 (P2-03 적용)

현재 `attendance/page.tsx:62`에 `const supabase = createClient()` 가 컴포넌트 body에 선언되어 있음 → 렌더마다 새 클라이언트 생성.

**적용 방법:**
```typescript
// 기존 (line 3)
import { useEffect, useState } from "react";

// 수정
import { useEffect, useState, useCallback, useMemo } from "react";

// 기존 (line 62)
const supabase = createClient();

// 수정
const supabase = useMemo(() => createClient(), []);
```

`fetchLogsForCalendar`도 `useCallback`으로 감싸고 `[supabase]`를 deps에 추가:
```typescript
const fetchLogsForCalendar = useCallback(async (date: Date, type: "week" | "month") => {
  // ... 기존 로직
}, [supabase]);
```
→ useEffect deps: `[baseDate, viewType, fetchLogsForCalendar]`

#### 수정 2. fetchDailyAttendance — any 타입 제거 (P3-05 적용)

Plan의 `data.forEach((log: any) => ...)` 대신 타입 정의:
```typescript
interface AttLogRow {
  profile_id: string;
  type: "IN" | "OUT";
  created_at: string;
}

// fetchDailyAttendance 내부
data.forEach((log: AttLogRow) => {
```

#### 수정 3. fetchDailyAttendance — useCallback 래핑

```typescript
// 기존 plan
const fetchDailyAttendance = async (date: Date) => { ... };

// 수정
const fetchDailyAttendance = useCallback(async (date: Date) => {
  // ...
}, [supabase]);
```
→ useEffect deps: `[tab, dailyDate, fetchDailyAttendance]`

#### 수정 4. selectedLogs 헤더 카운트 뱃지 — 결근자 포함 반영

기존 `{selectedLogs.length}명` 뱃지는 결근자가 추가되면 "출근+결근 합산"이 됨. 의미가 달라지므로 분리 표시:

```tsx
// 수정 후
const presentCount = selectedLogs.filter((l) => !l.is_absent).length;
const absentCount = selectedLogs.filter((l) => l.is_absent).length;

// 헤더
<span className="text-[#3182F6] bg-[#E8F3FF] px-2.5 py-0.5 rounded-full text-[13px] font-semibold">
  출근 {presentCount}명
</span>
{absentCount > 0 && (
  <span className="text-[#E03131] bg-[#FFEBEB] px-2.5 py-0.5 rounded-full text-[13px] font-semibold">
    미출근 {absentCount}명
  </span>
)}
```

#### 수정 5. Empty state 문구

결근자도 selectedLogs에 포함되므로 빈 상태는 "스케줄 자체가 없는 날"에만 발생:

```tsx
// 기존
"이 날은 출근 기록이 없어요."

// 수정
"이 날은 근무 예정이 없어요."
```

#### 수정 6. schedule_slots JOIN 최적화 (선택)

Plan의 step [1]+[2](schedule_slots 조회 후 profiles 별도 조회)를 단일 조회로 통합 가능:
```typescript
const { data: slotsData } = await supabase
  .from("schedule_slots")
  .select("profile_id, slot_date, start_time, end_time, work_location, profiles!profile_id(name, color_hex)")
  .eq("status", "active")
  .gte("slot_date", startDateStr)
  .lte("slot_date", endDateStr);
```
→ profiles 별도 조회(`step [2]`) 불필요. 쿼리 1회 절약.

---

## 배경

- 근태 페이지: 출근 로그가 있는 직원만 표시 → **스케줄이 있지만 미출근한 직원(결근)이 화면에 나타나지 않음**
- 스케줄 일간 뷰: 예정 슬롯만 표시 → **실제 출근 여부를 확인하려면 근태 페이지를 따로 열어야 함**

두 가지를 한 번에 작업. DB 변경 없음.

---

## 작업 1 — 결근자 노출 (`attendance/page.tsx`)

### 현재 흐름 (문제)

```
attendance_logs 조회 (날짜 범위)
  → 로그 있는 직원만 grouped 맵 생성
  → schedule_slots 조회: grouped에 있는 날짜만 (allDates)
  → 스케줄 정보 덮어쓰기
결과: 출근한 사람만 보임
```

### 변경 흐름 (목표)

```
schedule_slots 조회 (날짜 범위 전체) ← 먼저 조회 (status='active'만)
  → 슬롯이 있는 모든 직원을 is_absent=true 로 base 맵 생성

attendance_logs 조회 (동일 날짜 범위)
  → base 맵에 clock_in/out 덮어쓰기
  → 덮어쓴 경우 is_absent=false

결과: 슬롯 있는 직원 전원 표시 (출근자 + 결근자)
```

> **주의**: `status='active'`만 조회. `substituted`(대타 처리된) 원본 슬롯은 제외해야 함.
> 대타자의 신규 슬롯은 `active`이므로 정상 포함됨.

### 코드 변경 상세

#### ① import 수정 (P2-03 싱글턴화)

```typescript
// 기존
import { useEffect, useState } from "react";

// 수정
import { useEffect, useState, useCallback, useMemo } from "react";
```

#### ② `ProcessedLog` 타입에 필드 2개 추가

```typescript
interface ProcessedLog {
  // 기존 필드 유지 ...
  is_absent: boolean;                   // 스케줄 있으나 clock_in 없음
  early_leave_minutes: number | null;   // 조기퇴근 감지 (보너스)
}
```

#### ③ supabase 싱글턴화 (컴포넌트 최상단)

```typescript
// 기존
const supabase = createClient();

// 수정
const supabase = useMemo(() => createClient(), []);
```

#### ④ `fetchLogsForCalendar` 재구성 (useCallback 포함)

```typescript
const fetchLogsForCalendar = useCallback(async (date: Date, type: "week" | "month") => {
  setLoading(true);

  // 날짜 범위 계산 (기존 동일)
  let startDate, endDate;
  if (type === "week") {
    startDate = startOfWeek(date, { weekStartsOn: 0 });
    endDate = endOfWeek(date, { weekStartsOn: 0 });
  } else {
    const monthStart = startOfMonth(date);
    startDate = startOfWeek(monthStart, { weekStartsOn: 0 });
    endDate = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 0 });
  }

  const startDateStr = format(startDate, "yyyy-MM-dd");
  const endDateStr = format(endDate, "yyyy-MM-dd");

  // [1] schedule_slots 먼저 조회 (status=active, substituted 제외)
  // profiles JOIN으로 별도 조회 불필요
  const { data: slotsData } = await supabase
    .from("schedule_slots")
    .select("profile_id, slot_date, start_time, end_time, work_location, profiles!profile_id(name, color_hex)")
    .eq("status", "active")
    .gte("slot_date", startDateStr)
    .lte("slot_date", endDateStr);

  // [2] base 맵 생성 (슬롯 기반, is_absent=true)
  const grouped: Record<string, Map<string, ProcessedLog>> = {};

  (slotsData || []).forEach((slot: any) => {
    const slotDateStr = slot.slot_date;
    if (!grouped[slotDateStr]) grouped[slotDateStr] = new Map();

    const pId = slot.profile_id;
    if (!grouped[slotDateStr].has(pId)) {
      grouped[slotDateStr].set(pId, {
        profile_id: pId,
        name: slot.profiles?.name || "알 수 없음",
        color_hex: slot.profiles?.color_hex || "#8B95A1",
        store_name: "—",
        clock_in: null,
        clock_out: null,
        distance_in: null,
        distance_out: null,
        attendance_type_in: "regular",
        attendance_type_out: "regular",
        reason_out: null,
        scheduled_start: slot.start_time,
        scheduled_end: slot.end_time,
        scheduled_location: slot.work_location,
        late_minutes: null,
        is_absent: true,            // ← 기본값: 결근
        early_leave_minutes: null,
      });
    }
  });

  // [3] attendance_logs 조회 (기존과 동일 범위)
  const startStr = startDate.toISOString();
  const endStr = new Date(new Date(endDate).setHours(23, 59, 59, 999)).toISOString();

  const { data, error } = await supabase
    .from("attendance_logs")
    .select(
      `id, profile_id, type, created_at, distance_m, attendance_type, reason, profiles(name, color_hex), stores!store_id(name)`
    )
    .gte("created_at", startStr)
    .lte("created_at", endStr)
    .order("created_at", { ascending: true });

  if (!error && data) {
    data.forEach((log: any) => {
      const dateKey = format(new Date(log.created_at), "yyyy-MM-dd");
      if (!grouped[dateKey]) grouped[dateKey] = new Map();

      const pId = log.profile_id;
      if (!grouped[dateKey].has(pId)) {
        // 출근 기록은 있지만 스케줄 슬롯이 없는 경우 (비정상 출근 등)
        grouped[dateKey].set(pId, {
          profile_id: pId,
          name: log.profiles?.name || "알 수 없음",
          color_hex: log.profiles?.color_hex || "#8B95A1",
          store_name: log.stores?.name || "알 수 없음",
          clock_in: null,
          clock_out: null,
          distance_in: null,
          distance_out: null,
          attendance_type_in: "regular",
          attendance_type_out: "regular",
          reason_out: null,
          scheduled_start: null,
          scheduled_end: null,
          scheduled_location: null,
          late_minutes: null,
          is_absent: false,
          early_leave_minutes: null,
        });
      }

      const userLog = grouped[dateKey].get(pId)!;

      // [4] base 맵에 출근 기록 덮어쓰기 → is_absent=false
      if (log.type === "IN" && !userLog.clock_in) {
        userLog.clock_in = log.created_at;
        userLog.distance_in = log.distance_m ?? null;
        userLog.attendance_type_in = log.attendance_type || "regular";
        userLog.store_name = log.stores?.name || "알 수 없음";
        userLog.is_absent = false;  // ← 출근 확인됨

        // 지각 계산
        if (userLog.scheduled_start) {
          const [sh, sm] = userLog.scheduled_start.split(":").map(Number);
          const clockInDate = new Date(log.created_at);
          const schedStart = new Date(`${dateKey}T${String(sh).padStart(2,"0")}:${String(sm).padStart(2,"0")}:00`);
          const diffMin = Math.floor((clockInDate.getTime() - schedStart.getTime()) / 60000);
          userLog.late_minutes = diffMin > 10 ? diffMin : null;
        }
      }
      if (log.type === "OUT") {
        userLog.clock_out = log.created_at;
        userLog.distance_out = log.distance_m ?? null;
        userLog.attendance_type_out = log.attendance_type || "regular";
        userLog.reason_out = log.reason ?? null;

        // 조기퇴근 계산
        if (userLog.scheduled_end && userLog.clock_out) {
          const [eh, em] = userLog.scheduled_end.split(":").map(Number);
          const clockOutDate = new Date(userLog.clock_out);
          const schedEnd = new Date(`${dateKey}T${String(eh).padStart(2,"0")}:${String(em).padStart(2,"0")}:00`);
          const diff = Math.floor((schedEnd.getTime() - clockOutDate.getTime()) / 60000);
          userLog.early_leave_minutes = diff > 10 ? diff : null;
        }
      }
    });
  }

  // [5] Map → Array 변환
  const finalData: Record<string, ProcessedLog[]> = {};
  Object.keys(grouped).forEach((key) => {
    finalData[key] = Array.from(grouped[key].values());
  });
  setLogsByDate(finalData);
  setLoading(false);
}, [supabase]);

// useEffect 수정 (deps에 fetchLogsForCalendar 추가)
useEffect(() => {
  fetchLogsForCalendar(baseDate, viewType);
}, [baseDate, viewType, fetchLogsForCalendar]);
```

#### ⑤ 헤더 카운트 뱃지 분리

```tsx
// 선택된 날짜 기준
const presentCount = selectedLogs.filter((l) => !l.is_absent).length;
const absentCount  = selectedLogs.filter((l) => l.is_absent).length;

// 헤더 h3
<h3 className="text-[18px] font-bold text-[#191F28] mb-4 flex items-center gap-2 flex-wrap">
  {format(selectedDate, "M월 d일 (EEE)", { locale: ko })} 출근 기록
  <span className="text-[#3182F6] bg-[#E8F3FF] px-2.5 py-0.5 rounded-full text-[13px] font-semibold">
    출근 {presentCount}명
  </span>
  {absentCount > 0 && (
    <span className="text-[#E03131] bg-[#FFEBEB] px-2.5 py-0.5 rounded-full text-[13px] font-semibold">
      미출근 {absentCount}명
    </span>
  )}
</h3>
```

#### ⑥ Empty state 문구 수정

```tsx
// 기존
"이 날은 출근 기록이 없어요."

// 수정 (스케줄 없는 날만 해당)
"이 날은 근무 예정이 없어요."
```

#### ⑦ 달력 셀 — 결근자 뱃지 추가

현재: 출근자 이름 뱃지 (직원 색상 배경)

변경:
- **출근자**: 기존 그대로 (color_hex 배경, 직원 이름)
- **결근자**: 흰 배경 + 빨간 테두리 + 직원 이름

```tsx
{dayLogs.slice(0, 3).map((log) => {
  if (log.is_absent) {
    // 과거 날짜만 결근 뱃지 표시 (오늘/미래는 제외)
    const isPast = isBefore(day, startOfDay(new Date()));
    if (!isPast) return null;
    return (
      <div
        key={log.profile_id}
        className="w-full truncate text-center rounded-[4px] px-1 py-[3px] sm:py-1 text-[9px] sm:text-[11px] font-bold border border-[#FFCDD2] text-[#E03131] bg-white"
      >
        {log.name}
      </div>
    );
  }
  const textColor = getContrastYIQ(log.color_hex);
  return (
    <div
      key={log.profile_id}
      className="w-full truncate text-center rounded-[4px] px-1 py-[3px] sm:py-1 text-[9px] sm:text-[11px] font-bold shadow-sm"
      style={{ backgroundColor: log.color_hex, color: textColor }}
    >
      {log.name}
    </div>
  );
})}
```

`isBefore`, `startOfDay`를 date-fns import에 추가.

#### ⑧ 상세 카드 — 결근자 카드

```tsx
// selectedLogs.map 내부에서 분기
{log.is_absent ? (
  (() => {
    // 과거 날짜만 결근 카드 표시
    const isPast = isBefore(selectedDate, startOfDay(new Date()));
    if (!isPast) return null;
    return (
      <div
        key={log.profile_id}
        className="bg-white rounded-[20px] p-5 border-2 border-[#FFCDD2] bg-[#FFF5F5]"
      >
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-[16px] font-bold text-white shadow-sm shrink-0"
            style={{ backgroundColor: log.color_hex }}
          >
            {log.name.charAt(0)}
          </div>
          <div>
            <p className="text-[16px] font-bold text-[#191F28] mb-0.5">{log.name}</p>
            <span className="text-[12px] font-bold text-[#E03131]">미출근</span>
          </div>
        </div>
        {log.scheduled_start && (
          <div className="mt-3 flex items-center gap-2 text-[13px] text-[#8B95A1]">
            <span>예정:</span>
            <span className="font-bold text-[#4E5968]">
              {log.scheduled_start.slice(0, 5)} ~ {log.scheduled_end?.slice(0, 5)}
            </span>
            <span>({LOCATION_LABELS[log.scheduled_location ?? ""] ?? log.scheduled_location})</span>
          </div>
        )}
      </div>
    );
  })()
) : (
  /* 기존 출근 카드 — 변경 없음 */
)}
```

---

## 작업 2 — 스케줄 일간 뷰 근태 레이어 (`schedules/page.tsx`)

### 현재 구조

`renderDailyView()`:
- 행 높이: `min-h-[52px]`
- 슬롯 바: `absolute top-2 bottom-2` (행 전체 높이)
- `dailySlotsData` state 사용

> Phase 4(커밋 `7695aae`)에서 daily 뷰 row 구조 변경 없음. 계획 그대로 적용 가능.

### 변경 구조

```
행 높이: h-[72px] (두 레이어 수용)

[상단 레이어] 예정 바 (기존): top-1.5 h-[26px]
  - 색상: work_location 기준 (LOCATION_COLORS)
  - 시간 텍스트 표시

[하단 레이어] 실제 출근 바 (신규): bottom-1.5 h-[22px]
  - 색상:
    - 정시 출근: #00B761 (초록)
    - 지각 (>10분): #F59E0B (주황)
    - 미출근 (과거): #FFF5F5 배경 + "미출근" 텍스트
  - clock_in ~ clock_out 을 분으로 변환 후 % 계산
  - clock_out 없으면 현재 시간 기준으로 우측 끝 처리
```

### 코드 변경 상세

#### ① 새 타입 추가 (any 타입 없이)

```typescript
interface DailyAttLog {
  profile_id: string;
  clock_in: string | null;   // ISO timestamp (UTC)
  clock_out: string | null;  // ISO timestamp (UTC)
}

// attendance_logs 쿼리 행 타입
interface AttLogRow {
  profile_id: string;
  type: "IN" | "OUT";
  created_at: string;
}
```

#### ② 새 state 추가

```typescript
const [dailyAttLogs, setDailyAttLogs] = useState<DailyAttLog[]>([]);
```

#### ③ fetchDailyAttendance — useCallback 래핑

```typescript
const fetchDailyAttendance = useCallback(async (date: Date) => {
  const dateStr = format(date, "yyyy-MM-dd");
  // KST 00:00 ~ 23:59 범위 (attendance_logs.created_at은 timestamptz)
  const start = new Date(dateStr + "T00:00:00+09:00").toISOString();
  const end   = new Date(dateStr + "T23:59:59+09:00").toISOString();

  const { data } = await supabase
    .from("attendance_logs")
    .select("profile_id, type, created_at")
    .gte("created_at", start)
    .lte("created_at", end)
    .order("created_at", { ascending: true });

  if (data) {
    const map = new Map<string, DailyAttLog>();
    (data as AttLogRow[]).forEach((log) => {
      if (!map.has(log.profile_id)) {
        map.set(log.profile_id, { profile_id: log.profile_id, clock_in: null, clock_out: null });
      }
      const entry = map.get(log.profile_id)!;
      if (log.type === "IN" && !entry.clock_in) entry.clock_in = log.created_at;
      if (log.type === "OUT") entry.clock_out = log.created_at;
    });
    setDailyAttLogs(Array.from(map.values()));
  }
}, [supabase]);
```

#### ④ useEffect — tab/dailyDate 변경 시 근태 fetch

```typescript
useEffect(() => {
  if (tab !== "daily") return;
  fetchDailyAttendance(dailyDate);
}, [tab, dailyDate, fetchDailyAttendance]);
```

#### ⑤ renderDailyView — 행 높이 조정 + 슬롯 바 위치 변경

```tsx
// 기존 행
<div key={profile.id} className="flex items-center border-t border-slate-100 min-h-[52px] relative">

// 변경
<div key={profile.id} className="flex items-center border-t border-slate-100 relative" style={{ height: "72px" }}>
```

슬롯 바 위치 변경 (상단 레이어):
```tsx
// 기존
className="absolute top-2 bottom-2 rounded-lg text-white text-[11px] ..."
style={{ left: `${leftPct}%`, width: `${widthPct}%`, ... }}

// 변경 (상단 26px 레이어)
className="absolute rounded-lg text-white text-[11px] font-bold px-2 flex items-center overflow-hidden hover:opacity-80 transition-all"
style={{
  top: "6px", height: "26px",
  left: `${leftPct}%`,
  width: `${widthPct}%`,
  backgroundColor: LOCATION_COLORS[slot.work_location],
  minWidth: "4px",
}}
```

#### ⑥ 근태 바 렌더링 추가 (하단 레이어)

슬롯 렌더링 블록 이후 추가:

```tsx
{(() => {
  const attLog = dailyAttLogs.find((a) => a.profile_id === profile.id);
  if (empSlots.length === 0) return null; // 슬롯 없으면 근태 레이어 없음

  const firstSlot = empSlots[0];
  const dateStr = format(dailyDate, "yyyy-MM-dd");
  const isPast = dailyDate < new Date(new Date().setHours(0, 0, 0, 0));

  // 미출근 (과거 날짜, 출근 기록 없음)
  if (!attLog?.clock_in && isPast) {
    return (
      <div
        className="absolute flex items-center px-2 rounded-md text-[10px] font-bold text-[#E03131]"
        style={{
          bottom: "6px", height: "22px",
          left: "4px", right: "4px",
          backgroundColor: "#FFF5F5",
          border: "1px solid #FFCDD2",
        }}
      >
        미출근
      </div>
    );
  }

  if (!attLog?.clock_in) return null; // 오늘/미래 미출근 — 표시 안 함

  // 출근 바 계산
  const clockInDate = new Date(attLog.clock_in);
  const clockOutDate = attLog.clock_out ? new Date(attLog.clock_out) : new Date();
  const totalHours = hourEnd - hourStart;

  const inH = clockInDate.getHours() + clockInDate.getMinutes() / 60;
  const outH = clockOutDate.getHours() + clockOutDate.getMinutes() / 60;
  const leftPct  = Math.max(0, ((inH - hourStart) / totalHours) * 100);
  const widthPct = Math.max(0.5, Math.min(100 - leftPct, ((outH - inH) / totalHours) * 100));

  // 지각 여부
  const [sh, sm] = firstSlot.start_time.split(":").map(Number);
  const schedStart = new Date(`${dateStr}T${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}:00`);
  const lateMin = Math.floor((clockInDate.getTime() - schedStart.getTime()) / 60000);
  const isLate = lateMin > 10;

  return (
    <div
      className="absolute flex items-center px-1.5 rounded-md text-[10px] font-bold text-white overflow-hidden"
      style={{
        bottom: "6px", height: "22px",
        left: `${leftPct}%`,
        width: `${widthPct}%`,
        backgroundColor: isLate ? "#F59E0B" : "#00B761",
        minWidth: "4px",
      }}
    >
      {widthPct > 5 && (
        <span className="truncate">{isLate ? `+${lateMin}분` : ""}</span>
      )}
    </div>
  );
})()}
```

---

## 테스트 체크리스트

### 작업 1 — 결근자 노출

- [ ] 스케줄 있고 출근한 날: 기존 그대로 표시 (is_absent=false)
- [ ] 스케줄 있고 미출근한 **과거** 날짜: 빨간 테두리 뱃지 + 미출근 카드
- [ ] 스케줄 있고 아직 출근 안 한 **오늘/미래**: 결근 표시 안 함 (뱃지·카드 모두)
- [ ] 스케줄 없는 직원: 근태 페이지에 표시 안 됨
- [ ] `substituted` 슬롯 소유자: 결근 대상에서 제외됨 (status='active' 필터로)
- [ ] 조기퇴근 뱃지: clock_out이 scheduled_end보다 10분 이상 빠를 때 표시
- [ ] 헤더 뱃지: "출근 N명 / 미출근 M명" 분리 표시
- [ ] Empty state: 스케줄 없는 날 "이 날은 근무 예정이 없어요."

### 작업 2 — 근태 레이어

- [ ] 슬롯 있고 출근한 경우: 상단 색상 바 + 하단 초록/주황 실제 바
- [ ] 슬롯 있고 미출근 (과거): 하단에 "미출근" 빨간 표시
- [ ] 슬롯 있고 오늘 아직 미출근: 하단 바 없음
- [ ] 슬롯 없는 직원: 하단 레이어 없음
- [ ] 퇴근 미기록(근무 중): clock_out=현재 시간으로 우측 끝 처리
- [ ] 일간 뷰 날짜 변경 시 근태 데이터 갱신
- [ ] 주간 → 일간 탭 전환 시 근태 데이터 fetch
- [ ] `substituted` 슬롯(회색 취소선) 행에도 근태 바 정상 표시 여부 확인

---

## 구현 순서

```
1. attendance/page.tsx
   a. import에 useCallback, useMemo, isBefore, startOfDay 추가
   b. supabase 싱글턴화 (useMemo)
   c. ProcessedLog 타입 수정 (is_absent, early_leave_minutes 추가)
   d. fetchLogsForCalendar useCallback 래핑 + 로직 재구성
   e. 달력 셀 결근 뱃지 UI
   f. 헤더 뱃지 분리 (출근 N명 / 미출근 M명)
   g. 상세 카드 결근 카드 UI
   h. Empty state 문구 변경
   i. npm run build

2. schedules/page.tsx
   a. DailyAttLog, AttLogRow 타입 추가
   b. dailyAttLogs state 추가
   c. fetchDailyAttendance (useCallback) 함수 추가
   d. useEffect — daily 탭 근태 fetch
   e. renderDailyView 행 높이 변경 (min-h-[52px] → height:72px)
   f. 슬롯 바 위치 조정 (top-2 bottom-2 → top:6px height:26px)
   g. 근태 바 렌더링 블록 추가
   h. npm run build
```

---

## 참고 — schema.md 업데이트 필요 사항

Phase 4(P4-06) 구현에서 추가된 `schedule_updated` notification type이 `docs/schema.md` 알림 type 목록에 누락됨.
구현 완료 후 schema.md 업데이트 시 아래 행 추가:

| type | 발생 시점 |
|------|-----------|
| `schedule_updated` | 확정 스케줄 슬롯 수정/삭제 시 (→ 해당 직원) |
