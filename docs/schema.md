# DB 스키마 (최신 상태)

> **프로젝트**: ymvdjxzkjodasctktunh
> **최종 갱신**: 2026-03-16 (DB-001, DB-002, DB-003 반영)
> **연결 방식**: Supabase Management API

---

## 테이블 목록

| 테이블 | 설명 |
|--------|------|
| `profiles` | 사용자 프로필 (auth.users와 1:1) |
| `attendance_logs` | 출퇴근 기록 |
| `stores` | 매장 정보 |
| `notifications` | 알림 |

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

## 함수 (Functions)

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

## 개선 필요 사항

| # | 항목 | 우선순위 | 상태 |
|---|------|---------|------|
| 1 | `stores.radius_m` 컬럼이 있는데 코드에서 하드코딩 상수 사용 중 | 낮음 | 미처리 |
| 2 | `attendance_logs.profile_id`, `created_at` 인덱스 없음 | 중간 | ✅ DB-001 완료 |
| 3 | `profiles.updated_at` 자동 갱신 트리거 없음 | 낮음 | ✅ DB-002 완료 |
| 4 | `attendance_logs.store_id` 단일 컬럼으로 출/퇴근 매장 구분 불가 | 높음 | ✅ DB-003 완료 |
| 5 | `attendance_logs.store_id` 레거시 컬럼 제거 (check_in/out_store_id로 완전 이관 후) | 낮음 | 미처리 |
