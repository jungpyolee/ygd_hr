# [QA] 스케줄 기능 — 버그 탐색 보고서

| 항목 | 내용 |
|------|------|
| 담당 | 버그 탐색 전문가 |
| 검토일 | 2026-03-18 |
| 브랜치 | dev |
| 상태 | ✅ 완료 |

## 요약

스케줄 관련 3개 파일 (`src/app/admin/schedules/page.tsx`, `src/app/admin/schedules/substitutes/page.tsx`, `src/app/schedule/page.tsx`) 과 DB 마이그레이션 (`docs/migrations/007_epic_d_schedule_tables.sql`) 전체를 분석했습니다.

**총 발견 항목: 22개** (확실한 버그 5개 / 잠재적 버그 7개 / 엣지 케이스 미처리 6개 / 방어 코드 미흡 4개)

---

## 버그 목록

---

### 🔴 확실한 버그 (재현 가능)

---

#### BUG-SCH-001: 대타 수락 시 race condition — 복수 사용자가 동시에 수락 가능

- **파일**: `src/app/schedule/page.tsx:189-258` (`handleAcceptSubstitute`)
- **재현 조건**: eligible 직원 A와 B가 동시에 "수락하기" 버튼 클릭
- **예상 동작**: 한 명만 대타로 확정되어야 함
- **실제 동작**: A, B 모두 `substitute_responses` INSERT 성공 → 두 사람 모두 `status='filled'`, `accepted_by`에 마지막 UPDATE 값만 남음. 그러나 `schedule_slots`에는 두 개의 active 슬롯이 생성됨 (두 명 모두 새 슬롯 INSERT). 즉, 한 근무 슬롯에 두 명이 동시에 배정되는 데이터 무결성 파괴 발생.
- **심각도**: 🔴 치명 — 데이터 무결성 파괴, 급여·근무표 오류 직결
- **수정 방향**: DB 레벨 유니크 제약 또는 트랜잭션 + `status='approved'` 조건으로 UPDATE 시 affected rows 확인. `accepted_by IS NULL` 조건을 UPDATE 쿼리에 추가해 첫 번째 수락자만 성공하도록 처리.

---

#### BUG-SCH-002: 겹침 검사가 daily 탭 슬롯을 무시함

- **파일**: `src/app/admin/schedules/page.tsx:398-412` (`handleSaveSlot`)
- **재현 조건**: 관리자가 weekly 탭에서 슬롯 추가 중, 동일 직원의 같은 날 다른 주차 슬롯이 존재하는 경우 (정상 케이스는 아니나), 더 자주 발생하는 케이스: 대타 수락으로 `schedule_slots`에 추가된 슬롯은 `weeklySchedule.id`가 다를 수 있으므로, `slots` state에 포함되지 않아 겹침 검사 통과
- **예상 동작**: 같은 날 동일 직원에게 겹치는 시간이 있으면 차단
- **실제 동작**: `slots` state는 현재 주차의 `weekly_schedule_id`에 속한 슬롯만 포함. 대타로 생성된 슬롯(다른 `weekly_schedule_id` 소속 가능)은 검사 대상에서 빠져 겹침 허용
- **심각도**: 🔴 높음 — 같은 날 동일 직원 중복 배정 발생 가능
- **수정 방향**: `handleSaveSlot` 내 겹침 검사 시 `slot_date`와 `profile_id`를 조건으로 DB에서 직접 조회하거나, `slots` state 로딩 쿼리를 `slot_date` 범위 기준으로 전환

---

#### BUG-SCH-003: 이전 주 복사 시 이미 슬롯이 있는 주차에 중복 삽입

- **파일**: `src/app/admin/schedules/page.tsx:456-498` (`handleCopyPrevWeek`)
- **재현 조건**: 현재 주에 이미 일부 슬롯이 존재하는 상태에서 "이전 주 복사" 클릭
- **예상 동작**: 이미 존재하는 슬롯과 겹치는 복사는 건너뛰거나 사용자에게 경고
- **실제 동작**: 중복 여부 확인 없이 `insert(newSlots)` 실행. DB에 제약 조건이 없으므로 동일 `profile_id`, `slot_date`, 시간대 슬롯이 복수 삽입됨
- **심각도**: 🔴 높음 — 같은 주에 중복 슬롯 다수 생성, UI에서 중복 표시 및 혼란
- **수정 방향**: `handleFillDefaults`처럼 기존 슬롯 조회 후 `existingSet`으로 필터링 추가. 또는 최소한 복사 전 확인 바텀시트 표시

---

#### BUG-SCH-004: `fetchSlots` (직원 스케줄 페이지)의 `weekly_schedules` 범위 쿼리 오류

- **파일**: `src/app/schedule/page.tsx:100-106`
- **재현 조건**: 항상 발생 (논리 오류)
- **예상 동작**: 현재 조회 주의 `confirmed` 스케줄 슬롯 조회
- **실제 동작**:
  ```
  .gte("week_start", weekStartStr)   // 예: 2026-03-15
  .lte("week_start", weekEndStr)     // 예: 2026-03-21
  ```
  `weekly_schedules.week_start`는 항상 주의 시작일(일요일) 하나의 값. `weekEndStr`(토요일)과 비교하면 `week_start`가 일요일인 경우 ≤ 토요일이 되어 쿼리가 **빈 결과**를 반환한다. 예: 주 시작이 2026-03-15(일)이면 `week_start = '2026-03-15'`, weekEndStr = `'2026-03-21'`인데 `'2026-03-15' <= '2026-03-21'`은 참이므로 실제로는 동작함. 그러나 주 시작이 다른 요일인 경우(예: `startOfWeek`가 다른 로케일 설정을 받으면) 실패 가능. 더 심각한 문제: 단일 주차에 정확히 하나의 `weekly_schedule` 레코드만 있으므로 범위 쿼리 대신 `eq("week_start", weekStartStr)` 단일 조회면 충분한데, 불필요하게 복잡한 범위 쿼리를 사용해 향후 혼란 야기. **실제 버그**: `wsIds` 배열을 `in()` 조건으로 넘기는데, 단일 주에 `weekly_schedules`가 여러 개 존재하는 경우는 없으므로 정상 동작하지만, 범위 조건 자체가 `week_start`(일요일) ≤ `weekEndStr`(토요일)이므로 한 주에 하나만 존재할 때는 정상 동작하나, 향후 주 설정 변경 시 예상치 못한 결과 가능
- **심각도**: 🟠 중간 — 현재는 우연히 동작하지만 취약한 로직
- **수정 방향**: `.eq("week_start", weekStartStr).maybeSingle()` 단일 조회로 단순화

---

#### BUG-SCH-005: 대타 수락 후 original slot의 `status`가 `substituted`로 변경되지만, `handleSaveSlot` 겹침 검사에서 이를 `active` 상태로 필터링하지 않음

- **파일**: `src/app/admin/schedules/page.tsx:398-412`
- **재현 조건**: 직원 A의 슬롯이 대타 처리되어 `status='substituted'`가 된 상태에서 관리자가 동일 직원·날짜에 새 슬롯 추가 시도
- **예상 동작**: `substituted` 슬롯은 실질적으로 종료된 근무이므로 겹침 계산 대상에서 제외해야 함
- **실제 동작**: `fetchAll()`에서 `.neq("status", "cancelled")`만 필터링하므로 `substituted` 슬롯도 `slots` state에 포함됨. 겹침 검사 시 `s.status === "active"` 조건(`line 401`)이 있으나, 실제 state에 `substituted` 슬롯이 포함되어 있고 `sameDay` 필터에서 `s.status === "active"` 조건으로 제외하므로 이 부분은 정상. 단, `fetchAll`의 `neq("status", "cancelled")` 필터가 `substituted` 슬롯을 포함시켜 주간 그리드에도 표시됨 → 이미 대체된 슬롯이 관리자 UI에 여전히 색상 블록으로 표시되는 UI 버그
- **심각도**: 🟠 중간 — 관리자 UI에 `substituted` 슬롯이 `active`처럼 보임. `LOCATION_COLORS`로 색상 표시됨
- **수정 방향**: `fetchAll`의 슬롯 쿼리를 `.eq("status", "active")`로 변경하거나, 그리드 렌더링 시 `substituted` 상태를 별도 스타일(회색, 취소선 등)로 표시

---

### 🟠 잠재적 버그 (특정 조건에서 발생)

---

#### BUG-SCH-006: `getOrCreateWeeklySchedule` 동시 호출 시 race condition

- **파일**: `src/app/admin/schedules/page.tsx:370-386`
- **재현 조건**: 관리자가 네트워크 응답이 느릴 때 "저장하기"를 두 번 연속 클릭하거나, "이전 주 복사"와 "기본 패턴으로 채우기"를 거의 동시에 클릭
- **예상 동작**: `weekly_schedules.week_start`에 UNIQUE 제약이 있으므로 두 번째 INSERT는 실패하고 에러가 발생
- **실제 동작**: 두 요청이 동시에 `existing` 조회 → 둘 다 없음 확인 → 동시에 INSERT → 하나는 UNIQUE 제약 위반 에러 발생, 사용자에게 "주차 생성에 실패했어요" 토스트가 뜨고 슬롯 저장 중단
- **심각도**: 🟠 중간 — 사용자 혼란, 작업 재시도 필요
- **수정 방향**: `SlotBottomSheet`의 저장 버튼 `disabled={saving}` 상태는 있으나, 복사/기본 패턴 버튼은 별개 `loading` 상태이므로 동시 클릭 가능. 버튼 조작 시 전역 lock 또는 `upsert` 사용 고려

---

#### BUG-SCH-007: `handleCopyPrevWeek` — dayIndex가 -1인 경우 모든 슬롯이 weekDates[0](일요일)로 잘못 매핑

- **파일**: `src/app/admin/schedules/page.tsx:479-481`
- **재현 조건**: 이전 주 슬롯의 `slot_date`가 `getWeekDates(subWeeks(weekStart, 1))`에서 계산된 날짜와 정확히 일치하지 않는 경우. 예: 이전 주 슬롯이 다른 타임존 파싱 오류로 날짜가 1일 어긋난 경우, 또는 DB에 비정상 날짜가 있는 경우
- **예상 동작**: 일치하지 않는 슬롯은 복사 건너뜀 또는 경고
- **실제 동작**: `dayIndex === -1`이면 `weekDates[0]`(일요일)로 fallback 매핑됨 — 의도치 않은 일요일 슬롯 대량 생성
- **심각도**: 🟠 중간
- **수정 방향**: `dayIndex === -1` 시 해당 슬롯 건너뜀 (`continue`) 처리

---

#### BUG-SCH-008: 직원 스케줄 페이지에서 `selectedDay`가 현재 주 범위를 벗어날 수 있음

- **파일**: `src/app/schedule/page.tsx:70-71`
- **재현 조건**: 초기 렌더 시 `weekStart`는 현재 주 일요일, `selectedDay`는 `new Date()`(오늘). 주를 이전/다음으로 이동해도 `selectedDay`는 변경되지 않음
- **예상 동작**: 주 이동 시 `selectedDay`가 해당 주 내 날짜로 자동 이동하거나, 현재 선택 일자가 해당 주 외부임을 명확히 표시
- **실제 동작**: 다음 주로 이동 후에도 `selectedDay`가 지난 주 날짜를 가리킨다면, day strip에서 어떤 날도 선택(highlighted)되지 않은 상태로 보임. `selectedSlots`는 `selectedDay`의 `slot_date`를 기준으로 필터링하므로 주 이동 후에도 이전 날짜의 슬롯이 표시되거나 0개 표시
- **심각도**: 🟠 중간 — 사용자 혼란 (주를 이동했는데 이전 주 날짜 근무가 여전히 표시)
- **수정 방향**: `weekStart` 변경 시 `selectedDay`를 해당 주의 첫날 또는 오늘(당일이 해당 주 내면)로 자동 업데이트

---

#### BUG-SCH-009: `handleSubstituteRequest` — 중복 확인 후 INSERT 사이의 TOCTOU 취약점

- **파일**: `src/app/schedule/page.tsx:287-299`
- **재현 조건**: 같은 직원이 두 탭/세션에서 동시에 대타 요청 버튼 클릭
- **예상 동작**: 한 건만 생성
- **실제 동작**: 두 세션 모두 `existing`이 null임을 확인 후 동시에 INSERT. DB에 `UNIQUE(slot_id, requester_id)` 제약이 없으므로 중복 요청 2건이 `substitute_requests`에 삽입됨 → 관리자에게 동일 요청이 2개로 표시
- **심각도**: 🟠 중간
- **수정 방향**: DB에 `UNIQUE(slot_id, requester_id)` 제약 추가 (현재 마이그레이션에 미포함 확인됨). 클라이언트 중복 확인은 보조적 방어만 가능

---

#### BUG-SCH-010: 대타 수락 시 원본 슬롯 조회 실패해도 에러 처리 없음

- **파일**: `src/app/schedule/page.tsx:216-232`
- **재현 조건**: 네트워크 오류 또는 RLS 정책으로 원본 슬롯 조회 실패
- **예상 동작**: 에러 시 전체 트랜잭션 롤백 또는 사용자에게 실패 안내
- **실제 동작**: `origSlot`이 null이면 새 슬롯 INSERT를 건너뜀. 그러나 이미 `substitute_responses` INSERT, `substitute_requests` UPDATE, `schedule_slots` UPDATE(substituted)는 완료된 상태. 원본 슬롯 취득자에게 새 슬롯이 생성되지 않은 채 대타 확정 상태만 남음
- **심각도**: 🟠 중간 — 부분 성공 상태로 데이터 불일치
- **수정 방향**: Supabase Edge Function으로 원자적 트랜잭션 처리하거나, 최소한 `origSlot` 조회 실패 시 이전 단계를 보상 롤백(수동)

---

#### BUG-SCH-011: `handleFillDefaults`의 중복 검사가 `profile_id + slot_date` 조합만 확인 — 같은 날 다른 work_location 중복 허용

- **파일**: `src/app/admin/schedules/page.tsx:527-529`
- **재현 조건**: 직원이 하루에 두 곳(카페 + 공장) 근무 패턴을 `work_defaults`에 등록한 경우, "기본 패턴으로 채우기" 두 번 실행
- **예상 동작**: 이미 같은 `profile_id + slot_date`가 있으면 스킵
- **실제 동작**: `existingSet`의 key가 `${profile_id}_${slot_date}`이므로, 카페 슬롯이 이미 있어도 공장 슬롯은 새로 삽입됨 → 정상 동작. 그러나 정확히 동일한 `profile_id + slot_date + work_location` 조합의 기본 패턴이 두 개 있는 경우(불가능하지는 않음, DB UNIQUE 제약: `profile_id, day_of_week, work_location`이므로 동일 조합 1개만 존재) → 이 경우는 실제로 문제 없음. 단, 이 key 구조는 같은 날 두 번 "기본 패턴 채우기"를 실행하면 첫 번째 실행 시 카페 슬롯 + 공장 슬롯이 모두 생성되고, 두 번째 실행 시 `existingSet`에 key가 있어 스킵됨 → 정상. **실제 버그 없음**, 단 key 구조가 혼동될 수 있음
- **심각도**: 🟡 낮음 (실제 버그는 아니나 코드 의도가 불명확)

---

#### BUG-SCH-012: `handleConfirmSchedule` — 이미 confirmed 상태에서 재확정 허용(버튼이 비활성화되어야 하나 직접 API 호출 가능)

- **파일**: `src/app/admin/schedules/page.tsx:577-605`
- **재현 조건**: UI에서는 `weeklySchedule?.status === "confirmed"`일 때 버튼이 `disabled`이지만, 공격자가 직접 API 호출
- **예상 동작**: 이미 confirmed 스케줄 재확정 시도 차단
- **실제 동작**: RLS에서 어드민에게 `weekly_schedules` ALL 권한 부여. DB 레벨에서 `status` 변경 제약 없으므로 `draft → confirmed → draft` 등 역행 가능
- **심각도**: 🟠 중간 — 일반 직원은 불가 (admin only), 관리자 실수 방지 필요
- **수정 방향**: DB에 상태 전이 제약 트리거 추가 (`confirmed → draft` 방지) 또는 서버사이드 확인 로직

---

### 🟡 엣지 케이스 미처리

---

#### BUG-SCH-013: 직원이 0명일 때 `SlotBottomSheet`의 직원 select가 빈 상태로 열림

- **파일**: `src/app/admin/schedules/page.tsx:109-110`
- **재현 조건**: `profiles` 데이터가 없거나 API 오류로 빈 배열인 상태에서 슬롯 추가 버튼 클릭
- **예상 동작**: 직원 없음 안내 후 폼 열기 방지 또는 비활성화
- **실제 동작**: `profiles[0]?.id || ""`로 `profile_id`가 빈 문자열 초기화. 저장 시 `!form.profile_id` 유효성 검사에서 걸리지만, 빈 select로 폼이 열려 사용자에게 혼란
- **심각도**: 🟡 낮음

---

#### BUG-SCH-014: `weekDates` 날짜 레이블이 `DAY_LABELS[i % 7]`로 계산되어 요일 순서 가정

- **파일**: `src/app/admin/schedules/page.tsx:182-186`
- **재현 조건**: `startOfWeek`의 `weekStartsOn`이 0(일요일)이 아닌 경우
- **예상 동작**: 날짜와 요일 레이블이 일치
- **실제 동작**: `DAY_LABELS[i]`가 `["일","월",...,"토"]` 순서이고 `weekDates`가 일요일 시작이므로 현재는 정상. 그러나 `startOfWeek(new Date(), { weekStartsOn: 0 })`이 하드코딩되어 있어 국제화/설정 변경 시 불일치 발생 가능. **날짜 선택 드롭다운**에서 `DAY_LABELS[i % 7]`을 사용하는데, `i`가 `weekDates` 배열 인덱스(0~6)이므로 0=일요일로 고정 가정 — `date-fns`의 `getDay()`로 실제 요일 확인하는 것이 안전
- **심각도**: 🟡 낮음

---

#### BUG-SCH-015: 인원 카운팅 로직(daily 뷰)이 30분 단위 슬롯을 정수 시간으로만 카운트

- **파일**: `src/app/admin/schedules/page.tsx:773-786`
- **재현 조건**: `start_time`이 `09:30`인 슬롯이 있을 때 9시 인원 카운트 확인
- **예상 동작**: 9:30 시작 슬롯은 9시대에 포함되지 않음 (또는 포함됨 — 의도에 따라)
- **실제 동작**: `parseInt(s.start_time.split(":")[0])`로 시 단위만 추출. `09:30` 시작 슬롯은 `start=9`, 9시 블록에서 `h >= 9 && h < end`가 참 → 9시에 포함 카운트. 실제로는 9:00~9:30 구간에는 아직 근무 시작 전이므로 카운트 오류
- **심각도**: 🟡 낮음 — UI 인원 표시 부정확

---

#### BUG-SCH-016: `SlotBottomSheet`에서 `weekDates` prop이 weekly 탭 기준으로만 전달

- **파일**: `src/app/admin/schedules/page.tsx:910-921`
- **재현 조건**: daily 탭에서 시간라인 셀 클릭 시 슬롯 추가 바텀시트 열기
- **예상 동작**: `defaultDate`가 daily 탭의 현재 날짜로 설정됨
- **실제 동작**: `SlotBottomSheet`의 `weekDates` prop은 항상 `weekDates`(weekly 탭의 현재 주)로 전달. daily 탭에서 다른 주의 날짜를 보고 있을 때 슬롯 추가 시, 날짜 select dropdown의 옵션이 weekly 탭의 주 날짜들로만 표시됨. `defaultDate`는 daily 탭 날짜로 설정되지만, 해당 날짜가 `weekDates` 배열에 없으면 select에서 선택 불가 → 강제로 weekly 탭 날짜 중 하나가 선택됨
- **심각도**: 🟡 중간 — 의도한 날짜와 다른 날짜에 슬롯이 생성될 수 있음

---

#### BUG-SCH-017: 대타 요청 바텀시트에서 `requestReason` 상태가 다른 슬롯 요청 시 초기화되지 않음

- **파일**: `src/app/schedule/page.tsx:283-324`
- **재현 조건**: 슬롯 A에서 대타 요청 → 사유 입력 → 취소 → 슬롯 B에서 대타 요청
- **예상 동작**: 슬롯 B 요청 시 사유 필드가 비어있어야 함
- **실제 동작**: `requestReason` state가 `setRequestTarget(slot)` 호출 시 초기화되지 않으므로 이전에 입력한 사유가 남아있음. 취소 버튼의 `onClick`이 `setRequestTarget(null)`만 하고 `setRequestReason("")`는 하지 않음
- **심각도**: 🟡 낮음 — UX 문제

---

#### BUG-SCH-018: 날짜 파싱 `new Date(slot_date)` — 로컬 타임존 오프셋으로 1일 어긋남 가능

- **파일**: `src/app/admin/schedules/substitutes/page.tsx:275`, `src/app/schedule/page.tsx:551`
- **재현 조건**: 서버 또는 클라이언트의 시스템 타임존이 UTC+0 이하인 경우(현재 배포 환경은 KST이지만, Vercel 서버 렌더링 시 UTC 처리 가능)
- **예상 동작**: `"2026-03-15"`를 `new Date()` 파싱 시 정확히 2026-03-15로 처리
- **실제 동작**: `new Date("2026-03-15")`는 ISO 8601 date-only 형식으로 **UTC 자정**으로 파싱됨. KST(UTC+9) 환경에서는 `2026-03-15 09:00:00 KST`가 되어 정상. 그러나 UTC 환경에서는 `2026-03-15 00:00:00 UTC`로 파싱되므로 `format(new Date("2026-03-15"), "M월 d일")` 결과가 환경에 따라 달라짐. 현재 Vercel은 UTC 기준 배포이므로 실제로 영향 가능성 있음. `schedule/page.tsx:477`에서는 이미 `new Date(req.slot_date + "T00:00:00")`로 로컬 파싱 처리했지만, `substitutes/page.tsx:275`와 `schedule/page.tsx:551`에서는 `new Date(rejectTarget.slot_date)`와 `new Date(requestTarget.slot_date)` 직접 파싱 사용
- **심각도**: 🟡 중간 — 특정 타임존에서 날짜 표시가 하루 전으로 표시될 수 있음
- **수정 방향**: 모든 `date-only` 문자열 파싱 시 `new Date(str + "T00:00:00")` 또는 `date-fns/parseISO` 사용 통일

---

### 🟢 방어 코드 미흡

---

#### BUG-SCH-019: `timeToMinutes` — `split(":")`이 HH:MM:SS 포맷(DB time 타입) 처리 실패

- **파일**: `src/app/admin/schedules/page.tsx:63-66`
- **재현 조건**: DB의 `time` 타입이 `HH:MM:SS` 형식으로 반환될 때
- **예상 동작**: 정상 계산
- **실제 동작**: `"09:00:00".split(":")` → `["09","00","00"]`. `map(Number)`로 `h=9, m=0`만 사용하므로 실제로는 정상 동작. 단, `slot.start_time.slice(0, 5)`로 표시할 때 `"09:00"`로 올바르게 슬라이싱됨 → **현재 정상 동작**. 다만 명시적 파싱이 없어 형식 변경 시 취약

---

#### BUG-SCH-020: `work_defaults.day_of_week`가 0~6 외 값일 때 `weekDates[wd.day_of_week]`가 undefined

- **파일**: `src/app/admin/schedules/page.tsx:545`
- **재현 조건**: DB에 비정상 `day_of_week` 값(예: 7, -1)이 들어간 경우
- **예상 동작**: 유효성 오류 처리
- **실제 동작**: `weekDates[7]`은 `undefined` → `slot_date: undefined`로 INSERT → DB `slot_date NOT NULL` 제약 위반 에러 발생. 에러 처리(`toast.error`)는 있어 실제 DB 오염은 없음. 단 에러 메시지가 명확하지 않음
- **심각도**: 🟢 낮음

---

#### BUG-SCH-021: 관리자 권한 확인이 미들웨어에서 role 기반으로 이루어지지 않음

- **파일**: `src/middleware.ts`
- **재현 조건**: 일반 직원이 브라우저에서 `/admin/schedules` URL 직접 접근
- **예상 동작**: 어드민 전용 페이지 접근 차단
- **실제 동작**: 미들웨어는 인증 여부(`user` 존재)만 확인하고 `role` 확인 없음. 일반 직원이 `/admin/schedules` URL 직접 접근 가능. **단, RLS 정책으로 데이터 조회/수정은 차단됨** (어드민 bypass only). 그러나 UI가 노출되고, 데이터는 빈 배열로 표시되어 보안상 혼란
- **심각도**: 🟢 낮음 — RLS가 백업이지만 admin UI 노출은 UX 문제
- **수정 방향**: 미들웨어 또는 어드민 레이아웃(`src/app/admin/layout.tsx`)에서 role 확인 후 리다이렉트

---

#### BUG-SCH-022: `notes` 필드 최대 길이 제한 없음

- **파일**: `src/app/admin/schedules/page.tsx:259-266`
- **재현 조건**: 매우 긴 문자열 입력
- **예상 동작**: UI 또는 DB에서 길이 제한
- **실제 동작**: `<input type="text" />` — HTML `maxlength` 미설정. DB `notes text` 타입은 무제한. 매우 긴 문자열이 저장되어 주간 그리드 UI 레이아웃 깨짐 가능
- **심각도**: 🟢 낮음

---

## 테스트 시나리오 체크리스트

### 기본 기능
- [ ] 관리자: 슬롯 추가 → 주간 그리드에 즉시 반영되는가
- [ ] 관리자: 슬롯 수정 → 변경사항이 즉시 반영되는가
- [ ] 관리자: 슬롯 삭제(`cancelled`) → 그리드에서 즉시 사라지는가
- [ ] 직원: `confirmed` 주차만 스케줄 페이지에 표시되는가 (`draft` 주차는 숨겨지는가)

### 이전 주 복사
- [ ] 빈 주에서 이전 주 복사 → 정상 복사되는가
- [ ] 이미 슬롯이 있는 주에 이전 주 복사 → 중복 슬롯이 생성되는가 (BUG-SCH-003 확인)
- [ ] 이전 주 스케줄이 없을 때 복사 버튼 클릭 → "이전 주 스케줄이 없어요" 토스트 표시

### 기본 패턴 채우기
- [ ] `work_defaults`가 없는 상태에서 채우기 → 안내 메시지 표시
- [ ] 이미 모든 패턴이 반영된 상태에서 채우기 → "추가할 슬롯이 없어요" 토스트 표시
- [ ] `work_defaults.day_of_week` 0~6 정상 범위에서 올바른 날짜에 슬롯 생성

### 스케줄 확정
- [ ] `draft` 상태 주차 확정 → 직원들에게 알림 전송 확인
- [ ] 이미 `confirmed` 상태에서 확정 버튼 비활성화 확인
- [ ] 확정 후 직원 스케줄 페이지에서 슬롯 표시 확인

### 대타 요청 (직원)
- [ ] 슬롯에서 "대타" 버튼 클릭 → 요청 바텀시트 표시
- [ ] 동일 슬롯에 대타 요청 중복 제출 방지 확인
- [ ] 대타 요청 후 관리자 "대체근무 관리"에 pending 배지 표시 확인

### 대타 승인/반려 (관리자)
- [ ] 승인 시 eligible 직원 자동 추천 로직 확인 (work_locations 기반)
- [ ] 승인 후 eligible 직원 스케줄 페이지에 대타 요청 섹션 표시 확인
- [ ] 반려 시 요청자에게 알림 전송 확인

### 대타 수락 (직원 — 동시성 테스트)
- [ ] **두 명이 동시에 수락하기 클릭** → 한 명만 대타 확정되는가 (BUG-SCH-001 확인)
- [ ] 수락 후 원본 슬롯 `status='substituted'` 확인
- [ ] 수락자에게 새 슬롯이 생성되는가

### 날짜/시간 엣지 케이스
- [ ] 주 이동(이전/다음) 후 선택 날짜 자동 업데이트 여부 (BUG-SCH-008 확인)
- [ ] daily 탭에서 weekly 탭과 다른 주 날짜 보기 → 슬롯 추가 시 올바른 날짜 저장 (BUG-SCH-016 확인)
- [ ] `slot_date` 날짜 표시 — 다른 타임존 환경에서 정확성 (BUG-SCH-018 확인)

### 권한 테스트
- [ ] 일반 직원이 `/admin/schedules` 직접 URL 접근 — 어드민 UI 노출 여부 (BUG-SCH-021 확인)
- [ ] 일반 직원이 Supabase API를 통해 `weekly_schedules` UPDATE 시도 — RLS 차단 확인
- [ ] 일반 직원이 타인의 슬롯 대타 요청 API 직접 호출 — RLS 차단 확인

---

## 종합 의견

### 가장 시급한 수정 항목 (우선순위 순)

1. **BUG-SCH-001** (대타 동시 수락 race condition) — 데이터 무결성 파괴 가능, 급여 계산 직결. **즉시 수정 필요**.
2. **BUG-SCH-003** (이전 주 복사 중복 방지 미흡) — 현재도 매 주마다 발생 가능한 실용적 버그.
3. **BUG-SCH-002** (겹침 검사 누락 — 대타 생성 슬롯) — 중복 배정 발생 가능.
4. **BUG-SCH-009** (`substitute_requests` UNIQUE 제약 미설정) — DB 마이그레이션 누락.
5. **BUG-SCH-016** (daily 탭 슬롯 추가 날짜 오류) — 관리자 UI 혼란.

### 설계상 주의 사항

- **대타 수락 플로우 전체가 클라이언트 측 멀티스텝 처리**로 구성되어 원자성 없음. 네트워크 오류 시 부분 성공 상태 가능. Supabase Edge Function으로 이전하거나 최소한 각 단계 실패 시 보상 처리 로직 필요.
- **RLS 정책은 적절히 구성**되어 있어 일반 직원의 타인 데이터 조작은 차단됨. 단, 관리자 권한 UI 라우팅 제어 미흡.
- **타임존 처리**: `slot_date`가 `date` 타입으로 문자열 저장되어 KST/UTC 혼동 이슈가 최소화되어 있으나, `new Date(date_string)` 직접 파싱 시 환경에 따라 하루 어긋남 발생 가능. `new Date(str + "T00:00:00")` 패턴 통일 권장.
