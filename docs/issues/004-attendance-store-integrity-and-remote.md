# [BUG-F / FEAT-F / FEAT-G] store_id 무결성 + 원격퇴근 + 출장출근/퇴근

| 항목 | 내용 |
|------|------|
| **유형** | 버그 수정 + 신규 기능 |
| **상태** | ✅ 완료 |
| **발견일** | 2026-03-16 |
| **완료일** | 2026-03-16 |
| **마이그레이션** | `docs/migrations/003_attendance_logs_store_split.sql` |

---

## Bug F — attendance_logs store_id 무결성

### 문제

`attendance_logs.store_id` 단일 컬럼으로 출근 매장과 퇴근 매장을 구분할 수 없었음.

A 매장에서 출근 → B 매장에서 퇴근 시:
- IN 로그의 `store_id` = A (출근 시 가장 가까운 매장)
- OUT 로그의 `store_id` = B (퇴근 시 가장 가까운 매장)

어드민 캘린더에서 그룹핑 시 첫 번째 로그 기준으로 매장명 표시 → 퇴근 매장 정보 유실.

### 해결

`check_in_store_id` / `check_out_store_id` 컬럼으로 분리.

| 상황 | check_in_store_id | check_out_store_id |
|------|------------------|--------------------|
| 일반 출근 | nearestStore.id | null |
| 일반 퇴근 | null | nearestStore.id |
| 출장출근 | **null** | null |
| 원격퇴근 | null | **null** |
| 출장퇴근 | null | **null** |

기존 `store_id` 컬럼은 nullable로 변경 후 유지 (레거시 데이터 보존).
기존 데이터는 `check_in_store_id = check_out_store_id = store_id`로 마이그레이션.

---

## Epic F — 원격퇴근

### 문제

퇴근 체크를 깜빡한 경우 매장에서 멀어지면 퇴근 버튼 자체가 차단됨.

### 해결: 원격퇴근 플로우

```
퇴근 버튼 탭
  └── 반경 100m 초과 감지
        └── 원격퇴근 바텀시트 표시
              ├── 현재 위치 좌표 기록 (user_lat, user_lng)
              ├── 매장까지 거리 기록 (distance_m)
              ├── 사유 입력 (필수, 비어있으면 제출 불가)
              └── 제출 → attendance_type='remote_out', check_out_store_id=null
```

### 어드민 화면

- 퇴근 카드에 `📍 원격퇴근` 뱃지 표시
- 사유 텍스트 표시
- 퇴근 거리 표시 (예: `퇴근 342m`)

### 알림

```
title: "📍 원격퇴근 알림"
content: "{이름}님이 {매장명}에서 {거리}m 거리에서 원격퇴근했어요"
type: "attendance_remote_out"
target_role: "admin"
```

---

## Epic G — 출장출근 / 출장퇴근

### 문제

출장 직원은 매장 반경 밖에서 출근 자체가 불가능했음.

### 해결: 출장출근 플로우

```
출근 버튼 탭
  └── 반경 100m 초과 감지
        └── ConfirmDialog 표시: "출장 중이신가요?"
              ├── 확인 → attendance_type='business_trip_in', check_in_store_id=null
              └── 취소 → 아무것도 안 함
```

### 해결: 출장퇴근 플로우

```
퇴근 버튼 탭 (lastLog.attendance_type === 'business_trip_in')
  └── 반경 초과 → 원격퇴근 폼 (동일 UI)
        └── 사유 자동입력: "출장" (읽기 전용)
        └── 제출 → attendance_type='business_trip_out'
```

### 어드민 화면

- `✈️ 출장출근` / `✈️ 출장퇴근` 뱃지 표시
- 출장중 상태에서 직원 카드에 `✈️ 출장중` 표시

### 알림

```
출장출근: title "✈️ 출장출근 알림" / type "attendance_business_trip_in"
출장퇴근: title "✈️ 출장퇴근 알림" / type "attendance_business_trip_out"
```

---

## 변경 파일 목록

| 파일 | 변경 유형 |
|------|----------|
| `docs/migrations/003_attendance_logs_store_split.sql` | 신규 생성 |
| `src/components/AttendanceCard.tsx` | 전면 재작성 |
| `src/app/page.tsx` | attendance_type lastLog 포함 |
| `src/app/admin/attendance/page.tsx` | 거리/뱃지/사유 표시 |
| `docs/schema.md` | attendance_logs 스키마 갱신 |

---

## DB 적용 방법

Supabase Dashboard → SQL Editor에서 아래 파일 내용 실행:

```
docs/migrations/003_attendance_logs_store_split.sql
```

---

## 빌드 결과

```
✓ npx tsc --noEmit → 타입 오류: 0건
```
