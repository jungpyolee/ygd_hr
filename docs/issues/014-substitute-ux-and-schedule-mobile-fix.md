# [BUG/FEAT-014] 대체근무 UX + 스케줄 관리 모바일 UI 개선

| 항목 | 내용 |
|------|------|
| 유형 | 버그 수정 + 기능 개선 |
| 상태 | ✅ 완료 |
| 파일 | `src/app/schedule/page.tsx`, `src/app/admin/layout.tsx`, `src/app/admin/schedules/page.tsx` |
| 발견일 | 2026-03-18 |
| 완료일 | 2026-03-18 |

---

## 수정 항목

### 이슈 1 — 어드민 대체근무 확정 알림 누락
**원인**: `handleAcceptSubstitute`가 요청자(직원)에게만 알림 발송, 어드민에게 미발송.
**수정**: `Promise.all`로 요청자 + 어드민 동시 알림 발송. 내용에 날짜/장소/시간/포지션/수락자 이름 포함.

### 이슈 2 — 대체근무 관리 pending 카운트 뱃지 미갱신
**원인**: `admin/layout.tsx`가 `substitute_requests` 테이블 변경을 구독하지 않아 승인/반려 후 카운트가 유지됨.
**수정**: `substitute_requests` INSERT/UPDATE realtime 채널 추가. `substitute_filled` 알림 수신 시 카운트 갱신.

### 이슈 3 — 대체근무 목록 페칭 느림
**원인**: 모든 `approved` 요청을 로드 후 클라이언트에서 `eligible_profile_ids.includes(profileId)` 필터링.
**수정**: DB 레벨에서 `.contains("eligible_profile_ids", [profileId])` 필터 적용.

### 이슈 4 — 대체근무 카드에 위치/시간 미표시 (물결만 나옴)
**원인**: `schedule_slots!slot_id` JOIN이 RLS 정책 때문에 null 반환 (`schedule_slots`를 타 직원 FK를 통해 읽을 권한 없음).
**수정**: JOIN 방식 제거 → `substitute_requests` 조회 후 `schedule_slots`, `profiles` 를 별도 IN 쿼리로 직접 조회 (3단계 병렬 구조).

### 이슈 5 — 대체근무 섹션 UX 오해 유발 ("나에게 온 대타 요청")
**원인**: 기존 문구가 "누군가 나에게 대타를 요청했다"는 뉘앙스로 오인 가능.
**실제 흐름**: A가 결근 요청 → 어드민 승인 → 후보자들에게 "빈 자리가 있다"고 알림.
**수정**:
- 섹션 제목: "나에게 온 대타 요청" → "대체 근무 자리"
- 안내 문구 추가: "빠진 자리를 채울 수 있어요. 확인해보세요."
- 카드: "확인하기" → "지원 가능" 뱃지 + 전체 클릭 가능
- 바텀시트: "대타 요청 확인" → "대체 근무 지원", "수락하기" → "지원하기"

### 이슈 6 — 스케줄 관리 모바일 UI 날짜 핸들러 위치 불일치 + 툴바 줄바꿈
**원인 1**: 주간 탭 날짜 네비게이터는 탭 스위처 위, 일간 탭 날짜 네비게이터는 `renderDailyView()` 내부(아래).
**수정 1**: 공통 날짜 네비게이터를 탭 스위처 위에 통합. 주간/일간 상태에 따라 동작 분기.
**원인 2**: "이전 주 복사", "기본 패턴으로 채우기" 버튼 텍스트가 길어 모바일에서 2줄로 줄바꿈.
**수정 2**: `hidden sm:inline`으로 텍스트 숨기고 모바일에서 아이콘만 표시. `title` 속성으로 툴팁 제공.

### 이슈 7 — 주간/일간 표 좌우 스크롤 시 직원명 사라짐
**수정**:
- **주간 그리드**: 직원명 `<th>`, `<td>`에 `sticky left-0 z-10/z-20 bg-white border-r` 적용
- **일간 타임라인**: 직원명 div에 `sticky left-0 z-10 bg-white border-r` 적용, 인원 행도 동일. 헤더 placeholder도 sticky 처리.
- 일간 뷰 컨테이너를 `rounded-[20px] border` 카드 스타일로 통일.
