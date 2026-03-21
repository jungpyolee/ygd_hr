# [DB-012] Web Push 알림 인프라

| 항목 | 내용 |
|------|------|
| 유형 | 기능 추가 |
| 상태 | ✅ 완료 |
| 마이그레이션 | migrations/012_push_notifications.sql |
| 발견일 | 2026-03-21 |
| 완료일 | 2026-03-21 |

## 배경

기존 Supabase Realtime 기반 인앱 알림은 앱이 열려 있는 경우에만 동작.
앱이 백그라운드/종료 상태에서도 알림을 받을 수 있도록 Web Push (VAPID) 기반 OS 레벨 푸시 알림 추가.

## 마이그레이션

### 신규 테이블

**push_subscriptions**: 브라우저별 푸시 구독 정보 저장
- `UNIQUE(profile_id, endpoint)` — 같은 브라우저 중복 구독 방지
- `auth.users(id)` 참조 (profiles.id에 PK 제약 없음)

**push_preferences**: 유저별 수신 설정
- `enabled` — 마스터 토글
- `type_settings jsonb` — 알림 유형별 on/off (absent key = 기본 허용)

### profiles.id 참고사항

`profiles` 테이블에 PRIMARY KEY 및 UNIQUE 제약이 없어 `REFERENCES profiles(id)` 불가.
→ `REFERENCES auth.users(id)` 로 우회.

## 테스트

```sql
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('push_subscriptions', 'push_preferences');
-- → 2개 행 확인

SELECT policyname, cmd FROM pg_policies
WHERE tablename IN ('push_subscriptions', 'push_preferences') AND schemaname = 'public'
ORDER BY tablename, cmd;
-- → 각 테이블 SELECT/INSERT/DELETE(subscriptions), SELECT/INSERT/UPDATE(preferences)
```

## 결과

Dev DB 적용 완료 (2026-03-21).
Production 적용은 배포 시 섹션 3-1 절차에 따라 실행.

## schema.md 변경 사항

- `push_subscriptions` 테이블 추가
- `push_preferences` 테이블 추가
