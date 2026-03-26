# 알림 시스템 정리

> 최종 업데이트: 2026-03-26

---

## 개요

- **인앱 알림**: `notifications` 테이블 INSERT → Supabase Realtime 구독으로 실시간 표시
- **Web Push**: VAPID 기반 OS 레벨 푸시 알림 (백그라운드에서도 수신)
- **중앙 함수**: 모든 알림은 `createNotification()` (`src/lib/notifications.ts`)을 통해 생성
- **DB 트리거 알림**: 없음 (모두 코드에서 생성)

---

## 어드민이 받는 알림

| 상황 | 타입 | 제목 | 내용 예시 | 코드 위치 |
|------|------|------|----------|-----------|
| 직원 일반 출근 | `attendance_in` | ☀️ 출근 알림 | `홍길동님이 연경당으로 출근했어요` | `AttendanceCard.tsx:300` |
| 직원 일반 퇴근 | `attendance_out` | 🌙 퇴근 알림 | `홍길동님이 연경당에서 퇴근했어요` | `AttendanceCard.tsx:300` |
| 직원 원격 퇴근 | `attendance_remote_out` | 📍 원격퇴근 알림 | `홍길동님이 150m 거리에서 원격 퇴근했어요` | `AttendanceCard.tsx:305` |
| 직원 출장 출근 | `attendance_business_trip_in` | ✈️ 출장 출근 알림 | `홍길동님이 출장 출근했어요` | `AttendanceCard.tsx:312` |
| 직원 출장 퇴근 | `attendance_business_trip_out` | ✈️ 출장 퇴근 알림 | `홍길동님이 출장 퇴근했어요` | `AttendanceCard.tsx:316` |
| 직원 수동 출근 (GPS 실패) | `attendance_fallback_in` | ⚠️ 수동 출근 알림 | `홍길동님이 위치 확인 실패로 연경당을 직접 선택해 출근했어요` | `AttendanceCard.tsx:293` |
| 직원 수동 퇴근 (GPS 실패) | `attendance_fallback_out` | ⚠️ 수동 퇴근 알림 | `홍길동님이 위치 확인 실패로 연경당을 직접 선택해 퇴근했어요` | `AttendanceCard.tsx:293` |
| 신규 직원 온보딩 완료 | `onboarding` | 🎉 새 직원 등록 | `홍길동님이 온보딩을 완료하고 프로필을 등록했습니다.` | `OnboardingFunnel.tsx:100` |
| 직원 정보 수정 | `profile_update` | 📝 정보 수정 알림 | `홍길동님이 연락처와 계좌번호 정보를 수정했어요.` | `MyInfoModal.tsx:156` |
| 서류(보건증) 업로드 | `document_upload` | 📝 서류 업로드 알림 | `홍길동님이 보건증 사본을 업로드했어요.` | `MyInfoModal.tsx:67` |
| 보건증 만료 임박 (30일 내) | `health_cert_expiry` | 보건증 만료 임박 | `홍길동님의 보건증이 15일 후 만료돼요. 갱신을 안내해 주세요.` | `admin/layout.tsx:170` |

### 어드민 알림 클릭 시 이동 경로

| 타입 | 이동 경로 |
|------|-----------|
| `onboarding`, `profile_update`, `document_upload`, `health_cert_expiry` | `/admin/employees` |
| `attendance_*` 전체 | `/admin/attendance` |

---

## 직원이 받는 알림

| 상황 | 타입 | 제목 | 내용 예시 | 코드 위치 |
|------|------|------|----------|-----------|
| 어드민이 수동 퇴근 처리 | `attendance_fallback_out` | 퇴근 처리 완료 | `관리자가 퇴근 처리했어요` | `admin/stats/page.tsx:310`, `admin/attendance/page.tsx:308`, `admin/calendar/page.tsx:397,854` |
| 근무 추가됨 | `schedule_updated` | 스케줄이 업데이트됐어요 | `근무가 추가됐어요 (3/26 09:00~18:00)` | `admin/calendar/page.tsx:1439` |
| 근무 수정됨 | `schedule_updated` | 스케줄이 업데이트됐어요 | `근무가 변경됐어요 (3/26 09:00~18:00)` | `admin/calendar/page.tsx:1464` |
| 근무 삭제됨 | `schedule_updated` | 스케줄이 업데이트됐어요 | `근무가 삭제됐어요 (3/26)` | `admin/calendar/page.tsx:1490` |
| 주간 스케줄 복사 확정 | `schedule_updated` | 스케줄이 업데이트됐어요 | `이번 주 근무가 배정됐어요. 캘린더에서 확인해보세요.` | `admin/calendar/page.tsx:1560` |
| 내 레시피에 댓글 달림 | `recipe_comment` | 레시피에 새 댓글이 달렸어요 | `홍길동님: 맛있어 보여요!` | `RecipeComments.tsx:301` |
| 내 댓글에 대댓글 달림 | `recipe_reply` | 홍길동님이 답글을 달았어요 | `감사합니다~` | `RecipeComments.tsx:341` |
| 댓글에서 @멘션됨 | `recipe_mention` | 홍길동님이 회원님을 언급했어요 | `@김철수 이거 한번 해볼래요?` | `RecipeComments.tsx:352` |

### 직원 알림 클릭 시 이동 경로

| 타입 | 이동 경로 |
|------|-----------|
| `schedule_updated` | `/calendar` |
| `recipe_comment`, `recipe_reply`, `recipe_mention` | `/recipes/{레시피ID}` |
| `attendance_fallback_out` (수동퇴근 처리) | `/` |

---

## 정의되었지만 미사용 중인 타입

| 타입 | 설명 | 비고 |
|------|------|------|
| `substitute_requested` | 대타 요청 | 대타 기능 미구현 |
| `substitute_approved` | 대타 승인 | 대타 기능 미구현 |
| `substitute_rejected` | 대타 거절 | 대타 기능 미구현 |
| `substitute_filled` | 대타 완료 | 대타 기능 미구현 |
| `schedule_published` | 스케줄 발행 | 미사용 |
| `announcement` | 공지사항 | 공지 기능 미구현 |
| `overtime_approved` | 추가근무 인정 | 미사용 |
| `overtime_cancelled` | 추가근무 취소 | 미사용 |

---

## 보건증 만료 알림 자동 체크 로직

- **위치**: `src/app/admin/layout.tsx` (`checkHealthCertExpiry()`)
- **실행 시점**: 어드민 레이아웃 렌더링 시 (useEffect)
- **조건**: 보건증 만료일이 30일 이내인 직원
- **중복 방지**: 당일 이미 같은 직원에 대해 `health_cert_expiry` 알림이 있으면 스킵

---

## Web Push 발송 조건

1. `push_preferences.enabled = true` (유저가 푸시 활성화)
2. `push_preferences.type_settings[해당타입] !== false` (타입별 수신 허용)
3. `push_subscriptions`에 구독 정보 존재
4. Dev 환경에서는 푸시 발송 스킵

---

## 핵심 파일 목록

| 파일 | 역할 |
|------|------|
| `src/lib/notifications.ts` | `createNotification()` 중앙 함수, NotificationType 정의 |
| `src/lib/push-server.ts` | Web Push 발송 (`sendPushToProfile`, `sendPushToRole`) |
| `src/lib/notificationUrls.ts` | 알림 클릭 시 이동 URL 라우팅 |
| `src/components/AttendanceCard.tsx` | 출퇴근 알림 생성 |
| `src/components/OnboardingFunnel.tsx` | 온보딩 완료 알림 |
| `src/components/MyInfoModal.tsx` | 정보 수정 / 서류 업로드 알림 |
| `src/components/recipe/RecipeComments.tsx` | 레시피 댓글/대댓글/멘션 알림 |
| `src/app/admin/layout.tsx` | 보건증 만료 자동 체크 |
| `src/app/admin/calendar/page.tsx` | 스케줄 변경 알림 + 수동 퇴근 처리 알림 |
| `src/app/admin/stats/page.tsx` | 수동 퇴근 처리 알림 |
| `src/app/admin/attendance/page.tsx` | 수동 퇴근 처리 알림 |
