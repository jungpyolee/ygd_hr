# [QA] 스케쥴 기능 — 백엔드 검토 보고서

| 항목 | 내용 |
|------|------|
| 담당 | 백엔드 전문가 |
| 검토일 | 2026-03-18 |
| 브랜치 | dev |
| 상태 | ✅ 완료 |

## 요약

| 심각도 | 건수 |
|--------|------|
| 🔴 Critical | 4 |
| 🟠 Major | 5 |
| 🟡 Minor | 5 |
| **합계** | **14** |

**검토 파일**
- `src/app/admin/schedules/page.tsx`
- `src/app/admin/schedules/substitutes/page.tsx`
- `src/app/schedule/page.tsx`
- `docs/migrations/007_epic_d_schedule_tables.sql`
- `src/middleware.ts`
- `src/app/admin/layout.tsx`

---

## 이슈 목록

### 🔴 Critical

#### CRIT-01. 대타 수락 — 원자성 없는 다중 DB 호출
- **파일**: `src/app/schedule/page.tsx:194-253`
- **현상**: 4단계 호출(responses INSERT → requests UPDATE → slots UPDATE → slots INSERT)이 각각 독립 쿼리로 실행됨. 중간 실패 시 롤백 없음.
- **위험도**: 원본 슬롯은 `substituted` 처리됐는데 대타자 슬롯이 생성 안 된 고아 상태 발생 가능.
- **권장 수정**: DB 함수(`accept_substitute`) + 트랜잭션으로 이전 후 `rpc()` 단일 호출.

#### CRIT-02. 대타 수락 — 다중 사용자 동시 수락 Race Condition
- **파일**: `src/app/schedule/page.tsx:194-253`
- **현상**: 두 eligible 직원이 동시에 수락하면 `substitute_requests.status='filled'` + 새 슬롯 INSERT가 중복 실행됨. 수락 전 `status='approved'` 재확인 로직 없음.
- **위험도**: 동일 슬롯에 복수 대타자 배정 가능.
- **권장 수정**: DB 함수에서 `UPDATE ... WHERE status='approved'` 후 영향 행 수 0이면 예외 발생 (낙관적 잠금).

#### CRIT-03. 어드민 뮤테이션 — 서버사이드 권한 검증 없음
- **파일**: `src/app/admin/schedules/page.tsx`, `src/app/admin/schedules/substitutes/page.tsx`
- **현상**: 스케줄 확정, 슬롯 CRUD, 대타 승인/반려가 클라이언트 컴포넌트에서 직접 Supabase를 호출함. Admin Layout의 권한 체크는 클라이언트 UI 가드일 뿐.
- **위험도**: RLS가 DB 레벨에서 막고 있어 현재는 차단되나, defense-in-depth 없음.
- **권장 수정**: Server Action 또는 Route Handler로 이전, `createServerClient`로 세션/role 검증.

#### CRIT-04. substitute_requests — 직원 UPDATE RLS 정책 없음 (기능 파괴)
- **파일**: `src/app/schedule/page.tsx:206-211` / `docs/migrations/007_epic_d_schedule_tables.sql:122-127`
- **현상**: `substitute_requests`에 일반 직원용 UPDATE 정책이 없음. 대타 수락 시 직원이 `status='filled'`로 UPDATE 시도하면 RLS에 의해 차단됨.
- **위험도**: 대타 수락 기능 전체가 현재 작동 불가 상태.
- **권장 수정**: `SECURITY DEFINER` DB 함수로 이전하거나 eligible 직원의 approved 건 UPDATE 전용 RLS 정책 추가.

---

### 🟠 Major

#### MAJOR-01. fetchIncomingRequests — 전체 approved 요청 클라이언트 다운로드 후 필터링
- **파일**: `src/app/schedule/page.tsx:127-145`
- **현상**: `status='approved'` 전체를 내려받고 클라이언트에서 `eligible_profile_ids.includes(profileId)` 필터. RLS에 이미 `auth.uid() = ANY(eligible_profile_ids)` 조건이 있으므로 서버에서 필터됨에도 불필요한 데이터 전송 + 타 직원 정보 노출 위험.
- **권장 수정**: DB 쿼리 레벨 필터 추가 및 클라이언트 중복 필터 제거.

#### MAJOR-02. handleCopyPrevWeek — 기존 슬롯 중복 확인 없이 일괄 INSERT
- **파일**: `src/app/admin/schedules/page.tsx:456-499`
- **현상**: 이전 주 복사 전 현재 주 기존 슬롯을 확인하지 않아 중복 슬롯 생성 가능. DB에 `(profile_id, slot_date)` 유니크 제약 없어 막을 수단 없음.
- **권장 수정**: 복사 전 현재 주 슬롯 존재 여부 확인 또는 DB 유니크 제약 추가.

#### MAJOR-03. handleConfirmSchedule — 재확정 시 notifications 중복 발송
- **파일**: `src/app/admin/schedules/page.tsx:577-605`
- **현상**: `confirmed` 이중 확정 방지를 클라이언트 상태에만 의존. UPDATE 쿼리에 `status='draft'` 조건 없어 직접 API 호출 시 중복 알림 발송 가능.
- **권장 수정**: UPDATE 쿼리에 `.eq('status', 'draft')` 조건 추가.

#### MAJOR-04. schedule_slots — DB 레벨 시간 겹침 제약 없음
- **현상**: 클라이언트 JavaScript에서만 겹침 검사 수행. Race Condition 또는 API 직접 호출 시 겹치는 슬롯 INSERT 가능.
- **권장 수정**: DB exclusion constraint 또는 트리거로 겹침 방지.

#### MAJOR-05. handleFillDefaults — 중복 검사 키가 (profile_id, slot_date)만 사용
- **파일**: `src/app/admin/schedules/page.tsx:527-529`
- **현상**: 같은 직원이 같은 날 다른 장소 근무 패턴을 work_defaults에 등록한 경우, 두 번째 패턴이 중복으로 간주되어 건너뜀.
- **권장 수정**: 중복 키를 `(profile_id, slot_date, location)` 등으로 세분화.

---

### 🟡 Minor

#### MINOR-01. 직원 스케줄 조회 쿼리 2회 실행
- `weekly_schedules` → `schedule_slots` 순차 조회. 1회 JOIN 쿼리로 줄일 수 있음.

#### MINOR-02. schedule_slots updated_at 트리거 미검증
- 트리거는 존재하나 테스트 코드 없음.

#### MINOR-03. Admin Layout 클라이언트 권한 체크 Flash
- 짧은 순간 admin 컨텐츠가 노출되는 flash 가능성.

#### MINOR-04. 날짜 UTC 파싱 버그
- **파일**: `src/app/admin/schedules/substitutes/page.tsx:275`
- `new Date("2026-03-18")`은 UTC 자정 기준이라 KST에서 전날로 표시됨.
- `schedule/page.tsx:477`에서는 이미 `T00:00:00` 패턴 적용됨 — 동일 패턴 적용 필요.

#### MINOR-05. notifications INSERT 정책이 public(비인증 포함)
- `TO authenticated`로 제한 권장.

---

## 종합 의견

**즉시 수정 우선순위**:
1. **CRIT-04** — 대타 수락 RLS 누락으로 기능 자체가 작동 불가
2. **CRIT-01/02** — 대타 수락 원자성 + Race Condition (데이터 무결성)
3. **MAJOR-02/04** — 중복 슬롯 생성 가능 (데이터 오염)

CRIT-01, CRIT-02, CRIT-04는 모두 대타 수락 흐름 하나에 집중되어 있어, Supabase RPC 함수 1개로 일괄 해결 가능합니다.
