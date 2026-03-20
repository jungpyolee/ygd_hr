# [FEAT-029] 고양이 오이 닷지 게임 (이스터에그)

| 항목 | 내용 |
|------|------|
| 유형 | 기능 추가 |
| 상태 | ✅ 완료 |
| 파일 | `src/components/CatDodgeGame.tsx`, `src/app/guide/page.tsx` |
| 발견일 | 2026-03-20 |
| 완료일 | 2026-03-20 |

## 배경

이용가이드 페이지의 WalkingCat 이스터에그(고양이 10번 클릭 → 😻 피날레) 이후
풀스크린 닷지 게임으로 이어지도록 기획.

## 기획

- 고양이 🐱 가 하늘에서 떨어지는 오이 🥒 를 피하는 게임 (고양이-오이 공포 밈)
- 점수: 생존 시간 (초)
- 난이도: 10초마다 오이 낙하 속도 + 스폰 빈도 증가
- 조작: 화면 왼쪽/오른쪽 터치 hold → 고양이 이동 (키보드 ←→ 데스크톱 지원)
- 게임오버: 점수 저장 + 리더보드(유저별 최고점 TOP 10) 표시

## 수정 내용

### DB
- `docs/migrations/019_cat_dodge_scores.sql`: `cat_dodge_scores` 테이블 생성
  - `user_id`, `score`, `created_at`
  - RLS: authenticated SELECT(전체), INSERT(본인만)
  - Dev DB 적용 완료

### 신규 파일
- `src/components/CatDodgeGame.tsx`
  - 풀스크린 오버레이 (z-index 10000, 다크 그라디언트 배경)
  - 카운트다운 3초 → 게임 시작
  - `requestAnimationFrame` 기반 게임 루프 (ref 활용, stale closure 방지)
  - 난이도: `difficulty = floor(elapsed / 10)`, 속도·스폰간격 연동
  - 충돌: Euclidean 거리 < CAT_RADIUS(22) + CUC_RADIUS(16) = 38px
  - 게임오버 시 스코어 저장 → 유저별 최고점 집계 → TOP 10 리더보드 표시
  - 재시작 / 그만할래요 버튼

### 수정 파일
- `src/app/guide/page.tsx`
  - `CAT_STAGES`: `{ emoji, label }[]` → `string[]` (label 완전 제거)
  - `WalkingCat`: `onGameStart` prop 추가, 😻 애니메이션 후 콜백 호출
  - `GuidePage`: `showGame` 상태 추가, `<CatDodgeGame>` 조건부 렌더

## 결과

빌드 성공. 이용가이드 고양이 10번 클릭 → 😻 사라짐 → 닷지 게임 풀스크린 진입.
