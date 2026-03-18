# DB 스키마 (최신 상태)

> **프로젝트**: ymvdjxzkjodasctktunh
> **최종 갱신**: 2026-03-17 (Epic D 스케줄 5테이블 + profiles 5컬럼 추가)
> **DB 시간대**: `Asia/Seoul` (KST, UTC+9) — 모든 롤에 적용됨
> **timestamptz 저장**: UTC로 저장, 날짜 함수(`DATE_TRUNC`, `CURRENT_DATE` 등)는 KST 기준 동작
> **연결 방식**: Supabase Management API

---

## 테이블 목록

| 테이블 | 설명 |
|--------|------|
| `profiles` | 사용자 프로필 (auth.users와 1:1) |
| `attendance_logs` | 출퇴근 기록 |
| `stores` | 매장 정보 |
| `notifications` | 알림 |
| `recipe_categories` | 레시피 카테고리 |
| `recipe_items` | 레시피 항목 (썸네일, 영상, 공개여부) |
| `recipe_steps` | 레시피 단계별 설명 |
| `work_defaults` | 직원 요일별 기본 근무 패턴 |
| `weekly_schedules` | 주차별 스케줄 컨테이너 (draft/confirmed) |
| `schedule_slots` | 개별 근무 슬롯 (날짜·시간·장소·포지션) |
| `substitute_requests` | 대타 요청 (pending→approved/rejected→filled) |
| `substitute_responses` | 대타 수락/거절 응답 |

---

## profiles

사용자 계정과 1:1 연결. auth.users INSERT 시 트리거로 자동 생성.

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|------|--------|------|
| `id` | uuid | NO | - | PK, auth.users.id 참조 |
| `email` | text | NO | - | UNIQUE, `{userId}@ygd.com` 형식 |
| `name` | text | YES | - | 직원 이름 |
| `phone` | text | YES | - | 연락처 |
| `department` | text | YES | - | 부서 |
| `position` | text | YES | - | 직급 |
| `role` | text | YES | `'employee'` | `'admin'` / `'employee'` |
| `color_hex` | varchar(7) | YES | `'#8B95A1'` | 아바타 색상 |
| `target_in_time` | text | YES | `'09:00'` | 기본 출근 시간 |
| `target_out_time` | text | YES | `'18:00'` | 기본 퇴근 시간 |
| `join_date` | date | YES | - | 입사일 |
| `employment_contract_url` | text | YES | - | 근로계약서 Storage 경로 |
| `bank_account_copy_url` | text | YES | - | 통장사본 Storage 경로 |
| `resident_register_url` | text | YES | - | 주민등록등본 Storage 경로 |
| `health_cert_url` | text | YES | - | 보건증 Storage 경로 |
| `health_cert_date` | date | YES | - | 보건증 만료일 |
| `health_cert_verified` | boolean | YES | `false` | 보건증 실물 확인 여부 |
| `account_number` | text | YES | - | 계좌번호 |
| `bank_name` | text | YES | - | 은행명 |
| `employment_type` | text | YES | `'part_time_fixed'` | `'full_time'` / `'part_time_fixed'` / `'part_time_daily'` |
| `work_locations` | text[] | YES | `'{}'` | `'cafe'` / `'factory'` / `'catering'` 복수 선택 |
| `cafe_positions` | text[] | YES | `'{}'` | `'hall'` / `'kitchen'` / `'showroom'` 복수 선택 |
| `hourly_wage` | integer | YES | - | 시급 (원, 알바만) |
| `insurance_type` | text | YES | - | `'national'` (2대보험) / `'3.3'` (원천징수) |
| `created_at` | timestamptz | YES | `now()` | 생성일 |
| `updated_at` | timestamptz | YES | `now()` | 수정일 |

**제약조건**
- PK: `id`
- UNIQUE: `email`
- FK: `id` → `auth.users.id`

---

## attendance_logs

출퇴근 기록. type이 `IN`/`OUT`으로 구분.

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|------|--------|------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `profile_id` | uuid | NO | - | FK → profiles.id |
| `store_id` | uuid | **YES** | - | FK → stores.id (레거시, 신규는 아래 컬럼 사용) |
| `check_in_store_id` | uuid | YES | - | FK → stores.id (출근 매장, 출장출근 시 null) |
| `check_out_store_id` | uuid | YES | - | FK → stores.id (퇴근 매장, 원격/출장퇴근 시 null) |
| `type` | text | NO | - | `'IN'` / `'OUT'` |
| `attendance_type` | text | YES | `'regular'` | 아래 참고 |
| `reason` | text | YES | - | 원격/출장퇴근 사유 |
| `user_lat` | float8 | YES | - | 기록 시 사용자 위도 |
| `user_lng` | float8 | YES | - | 기록 시 사용자 경도 |
| `distance_m` | float8 | YES | - | 매장까지 거리 (미터) |
| `created_at` | timestamptz | YES | `now()` | 기록 시각 |

**attendance_type 값**

| 값 | 설명 |
|----|------|
| `regular` | 일반 출퇴근 (반경 내) |
| `remote_out` | 원격퇴근 (반경 밖 퇴근, 사유 필수) |
| `business_trip_in` | 출장출근 (반경 밖 출근, 사용자 확인) |
| `business_trip_out` | 출장퇴근 (출장출근 후 반경 밖 퇴근, 사유 자동입력) |

**제약조건**
- PK: `id`
- FK: `profile_id` → `profiles.id`
- FK: `store_id` → `stores.id` (nullable, DB-003 이후)
- FK: `check_in_store_id` → `stores.id`
- FK: `check_out_store_id` → `stores.id`

---

## stores

매장 정보. 위도/경도 기반 출근 반경 판단에 사용.

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|------|--------|------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `name` | text | NO | - | 매장명 |
| `lat` | float8 | NO | - | 위도 |
| `lng` | float8 | NO | - | 경도 |
| `radius_m` | integer | YES | `100` | 출근 가능 반경 (미터) |

**제약조건**
- PK: `id`

> ⚠️ 현재 코드(`AttendanceCard.tsx`)에서 반경은 `RADIUS_METER = 100` 상수로 하드코딩되어 있음.
> `stores.radius_m` 컬럼이 존재하지만 코드에서 활용 안 됨 → 개선 여지 있음.

---

## notifications

관리자/직원 알림. Supabase Realtime으로 실시간 구독.

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|------|--------|------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `profile_id` | uuid | YES | - | FK → profiles.id (발신자) |
| `target_role` | text | YES | - | `'admin'` / `'employee'` / `'all'` |
| `type` | text | NO | - | 알림 종류 (아래 참고) |
| `title` | text | NO | - | 제목 |
| `content` | text | NO | - | 내용 |
| `source_id` | uuid | YES | - | 관련 리소스 ID |
| `is_read` | boolean | YES | `false` | 읽음 여부 |
| `created_at` | timestamptz | YES | `now()` | 발송 시각 |

**알림 type 목록**

| type | 발생 시점 |
|------|-----------|
| `attendance_in` | 직원 출근 시 |
| `attendance_out` | 직원 퇴근 시 |
| `attendance_remote_out` | 직원 원격퇴근 시 |
| `attendance_business_trip_in` | 직원 출장출근 시 |
| `attendance_business_trip_out` | 직원 출장퇴근 시 |
| `onboarding` | 신규 직원 온보딩 완료 시 |
| `info_update` | 직원 정보 수정 시 |

**제약조건**
- PK: `id`
- FK: `profile_id` → `profiles.id`

---

## RLS 정책

### profiles
| 정책 | 대상 | 허용 작업 |
|------|------|-----------|
| Admin Bypass | public | ALL (`is_admin()` 조건) |
| Profiles are viewable by users | public | SELECT (authenticated만) |
| Users can update own profile | public | UPDATE (`auth.uid() = id`) |

### attendance_logs
| 정책 | 대상 | 허용 작업 |
|------|------|-----------|
| Admin Bypass | public | ALL (`is_admin()` 조건) |
| 인증된 사용자는 자신의 출퇴근 기록만 볼 수 있음 | authenticated | SELECT (`auth.uid() = profile_id`) |
| 인증된 사용자는 자신의 출퇴근 기록을 남길 수 있음 | authenticated | INSERT |

### stores
| 정책 | 대상 | 허용 작업 |
|------|------|-----------|
| Admin Bypass | public | ALL (`is_admin()` 조건) |
| 인증된 사용자는 매장 정보를 볼 수 있음 | authenticated | SELECT |

### notifications
| 정책 | 대상 | 허용 작업 |
|------|------|-----------|
| Anyone can create notifications | public | INSERT |
| Users can view their own or admins view all | public | SELECT |
| Users can update their own notification status | public | UPDATE |
| Only admins can delete notifications | public | DELETE |

---

## 시간대 처리 원칙

| 계층 | 처리 방식 |
|------|-----------|
| **DB 저장** | `timestamptz` (내부 UTC, 표시 KST) |
| **DB 날짜 함수** | `DATE_TRUNC`, `CURRENT_DATE` 등 KST 기준 (DB timezone = Asia/Seoul) |
| **앱 → DB 쿼리** | JS `Date` 객체 `.toISOString()` → UTC ISO 문자열로 전달 (정상) |
| **DB → 앱 표시** | JS `new Date(timestamptz)` → 로컬 시간 자동 변환 (KST) |
| **향후 서버사이드 날짜 집계** | `DATE_TRUNC('month', created_at)` — DB timezone KST 기준으로 동작 |

> **신규 테이블 추가 시**: `timestamptz DEFAULT now()` 패턴 유지. JS 앱에서 `.toISOString()` 전달, 표시는 `new Date()` 변환으로 일관성 유지.

---

## 함수 (Functions)

### `prevent_duplicate_attendance()`
```sql
-- BEFORE INSERT 트리거 함수 (attendance_logs)
-- 같은 타입 연속 차단: IN→IN, OUT→OUT
-- 출근 없이 퇴근 차단: 첫 로그가 OUT인 경우
-- ERRCODE 'P0001', message: DUPLICATE_ATTENDANCE_TYPE / INVALID_CHECKOUT_NO_CHECKIN
```

### `set_updated_at()`
```sql
-- BEFORE UPDATE 트리거 함수 (범용, 다른 테이블에도 재사용 가능)
-- DB-002에서 추가
RETURNS TRIGGER
NEW.updated_at = now(); RETURN NEW;
```

### `is_admin()`
```sql
-- 현재 사용자가 admin인지 확인 (RLS 정책에서 사용)
RETURNS boolean
SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
```

### `handle_new_user()`
```sql
-- auth.users INSERT 시 트리거로 실행
-- profiles 테이블에 자동 행 생성
INSERT INTO profiles (id, email, name)
VALUES (new.id, new.email, new.raw_user_meta_data->>'name')
```

### `delete_user_admin(target_user_id uuid)`
```sql
-- 관리자만 호출 가능
-- auth.users 삭제 시 CASCADE로 profiles, attendance_logs도 삭제
DELETE FROM auth.users WHERE id = target_user_id
```

### `rls_auto_enable()`
```sql
-- DDL 이벤트 트리거: 새 테이블 생성 시 자동으로 RLS 활성화
```

---

## 트리거

| 트리거 | 이벤트 | 테이블 | 실행 함수 |
|--------|--------|--------|-----------|
| `on_auth_user_created` | INSERT | `auth.users` | `handle_new_user()` |
| `trg_profiles_updated_at` | UPDATE (BEFORE) | `public.profiles` | `set_updated_at()` |
| `trg_prevent_duplicate_attendance` | INSERT (BEFORE) | `attendance_logs` | `prevent_duplicate_attendance()` |

---

## 인덱스

| 인덱스 | 테이블 | 종류 |
|--------|--------|------|
| `attendance_logs_pkey` | attendance_logs | UNIQUE (id) |
| `idx_attendance_logs_profile_id` | attendance_logs | (profile_id) |
| `idx_attendance_logs_created_at` | attendance_logs | (created_at DESC) |
| `idx_attendance_logs_profile_created` | attendance_logs | (profile_id, created_at DESC) |
| `idx_attendance_logs_attendance_type` | attendance_logs | (attendance_type) |
| `notifications_pkey` | notifications | UNIQUE (id) |
| `profiles_pkey` | profiles | UNIQUE (id) |
| `profiles_email_key` | profiles | UNIQUE (email) |
| `stores_pkey` | stores | UNIQUE (id) |

---

## Storage

| 버킷 | 접근 | 경로 패턴 | 용도 |
|------|------|-----------|------|
| `hr-documents` | Private | `{userId}/{column}_{timestamp}.{ext}` | 근로계약서, 통장사본, 등본, 보건증 |

---

---

## recipe_categories

레시피 카테고리. (예: 음료, 디저트)

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|------|--------|------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `name` | text | NO | - | 카테고리명 |
| `department` | text | NO | `'all'` | `'all'` / `'매장'` / `'공장'` |
| `order_index` | integer | NO | `0` | 정렬 순서 |
| `created_at` | timestamptz | YES | `now()` | 생성일 |

**RLS**: 전 직원 SELECT, 어드민 ALL

---

## recipe_items

레시피 항목. 카테고리에 속함.

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|------|--------|------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `category_id` | uuid | NO | - | FK → recipe_categories.id (CASCADE) |
| `name` | text | NO | - | 레시피명 |
| `description` | text | YES | - | 설명 |
| `thumbnail_url` | text | YES | - | 썸네일 이미지 Storage URL |
| `video_url` | text | YES | - | 영상 Storage URL |
| `is_published` | boolean | NO | `false` | 공개 여부 |
| `order_index` | integer | NO | `0` | 정렬 순서 |
| `created_at` | timestamptz | YES | `now()` | 생성일 |
| `updated_at` | timestamptz | YES | `now()` | 수정일 |

**RLS**: 직원은 `is_published=true`만 SELECT, 어드민 ALL

---

## recipe_steps

레시피 단계별 설명.

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|------|--------|------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `recipe_id` | uuid | NO | - | FK → recipe_items.id (CASCADE) |
| `step_number` | integer | NO | - | 단계 번호 (1부터) |
| `title` | text | YES | - | 단계 제목 |
| `content` | text | NO | - | 단계 설명 |
| `image_url` | text | YES | - | 단계 이미지 Storage URL |
| `created_at` | timestamptz | YES | `now()` | 생성일 |

**제약**: UNIQUE(recipe_id, step_number)
**RLS**: 부모 recipe가 published이면 직원 SELECT, 어드민 ALL

---

## work_defaults

직원 요일별 기본 근무 패턴. 주간 스케줄 자동 채우기의 기준.

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|------|--------|------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `profile_id` | uuid | NO | - | FK → profiles.id CASCADE |
| `day_of_week` | int | NO | - | 0=일, 1=월 … 6=토 |
| `start_time` | time | NO | - | 시작 시간 |
| `end_time` | time | NO | - | 종료 시간 |
| `work_location` | text | NO | - | `'cafe'` / `'factory'` / `'catering'` |
| `cafe_positions` | text[] | YES | `'{}'` | `'hall'` / `'kitchen'` / `'showroom'` |
| `is_active` | boolean | YES | `true` | 활성 여부 |
| `created_at` | timestamptz | YES | `now()` | 생성일 |

**제약**: UNIQUE(profile_id, day_of_week, work_location)
**RLS**: 어드민 ALL / 본인 SELECT

---

## weekly_schedules

주차별 스케줄 컨테이너. `confirmed` 상태가 되어야 직원에게 노출.

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|------|--------|------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `week_start` | date | NO | - | UNIQUE, 항상 일요일 날짜 |
| `status` | text | YES | `'draft'` | `'draft'` / `'confirmed'` |
| `published_at` | timestamptz | YES | - | 확정 시각 |
| `created_by` | uuid | YES | - | FK → profiles.id |
| `created_at` | timestamptz | YES | `now()` | 생성일 |
| `updated_at` | timestamptz | YES | `now()` | 수정일 |

**RLS**: 어드민 ALL / 직원은 `status='confirmed'`만 SELECT

---

## schedule_slots

개별 근무 슬롯. weekly_schedules에 속함.

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|------|--------|------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `weekly_schedule_id` | uuid | NO | - | FK → weekly_schedules.id CASCADE |
| `profile_id` | uuid | NO | - | FK → profiles.id CASCADE |
| `slot_date` | date | NO | - | 근무 날짜 |
| `start_time` | time | NO | - | 시작 시간 |
| `end_time` | time | NO | - | 종료 시간 |
| `work_location` | text | NO | - | `'cafe'` / `'factory'` / `'catering'` |
| `cafe_positions` | text[] | YES | `'{}'` | `'hall'` / `'kitchen'` / `'showroom'` |
| `status` | text | YES | `'active'` | `'active'` / `'cancelled'` / `'substituted'` |
| `notes` | text | YES | - | 메모 |
| `created_at` | timestamptz | YES | `now()` | 생성일 |
| `updated_at` | timestamptz | YES | `now()` | 수정일 |

**RLS**: 어드민 ALL / 직원은 본인 + confirmed 주차만 SELECT
**유효성**: 같은 profile_id·slot_date 시간 겹침 클라이언트 차단

---

## substitute_requests

대타 요청. 직원 요청 → 어드민 승인/반려 → 알림 대상 지원/수락.

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|------|--------|------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `slot_id` | uuid | NO | - | FK → schedule_slots.id CASCADE |
| `requester_id` | uuid | NO | - | FK → profiles.id |
| `reason` | text | YES | - | 요청 사유 |
| `status` | text | YES | `'pending'` | `'pending'` / `'approved'` / `'rejected'` / `'filled'` |
| `reject_reason` | text | YES | - | 반려 사유 |
| `rejected_by` | uuid | YES | - | FK → profiles.id |
| `rejected_at` | timestamptz | YES | - | 반려 시각 |
| `approved_by` | uuid | YES | - | FK → profiles.id |
| `approved_at` | timestamptz | YES | - | 승인 시각 |
| `eligible_profile_ids` | uuid[] | YES | `'{}'` | 어드민이 선택한 알림 대상 |
| `accepted_by` | uuid | YES | - | FK → profiles.id |
| `accepted_at` | timestamptz | YES | - | 대타 확정 시각 |
| `created_at` | timestamptz | YES | `now()` | 생성일 |
| `updated_at` | timestamptz | YES | `now()` | 수정일 |

**RLS**: 어드민 ALL / 요청자 SELECT+INSERT / eligible 직원 approved 건 SELECT

---

## substitute_responses

대타 지원 응답. eligible 직원이 수락/거절한 기록.

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|------|--------|------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `request_id` | uuid | NO | - | FK → substitute_requests.id CASCADE |
| `profile_id` | uuid | NO | - | FK → profiles.id |
| `response` | text | NO | - | `'accepted'` / `'declined'` |
| `created_at` | timestamptz | YES | `now()` | 생성일 |

**제약**: UNIQUE(request_id, profile_id)
**RLS**: 어드민 ALL / 본인 응답 관리 / 요청 관련자 SELECT

---

## 알림 type 목록 (전체)

| type | 발생 시점 |
|------|-----------|
| `attendance_in` | 직원 출근 |
| `attendance_out` | 직원 퇴근 |
| `attendance_remote_out` | 원격퇴근 |
| `attendance_business_trip_in` | 출장출근 |
| `attendance_business_trip_out` | 출장퇴근 |
| `onboarding` | 신규 직원 온보딩 완료 |
| `info_update` | 직원 정보 수정 |
| `substitute_requested` | 대타 요청 생성 (→ 어드민) |
| `substitute_approved` | 대타 승인 (→ eligible 직원) |
| `substitute_rejected` | 대타 반려 (→ 요청자) |
| `substitute_filled` | 대타 확정 (→ 요청자 + 어드민) |
| `schedule_published` | 스케줄 확정 (→ 해당 직원) |
| `schedule_updated` | 확정 스케줄 슬롯 수정/삭제 시 (→ 해당 직원) |

---

## Storage (전체)

| 버킷 | 접근 | 용도 |
|------|------|------|
| `hr-documents` | Private (서명 URL 60초) | 근로계약서, 보건증 |
| `recipe-media` | Public | 레시피 썸네일, 영상, 단계 이미지 (최대 100MB) |

---

## 개선 필요 사항

| # | 항목 | 우선순위 | 상태 |
|---|------|---------|------|
| 1 | `stores.radius_m` 컬럼이 있는데 코드에서 하드코딩 상수 사용 중 | 낮음 | 미처리 |
| 2 | `attendance_logs.profile_id`, `created_at` 인덱스 없음 | 중간 | ✅ DB-001 완료 |
| 3 | `profiles.updated_at` 자동 갱신 트리거 없음 | 낮음 | ✅ DB-002 완료 |
| 4 | `attendance_logs.store_id` 단일 컬럼으로 출/퇴근 매장 구분 불가 | 높음 | ✅ DB-003 완료 |
| 5 | `attendance_logs.store_id` 레거시 컬럼 제거 (check_in/out_store_id로 완전 이관 후) | 낮음 | 미처리 |
| 6 | DB 시간대 UTC → KST 통일, 중복 출퇴근 방지 트리거 없음 | 높음 | ✅ DB-004 완료 |
