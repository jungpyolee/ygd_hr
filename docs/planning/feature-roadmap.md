# 신규 기능 기획서

> **출처**: 연경이-정표 기획 대화 (2026-03-16 오전)
> **작성일**: 2026-03-16
> **참여자**: 이정표(개발), 연경이(운영)

---

## 기획 요약

| 에픽 | 기능명           | 우선순위  | 복잡도 |
| ---- | ---------------- | --------- | ------ |
| A    | 레시피 관리      | ⭐️ 높음   | 중     |
| B    | 급여 자동 계산   | ⭐️ 높음   | 높음   |
| C    | 서류 관리 간소화 | ⭐️⭐️ 즉시 | 낮음   |
| D    | 스케줄 관리      | 중간      | 높음   |
| E    | 출근 거리 표시   | 낮음      | 낮음   |

---

## Epic A — 레시피 관리

### 배경

신메뉴가 나올 때마다 연경이가 직접 하나하나 알려줘야 함.
스타벅스처럼 레시피를 앱에서 바로 조회할 수 있으면 교육 비용 절감 가능.

### 핵심 결정사항

- **MVP 범위**: 음료 레시피만 먼저 (Supabase 무료 플랜 용량 제한 고려)
- 다과: 연경이+지율이가 직접 담당 → 앱 불필요
- 공장: 적어둔 레시피가 이미 있음 → 굳이 앱 불필요 (추후 고려)

### A-1. 직원 레시피 열람

**접근 권한 구조:**

| 역할           | 볼 수 있는 레시피    |
| -------------- | -------------------- |
| 매장 직원      | 매장 레시피만 (음료) |
| 공장 직원      | 공장 레시피만        |
| 정규직         | 전체                 |
| 관리자(연경이) | 전체                 |

> 공장 레시피는 영업 비밀 — 매장 직원은 열람 불가

**카테고리 구조 (예시):**

```
매장
├── 음료
│   ├── 금귤 캐모마일
│   ├── 녹차 라떼
│   └── ...
└── 다과 (추후)
    ├── 벚꽃오미자 양갱
    ├── 건반병
    └── ...

공장 (추후)
└── ...
```

**레시피 컨텐츠 형태:**

- 텍스트 레시피 (기본)
- 영상 레시피 (선택, 스타벅스 레퍼런스)
- 이미지 첨부 가능

### A-2. 어드민 레시피 관리

관리자가 앱에서 직접 레시피를 추가/수정/삭제할 수 있어야 함.

**어드민 기능:**

- 카테고리 추가/수정/삭제 (매장/공장 구분)
- 메뉴 아이템 추가/수정/삭제
- 레시피 본문 에디터 (텍스트 + 이미지/영상 첨부)
- 접근 권한(매장/공장/전체) 설정

### A-3. DB 설계 (신규 테이블)

```sql
-- 카테고리 (음료, 다과, 공장 등)
recipes_categories (
  id uuid PK,
  name text,           -- "음료", "다과"
  store_type text,     -- 'store' | 'factory' | 'all'
  display_order int,
  created_at timestamptz
)

-- 메뉴 아이템 (금귤 캐모마일 등)
recipes_items (
  id uuid PK,
  category_id uuid FK,
  name text,           -- "금귤 캐모마일"
  description text,    -- 한 줄 설명
  thumbnail_url text,  -- 썸네일 이미지
  display_order int,
  created_at timestamptz
)

-- 레시피 상세 (단계별 설명)
recipes_steps (
  id uuid PK,
  item_id uuid FK,
  step_no int,
  content text,        -- 단계 설명
  image_url text,      -- 단계 이미지 (선택)
  video_url text,      -- 단계 영상 (선택)
  created_at timestamptz
)
```

**RLS**: store_type 기준으로 profiles.department 또는 별도 access_level 컬럼으로 제어

---

## Epic B — 급여 자동 계산

### 배경

현재 연경이가 직접 근무 시간을 계산해서 급여를 산정 중.
시급 × 근무시간 자동 계산 + 공제 유형별 세금 계산이 필요.

### 핵심 결정사항

- **급여 계산 기준: 스케줄(예정 시간) 기반** — 실제 출퇴근 시간이 아님
  - 이유: 9:40에 와도 10시부터 시작으로 간주. 7:30에 손님없어 일찍 끝나도 8시까지로 간주.
  - 근태 데이터 = 스케줄 준수 여부 확인용 (급여 산정 X)
- **어드민(연경이)만 급여 정보 열람 가능** — 직원 화면에서 완전 비공개

### B-1. 직원 정보 추가 항목

`profiles` 테이블에 추가:

| 컬럼             | 타입    | 설명                                              |
| ---------------- | ------- | ------------------------------------------------- |
| `hourly_wage`    | integer | 시급 (원) , ps.알바생인경우만 시급이 있음(선택값) |
| `insurance_type` | text    | `'national'` (2대보험) / `'3.3'` (3.3% 원천징수)  |

### B-2. 급여 계산 화면 (어드민 전용)

**월간 급여 정산 화면:**

- 직원별 해당 월 스케줄 합산 시간 표시
- 시급 × 합산 시간 = 세전 급여 자동 계산
- 보험 유형에 따른 공제액 자동 계산

**공제 계산 로직:**

```
[2대보험 (고용보험, 산재보험)]
공제율: 고용보험 0.9%
실수령액 = 세전급여 × (1 - 0.009)

[3.3% 원천징수]
공제율: 3.3% (소득세 3% + 지방소득세 0.3%)
실수령액 = 세전급여 × (1 - 0.033)
```

### B-3. 계좌번호 복사 버튼

급여 이체 시 편의를 위해 계좌번호 옆에 원클릭 복사 버튼 추가.

```
[국민은행]  123-456-789  [복사]
```

---

## Epic C — 서류 관리 간소화 ← 즉시 처리 가능

### 현재 → 변경

| 서류               | 현재                 | 변경                              | 이유                  |
| ------------------ | -------------------- | --------------------------------- | --------------------- |
| 등본(주민등록등본) | 파일 업로드          | **제거**                          | 실제로 쓸 일 없음     |
| 통장사본           | 파일 업로드          | **제거** (계좌번호 텍스트만 유지) | 사본 자체는 필요 없음 |
| 보건증             | 파일 업로드 + 만료일 | **유지**                          | 1년 갱신 관리 필요    |
| 근로계약서         | 파일 업로드          | **유지**                          | 관리자 기록용         |

### 영향 받는 컴포넌트

- `src/app/admin/employees/page.tsx` — 서류 업로드 섹션에서 `resident_register_url`, `bank_account_copy_url` 제거
- `src/components/MyInfoModal.tsx` — 직원 서류 업로드에서 `resident_register_url` 제거
- DB: `profiles` 테이블의 `resident_register_url` 컬럼은 유지 (기존 데이터 보존), UI에서만 숨김

---

## Epic D — 스케줄 관리

### 배경

현재는 구두/문자로 스케줄을 공유 중.
앱에서 근무 예정일을 캘린더로 확인하고, 대타 요청도 앱 내에서 처리.

### 핵심 결정사항

| 항목        | 결정                                 |
| ----------- | ------------------------------------ |
| 스케줄 주기 | 주단위 반복 (매주 수목금 같은 패턴)  |
| 변경 단위   | 특정 날짜 스케줄 삭제 후 대타가 추가 |
| 대타 알림   | 전원 푸시 알림 발송                  |
| 달력 분리   | 매장용 / 공장용 분리 표시            |
| 정규직      | 전체 스케줄 열람 가능                |
| 일반 직원   | 자기 소속(매장/공장)만               |
| 근태 캘린더 | 어드민 전용 유지 (현재와 동일)       |

### D-1. 스케줄 캘린더 (직원용)

- 홈 또는 별도 탭에 주간/월간 캘린더
- 본인 근무 예정일 하이라이트
- 다른 직원의 스케줄도 소속 내에서 확인 가능 (이름 표시)
- 대타 요청 버튼 → 전체 알림 발송 → 지원자 수락

### D-2. 스케줄 등록/관리 (어드민)

- 직원별 반복 스케줄 설정 (요일 + 시간)
- 특정 날짜 스케줄 추가/삭제
- 대타 요청 승인/거부

### D-3. DB 설계 (신규 테이블)

```sql
-- 반복 스케줄 템플릿 (주단위)
schedules_recurring (
  id uuid PK,
  profile_id uuid FK,
  day_of_week int[],   -- [1,3,5] = 월수금
  start_time text,     -- '10:00'
  end_time text,       -- '18:00'
  store_id uuid FK,
  is_active boolean,
  created_at timestamptz
)

-- 실제 날짜별 스케줄 인스턴스
schedules (
  id uuid PK,
  profile_id uuid FK,
  store_id uuid FK,
  date date,
  start_time text,
  end_time text,
  type text,           -- 'regular' | 'substitute'
  status text,         -- 'scheduled' | 'requested' | 'filled'
  created_at timestamptz
)

-- 대타 요청
substitute_requests (
  id uuid PK,
  schedule_id uuid FK,
  requester_id uuid FK,
  responder_id uuid FK,
  status text,         -- 'open' | 'accepted' | 'cancelled'
  created_at timestamptz
)
```

---

## Epic E — 출근 거리 어드민 표시

### 배경

현재 `attendance_logs.distance_m` 컬럼에 저장되지만 UI에서 표시 안 함.
어드민 화면에서 몇 미터 거리에서 찍었는지 확인하고 싶음 (관리자만).

### 구현

- `admin/attendance/page.tsx` 상세 카드에 거리 정보 추가
- 예: `📍 매장에서 42m`
- 어드민 전용 표시 (직원 화면 노출 X)

---

## Bug F — attendance_logs store_id 무결성

### 배경

A 매장에서 출근 후 B 매장 근처에서 퇴근 버튼을 누르면 `store_id`가 퇴근 위치 기준으로 덮어씌워짐 → 출근/퇴근 매장이 다른 상황을 구분 불가.

### 스키마 변경

```sql
-- attendance_logs 컬럼 분리
ALTER TABLE attendance_logs
  ADD COLUMN check_in_store_id  uuid REFERENCES stores(id),
  ADD COLUMN check_out_store_id uuid REFERENCES stores(id); -- nullable (원격/출장 퇴근 시 null 가능)

-- 기존 데이터 마이그레이션 (store_id를 양쪽에 동일하게 복사)
UPDATE attendance_logs
SET check_in_store_id  = store_id,
    check_out_store_id = store_id
WHERE check_in_store_id IS NULL;

-- 기존 store_id 컬럼은 마이그레이션 완료 후 제거 예정
-- ALTER TABLE attendance_logs DROP COLUMN store_id;
```

### 영향 범위

- `AttendanceCard.tsx` — insert 시 `check_in_store_id` / `check_out_store_id` 구분 저장
- `admin/attendance/page.tsx` — 출근/퇴근 매장 각각 표시
- RLS 정책 확인 필요

---

## Epic F — 원격퇴근

### 배경

퇴근 체크를 깜빡한 경우 매장에서 멀어지면 현재 로직상 퇴근 불가.
반경 100m 밖에서도 퇴근 처리할 수 있는 예외 경로 필요.

### 플로우

```
퇴근 버튼 탭
  └── 현재 위치 확인
        ├── 반경 100m 이내 → 일반 퇴근 (기존 플로우)
        └── 반경 100m 초과 → 원격퇴근 폼 진입
              ├── 현재 위치 좌표 기록 (어드민 확인용)
              ├── 사유 텍스트 입력 (필수)
              └── 제출 → 퇴근 처리 (check_out_store_id = null)
```

### DB 변경

```sql
-- attendance_logs에 추가
ALTER TABLE attendance_logs
  ADD COLUMN attendance_type text DEFAULT 'regular',
  -- 'regular' | 'remote_out' | 'business_trip_in' | 'business_trip_out'
  ADD COLUMN reason text; -- 원격퇴근/출장 사유
```

### UI

- 반경 초과 퇴근 시도 시: 토스 스타일 바텀시트 "지금 매장에서 멀리 계신가요?"
- 사유 입력 textarea (placeholder: "퇴근을 늦게 누른 이유를 적어주세요")
- 어드민 화면에서 원격퇴근 건은 별도 뱃지 표시 (`📍 원격퇴근`)
- 퇴근 위치 좌표는 `user_lat` / `user_lng` 기존 컬럼 활용

### 알림

```
어드민 푸시 알림:
  title: "📍 원격퇴근 알림"
  content: "{이름}님이 {매장명}에서 {거리}m 거리에서 원격퇴근했어요"
  type: "attendance_remote_out"
```

---

## Epic G — 출장출근 / 출장퇴근

### 배경

출장 직원은 매장 반경 밖에서 출근 체크가 필요.
현재는 출근 자체가 불가 → 출장 예외 처리 경로 추가.

### 출장출근 플로우

```
출근 버튼 탭
  └── 현재 위치 확인
        ├── 반경 100m 이내 → 일반 출근 (기존 플로우)
        └── 반경 100m 초과 → 토스 스타일 ConfirmDialog
              "근무지에서 멀리 계신가요?"
              "출장 중이신 경우 출장출근으로 처리할 수 있어요"
              [출장출근] [취소]
                └── 확인 → check_in_store_id = null, attendance_type = 'business_trip_in'
```

### 출장퇴근 플로우

```
퇴근 버튼 탭 (출장출근 상태)
  └── 원격퇴근 폼 진입 (동일 플로우)
        └── 사유 자동 입력: "출장"
        └── attendance_type = 'business_trip_out'
```

### attendance_type 값 정의

| 값                  | 설명             |
| ------------------- | ---------------- |
| `regular`           | 일반 출퇴근      |
| `remote_out`        | 원격퇴근         |
| `business_trip_in`  | 출장출근         |
| `business_trip_out` | 출장퇴근         |

### 알림

```
출장출근:
  title: "✈️ 출장출근 알림"
  content: "{이름}님이 출장출근했어요"
  type: "attendance_business_trip_in"

출장퇴근:
  title: "✈️ 출장퇴근 알림"
  content: "{이름}님이 출장퇴근했어요"
  type: "attendance_business_trip_out"
```

### 영향 범위

- `AttendanceCard.tsx` — 반경 초과 분기 로직 추가, 원격퇴근/출장 폼 컴포넌트
- `src/lib/notifications.ts` — 신규 notification type 4종 추가
- `admin/attendance/page.tsx` — attendance_type 뱃지 표시
- `types/` — attendance_type union type 추가

---

## 개발 우선순위 & 로드맵

```
Phase 0 (버그 수정) ━━━━━━━━━━━━━━━━━━━━━━
  Bug F. store_id 무결성
     - DB 스키마 변경 (check_in_store_id / check_out_store_id)
     - 기존 데이터 마이그레이션
     - AttendanceCard 저장 로직 수정

Phase 1 (즉시) ━━━━━━━━━━━━━━━━━━━━━━
  C. 서류 관리 간소화
     - 등본 UI 제거, 통장사본 UI 제거
     - 계좌번호 복사 버튼 추가

  F. 원격퇴근
     - 반경 초과 퇴근 플로우 (사유 입력 폼)
     - 알림 처리 (admin 원격퇴근 알림)
     - 어드민 화면 뱃지 표시

  G. 출장출근/출장퇴근
     - 반경 초과 출근 ConfirmDialog
     - 출장퇴근 플로우 (사유 자동입력)
     - 알림 처리 (admin 출장 알림)

Phase 2 (단기) ━━━━━━━━━━━━━━━━━━━━━━
  A. 레시피 관리 MVP (음료만)
     - DB 테이블 3개 생성
     - 어드민: 카테고리/메뉴/레시피 CRUD
     - 직원: 레시피 열람 (권한별)

  E. 출근 거리 표시 (어드민)
     - admin/attendance 카드에 distance_m 표시

Phase 3 (중기) ━━━━━━━━━━━━━━━━━━━━━━
  B. 급여 자동 계산
     - profiles에 hourly_wage, insurance_type 추가
     - 어드민 급여 정산 화면
     - 계좌번호 복사 버튼

  D. 스케줄 관리
     - DB 테이블 3개 생성
     - 어드민: 스케줄 등록/관리
     - 직원: 캘린더 열람 + 대타 요청
```

---

## 미결 질문 사항

| #   | 질문                                                                                                       | 관련 에픽 |
| --- | ---------------------------------------------------------------------------------------------------------- | --------- |
| 1   | 레시피 영상은 Supabase Storage vs YouTube 링크 중 어느 쪽?                                                 | A         |
| 2   | profiles에 `department` 컬럼('매장'/'공장')으로 레시피 권한 제어할지, 별도 `access_level` 추가할지?        | A         |
| 3   | 급여 정산 화면은 월별 확인만인지, 아니면 이체 내역 기록도 남길지?                                          | B         |
| 4   | 스케줄 대타 요청 알림 → 지원 가능 여부를 앱 내에서 해결? 아니면 카톡 연동?                                 | D         |
| 5   | 직원 화면에서 `이번 주 근무` 섹션(WeeklyWorkStats)의 총 근무시간 표시를 스케줄 기반으로 변경? 아니면 제거? | B+D       |

## 미결 질문 답변

| #   | 질문                                                                                         | 관련 에픽 |
| --- | -------------------------------------------------------------------------------------------- | --------- |
| 1   | Supabase Storage 사용                                                                        |
| 2   | profiles에 `department` 컬럼('매장'/'공장')으로 레시피 권한 제어                             | A         |
| 3   | 급여 정산 화면은 월별 확인 가능하고, 이체 여부 정도 체크할수 있도록                          | B         |
| 4   | 스케줄 대타 요청 알림 지원 가능 여부를 앱 내에서 해결                                        | D         |
| 5   | 직원 화면에서 `이번 주 근무` 섹션(WeeklyWorkStats)의 총 근무시간 표시를 스케줄 기반으로 변경 | B+D       |
