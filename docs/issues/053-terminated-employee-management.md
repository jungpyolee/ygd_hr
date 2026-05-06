# 053 — 퇴사자 관리 (Lite Plan)

## 배경

현재 `profiles` 테이블에는 퇴사 상태를 나타내는 컬럼이 없다.
퇴사한 직원이 발생해도 어드민의 모든 메뉴(직원 관리, 스케줄, 공지 대상, 통계, 보건증 체크 등)에서 계속 노출되며, 알림(인앱/푸시) 또한 발송된다.

소규모 매장 환경에서 보안 차단(RLS·미들웨어 강제 차단)까지는 과한 변경 범위라고 판단해, **"어드민 메뉴에서 안 보이게" + "알림 미발송"** 두 가지를 핵심 목표로 잡는 최소 영향 플랜으로 진행한다.

## 설계 요약

### DB
- `profiles.terminated_at timestamptz` 추가 (`NULL` = 재직중)
- `profiles.termination_reason text` (선택 입력)
- `profiles.terminated_by uuid` (감사 추적, FK → profiles.id)
- 활성 직원 조회 최적화용 partial index

### 코드
- 공통 헬퍼 `src/lib/profiles-query.ts` 신설 → `activeProfiles(sb)`
- 어드민/공통의 **목록형 직원 조회**에 활성 필터 적용
  - 본인 단건 조회(`eq("id", user.id)`)는 제외
  - 급여 정산은 퇴사월 처리를 위해 그대로 유지
- 알림 발송 진입점 3곳에 활성 필터 적용
  - `src/lib/push-server.ts` `sendPushToRole`
  - `src/lib/announcement-targets.ts` `getTargetProfileIds`
  - `src/components/announcement/AnnouncementForm.tsx` 발송 직접 쿼리

### UI (어드민 직원 페이지)
- 상단 "재직 / 퇴사" 토글 추가
- 직원 카드에 퇴사 배지 + 회색톤
- 상세 모달에 "퇴사 처리하기" / "복귀시키기" 버튼 (커스텀 다이얼로그)

### 의도적 제외
- 미들웨어 인증 차단 (퇴사자가 자발적으로 사용 안 함)
- `auth.users.banned_until` 처리
- RLS 정책 변경 (`attendance_logs` INSERT 차단 등)
- Realtime 구독 차단 (어차피 알림 발송이 차단됨)
- `employee_status_changes` 감사 테이블

→ 향후 보안 강화 필요해지면 추가만 하면 됨.

## 변경 파일

### 신규
- `docs/migrations/057_add_profiles_terminated_at.sql`
- `docs/db-issues/057-profiles-terminated-at.md`
- `src/lib/profiles-query.ts`

### 수정
- `src/app/admin/employees/page.tsx` — 토글 + 퇴사/복귀 다이얼로그 + 카드 배지
- `src/app/admin/layout.tsx` — 보건증 만료 체크 활성 필터
- `src/app/admin/page.tsx` — 어드민 대시보드 직원 수 활성 필터
- `src/app/admin/calendar/page.tsx` — 스케줄 작성 시 직원 목록 활성 필터
- `src/app/admin/schedules/substitutes/page.tsx` — 대타 매칭 직원 목록 활성 필터
- `src/app/admin/stats/page.tsx` — 통계 직원 목록 활성 필터
- `src/components/announcement/AnnouncementForm.tsx` — 대상 선정 활성 필터
- `src/lib/announcement-targets.ts` — 대상 선정 활성 필터
- `src/lib/push-server.ts` — 역할별 발송 활성 필터
- `docs/schema.md` — profiles 컬럼 갱신

## 결과 (2026-05-06)

### 작업 내역
- 마이그레이션 057 작성 + Dev DB 적용 완료 (terminated_at, termination_reason, terminated_by + partial index)
- `src/lib/profiles-query.ts` 헬퍼 신설
- 직원 목록형 조회 5곳에 활성 필터 적용
  - admin/calendar (스케줄 작성)
  - admin/schedules/substitutes (대타 매칭)
  - admin/stats (통계)
  - admin/layout (보건증 만료 체크)
  - admin/page (대시보드 직원 수)
- 알림 발송 진입점 4곳에 활성 필터 적용
  - announcement-targets / AnnouncementForm (공지 대상)
  - push-server `sendPushToProfile` / `sendPushToRole` (푸시)
  - notifications `createNotification` (인앱 + 푸시)
- admin/employees UI
  - 재직/퇴사 탭 토글
  - 카드 회색톤 + 퇴사 배지
  - 모달 상단 퇴사 정보 배너
  - "퇴사 처리하기" 모달 (사유 선택 입력)
  - "재직 상태로 되돌리기" 다이얼로그
- schema.md profiles 컬럼 갱신

### 의도적 제외
- 미들웨어 인증 차단 / Auth ban — 향후 필요 시 추가
- RLS 정책 변경 — 향후 필요 시 추가
- 미래 스케줄/배정 자동 정리 — 어드민이 직원 관리에서 수동 정리
- 급여 정산 페이지 필터 — 퇴사월 정산 처리를 위해 그대로 유지
- 게임 랭킹 필터 — 점수 이력 보존

### 빌드
- `npm run build` 통과 (재설치 후)

### Production 반영
미적용. dev→main 배포 시 마이그레이션 057 실행 필요.
