# [FEAT-036] 대타 수락 시 겹치는 슬롯 병합 처리

| 항목 | 내용 |
|------|------|
| 유형 | 기능 추가 |
| 상태 | ✅ 완료 |
| 파일 | `src/app/schedule/page.tsx`, `docs/migrations/025_accept_substitute_merge_overlap.sql` |
| 발견일 | 2026-03-21 |
| 완료일 | 2026-03-21 |

## 배경

대타 수락 시 수락자에게 같은 날 겹치거나 맞닿는 근무가 있으면 무조건 거부하는 구조였다.
예) 신서연 3/28 15~20 대타 → 김준휘가 수락하려는데 김준휘에게 3/28 10~16 근무가 이미 있어 차단됨.
같은 근무지·포지션이면 실질적으로 이어지는 근무이므로 병합 처리가 필요하다.

## 원인 분석

- 클라이언트(`handleAcceptSubstitute`): 겹침 감지 시 무조건 에러 토스트 후 중단
- DB RPC(`accept_substitute`): 신규 슬롯 INSERT 시 `no_overlapping_slots` EXCLUSION CONSTRAINT에 의해 차단

## 수정 내용

### 마이그레이션 025 — `accept_substitute` RPC 업데이트

- **반환 타입**: `VOID` → `JSONB` (`mode: 'filled' | 'merged'`, `merged_start`, `merged_end`)
- **병합 로직** (step 6 교체):
  1. 수락자의 같은 날 겹치거나 맞닿는(`<=` 등호 포함) active 슬롯 탐색
  2. 병합 가능 조건 검사:
     - 같은 `work_location`
     - 포지션 없는 근무지(factory, catering): `cafe_positions` 둘 다 NULL이면 OK
     - 포지션 있는 근무지(cafe): 배열 원소 완전 일치(`<@` 양방향)
  3. 조건 충족 → 기존 슬롯 `start_time`/`end_time` 확장 UPDATE (INSERT 없음 → 제약 충돌 없음)
  4. 조건 불충족 → `OVERLAP_DIFFERENT_LOCATION_OR_POSITION` 예외
  5. 겹치는 슬롯 없음 → 기존 INSERT (변경 없음)

### 클라이언트 `handleAcceptSubstitute` 수정

- `select` 쿼리에 `work_location`, `cafe_positions` 추가
- 겹침 감지 기준을 `<` → `<=` 변경 (맞닿음도 포함)
- 겹치는 슬롯 발견 시:
  - 병합 가능 조건 클라이언트에서도 사전 검사 → 불가 시 명확한 에러 토스트
  - 가능 시 그대로 RPC 호출 (병합은 서버에서 원자적으로 처리)
- RPC 결과 처리:
  - `mode === 'merged'` → "근무가 합쳐졌어요 (HH:MM~HH:MM으로 변경됐어요)" 토스트
  - `mode === 'filled'` → 기존 "대타를 수락했어요" 토스트

## 결과

| 케이스 | 처리 결과 |
|--------|---------|
| 10~16 + 15~20 (겹침, 같은 위치/포지션) | 10~20으로 병합 ✅ |
| 10~15 + 15~20 (맞닿음, 같은 위치/포지션) | 10~20으로 병합 ✅ |
| 10~14 + 15~20 (1시간 간격) | 겹침 없음 → 신규 슬롯 INSERT ✅ |
| 겹침 있으나 다른 work_location | 에러 토스트 ✅ |
| 겹침 있으나 같은 cafe지만 다른 포지션 | 에러 토스트 ✅ |
| factory/catering (positions NULL) 겹침 | 위치만 같으면 병합 ✅ |
