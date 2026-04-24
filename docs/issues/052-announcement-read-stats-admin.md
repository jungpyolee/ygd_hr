# 052. 어드민 공지 읽음 통계 UI

## 배경

`announcement_reads` 테이블과 사용자 측 읽음 처리(방문 시 upsert)는 이미 동작 중이었지만, **어드민에서 누가 읽었는지 확인할 수 있는 UI가 없었어요**. 공지 발송 후 반응 추적 불가 → 운영 문의/재공지 판단 어려움.

## 수정 내용

### 공용 로직 분리
- `src/lib/announcement-targets.ts`
  - `getTargetProfileIds(supabase, role, storeIds)` — `target_roles`(`'all'`/`'full_time'`/`'part_time'`) + `target_store_ids`(`employee_store_assignments` 조인) 규칙으로 대상 직원 id 목록 반환.
  - 기존 `AnnouncementForm`의 알림 발송 필터 로직과 동일 규칙.

### 공지 상세(수정) 페이지
- `src/app/admin/announcements/[id]/edit/page.tsx`에 `AnnouncementReadStatus` 섹션 마운트.
- `src/components/announcement/AnnouncementReadStatus.tsx` 신규
  - 상단: "N / M 읽음 / 전체" 카드.
  - 읽은 직원 리스트 (아바타·이름·읽은 시각, 최근순).
  - 안 읽은 직원 리스트 (아바타·이름).

### 공지 목록 페이지
- `src/app/admin/announcements/page.tsx` 각 카드 하단 메타줄에 "읽음 N/M" 추가 (전원 읽으면 파란색).
- 목록 로드 시 공지별 `getTargetProfileIds` 병렬 계산 + `announcement_reads` 한 번에 조회.

### RLS
- `announcement_reads` SELECT 정책이 `(profile_id = auth.uid()) OR is_admin()`이라 어드민은 전체 조회 가능. 변경 없음.

### 직원 페이지
- 건드리지 않음. 기존 읽음 처리 그대로 동작.

## 결과

- 빌드 통과. 어드민이 공지별 읽음 현황·미확인 직원 누구인지 한눈에 파악 가능.
