# 스케쥴 기능 개선 플랜

| 항목 | 내용 |
|------|------|
| 작성일 | 2026-03-18 |
| 브랜치 | dev |
| 기반 보고서 | schedule-qa-uiux / schedule-qa-frontend / schedule-qa-backend / schedule-qa-bugs |
| 총 이슈 | 67건 (UI/UX 18 + FE 13 + BE 14 + 버그 22) |
| 중복 제거 후 | **42개 독립 작업** |

---

## 1. 이슈 종합 매핑

> 4개 보고서에서 동일 근본 원인을 가진 이슈를 묶어 중복을 제거하고 작업 단위로 재분류한다.

| 작업 ID | 제목 | 관련 이슈 | 우선순위 |
|---------|------|-----------|---------|
| **P1-01** | 대타 수락 플로우 RPC 전환 | BE-CRIT01/02/04, FE-C01, BUG-001/006/010/014 | 🔴 P1 |
| **P1-02** | date-only UTC 파싱 통일 | BE-MINOR04, BUG-002/018 | 🔴 P1 |
| **P1-03** | 이전 주 복사 중복 방지 | BE-MAJOR02, BUG-003 | 🔴 P1 |
| **P2-01** | 스케줄 확정 재실행 방지 | BE-MAJOR03, BUG-004 | 🟠 P2 |
| **P2-02** | admin 알림 profile_id 누락 수정 | FE-I02, BUG-005 | 🟠 P2 |
| **P2-03** | Supabase 클라이언트 싱글턴화 | FE-C02 | 🟠 P2 |
| **P2-04** | 슬롯 삭제 확인 바텀시트 | UI-C1 | 🟠 P2 |
| **P2-05** | Skeleton UI 적용 (어드민 2곳) | UI-C2/C3, FE-N04 | 🟠 P2 |
| **P2-06** | substitute_requests UNIQUE 제약 | BUG-009 | 🟠 P2 |
| **P2-07** | 겹침 검사 DB 레벨 보강 | FE-M02, BE-MAJOR04, BUG-002 | 🟠 P2 |
| **P3-01** | 버튼 텍스트 동사형 통일 | UI-M1/M3/M5 | 🟡 P3 |
| **P3-02** | 토스트 description 보강 | UI-M4 | 🟡 P3 |
| **P3-03** | 폼 인라인 에러 표시 | UI-M2 | 🟡 P3 |
| **P3-04** | aria-label 일괄 추가 | UI-M6 | 🟡 P3 |
| **P3-05** | any 타입 제거 — join 결과 | FE-M01 | 🟡 P3 |
| **P3-06** | fetchAll profiles 분리 | FE-M04 | 🟡 P3 |
| **P3-07** | daily 탭 슬롯 추가 날짜 오류 | BUG-016, UI-m3 | 🟡 P3 |
| **P3-08** | 주 이동 시 selectedDay 동기화 | BUG-008 | 🟡 P3 |
| **P3-09** | requestReason 상태 초기화 | BUG-017 | 🟡 P3 |
| **P3-10** | daily 뷰 인원 집계 분 단위 수정 | FE-N02, BUG-015 | 🟡 P3 |
| **P3-11** | fetchIncomingRequests 서버 필터 | BE-MAJOR01, FE-N03 | 🟡 P3 |
| **P3-12** | handleCopyPrevWeek dayIndex -1 처리 | BUG-007 | 🟡 P3 |
| **P3-13** | fetchSlots setLoading(false) 안전 처리 | BUG-015(FE) | 🟡 P3 |
| **P3-14** | work_defaults day_of_week 범위 검증 | BUG-020 | 🟡 P3 |
| **P4-01** | 상수 파일 분리 (`schedule.ts`) | FE-I01 | 🟢 P4 |
| **P4-02** | WeeklyGrid / DailyTimeline 컴포넌트 분리 | FE-M03 | 🟢 P4 |
| **P4-03** | 터치 타겟 / 텍스트 크기 접근성 | UI-m4/m5 | 🟢 P4 |
| **P4-04** | 헤더 문구 개선 | UI-m1/m2 | 🟢 P4 |
| **P4-05** | 아이콘 구분 (기본 패턴 채우기) | UI-I1 | 🟢 P4 |
| **P4-06** | 확정 스케줄 수정/삭제 알림 발송 | UI-I2 | 🟢 P4 |
| **P4-07** | 빈 상태 문구 행동 유도 추가 | UI-I3 | 🟢 P4 |
| **P4-08** | 대타 사유 textarea 변경 | UI-I4 | 🟢 P4 |
| **P4-09** | notifications RLS TO authenticated | BE-MINOR05 | 🟢 P4 |
| **P4-10** | 미들웨어 admin role 체크 | BE-CRIT03, BUG-021 | 🟢 P4 |
| **P4-11** | weekly_schedules 조회 단순화 | BUG-004(쿼리) | 🟢 P4 |
| **P4-12** | SlotBottomSheet key prop 추가 | FE-N01, BUG-007 | 🟢 P4 |
| **P4-13** | 요일 레이블 getDay() 기반으로 변경 | FE-I03, BUG-014 | 🟢 P4 |
| **P4-14** | substituted 슬롯 그리드 표시 구분 | BUG-005(UI) | 🟢 P4 |
| **P4-15** | notes 최대 길이 제한 | BUG-022 | 🟢 P4 |
| **P4-16** | 직원 스케줄 쿼리 JOIN 단일화 | BE-MINOR01 | 🟢 P4 |
| **P4-17** | handleFillDefaults 중복 키 세분화 | BE-MAJOR05 | 🟢 P4 |

---

## 2. 의존성 그래프

```
P1-01 (대타 RPC) ──────────────────────────────────┐
P1-02 (날짜 파싱) ─────────────────────────────────┤
P1-03 (복사 중복 방지) ────────────────────────────┤
                                                    ↓
P2-01 ~ P2-07 (데이터 무결성 / 핵심 UI)             ↓
                                                    ↓
P3-01 ~ P3-14 (코드 품질 / UX)                      ↓
                                                    ↓
P4-01 (상수 분리) ← P4-02 (컴포넌트 분리) 가 P4-01에 의존
P4-10 (미들웨어) ← P2-03 (클라이언트 싱글턴) 완료 후 진행 권장
```

> **주의**: P1-01을 완료하기 전까지는 P3-11(fetchIncomingRequests 서버 필터)을 건드리지 않는다. 대타 수락 플로우 전체가 재작성되면서 쿼리 구조가 바뀌기 때문이다.

---

## 3. Phase별 상세 작업 지시서

---

### 🔴 Phase 1 — 긴급 (기능 복원 + 데이터 무결성)

> 배포 전 반드시 완료. 현재 대타 수락 기능이 RLS로 차단되어 작동하지 않음.

---

#### P1-01. 대타 수락 플로우 — Supabase RPC 전환

**근본 원인 분석**

현재 `handleAcceptSubstitute`(schedule/page.tsx:189~258)는 클라이언트에서 4단계 독립 쿼리를 순차 실행한다:
1. `substitute_responses` INSERT
2. `substitute_requests` UPDATE (status → filled)
3. `schedule_slots` UPDATE (원본 → substituted)
4. `schedule_slots` INSERT (대타자 신규 슬롯)

이로 인해 세 가지 치명적 문제가 발생한다:
- **기능 장애**: `substitute_requests`에 일반 직원 UPDATE RLS 정책이 없어 2단계에서 차단. 에러를 체크하지 않아 성공처럼 보이나 DB는 변경 안 됨.
- **원자성 없음**: 3단계 이후 실패 시 롤백 불가. 원본 슬롯만 `substituted`가 되고 대타자 슬롯이 없는 고아 상태 가능.
- **Race Condition**: eligible 직원 A·B가 동시 수락 시 둘 다 통과, 두 개의 대타 슬롯 생성.

**해결 방향**

PostgreSQL 함수 `accept_substitute(p_request_id, p_acceptor_id)` 작성 + Supabase Management API로 실행 + 클라이언트에서 `supabase.rpc('accept_substitute', {...})` 단일 호출로 교체.

**DB 함수 스펙**

```sql
-- 함수명: accept_substitute
-- 파라미터: p_request_id uuid, p_acceptor_id uuid
-- 반환: void (에러 시 EXCEPTION)
-- 트랜잭션: BEGIN/COMMIT 자동 (PL/pgSQL 함수)

CREATE OR REPLACE FUNCTION accept_substitute(
  p_request_id UUID,
  p_acceptor_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request       substitute_requests%ROWTYPE;
  v_orig_slot     schedule_slots%ROWTYPE;
BEGIN
  -- 1. 요청 잠금 및 상태 검증 (FOR UPDATE로 동시 수락 차단)
  SELECT * INTO v_request
    FROM substitute_requests
   WHERE id = p_request_id
     AND status = 'approved'
     AND p_acceptor_id = ANY(eligible_profile_ids)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ALREADY_FILLED_OR_NOT_ELIGIBLE';
  END IF;

  -- 2. 원본 슬롯 조회
  SELECT * INTO v_orig_slot
    FROM schedule_slots
   WHERE id = v_request.slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORIGINAL_SLOT_NOT_FOUND';
  END IF;

  -- 3. substitute_responses INSERT
  INSERT INTO substitute_responses(request_id, profile_id, response)
  VALUES (p_request_id, p_acceptor_id, 'accepted');

  -- 4. substitute_requests UPDATE
  UPDATE substitute_requests
     SET status      = 'filled',
         accepted_by = p_acceptor_id,
         accepted_at = NOW()
   WHERE id = p_request_id;

  -- 5. 원본 슬롯 → substituted
  UPDATE schedule_slots
     SET status = 'substituted'
   WHERE id = v_request.slot_id;

  -- 6. 대타자 신규 슬롯 INSERT
  INSERT INTO schedule_slots(
    weekly_schedule_id, profile_id, slot_date,
    start_time, end_time, work_location, cafe_positions, status
  )
  VALUES (
    v_orig_slot.weekly_schedule_id,
    p_acceptor_id,
    v_orig_slot.slot_date,
    v_orig_slot.start_time,
    v_orig_slot.end_time,
    v_orig_slot.work_location,
    v_orig_slot.cafe_positions,
    'active'
  );
END;
$$;

-- RLS: 인증된 직원이 자신이 eligible인 approved 요청에 대해서만 호출 가능
-- (함수 내부에서 eligible_profile_ids 검증)
REVOKE ALL ON FUNCTION accept_substitute(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION accept_substitute(UUID, UUID) TO authenticated;
```

**클라이언트 수정 대상**
- `src/app/schedule/page.tsx` — `handleAcceptSubstitute` 함수 전체를 아래 패턴으로 교체:

```typescript
const handleAcceptSubstitute = async (req: SubstituteRequest) => {
  if (!profileId) return;
  setRespondingId(req.id);

  const { error } = await supabase.rpc('accept_substitute', {
    p_request_id: req.id,
    p_acceptor_id: profileId,
  });

  if (error) {
    if (error.message.includes('ALREADY_FILLED_OR_NOT_ELIGIBLE')) {
      toast.error('이미 다른 분이 수락했어요', { description: '대타가 확정됐어요.' });
    } else {
      toast.error('수락에 실패했어요', { description: '잠시 후 다시 시도해주세요.' });
    }
    setRespondingId(null);
    return;
  }

  // 알림 발송 (실패해도 수락 자체는 성공이므로 에러 무시)
  const slotDateLabel = req.slot_date
    ? format(new Date(req.slot_date + 'T00:00:00'), 'M월 d일', { locale: ko })
    : '';
  await supabase.from('notifications').insert([
    {
      profile_id: req.requester_id,
      target_role: 'employee',
      type: 'substitute_filled',
      title: '대타가 구해졌어요',
      content: `${slotDateLabel} ${LOCATION_LABELS[req.work_location]} 대타가 확정됐어요.`,
      source_id: req.id,
    },
  ]);

  toast.success('대타를 수락했어요', { description: `${slotDateLabel} 근무가 추가됐어요.` });
  setRespondingId(null);
  fetchIncomingRequests();
  fetchSlots();
};
```

**DB 실행 절차**
1. `docs/migrations/008_accept_substitute_rpc.sql` 작성 (위 SQL)
2. Management API로 실행
3. 검증: `SELECT proname FROM pg_proc WHERE proname = 'accept_substitute';`

**완료 조건**
- [ ] DB 함수 생성 확인
- [ ] 직원 A가 수락 → `substitute_requests.status = 'filled'` 확인
- [ ] 대타자 신규 슬롯 생성 확인
- [ ] 원본 슬롯 `status = 'substituted'` 확인
- [ ] 직원 A와 B가 동시 수락 시 1명만 성공 확인

---

#### P1-02. date-only 문자열 UTC 파싱 통일

**근본 원인**

`new Date("2026-03-18")`은 ISO 8601 date-only 포맷으로 **UTC 자정** 기준 파싱된다. KST(UTC+9) 환경에서는 `2026-03-18 09:00 KST`로 해석되어 정상이나, Vercel 서버(UTC)에서는 `2026-03-18 00:00 UTC`로 파싱되어 `format()`이 올바른 날짜를 반환하더라도, 향후 서버사이드 렌더링이나 테스트 환경에서 하루 어긋남이 발생한다.

`schedule/page.tsx:477`에서 이미 `new Date(req.slot_date + "T00:00:00")` 패턴이 적용되어 있으나, 같은 파일 내 다른 위치와 substitutes/page.tsx에서 누락됨.

**수정 대상 위치**

| 파일 | 라인 | 현재 코드 | 수정 코드 |
|------|------|-----------|-----------|
| `src/app/admin/schedules/substitutes/page.tsx` | 275 | `new Date(req.slot_date)` | `new Date(req.slot_date + "T00:00:00")` |
| `src/app/schedule/page.tsx` | 551 | `new Date(requestTarget.slot_date)` | `new Date(requestTarget.slot_date + "T00:00:00")` |
| `src/app/schedule/page.tsx` | 236 | `new Date(req.slot_date)` | `new Date(req.slot_date + "T00:00:00")` |

**완료 조건**
- [ ] 위 3곳 수정
- [ ] KST 환경에서 날짜 표시 정상 확인

---

#### P1-03. 이전 주 복사 — 중복 슬롯 방지

**근본 원인**

`handleCopyPrevWeek`(admin/schedules/page.tsx:456~498)가 현재 주 기존 슬롯 존재 여부를 확인하지 않고 이전 주 슬롯을 전부 INSERT. `handleFillDefaults`에는 이미 중복 검사가 구현되어 있으나 복사 함수에는 누락.

추가로, `dayIndex === -1` fallback이 `weekDates[0]`(일요일)으로 설정되어 비정상 날짜의 슬롯이 모두 일요일에 몰릴 수 있음(BUG-SCH-007).

**수정 내용**

`handleCopyPrevWeek` 내에 아래 로직 추가:

```typescript
// 기존 슬롯 중복 확인 (handleFillDefaults와 동일 패턴)
const { data: existingSlots } = await supabase
  .from('schedule_slots')
  .select('profile_id, slot_date')
  .eq('weekly_schedule_id', wsId)
  .neq('status', 'cancelled');

const existingSet = new Set(
  (existingSlots || []).map(
    (s: { profile_id: string; slot_date: string }) => `${s.profile_id}_${s.slot_date}`
  )
);

const newSlots = prevSlots
  .map((s: ScheduleSlot) => {
    const dayIndex = prevWeekDates.indexOf(s.slot_date);
    if (dayIndex === -1) return null; // dayIndex -1 처리 (BUG-007)
    return {
      weekly_schedule_id: wsId,
      profile_id: s.profile_id,
      slot_date: weekDates[dayIndex],
      start_time: s.start_time,
      end_time: s.end_time,
      work_location: s.work_location,
      cafe_positions: s.cafe_positions,
      notes: s.notes,
      status: 'active',
    };
  })
  .filter((s): s is NonNullable<typeof s> => {
    if (!s) return false;
    return !existingSet.has(`${s.profile_id}_${s.slot_date}`); // 중복 제외
  });
```

**완료 조건**
- [ ] 이미 슬롯 있는 주에 복사 → 중복 슬롯 미생성 확인
- [ ] 빈 주에 복사 → 정상 복사 확인
- [ ] 이전 주 슬롯 날짜 매핑 오류 없음 확인

---

### 🟠 Phase 2 — 고우선순위 (데이터 무결성 + 핵심 UX)

---

#### P2-01. 스케줄 확정 재실행 방지

**수정 파일**: `src/app/admin/schedules/page.tsx`

두 가지 방어선 추가:
1. `handleConfirmSchedule` 시작 시 `weeklySchedule?.status === 'confirmed'` 얼리 리턴
2. UPDATE 쿼리에 `.eq('status', 'draft')` 조건 추가 (서버사이드 방어)

```typescript
const handleConfirmSchedule = async () => {
  if (weeklySchedule?.status === 'confirmed') {
    toast.error('이미 확정된 스케줄이에요', { description: '직원들에게 이미 알림이 전송됐어요.' });
    return;
  }
  // ...
  const { error } = await supabase
    .from('weekly_schedules')
    .update({ status: 'confirmed', published_at: new Date().toISOString() })
    .eq('id', wsId)
    .eq('status', 'draft'); // 추가
```

---

#### P2-02. admin 알림 INSERT — profile_id 누락 수정

**수정 파일**: `src/app/schedule/page.tsx:246-252`

관리자 전체 대상 알림 구조를 스키마 확인 후 처리:
- `notifications.profile_id`가 NOT NULL이면 → 관리자 프로필 ID를 별도 조회하거나, `target_role = 'admin'` + `profile_id = null` 허용하도록 스키마 수정
- NULL 허용이면 → `profile_id: null` 명시적 설정

**우선 할 것**: Management API로 `notifications` 컬럼 NULL 가능 여부 확인
```sql
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'notifications' AND column_name = 'profile_id';
```

결과에 따라:
- NOT NULL → `profile_id` 컬럼을 nullable로 변경하거나, admin 전용 알림 테이블 분리 검토
- NULL 허용 → 코드에 `profile_id: null` 명시

---

#### P2-03. Supabase 클라이언트 싱글턴화

**수정 파일**: 3개 페이지 파일 모두

```typescript
// 현재 (각 파일 최상단)
export default function Page() {
  const supabase = createClient(); // ❌ 매 렌더마다 생성
  ...
}

// 수정 후
export default function Page() {
  const supabase = useMemo(() => createClient(), []); // ✅ 마운트 1회
  ...
}
```

`useCallback`의 의존성 배열에 `supabase` 추가:
```typescript
const fetchSlots = useCallback(async () => {
  ...
}, [profileId, weekStart, supabase]); // supabase 추가
```

---

#### P2-04. 슬롯 삭제 확인 바텀시트

**수정 파일**: `src/app/admin/schedules/page.tsx` — `SlotBottomSheet` 컴포넌트

`handleDelete` 직접 호출 대신 `confirmDelete` 상태(boolean)로 2단계 분리:

```typescript
// SlotBottomSheet 내부 상태 추가
const [confirmDelete, setConfirmDelete] = useState(false);

// 삭제 버튼 → 확인 UI로 전환
{!confirmDelete ? (
  <button onClick={() => setConfirmDelete(true)} ...>
    이 슬롯 삭제하기
  </button>
) : (
  <div className="bg-[#FFF5F5] rounded-2xl p-4 space-y-3">
    <p className="text-[14px] font-bold text-[#E03131] text-center">
      정말 삭제할까요?
    </p>
    <p className="text-[13px] text-[#8B95A1] text-center">
      삭제하면 복구할 수 없어요.
    </p>
    <div className="flex gap-2">
      <button onClick={() => setConfirmDelete(false)} ...>취소하기</button>
      <button onClick={handleDelete} ...>삭제하기</button>
    </div>
  </div>
)}
```

---

#### P2-05. Skeleton UI 적용 (어드민 2페이지)

**수정 파일**:
- `src/app/admin/schedules/page.tsx` — 주간 그리드 Skeleton
- `src/app/admin/schedules/substitutes/page.tsx` — 카드 Skeleton

**어드민 스케줄 (주간 그리드 Skeleton)**
```tsx
// loading === true 시 표시
<div className="overflow-x-auto rounded-[20px] border border-slate-100 bg-white shadow-sm">
  <div className="min-w-[700px] p-4 space-y-3">
    {[1, 2, 3, 4].map((i) => (
      <div key={i} className="flex gap-2">
        <div className="w-[100px] h-8 bg-[#F2F4F6] rounded-lg animate-pulse" />
        {[1,2,3,4,5,6,7].map((j) => (
          <div key={j} className="flex-1 h-8 bg-[#F2F4F6] rounded-lg animate-pulse" />
        ))}
      </div>
    ))}
  </div>
</div>
```

**어드민 대체근무 (카드 Skeleton)**
```tsx
{[1, 2, 3].map((i) => (
  <div key={i} className="bg-white rounded-[20px] p-5 border border-slate-100">
    <div className="flex items-center gap-3 mb-3">
      <div className="w-8 h-8 rounded-full bg-[#F2F4F6] animate-pulse" />
      <div className="w-24 h-4 bg-[#F2F4F6] rounded animate-pulse" />
    </div>
    <div className="w-full h-3 bg-[#F2F4F6] rounded animate-pulse mb-2" />
    <div className="w-2/3 h-3 bg-[#F2F4F6] rounded animate-pulse" />
  </div>
))}
```

---

#### P2-06. substitute_requests UNIQUE 제약 추가

**목적**: 같은 직원이 같은 슬롯에 중복 요청하는 것을 DB 레벨에서 차단.

```sql
-- docs/migrations/009_substitute_requests_unique.sql
ALTER TABLE substitute_requests
  ADD CONSTRAINT substitute_requests_slot_requester_unique
  UNIQUE (slot_id, requester_id);
```

Management API로 실행 후 클라이언트의 중복 체크 로직은 UX용 보조 방어로 유지.

---

#### P2-07. 겹침 검사 강화

현재 클라이언트 `slots` state에만 의존하는 겹침 검사를 저장 직전 DB 재조회 방식으로 보강.

**수정 위치**: `handleSaveSlot` 내 겹침 검사 부분

```typescript
// 현재: slots state 참조 → 대타 슬롯 등 누락 가능
// 수정: 저장 직전 DB 조회
const { data: dbSameDay } = await supabase
  .from('schedule_slots')
  .select('id, start_time, end_time, status')
  .eq('profile_id', data.profile_id!)
  .eq('slot_date', data.slot_date!)
  .eq('status', 'active')
  .neq('id', data.id ?? '00000000-0000-0000-0000-000000000000');

const hasOverlap = (dbSameDay || []).some((s) => {
  const sStart = timeToMinutes(s.start_time);
  const sEnd   = timeToMinutes(s.end_time);
  return startMin < sEnd && endMin > sStart;
});
```

---

### 🟡 Phase 3 — 중우선순위 (코드 품질 + UX 개선)

---

#### P3-01. 버튼 텍스트 동사형 통일

**일괄 변경 목록**

| 파일 | 라인(참고) | 현재 | 변경 |
|------|----------|------|------|
| `admin/schedules/page.tsx` | 286 | "취소" | "닫기" |
| `schedule/page.tsx` | 577 | "취소" | "닫기" |
| `substitutes/page.tsx` | 356 | "취소" | "닫기" |
| `substitutes/page.tsx` | 422 | "취소" | "닫기" |
| `schedule/page.tsx` | 456 | "대타" | "대타 요청하기" |
| `admin/schedules/page.tsx` | 275 | "저장 중..." | "저장하는 중이에요" |
| `admin/schedules/page.tsx` | 283 | "삭제 중..." | "삭제하는 중이에요" |
| `admin/schedules/page.tsx` | 826 | "확정 중..." | "확정하는 중이에요" |
| `admin/schedules/page.tsx` | 888 | (복사 중) | "복사하는 중이에요" |
| `admin/schedules/page.tsx` | 896 | (채우는 중) | "채우는 중이에요" |
| `schedule/page.tsx` | 575 | "요청 중..." | "요청하는 중이에요" |

---

#### P3-02. 토스트 description 보강

| 파일 | 현재 | 수정 |
|------|------|------|
| `substitutes/page.tsx:169` | `toast.error("대타 가능한 직원을 선택해주세요.")` | description 추가: `"목록에서 대타 가능한 직원을 1명 이상 선택해주세요."` |

---

#### P3-03. 폼 인라인 에러 표시

**수정 파일**: `src/app/admin/schedules/page.tsx` — `SlotBottomSheet`

`handleSave` 유효성 검사 실패 시 toast 대신 각 필드 아래 에러 텍스트 표시:

```typescript
// 상태 추가
const [errors, setErrors] = useState<{ profile_id?: string; slot_date?: string }>({});

// handleSave 수정
const handleSave = async () => {
  const newErrors: typeof errors = {};
  if (!form.profile_id) newErrors.profile_id = '직원을 선택해주세요.';
  if (!form.slot_date)  newErrors.slot_date  = '날짜를 선택해주세요.';
  if (Object.keys(newErrors).length > 0) {
    setErrors(newErrors);
    return;
  }
  setErrors({});
  ...
};

// JSX: 각 필드 아래
{errors.profile_id && (
  <p className="text-[12px] text-[#E03131] mt-1">{errors.profile_id}</p>
)}
```

---

#### P3-04. aria-label 일괄 추가

**수정 대상**

| 파일 | 요소 | aria-label |
|------|------|-----------|
| `schedule/page.tsx:343` | ChevronLeft 버튼 | `"이전 주"` |
| `schedule/page.tsx:353` | ChevronRight 버튼 | `"다음 주"` |
| `schedule/page.tsx:545` | X 닫기 버튼 | `"닫기"` |
| `admin/schedules/page.tsx` | ChevronLeft (주 이동) | `"이전 주"` |
| `admin/schedules/page.tsx` | ChevronRight (주 이동) | `"다음 주"` |
| `admin/schedules/page.tsx:153` | X 닫기 버튼 | `"닫기"` |
| `substitutes/page.tsx:220` | ChevronLeft 뒤로가기 | `"대체근무 관리로 돌아가기"` |

---

#### P3-05. any 타입 제거 — join 결과 매핑

**수정 파일**: `src/app/schedule/page.tsx`, `src/app/admin/schedules/substitutes/page.tsx`

Supabase join 응답 타입 인터페이스 정의:

```typescript
// src/types/supabase-joins.ts (새 파일)
export interface RawSubstituteRequestRow {
  id: string;
  slot_id: string;
  requester_id: string;
  reason: string | null;
  status: string;
  eligible_profile_ids: string[];
  accepted_by: string | null;
  schedule_slots: {
    slot_date: string;
    start_time: string;
    end_time: string;
    work_location: string;
    cafe_positions: string[];
  } | null;
  profiles: { name: string } | null;
}
```

기존 `(r: any)` → `(r: RawSubstituteRequestRow)`로 교체.

---

#### P3-06. fetchAll profiles 분리

**수정 파일**: `src/app/admin/schedules/page.tsx`

```typescript
// profiles는 마운트 1회만
const fetchProfiles = useCallback(async () => {
  const { data } = await supabase.from('profiles').select('id, name, color_hex').order('name');
  if (data) setProfiles(data);
}, [supabase]);

// 슬롯/스케줄만 재조회하는 함수 분리
const fetchScheduleData = useCallback(async () => {
  setLoading(true);
  // weekly_schedule + slots 조회만
  ...
  setLoading(false);
}, [weekStartStr, supabase]);

useEffect(() => {
  fetchProfiles(); // 최초 1회
}, [fetchProfiles]);

useEffect(() => {
  fetchScheduleData(); // weekStart 변경 시
  fetchPendingSubCount();
}, [fetchScheduleData, fetchPendingSubCount]);
```

슬롯 저장/삭제 후에는 `fetchAll()` 대신 `fetchScheduleData()`만 호출.

---

#### P3-07. Daily 탭 슬롯 추가 날짜 오류 수정

**근본 원인**: `SlotBottomSheet`의 `weekDates` prop이 항상 주간 탭 기준 날짜 배열로 전달됨. daily 탭에서 다른 날짜를 보고 있을 때 슬롯 추가 시 날짜 드롭다운이 weekly 탭 날짜로만 표시됨.

**수정**: daily 탭에서 바텀시트 열 때 `weekDates`를 해당 날짜의 주 날짜 배열로 전달하거나, `defaultDate`가 `weekDates`에 없을 경우 해당 날짜 기준 주를 계산하여 전달.

```typescript
// 바텀시트 open 시 dailyDate 기준 주 날짜 계산
const dailyWeekDates = getWeekDates(startOfWeek(dailyDate, { weekStartsOn: 0 }));
setEditSlot({
  slot: null,
  defaultDate: dateStr,
  defaultProfileId: profile?.id,
  weekDates: dailyWeekDates, // 추가 prop
});
```

---

#### P3-08. 주 이동 시 selectedDay 동기화 (직원 스케줄)

**수정 파일**: `src/app/schedule/page.tsx`

```typescript
const handlePrevWeek = () => {
  const newWeekStart = subWeeks(weekStart, 1);
  setWeekStart(newWeekStart);
  // 이동한 주 내에서 가장 가까운 날짜로 selectedDay 이동
  setSelectedDay(startOfWeek(newWeekStart, { weekStartsOn: 0 }));
};

const handleNextWeek = () => {
  const newWeekStart = addWeeks(weekStart, 1);
  setWeekStart(newWeekStart);
  setSelectedDay(startOfWeek(newWeekStart, { weekStartsOn: 0 }));
};
```

---

#### P3-09. requestReason 상태 초기화

**수정 파일**: `src/app/schedule/page.tsx`

취소 버튼과 X 버튼 클릭 시 `requestReason`도 초기화:

```typescript
// 현재
onClick={() => setRequestTarget(null)

// 수정
onClick={() => { setRequestTarget(null); setRequestReason(''); }}
```

---

#### P3-10. Daily 뷰 인원 집계 분 단위 수정

**수정 파일**: `src/app/admin/schedules/page.tsx` (renderDailyView 내 집계 로직)

```typescript
// 현재 (버그)
parseInt(s.start_time.split(':')[0]) <= h && parseInt(s.end_time.split(':')[0]) > h

// 수정 (timeToMinutes 활용)
timeToMinutes(s.start_time) < (h + 1) * 60 && timeToMinutes(s.end_time) > h * 60
```

---

#### P3-11. fetchIncomingRequests 서버 필터 추가

> ⚠️ P1-01 완료 후 진행

**수정 파일**: `src/app/schedule/page.tsx:131-138`

```typescript
const { data: requests } = await supabase
  .from('substitute_requests')
  .select(`...`)
  .eq('status', 'approved')
  .contains('eligible_profile_ids', [profileId]); // 서버 필터 추가

// 클라이언트 필터 제거 (RLS + 서버 필터로 대체)
// const eligibleRequests = requests.filter(...) → 제거
```

---

#### P3-12. handleCopyPrevWeek dayIndex -1 처리

P1-03에서 포함하여 처리 (위 P1-03 코드 참조).

---

#### P3-13. fetchSlots setLoading(false) try/finally 처리

**수정 파일**: `src/app/schedule/page.tsx`

```typescript
const fetchSlots = useCallback(async () => {
  if (!profileId) return;
  setLoading(true);
  try {
    // ... 기존 쿼리 로직
  } finally {
    setLoading(false); // 에러 시에도 반드시 호출
  }
}, [profileId, weekStart, supabase]);
```

---

#### P3-14. work_defaults day_of_week 범위 검증

**수정 파일**: `src/app/admin/schedules/page.tsx:544-547`

```typescript
for (const wd of defaults) {
  const dow = wd.day_of_week;
  if (typeof dow !== 'number' || dow < 0 || dow > 6) continue; // 범위 검증 추가
  const targetDate = weekDates[dow];
  ...
}
```

---

### 🟢 Phase 4 — 저우선순위 (리팩토링 + 개선)

> 기능 안정화 후 순차 처리. 각 작업이 독립적이므로 병렬 진행 가능.

---

#### P4-01. 상수 파일 분리

**신규 파일**: `src/lib/constants/schedule.ts`

```typescript
export const LOCATION_LABELS: Record<string, string> = {
  cafe: '카페', factory: '공장', catering: '케이터링',
};
export const LOCATION_COLORS: Record<string, string> = {
  cafe: '#3182F6', factory: '#00B761', catering: '#F59E0B',
};
export const LOCATION_BG: Record<string, string> = {
  cafe: '#E8F3FF', factory: '#E6FAF0', catering: '#FFF7E6',
};
export const CAFE_POSITION_LABELS: Record<string, string> = {
  hall: '홀', kitchen: '주방', showroom: '쇼룸',
};
```

3개 파일에서 로컬 선언 제거 후 import로 교체.

---

#### P4-02. WeeklyGrid / DailyTimeline 컴포넌트 분리

> P4-01 완료 후 진행 (상수 import 필요)

**신규 파일**:
- `src/app/admin/schedules/_components/WeeklyGrid.tsx`
- `src/app/admin/schedules/_components/DailyTimeline.tsx`

`renderWeeklyGrid`, `renderDailyView` 함수를 각각 독립 컴포넌트로 추출. props 타입 명시.

---

#### P4-03. 접근성 — 터치 타겟 / 텍스트 크기

| 위치 | 수정 내용 |
|------|-----------|
| `schedule/page.tsx:343-358` 주 이동 버튼 | `className`에 `min-w-[44px] min-h-[44px]` 추가 |
| `admin/schedules/page.tsx:653, 752` 슬롯 텍스트 | `text-[11px]` → `text-[12px]` |

---

#### P4-04. 헤더 문구 개선

| 파일 | 현재 | 수정 |
|------|------|------|
| `admin/schedules/page.tsx` 헤더 설명 | "관리하고 확정해요" | "한눈에 관리해요" |
| `substitutes/page.tsx:225` | "처리해요." | "검토하고 승인해요." |

---

#### P4-05. 기본 패턴 채우기 아이콘 교체

`admin/schedules/page.tsx` — Copy 아이콘 → `LayoutTemplate` 아이콘으로 교체 (이전 주 복사와 구분).

---

#### P4-06. 확정 스케줄 수정/삭제 시 직원 알림

`handleSaveSlot` (수정 시)과 `handleDeleteSlot`에서 weeklySchedule.status가 `confirmed`인 경우 영향 받는 직원에게 알림 발송 로직 추가.

```typescript
// 확정된 주차 슬롯 수정/삭제 시
if (weeklySchedule?.status === 'confirmed') {
  await supabase.from('notifications').insert({
    profile_id: data.profile_id,
    target_role: 'employee',
    type: 'schedule_updated',
    title: '스케줄이 변경됐어요',
    content: `${slotDateLabel} 근무 일정이 수정됐어요. 확인해보세요.`,
    source_id: wsId,
  });
}
```

---

#### P4-07. 빈 상태 문구 행동 유도

**수정 파일**: `src/app/schedule/page.tsx:404-407`

```tsx
<p className="text-[#8B95A1] text-[15px] font-medium">이 날은 근무가 없어요</p>
<p className="text-[#8B95A1] text-[13px] mt-1">스케줄이 궁금하면 관리자에게 확인해보세요.</p>
```

---

#### P4-08. 대타 사유 input → textarea 변경

**수정 파일**: `src/app/schedule/page.tsx:560-566`

```tsx
<textarea
  value={requestReason}
  onChange={(e) => setRequestReason(e.target.value)}
  placeholder="사유를 입력해요 (예: 개인 사정, 몸 상태 불량)"
  rows={3}
  className="w-full px-4 py-3 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6] resize-none"
/>
```

---

#### P4-09. notifications RLS 정책 수정

```sql
-- TO public → TO authenticated
ALTER POLICY "notifications_insert" ON notifications TO authenticated;
-- 또는 기존 정책 DROP 후 재생성
```

---

#### P4-10. 미들웨어 admin role 체크

**수정 파일**: `src/middleware.ts`

```typescript
// /admin/** 경로에서 role 확인 추가
if (pathname.startsWith('/admin')) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.redirect(new URL('/', request.url));
  }
}
```

---

#### P4-11 ~ P4-17. 기타 소규모 수정

| ID | 파일 | 수정 내용 |
|----|------|-----------|
| P4-11 | `schedule/page.tsx:100-106` | `.eq("week_start", weekStartStr).maybeSingle()` 단순화 |
| P4-12 | `admin/schedules/page.tsx` | `SlotBottomSheet`에 `key={editSlot?.slot?.id ?? 'new'}` 추가 |
| P4-13 | `admin/schedules/page.tsx:182` | `DAY_LABELS[i]` → `format(parseISO(d), 'EEE', { locale: ko })` |
| P4-14 | `admin/schedules/page.tsx` | `substituted` 슬롯을 그리드에서 회색/취소선 스타일로 구분 표시 |
| P4-15 | `admin/schedules/page.tsx:259` | `<input maxLength={200} />` 추가 |
| P4-16 | `schedule/page.tsx:94-125` | weekly_schedules + schedule_slots 단일 JOIN 쿼리로 통합 |
| P4-17 | `admin/schedules/page.tsx:527` | 중복 키를 `${profile_id}_${slot_date}_${work_location}`으로 세분화 |

---

## 4. 작업 순서 요약 (실행 로드맵)

```
Week 1 (긴급)
├── P1-01  대타 수락 RPC 전환     ← DB 함수 작성 + 클라이언트 수정
├── P1-02  날짜 UTC 파싱 통일     ← 3곳 단순 수정
└── P1-03  이전 주 복사 중복 방지 ← handleCopyPrevWeek 수정

Week 2 (고우선순위)
├── P2-01  확정 재실행 방지
├── P2-02  admin 알림 profile_id  ← 스키마 확인 후 결정
├── P2-03  Supabase 클라이언트 싱글턴
├── P2-04  슬롯 삭제 확인 바텀시트
├── P2-05  Skeleton UI 2곳
├── P2-06  UNIQUE 제약 마이그레이션
└── P2-07  겹침 검사 DB 재조회

Week 3 (중우선순위 — 그룹 A)
├── P3-01  버튼 텍스트 동사형 통일  ← 일괄 텍스트 교체
├── P3-02  토스트 description 보강
├── P3-03  폼 인라인 에러
├── P3-04  aria-label 일괄 추가
└── P3-13  setLoading finally 처리

Week 4 (중우선순위 — 그룹 B)
├── P3-05  any 타입 제거
├── P3-06  fetchAll profiles 분리
├── P3-07  daily 탭 날짜 오류
├── P3-08  selectedDay 동기화
├── P3-09  requestReason 초기화
├── P3-10  인원 집계 분 단위
├── P3-11  서버 필터 추가 (P1-01 완료 후)
└── P3-14  day_of_week 범위 검증

Week 5+ (리팩토링 + 개선)
└── P4-01 ~ P4-17  순차 또는 병렬 처리
```

---

## 5. 빌드 체크 포인트

각 Phase 완료 시 반드시 실행:

```bash
npm run build
npm run lint
```

P1-01 완료 후 추가 검증:
```bash
# Management API로 RPC 함수 존재 확인
curl -s -X POST "https://api.supabase.com/v1/projects/ymvdjxzkjodasctktunh/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT proname, prosecdef FROM pg_proc WHERE proname = '\''accept_substitute'\''"}'
```

---

## 6. 리스크 및 주의사항

| 리스크 | 해당 작업 | 대응 |
|--------|-----------|------|
| RPC 함수 배포 전 클라이언트 배포 시 기능 단절 | P1-01 | DB 함수 먼저 배포, 클라이언트는 동시 또는 직후 배포 |
| UNIQUE 제약 추가 시 기존 중복 데이터 존재 가능 | P2-06 | ALTER 전 중복 데이터 조회 후 정리 필요 |
| P3-06 fetchAll 분리 후 profiles 빈 상태로 렌더 가능 | P3-06 | profiles 로딩 완료 전 그리드 표시 방지 조건 추가 |
| P4-10 미들웨어 role 체크 — profiles 테이블 조회 지연 | P4-10 | 미들웨어에서 `profiles` 대신 JWT custom claim 활용 권장 |
