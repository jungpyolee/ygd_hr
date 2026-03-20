# [BUG-025] P0 Critical 버그 수정

| 항목 | 내용 |
|------|------|
| 유형 | 버그 수정 |
| 상태 | ✅ 완료 |
| 파일 | `src/lib/notifications.ts`, `src/components/AttendanceCard.tsx`, `src/app/page.tsx`, `src/lib/hooks/useGeolocation.ts` |
| 발견일 | 2026-03-20 |
| 완료일 | 2026-03-20 |

## 배경

전체 코드베이스 분석에서 발견된 P0 등급 Critical 버그 4건.

## 원인 분석

### P0-1: notifications.ts — type 파라미터 타입 미지정
`sendNotification()`의 `type` 파라미터가 `string`으로 선언되어 있어 잘못된 알림 타입 값이 DB에 삽입될 수 있음.
또한 에러를 반환하지 않아 호출부에서 발송 실패 여부를 알 수 없음.

### P0-2: AttendanceCard.tsx — sendNotification 에러 미처리
출퇴근 기록 성공 후 `sendNotification()` 호출 시 에러가 발생해도 사용자에게 알려지지 않음.
관리자 알림이 조용히 누락될 수 있음.

### P0-3: page.tsx — Realtime 구독 에러 핸들러 없음
홈 화면의 알림 실시간 구독에 `.subscribe()` 콜백이 없어 구독 실패 시 자동 갱신이 중단되는데 사용자/개발자 모두 인지 불가.

### P0-4: useGeolocation.ts — inFlightRef 조기 무효화 경쟁 조건
성공/실패 콜백에서 `inFlightRef.current = null`을 무조건 실행하므로, `retry()`나 `handlePermChange`가 새 요청을 시작한 후에도 이전 요청의 콜백이 ref를 null로 덮어씀.
결과적으로 중복 요청이 동시에 실행될 수 있음.

## 수정 내용

### P0-1: notifications.ts
- `NotificationType` union type 정의 및 적용
- `{ error }` 반환으로 호출부에서 에러 핸들링 가능하게 변경

### P0-2: AttendanceCard.tsx
- `sendNotification()` 결과의 `error`를 확인
- 발송 실패 시 콘솔 에러 기록 (사용자 플로우는 차단하지 않음 — 출퇴근 자체는 성공했으므로)

### P0-3: page.tsx
- `.subscribe()` 콜백 추가하여 `CHANNEL_ERROR` / `TIMED_OUT` 상태 기록

### P0-4: useGeolocation.ts
- 콜백에서 `inFlightRef.current === p` 일 때만 null로 초기화 (stale closure 방지)

## 결과

- 빌드 통과 ✅
- `NotificationType` union 타입 적용으로 잘못된 type 값 컴파일 타임에 차단
- 기존 사용처(`health_cert_expiry`, `document_upload`, `profile_update`, `onboarding`, `substitute_requested`, `schedule_published`) 모두 타입에 추가
- `sendNotification()` 이제 `{ error }` 반환 — AttendanceCard에서 에러 발생 시 콘솔 기록
- Realtime 구독 `.subscribe()` 콜백 추가로 채널 에러 가시성 확보
- `useGeolocation` inFlightRef 조기 무효화 수정 — `p === inFlightRef.current` 체크로 stale 콜백이 새 요청 ref를 덮어쓰는 문제 해결

