# DB-010 — 근무지·포지션 DB 기반 관리

## 배경

`work_location`(`cafe`/`factory`/`catering`)과 포지션(`hall`/`kitchen`/`showroom`) 값이
코드 전체 16개 파일에 하드코딩되어 있었음.
새 근무지나 포지션이 추가될 때마다 코드를 수정하고 배포해야 하는 확장성 문제.

## 원인

초기 설계 시 근무지가 3개로 고정될 것으로 예상하여 DB 테이블 없이 상수로 관리.
`stores` 테이블은 GPS 출퇴근용으로만 사용했고, 근무지 메타정보(라벨, 색상, 포지션 목록)는
저장 위치가 없었음.

## 계획

### DB 변경
1. `stores` 테이블에 근무지 메타데이터 컬럼 추가
   - `work_location_key text UNIQUE` — 코드 식별자
   - `label text NOT NULL DEFAULT ''` — UI 한글 표시명
   - `color text NOT NULL DEFAULT '#8B95A1'` — 색상 토큰
   - `bg_color text NOT NULL DEFAULT '#F2F4F6'` — 배경색 토큰
   - `display_order integer NOT NULL DEFAULT 0` — 정렬 순서

2. `store_positions` 테이블 신규 생성
   - `store_id` FK → stores.id (CASCADE)
   - `position_key text` — 코드 식별자 (hall/kitchen/showroom 등)
   - `label text` — UI 한글 표시명
   - `display_order integer`
   - UNIQUE(store_id, position_key)
   - RLS: anon/authenticated SELECT, admin ALL

3. Dev DB에 기본 데이터 삽입 (카페/공장/케이터링 + 홀/주방/쇼룸)

### 코드 변경
- `src/types/workplace.ts` — WorkLocation, StorePosition 타입
- `src/lib/hooks/useWorkplaces.ts` — SWR 기반 공통 훅
- 16개 파일의 하드코딩 상수 제거 → 훅 사용

## 결과

- [x] Dev DB 마이그레이션 완료
- [x] Dev 데이터 검증 (카페 3포지션, 공장, 케이터링 확인)
- [x] 코드 수정 완료 (11개 파일, 하드코딩 상수 전면 제거)
- [x] 빌드 통과
