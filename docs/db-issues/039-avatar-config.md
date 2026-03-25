# 039 — profiles.avatar_config 컬럼 추가

## 배경
react-nice-avatar 기반 커스텀 아바타 기능 도입.
직원이 자신의 아바타를 모달에서 직접 편집하고 저장할 수 있어야 한다.

## 계획
- `profiles` 테이블에 `avatar_config jsonb` 컬럼 추가
- 기존 직원: `avatar_config = null` → 앱에서 `genConfig(userId)` 로 결정론적 랜덤 생성 (DB 업데이트 불필요)
- 직원이 편집 후 저장하면 해당 config를 jsonb로 저장

## 마이그레이션

`docs/migrations/039_avatar_config.sql` 실행

## 결과

- Dev 적용: ✅ 2026-03-24
- Production 적용: 배포 시 진행
