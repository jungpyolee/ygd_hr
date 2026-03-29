# 050 — 근태 시스템 구조 개선

## 배경
3월 적응기간 동안 직원들이 출퇴근 버튼을 깜빡하거나 늦게 누르는 경우가 빈번했다. 직원이 제대로 안 찍으면 관리자가 하나하나 수동으로 확인해줘야 하는 구조적 문제가 있었다.

## 변경사항

### Phase 1: 크레딧 시스템 완전 제거
- `attendance_credits` 테이블, `sync_credit_score()` 트리거, profiles 크레딧 관련 컬럼 삭제
- vercel.json 죽은 cron (`/api/cron/daily-settlement`) 제거
- 마이그레이션: `044_remove_credit_system.sql`

### Phase 2: 출퇴근 미체크 푸시 알림
- pg_cron + pg_net으로 매 10분(KST 07~21시) 스케줄 시작/종료 시간 경과 후 미체크 직원에게 알림 발송
- Vercel Hobby 플랜 cron 제한(1일 1회) 대안으로 Supabase pg_cron 활용
- 알림 타입: `checkin_reminder`, `checkout_reminder`
- 직원 설정에서 근태 리마인더 ON/OFF 가능
- API Route: `src/app/api/cron/attendance-reminder/route.ts` (시간대 처리 `Intl.DateTimeFormat` 통일)
- 마이그레이션: `047_attendance_reminder_cron.sql`

### Phase 3: 근태 조정 신청 기능
- `attendance_adjustments` 테이블 신설 (직원 신청 → 관리자 승인/반려)
- 상태: `pending`, `approved`, `rejected`, `dismissed`
- 감지 조건 (4월부터 적용):
  - 출근 지연 (스케줄 시작 +10분 이상)
  - 조기 퇴근 (스케줄 종료 -10분 이상)
  - 출근 미체크 (IN 기록 없음)
  - 퇴근 미체크 (IN만 있고 OUT 없음)
- 한 날짜에 복수 이슈 동시 감지 → 일괄 신청
- **"문제 없어요" 기능**: 지각/조퇴가 실제 맞으면 dismiss 처리 (관리자 알림 없음)
  - dismissable: `late_checkin`, `early_checkout`
  - 필수 신청: `missed_checkin`, `missed_checkout`
- **반려 후 재신청**: upsert로 rejected row를 pending으로 덮어쓰기
- **승인 시 근무시간 반영**:
  - `missed_checkin` approved → 출근일수+1, 스케줄 시간 인정
  - 관리자 통합 스케줄에서 결근→출근 전환, 지각→정상 전환
- 관리자 페이지: 스케줄 vs 실제 vs 요청 시각 3열 비교, 시간 차이 표시, 매장명, 신청/처리 시각
- 알림 타입: `adjustment_requested`, `adjustment_approved`, `adjustment_rejected`
- 마이그레이션: `045_attendance_adjustments.sql`, `048_adjustment_dismissed_status.sql`

### Phase 4: 빠른 연속 출퇴근 방지
- `prevent_duplicate_attendance()` 트리거에 60초 최소 간격 추가
- **당일(KST) 기준**으로 중복 체크 (전날 OUT 없이 다음 날 IN 허용)
- 관리자 수동 처리(reason 있는 경우) 면제
- 프론트엔드 60초 쿨다운 + 쿨다운 중 탭 시 토스트 안내
- 마이그레이션: `046_attendance_min_interval.sql`, `049_fix_duplicate_attendance_today_only.sql`

### Phase 5: 관리자 사이드바 메뉴 추가
- "근태 조정" 메뉴 항목 추가 (ClipboardEdit 아이콘)

### Phase 6: 이용가이드 & 업데이트 내역
- v1.1.0 업데이트: 근태 조정 신청, 출퇴근 리마인더, 빠른 클릭 방지
- 이용가이드 "근태 조정 신청" 섹션 신설 (예시 UI 포함)
- 가이드 버전 3파일 동시 업데이트 (guide, my, BottomNav)

### 기타 수정
- 관리자 통합 스케줄 DaySheet `<button>` 중첩 에러 해결 (`<div>` + 이벤트 전파 분기)
- vercel.json에서 cron 제거 (pg_cron으로 대체)
- Vercel 환경변수 `CRON_SECRET` 설정

## 엣지케이스 처리
1. 반려 후 재신청 → upsert로 rejected row 덮어쓰기
2. 같은 날 복수 건 일부만 처리 → 심사 중 + 신청하기 동시 표시 가능
3. 전날 퇴근 미체크 후 다음 날 출근 → 트리거 당일 기준으로 허용

## 테스트 결과 (Dev DB)
- 조정 CRUD: UNIQUE 제약, CHECK 제약, NOT NULL 모두 정상
- 반려 후 upsert 재신청: pending 복원, 사유/시각 갱신, reject_reason 초기화
- 트리거: IN→IN 차단, 60초 쿨다운, reason 면제 모두 정상
- updated_at 자동 갱신 정상

## 결과
- 빌드 통과 확인
- Dev DB 마이그레이션 044~049 실행 완료
