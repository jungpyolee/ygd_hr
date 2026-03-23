# 035 — 통합 캘린더 재설계

## 배경
어드민에서 스케쥴 관리(`/admin/schedules`)와 근태 관리(`/admin/attendance`)가 분리되어
개념 혼재 + 관리 피로도 증가. 직원 측도 `/schedule`, `/attendances` 별도 분리.

## 목표
1. **어드민**: `/admin/calendar` — 스케쥴 + 근태 + 회사일정 통합 (조회/수정 모드)
2. **직원**: `/calendar` — 내 스케쥴 + 내 근태 + 팀 스케쥴 + 회사일정 통합
3. **회사 일정**: `company_events` 테이블 신설, 어드민 CRUD

## DB 변경 (migration 035)
- `company_events` 테이블 신설 (이하 참조)
- `schedule_slots` RLS에 `employee_view_confirmed_team_slots` 정책 추가
  - 기존: 본인 슬롯만 SELECT
  - 신규: 확정된 주의 모든 슬롯 SELECT (팀 캘린더 지원)

### Dev DB 적용 방법 (API 타임아웃 시 수동 적용)
```
Supabase Dashboard > aayedfstvegiswgjwcuw > SQL Editor
docs/migrations/035_company_events.sql 내용 실행
```

## 설계 결정
- **초안/확정 UI 제거**: 수정 모드 저장 → 자동 confirmed + 직원 알림
- **immediate save**: 수정 모드에서 변경사항은 즉시 DB 저장, 저장하기 버튼 = 확정+알림 발송
- **직원 팀뷰**: 같은 근무지 전원 표시 (RLS 정책 추가로 가능)
- **회사 일정 색상**: 어드민이 preset 6색 중 선택

## 관련 파일
- `docs/migrations/035_company_events.sql`
- `src/app/admin/calendar/page.tsx` (신규)
- `src/app/admin/calendar/events/page.tsx` (신규)
- `src/app/calendar/page.tsx` (신규)
- `src/app/admin/layout.tsx` (수정 — 메뉴 추가)

## 데이터 정합성 보장
- 기존 `schedule_slots`, `weekly_schedules`, `attendance_logs` 스키마 무변경
- 기존 `/admin/schedules`, `/admin/attendance`, `/schedule`, `/attendances` 유지 (점진적 제거 예정)
- 새 어드민 캘린더 저장 → `weekly_schedules.status = 'confirmed'` (기존 직원 `/schedule` 호환 유지)

## Dev DB 마이그레이션 수동 적용 필요

Dev DB API (aayedfstvegiswgjwcuw)가 Management API를 통해 접근 불가 (연결 타임아웃).
Supabase Dashboard에서 직접 실행 필요:

1. Supabase Dashboard → 프로젝트 `aayedfstvegiswgjwcuw` → SQL Editor
2. `docs/migrations/035_company_events.sql` 내용 붙여넣기 후 실행

## 결과
- [x] `docs/migrations/035_company_events.sql` 작성
- [x] `/admin/calendar` 어드민 통합 캘린더 (조회/수정 모드, 월/주 뷰)
- [x] `/admin/calendar/events` 회사 일정 CRUD
- [x] `/calendar` 직원 통합 캘린더 (4레이어)
- [x] 어드민 사이드바에 "통합 캘린더" 메뉴 추가
- [x] 직원 홈에 캘린더 진입점 추가
- [x] 빌드 통과 (30개 페이지)
- [ ] Dev DB migration 수동 적용 필요
