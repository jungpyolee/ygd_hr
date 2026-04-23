# DB 스키마 (최신 상태)

> **프로젝트**: ymvdjxzkjodasctktunh
> **최종 갱신**: 2026-03-27 (DB-043: kurly_products 컬리 납품 제품 마스터 테이블 추가)
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
| `recipe_items` | 레시피 항목 (썸네일, 영상, 공개여부, 작성자) |
| `recipe_ingredients` | 레시피 재료 목록 |
| `recipe_steps` | 레시피 단계별 설명 |
| `recipe_comments` | 레시피 댓글/대댓글 (소프트 삭제) |
| `work_defaults` | 직원 요일별 기본 근무 패턴 |
| `weekly_schedules` | 주차별 스케줄 컨테이너 (draft/confirmed) |
| `schedule_slots` | 개별 근무 슬롯 (날짜·시간·장소·포지션) |
| `substitute_requests` | 대타 요청 (pending→approved/rejected→filled) |
| `substitute_responses` | 대타 수락/거절 응답 |
| `company_events` | 회사 공지 일정 (어드민 등록, 직원 캘린더 표시) |
| `attendance_adjustments` | 근태 조정 신청 (직원 신청 → 관리자 승인/반려) |
| `kurly_products` | 컬리 납품 제품 마스터 (라벨지 자동생성용) |

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
| `position_keys` | text[] | YES | `'{}'` | `'hall'` / `'kitchen'` / `'showroom'` 복수 선택 |
| `hourly_wage` | integer | YES | - | 시급 (원, 알바만) |
| `insurance_type` | text | YES | - | deprecated. `'national'`/`'3.3'`. `tax_category`로 대체 중 |
| `tax_category` | text | YES | - | `'business'`(3.3% 사업) / `'daily'`(일용, 고용만) / `'regular'`(근로, 4대보험) |
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
| `regular` | 일반 출퇴근 (GPS 반경 내) |
| `remote_out` | 원격퇴근 (반경 밖 퇴근, 사유 필수) |
| `business_trip_in` | 출장출근 (반경 밖 출근, 사용자 확인) |
| `business_trip_out` | 출장퇴근 (출장출근 후 반경 밖 퇴근, 사유 자동입력) |
| `fallback_in` | 수동출근 — GPS 실패 후 직원이 매장 직접 선택 (`distance_m=0`) 또는 관리자 처리 (`distance_m=null`, `reason="관리자 수동 처리"`) |
| `fallback_out` | 수동퇴근 — GPS 실패 후 직원이 매장 직접 선택 (`distance_m=0`) 또는 관리자 처리 (`distance_m=null`, `reason="관리자 수동 처리"`) |
| `qr_in` | QR 출근 — 매장 QR 스캔으로 출근 (`distance_m=0`) |
| `qr_out` | QR 퇴근 — 매장 QR 스캔으로 퇴근 (`distance_m=0`) |

**제약조건**
- PK: `id`
- FK: `profile_id` → `profiles.id`
- FK: `check_in_store_id` → `stores.id`
- FK: `check_out_store_id` → `stores.id`

---

## stores

매장 정보. 위도/경도 기반 출근 반경 판단 + 근무지 메타데이터 관리.

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|------|--------|------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `name` | text | NO | - | 매장명 |
| `lat` | float8 | NO | - | 위도 |
| `lng` | float8 | NO | - | 경도 |
| `work_location_key` | text | YES | - | 코드 식별자 (`cafe`/`factory`/`catering`) UNIQUE |
| `label` | text | NO | `''` | UI 한글 표시명 |
| `color` | text | NO | `'#8B95A1'` | UI 색상 |
| `bg_color` | text | NO | `'#F2F4F6'` | UI 배경색 |
| `display_order` | integer | NO | `0` | 정렬 순서 |
| `is_gps_required` | boolean | NO | `true` | GPS 위치 체크 필요 여부 (케이터링 등 이동형 근무지는 false) |
| `overtime_unit` | integer | NO | `30` | 추가근무 인정 단위(분): 15/30/60/0(자유입력) |
| `overtime_include_early` | boolean | NO | `false` | 일찍 출근한 시간도 추가근무에 포함할지 여부 |
| `overtime_min_minutes` | integer | NO | `10` | 이 값(분) 이상일 때만 확인 필요로 표시 |
| `qr_token` | text | YES | - | QR 출퇴근용 고유 토큰 (UNIQUE) |

**비고**
- `lat`/`lng`는 nullable — `is_gps_required=false`인 근무지는 null 허용
- `is_gps_required=false`인 경우 코드에서 거리 체크 건너뜀

**제약조건**
- PK: `id`
- UNIQUE: `work_location_key`, `qr_token`

---

## store_positions

근무지별 포지션 목록. `stores.work_location_key`가 있는 근무지에 연결.

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|------|--------|------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `store_id` | uuid | NO | - | FK → stores.id (CASCADE) |
| `position_key` | text | NO | - | 코드 식별자 (`hall`/`kitchen`/`showroom`) |
| `label` | text | NO | - | UI 한글 표시명 |
| `display_order` | integer | NO | `0` | 정렬 순서 |

**제약조건**
- PK: `id`
- UNIQUE: `(store_id, position_key)`
- FK: `store_id` → `stores.id` ON DELETE CASCADE
- RLS: anon/authenticated SELECT, admin ALL

---

## employee_store_assignments

직원-근무지 배정 테이블. `profiles.work_locations text[]`를 관계형으로 전환.

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|------|--------|------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `profile_id` | uuid | NO | - | FK → auth.users(id) CASCADE |
| `store_id` | uuid | NO | - | FK → stores.id CASCADE |
| `created_at` | timestamptz | YES | `now()` | 생성일 |

**제약조건**
- UNIQUE: `(profile_id, store_id)`
- RLS: admin ALL, 본인 SELECT

---

## overtime_requests

추가근무 인정/넘김 기록. 사장이 직접 관리 (직원 요청 기능 없음).

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|------|--------|------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `profile_id` | uuid | NO | - | FK → profiles.id CASCADE |
| `date` | date | NO | - | 해당 날짜 |
| `minutes` | integer | NO | - | 인정된 추가근무 분 (dismissed는 0) |
| `reason` | text | YES | - | 메모 (선택) |
| `status` | overtime_status | NO | `'pending'` | `approved` / `dismissed` (pending/rejected는 미사용) |
| `approved_by` | uuid | YES | - | FK → profiles.id (처리한 관리자) |
| `note` | text | YES | - | 내부 메모 |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | 자동 갱신 트리거 있음 |

**비고**
- `overtime_status` ENUM: `pending` / `approved` / `rejected` / `dismissed`
  - 실제 사용: `approved` (추가근무 인정) / `dismissed` (확인하고 넘김)
- dismissed 레코드의 `minutes`는 0으로 저장
- RLS: admin ALL, 직원 SELECT(본인)

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
| `created_by` | uuid | YES | - | FK → profiles.id (SET NULL), 작성자 |

**RLS**: 직원은 `is_published=true` 또는 본인 글만 SELECT, 어드민 ALL / full_time 본인 글 INSERT·UPDATE·DELETE

---

## recipe_ingredients

레시피 재료 목록.

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|------|--------|------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `recipe_id` | uuid | NO | - | FK → recipe_items.id (CASCADE) |
| `name` | text | NO | - | 재료명 |
| `amount` | text | NO | - | 양 (분수 표현 가능, e.g. "1/2") |
| `unit` | text | YES | - | 단위 (g, ml, 개, T ...) |
| `order_index` | integer | NO | `0` | 정렬 순서 |
| `created_at` | timestamptz | YES | `now()` | 생성일 |

**RLS**: 직원은 published 레시피 재료만 SELECT, 어드민 ALL / full_time INSERT·UPDATE·DELETE

---

## recipe_comments

레시피 댓글 및 대댓글. 소프트 삭제 지원.

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|------|--------|------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `recipe_id` | uuid | NO | - | FK → recipe_items.id (CASCADE) |
| `profile_id` | uuid | NO | - | FK → profiles.id (CASCADE), 작성자 |
| `parent_id` | uuid | YES | - | FK → recipe_comments.id (CASCADE), NULL이면 최상위 |
| `content` | text | NO | - | 댓글 내용 |
| `mentioned_profile_id` | uuid | YES | - | FK → profiles.id (SET NULL), @태그 대상 |
| `is_deleted` | boolean | NO | `false` | 소프트 삭제 여부 |
| `created_at` | timestamptz | YES | `now()` | 생성일 |
| `updated_at` | timestamptz | YES | `now()` | 수정일 (트리거) |

**RLS**: 직원은 published 레시피 댓글 SELECT / 인증 직원 INSERT (`profile_id = auth.uid()`) / 본인 UPDATE / 어드민 ALL

**알림 타입**: `recipe_comment` (새 댓글), `recipe_reply` (대댓글), `recipe_mention` (@멘션)

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
| `store_id` | uuid | NO | - | FK → stores.id |
| `position_keys` | text[] | YES | `'{}'` | DB 기반 position_key 목록 |
| `is_active` | boolean | YES | `true` | 활성 여부 |
| `created_at` | timestamptz | YES | `now()` | 생성일 |

**제약**: UNIQUE(profile_id, day_of_week, store_id)
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
| `store_id` | uuid | NO | - | FK → stores.id |
| `position_keys` | text[] | YES | `'{}'` | DB 기반 position_key 목록 |
| `status` | text | YES | `'active'` | `'active'` / `'cancelled'` / `'substituted'` |
| `notes` | text | YES | - | 메모 |
| `lunch_deduction` | bool | NO | `false` | 점심 제공 슬롯(공장 등) — true면 급여 계산 시 60분 차감 |
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

## attendance_adjustments (근태 조정 신청)

> **마이그레이션**: 045_attendance_adjustments.sql
> 직원이 스케줄 범위 밖 출퇴근 기록에 대해 조정을 신청하고 관리자가 승인/반려

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|------|--------|------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `profile_id` | uuid | NO | - | FK → profiles.id (CASCADE) |
| `target_date` | date | NO | - | 조정 대상 날짜 |
| `adjustment_type` | text | NO | - | `late_checkin` / `early_checkout` / `missed_checkin` / `missed_checkout` / `wrong_store` / `other` |
| `requested_time` | time | YES | - | 실제 출퇴근 시각 |
| `reason` | text | NO | - | 사유 |
| `status` | text | NO | `'pending'` | `pending` / `approved` / `rejected` |
| `reviewed_by` | uuid | YES | - | FK → profiles.id |
| `reviewed_at` | timestamptz | YES | - | 처리 시각 |
| `reject_reason` | text | YES | - | 반려 사유 |
| `created_at` | timestamptz | YES | `now()` | 생성일 |
| `updated_at` | timestamptz | YES | `now()` | 수정일 (트리거 자동 갱신) |

**제약조건**: UNIQUE `(profile_id, target_date, adjustment_type)`
**RLS**: 관리자=ALL, 직원=본인 SELECT/INSERT
**인덱스**: `(profile_id)`, `(status)`, `(target_date DESC)`

---

## kurly_products (컬리 납품 제품 마스터)

> **마이그레이션**: 043_kurly_products.sql
> 마켓컬리 발주 라벨지 자동생성을 위한 제품 정보 관리

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | UUID (PK) | gen_random_uuid() |
| `name` | TEXT NOT NULL | 상품명 (예: [연경당] 금귤정과 (진정과) 140g) |
| `master_code` | TEXT NOT NULL UNIQUE | 컬리 마스터코드 (예: M00000420174) |
| `barcode` | TEXT | 바코드 (예: 8800265330025) |
| `unit_weight` | TEXT | 규격 중량 (예: 170g) |
| `box_capacity` | INT NOT NULL DEFAULT 1 | 박스당 입수량 |
| `is_active` | BOOLEAN DEFAULT true | 활성 여부 |
| `created_at` | TIMESTAMPTZ | now() |

**RLS**: 관리자=ALL (is_admin())

---

## 개선 필요 사항

| # | 항목 | 우선순위 | 상태 |
|---|------|---------|------|
| 1 | `stores.radius_m` 컬럼이 있는데 코드에서 하드코딩 상수 사용 중 | 낮음 | ✅ DB-005 완료 (컬럼 제거) |
| 2 | `attendance_logs.profile_id`, `created_at` 인덱스 없음 | 중간 | ✅ DB-001 완료 |
| 3 | `profiles.updated_at` 자동 갱신 트리거 없음 | 낮음 | ✅ DB-002 완료 |
| 4 | `attendance_logs.store_id` 단일 컬럼으로 출/퇴근 매장 구분 불가 | 높음 | ✅ DB-003 완료 |
| 5 | `attendance_logs.store_id` 레거시 컬럼 제거 | 낮음 | ✅ DB-005 완료 |
| 6 | DB 시간대 UTC → KST 통일, 중복 출퇴근 방지 트리거 없음 | 높음 | ✅ DB-004 완료 |
