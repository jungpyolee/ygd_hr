# YGD HR — 전체 진행 현황 & 개선 로드맵

> **최종 갱신**: 2026-03-17
> **기준 브랜치**: dev (main과 동일)

---

## 1. 구현 완료 항목

### 기반 시스템
| 항목 | 내용 |
|------|------|
| ✅ 인증 | Supabase Auth + SSR 쿠키 세션, 온보딩 퍼널 |
| ✅ PWA | Serwist 기반, 설치 프롬프트, 오늘 하루 안 보기 |
| ✅ 알림 시스템 | `notifications` 테이블 + Supabase Realtime 구독, 어드민 드롭다운 |
| ✅ DB 시간대 | `Asia/Seoul` KST 통일, `prevent_duplicate_attendance()` 중복 방지 트리거 |

### Epic C — 서류 관리 간소화 ✅
- 등본·통장사본 UI 제거 (DB 컬럼 유지)
- 보건증·근로계약서 파일 업로드 유지
- 계좌번호 텍스트 관리 (은행명 + 계좌번호)

### Epic F/G — 출퇴근 (위치 기반) ✅
- `useGeolocation` 훅: 5초 타임아웃, 45초 캐시(표시용) / 10초 캐시(출퇴근 기록용)
- `LocationPermissionGuide`: iOS/Android 권한 설정 안내 바텀시트
- attendance_type 4종: `regular` / `remote_out` / `business_trip_in` / `business_trip_out`
- `check_in_store_id` / `check_out_store_id` 분리 저장
- 원격퇴근: 반경 초과 퇴근 → 사유 입력 → `remote_out` 기록
- 출장출근/퇴근: 반경 초과 출근 → ConfirmDialog → `business_trip_in/out` 기록

### Epic A — 레시피 관리 ✅
- `recipe_categories` / `recipe_items` / `recipe_steps` 테이블
- 어드민 카테고리·메뉴·단계 CRUD (썸네일, 영상, 공개 여부)
- 직원 레시피 열람 (`is_published=true`만), 단계별 보기
- Storage 버킷 `recipe-media` (public, 100MB)

### Epic E — 출근 거리 어드민 표시 ✅
- `admin/attendance` 상세 카드에 `distance_m` 표시 (MapPin 아이콘)

### Epic D — 스케줄 관리 ✅ (Phase 1~6 완료, 2026-03-17)

#### DB 추가
| 테이블 | 설명 |
|--------|------|
| `work_defaults` | 직원 요일별 기본 근무 패턴 |
| `weekly_schedules` | 주차별 컨테이너 (draft → confirmed) |
| `schedule_slots` | 개별 근무 슬롯 (날짜·시간·장소·포지션) |
| `substitute_requests` | 대타 요청 (pending→approved/rejected→filled) |
| `substitute_responses` | 대타 수락/거절 응답 |

`profiles` 컬럼 추가: `employment_type` / `work_locations[]` / `cafe_positions[]`

#### 화면
| 경로 | 기능 |
|------|------|
| `/admin/schedules` | 주간 그리드 + 일간 타임라인, 슬롯 CRUD, 이전 주 복사, 확정(publish) |
| `/admin/schedules/substitutes` | 대체근무 관리: 반려(선택적 사유) / 승인(알림 대상 선택) |
| `/admin/employees` | 고용형태·근무장소·포지션 편집 + work_defaults CRUD |
| `/schedule` | 직원 내 스케줄 주간 뷰 + 대타 요청 |

#### 최근 UX 수정 (2026-03-17)
- 같은 직원·날짜 시간 겹침 방지 유효성 검사
- 시작 ≥ 종료 시간 차단
- + 버튼 중앙 정렬 (`align-middle`)
- 초안 뱃지 레이아웃 시프트 수정 (absolute 우측 고정)
- 이전 주 복사 버튼 → 탭 토글 우측, 주간 전용
- 대체근무 관리 pending 숫자 뱃지 (헤더 버튼 + 사이드바 + 모바일 메뉴)

---

## 2. 미완성 / 진행 필요 항목

### 2-A. Epic D 잔여 (스케줄 시스템 완성)

#### 🔴 직원 대타 수락/거절 UI (우선순위: 높음)
**현재 상태**: `substitute_responses` 테이블 존재, `eligible_profile_ids`에 알림 대상 저장됨. 하지만 직원이 수락/거절하는 UI 없음.

**필요 작업**:
1. `/schedule` 페이지 하단에 "나에게 온 대타 요청" 섹션 추가
   - `substitute_requests`에서 `status='approved' AND auth.uid() = ANY(eligible_profile_ids)` 조회
   - 아직 `substitute_responses`에 응답 없는 건만 표시
2. 수락 → `INSERT substitute_responses(response='accepted')` → `UPDATE substitute_requests SET status='filled', accepted_by` → `UPDATE schedule_slots SET status='substituted'` + 새 슬롯 INSERT(acceptor) → 알림(requester + admin)
3. 거절 → `INSERT substitute_responses(response='declined')` → 토스트

#### 🟡 work_defaults → 주간 스케줄 자동 채우기 (우선순위: 중간)
**현재 상태**: work_defaults CRUD UI 있음. 하지만 "이전 주 복사"만 있고, 기본 패턴으로 초기 채우기 기능 없음.

**필요 작업**: `/admin/schedules` 에 "기본 패턴으로 채우기" 버튼 추가. work_defaults 기준으로 현재 주 전 직원 슬롯을 한 번에 생성.

#### 🟡 일간 뷰 주차 연동 (우선순위: 낮음)
일간 뷰에서 현재 week의 슬롯만 보여줌. 다른 주 날짜로 이동 시 해당 주 weekly_schedule 조회 필요.

### 2-B. Epic B — 급여 자동 계산 (미착수)
**현재 상태**: 기획 완료, profiles에 `hourly_wage`·`insurance_type` 컬럼 없음.

**필요 작업**:
1. DB: `profiles`에 `hourly_wage int`, `insurance_type text CHECK ('national','3.3')` 추가
2. admin/employees에서 시급·보험유형 편집 UI 추가
3. `/admin/payroll` 월별 급여 정산 페이지:
   - 직원별 해당 월 `schedule_slots` 합산 시간
   - 시급 × 시간 = 세전, 공제 유형별 실수령 자동 계산
   - 이체 여부 체크 기능 (`salary_payments` 테이블 필요)
4. WeeklyWorkStats → 스케줄 기반으로 변경 (이번 주 예정 근무시간 표시)

### 2-C. 기존 직원 profile 데이터 입력 필요
- `employment_type`, `work_locations`, `cafe_positions` 컬럼은 생성됐으나 기존 직원 값 없음 (기본값 `part_time_fixed`, `{}`)
- 어드민이 `/admin/employees`에서 직접 입력 필요

---

## 3. 스케줄 ↔ 근태 통합 개선 로드맵

> 현재 스케줄(Epic D)과 근태(Epic F/G)는 별개 시스템. 아래 개선으로 두 시스템을 유기적으로 연결.

### 3-A. 어드민 — 오늘 현황 대시보드 (신규)
**목적**: 어드민이 하루 한 눈에 현황 파악

```
[오늘 3월 17일 월요일]

출근 현황 (카페 4명 스케줄)
─────────────────────────────────────
✅ 김직원   10:00~18:00   출근 10:03 (+3분)
✅ 이직원   09:00~17:00   출근 09:12 (+12분 지각)
⏳ 박직원   13:00~21:00   출근 예정 (아직 시간 전)
❌ 정직원   10:00~18:00   미출근 (현재 10:30)
```

**구현 방향**:
- `/admin` 대시보드에 "오늘 스케줄 현황" 섹션 추가
- `schedule_slots WHERE slot_date = today AND status = 'active'` + `attendance_logs WHERE DATE(created_at) = today` 조인
- 상태 판단: 출근 기록 있음 → ✅, 스케줄 시작 시간 지남 + 기록 없음 → ❌, 시작 전 → ⏳
- 지각 감지: 실제 출근 시간 - 스케줄 start_time > 10분 → 지각 뱃지

### 3-B. 어드민 근태 조회 개선 — 스케줄 대비 표시
**목적**: 근태 기록 옆에 예정 스케줄 정보 함께 표시

```
[3월 19일 이직원]
스케줄: 카페 09:00~17:00
실제:   출근 09:23 (+23분) / 퇴근 17:05 (+5분)
```

**구현 방향**:
- `admin/attendance` 로그 카드에 해당 날짜 `schedule_slots` 조인 표시
- attendance_type이 `regular`인데 스케줄 시작 기준 N분 초과 → "지각" 뱃지

### 3-C. 직원 홈 화면 — 오늘 스케줄 위젯 (신규)
**목적**: 직원이 앱 열면 오늘 근무를 바로 확인

```
[메인 화면 AttendanceCard 아래]
오늘 스케줄
─────────────────
카페 홀/주방
10:00 ~ 18:00
```

**구현 방향**:
- `page.tsx`에서 오늘 날짜의 confirmed schedule_slot 조회
- AttendanceCard 아래 위젯으로 표시 (스케줄 없으면 미표시)
- 케이터링 슬롯이면 "출장출근으로 기록해주세요" 안내 텍스트 추가

### 3-D. WeeklyWorkStats → 스케줄 기반 전환
**목적**: 이번 주 예정 근무시간 / 실제 근무시간 대비 표시 (기획 확정 사항)

```
이번 주 근무
예정  32시간 (스케줄 기준)
실적  29시간 40분 (출퇴근 기록 기준)
```

**구현 방향**:
- 현재: `attendance_logs` 기반 계산
- 변경: confirmed `schedule_slots` 합산 = 예정 시간 / `attendance_logs` 합산 = 실적 시간
- 급여 계산(Epic B)과 연동 시 "이번 주 예상 급여" 추가 가능 (어드민 전용)

### 3-E. 대타 흐름 완성 — 케이터링 연동
**목적**: 케이터링 근무 대타 시 출장출근 흐름과 자연스럽게 연결

- 케이터링 슬롯의 대타 수락자 → 앱에 "출장출근으로 기록해주세요" 알림
- 기존 `business_trip_in/out` 플로우 그대로 사용 (신규 인프라 불필요)

### 3-F. 스케줄 미준수 자동 알림 (향후)
**목적**: 어드민이 놓치지 않도록 자동 경고

- 스케줄 시작 후 N분 경과 시 미출근 직원 → 어드민에게 알림
- Supabase Edge Functions `pg_cron`으로 10분 주기 체크 가능
- 우선순위: 낮음 (수동 대시보드 확인으로 충분한 단계)

---

## 4. 기타 기술 부채

| 항목 | 내용 | 우선순위 |
|------|------|---------|
| `attendance_logs.store_id` 레거시 컬럼 | `check_in/out_store_id`로 완전 이관 후 제거 | 낮음 |
| `stores.radius_m` 미사용 | 코드에서 `RADIUS_METER=100` 하드코딩, 매장별 반경 설정 미적용 | 낮음 |
| 직원 알림 시스템 미완 | 현재 알림은 어드민 드롭다운만 존재. 직원용 알림 화면 없음 | 중간 |
| Web Push 미구현 | 앱이 닫혀 있어도 알림 수신 (PWA Push API + Supabase Webhooks) | 낮음 |

---

## 5. 작업 우선순위 요약

```
즉시 (Epic D 마무리)
  ① 직원 대타 수락/거절 UI ← 기능 완성에 필수
  ② 기존 직원 employment_type/work_locations 입력 (어드민 수작업)

단기 (스케줄↔근태 통합)
  ③ 직원 홈 화면 오늘 스케줄 위젯
  ④ 어드민 오늘 현황 대시보드
  ⑤ WeeklyWorkStats 스케줄 기반 전환

중기 (Epic B + 통합 개선)
  ⑥ 급여 자동 계산 (hourly_wage, 정산 화면)
  ⑦ 어드민 근태 조회 스케줄 대비 표시
  ⑧ work_defaults 기본 패턴 자동 채우기

장기 (자동화)
  ⑨ 스케줄 미준수 자동 알림 (pg_cron)
  ⑩ Web Push 알림
```
