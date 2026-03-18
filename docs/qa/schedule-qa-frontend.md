# [QA] 스케쥴 기능 — 프론트엔드 검토 보고서

| 항목 | 내용 |
|------|------|
| 담당 | 프론트엔드 전문가 |
| 검토일 | 2026-03-18 |
| 브랜치 | dev |
| 상태 | ✅ 완료 |

## 요약

| 심각도 | 건수 |
|--------|------|
| 🔴 Critical | 2 |
| 🟠 Major | 4 |
| 🟡 Minor | 4 |
| 🟢 개선 제안 | 3 |
| **합계** | **13** |

**검토 파일**
- `src/app/admin/schedules/page.tsx`
- `src/app/admin/schedules/substitutes/page.tsx`
- `src/app/schedule/page.tsx`

---

## 이슈 목록

### 🔴 Critical

#### C-01. 대타 수락(handleAcceptSubstitute) — 원자성 없는 다중 DB 호출
- **파일**: `src/app/schedule/page.tsx:206-233`
- **현상**: `substitute_requests` 업데이트 → `schedule_slots` 상태변경 → 신규 슬롯 INSERT를 순차 개별 호출하면서 중간 실패 시 오류를 검사하지 않음.
- **문제**: 요청은 `filled`인데 수락자 슬롯이 생성 안 되는 데이터 불일치 발생 가능.
- **권장 수정**: Supabase RPC(PostgreSQL 함수)로 `accept_substitute(request_id, acceptor_id)` 원자 처리 필요.

#### C-02. supabase 클라이언트를 컴포넌트 렌더 본문에서 매번 생성 (3개 파일 모두)
- **파일**: `src/app/admin/schedules/page.tsx:297`, `src/app/admin/schedules/substitutes/page.tsx:53`, `src/app/schedule/page.tsx:67`
- **현상**: `createClient()`가 매 렌더마다 새 인스턴스 생성.
- **문제**: React Strict Mode 이중 렌더 + 향후 실시간 구독 도입 시 중복 연결 문제. `useCallback` 의존성 배열에서 `supabase` 누락 상태.
- **권장 수정**: `useMemo(() => createClient(), [])` 또는 모듈 레벨 싱글턴으로 관리.

---

### 🟠 Major

#### M-01. any 타입 남용 — Supabase join 결과 매핑
- **파일**: `src/app/admin/schedules/substitutes/page.tsx:94`, `src/app/schedule/page.tsx:143, 152, 159, 163`
- **현상**: join 컬럼에 `any` 타입 사용.
- **문제**: 컬럼명 오타·null 접근 오류를 컴파일 타임에 잡지 못함.
- **권장 수정**: Supabase CLI 타입 생성 또는 `RawSubstituteRequestRow` 인터페이스 정의.

#### M-02. 겹침 검사가 로컬 상태(slots)만 참조
- **파일**: `src/app/admin/schedules/page.tsx:398-412`
- **현상**: 일간 뷰에서 다른 주 슬롯 편집 시 `slots`에 없으므로 겹침 검사 무효화.
- **권장 수정**: DB 레벨 exclusion constraint 또는 저장 직전 별도 쿼리.

#### M-03. renderWeeklyGrid / renderDailyView — 컴포넌트 내부 일반 함수
- **파일**: `src/app/admin/schedules/page.tsx:608, 679`
- **현상**: 매 렌더마다 재생성. 주간 그리드는 `profiles × 7` 이중 순회 + filter 반복.
- **권장 수정**: 별도 컴포넌트(`WeeklyGrid`, `DailyTimeline`)로 분리.

#### M-04. fetchAll — profiles를 슬롯 변경마다 불필요하게 재로드
- **파일**: `src/app/admin/schedules/page.tsx:317-340`
- **현상**: 슬롯 저장/삭제 등 단순 변경 후에도 profiles 쿼리 재실행.
- **권장 수정**: profiles는 마운트 1회만, 스케줄/슬롯은 별도 함수로 분리.

---

### 🟡 Minor

#### N-01. SlotBottomSheet useState 초기값이 props 변화를 반영 안 함
- `key` prop 명시로 강제 리마운트 권장.

#### N-02. 일간 뷰 인원 집계 분(minute) 무시
- **파일**: `src/app/admin/schedules/page.tsx:774-777`
- **현상**: `parseInt`로 정수 시 단위만 비교. `09:30` 시작 직원이 9시 열에 미집계.
- **권장 수정**: 기존 `timeToMinutes` 함수 활용해 분 단위 비교.

#### N-03. 전체 approved 요청 로드 후 클라이언트 필터링 비효율
- **파일**: `src/app/schedule/page.tsx:131-138`
- DB `.contains("eligible_profile_ids", [profileId])` 조건 추가로 전송량 절감 가능. RLS 정책이 이미 필터링하므로 클라이언트 중복 필터 제거 가능.

#### N-04. 어드민 스케줄 페이지 로딩 — Skeleton 없이 스피너만 사용
- CLAUDE.md UI/UX 규칙 위반 (직원 schedule 페이지는 Skeleton 적용됨).

---

### 🟢 개선 제안

#### I-01. 상수 3벌 중복 정의
- `LOCATION_COLORS`, `LOCATION_LABELS`, `LOCATION_BG`, `CAFE_POSITION_LABELS`가 3개 파일에 각각 존재.
- **권장**: `src/lib/constants/schedule.ts`로 추출.

#### I-02. 대타 수락 알림 admin 항목에 profile_id 없음
- **파일**: `src/app/schedule/page.tsx:247-252`
- DB의 `notifications.profile_id` NOT NULL 여부 확인 필요. NULL이면 INSERT 오류.

#### I-03. 주간 그리드 요일 레이블이 배열 인덱스에 의존
- `weekStartsOn` 변경 시 레이블 불일치.
- **권장**: `getDay()` 또는 `format(day, "EEE", { locale: ko })`로 실제 요일 참조.

---

## 종합 의견

가장 우선순위가 높은 작업:
1. **C-01** — 대타 수락 Supabase RPC 전환 (데이터 정합성, 백엔드 CRIT-01과 연계)
2. **C-02** — supabase 클라이언트 싱글턴화 (안정성)
3. **M-01** — any 타입 제거 (타입 안전성)
4. **N-04** — Skeleton UI 적용 (UI 규칙 준수)

상수 중복(I-01)은 낮은 위험도지만 3개 파일 수정 시 누락 가능성이 높으므로 조기 정리 권장.
