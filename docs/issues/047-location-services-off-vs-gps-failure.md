# 047 — 위치 서비스 꺼짐 vs GPS 불량 분기 처리

## 배경

출근 버튼 탭 시 위치 오류가 발생하면 두 가지 케이스로 분기해야 한다.
- **위치 서비스 꺼짐** (시스템 차단): 설정 안내 → 수동 선택 허용 안 함
- **GPS 불량/타임아웃**: retry → 수동 선택 fallback 허용

## 원인

iOS에서 기기 위치 서비스를 완전히 끄면 `getCurrentPosition`이 `PERMISSION_DENIED (code 1)`이 아닌 **`POSITION_UNAVAILABLE (code 2)`** 를 반환한다.

기존 코드는 `code 2`를 무조건 GPS 불량으로 처리 → `unavailable` → StoreSelectorSheet 표시.

따라서 위치 서비스를 꺼도 수동 선택으로 출근할 수 있는 문제가 있었다.

## 수정 내용

`useGeolocation.ts` 에러 콜백에서 `code 2` 수신 시 `navigator.permissions.query({ name: 'geolocation' })` 로 실제 권한 상태를 추가 확인:

| permissions 상태 | 반환 status | 이후 동작 |
|-----------------|------------|----------|
| `denied` | `"denied"` | LocationPermissionGuide 표시, 수동 선택 차단 |
| `granted` / `prompt` | `"unavailable"` | retry → StoreSelectorSheet |
| permissions API 미지원 | `"unavailable"` | 기존 동작 유지 (안전 fallback) |

`doFetch`, `fetchForAttendance` 두 곳 모두 동일하게 적용.

## 결과

- [x] 빌드 통과
