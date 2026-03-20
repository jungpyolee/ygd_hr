# [FEAT-026] 위치 실패 시 매장 수동 선택 Fallback 플로우

| 항목 | 내용 |
|------|------|
| 유형 | 기능 추가 |
| 상태 | ✅ 완료 |
| 파일 | `src/components/StoreSelectorSheet.tsx` (신규), `src/components/AttendanceCard.tsx`, `src/lib/notifications.ts`, `src/app/admin/attendance/page.tsx` |
| 발견일 | 2026-03-20 |
| 완료일 | 2026-03-20 |

## 배경

메인화면 진입 시 GPS 위치 로딩 실패가 간헐적으로 발생.
이때 출퇴근 버튼을 누르면 GPS 재시도 → 재시도 실패 → 토스트 에러로 종료되어
사용자가 출퇴근 자체를 못 하는 상황이 생김.

## 원인 분석

`handleAttendance`, `runCheckoutFlow`, `handlePermissionConfirm` 세 곳에서
GPS 최종 실패 시 `toast.error()`로 흐름을 종료하고 있었음.
위치 정보가 없어도 매장 선택으로 출퇴근을 완료할 수 있는 fallback이 없었음.

## 수정 내용

### 신규 컴포넌트 — `StoreSelectorSheet.tsx`
- 바텀시트 형태의 매장 선택 UI
- 라디오 스타일로 매장 선택, 확인/취소 버튼
- `type: "IN" | "OUT"` prop으로 출근/퇴근 문구 구분

### `AttendanceCard.tsx`
- 상태 추가: `showStoreSelector`, `storeSelectorType`
- `openStoreFallback(type)`: GPS 최종 실패 시 진입 헬퍼
- `handleStoreFallbackSelect(store)`: 매장 선택 완료 시 `processAttendance()` 호출
  - `lat/lng`: 선택한 매장 좌표 사용
  - `distanceM`: 0 (수동 선택 식별자)
  - `attendanceType`: `"fallback_in"` / `"fallback_out"`
- 기존 토스트 종료 3곳 → `openStoreFallback()` 진입으로 교체
  - `handleAttendance` GPS 재시도 실패
  - `runCheckoutFlow` GPS 재시도 실패
  - `handlePermissionConfirm` 권한 안내 후에도 실패

### `notifications.ts`
- `NotificationType`에 `"attendance_fallback_in"`, `"attendance_fallback_out"` 추가
- fallback 알림 제목: "⚠️ 수동 출근/퇴근 알림" — 관리자가 식별 가능

### `admin/attendance/page.tsx`
- `attendance_type_in === "fallback_in"` → "⚠️ 수동출근" 보라색 뱃지
- `attendance_type_out === "fallback_out"` → "⚠️ 수동퇴근" 보라색 뱃지

## DB 변경 사항

없음. `attendance_type`은 `text` 컬럼이므로 신규 값 `"fallback_in"`, `"fallback_out"` 즉시 사용 가능.

## 결과

빌드 통과 ✅
