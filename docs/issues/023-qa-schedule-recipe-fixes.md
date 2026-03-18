# [FEAT-023] QA: 스케줄·레시피 전체 버그 수정

| 항목 | 내용 |
|------|------|
| 유형 | 버그 수정 / 코드 품질 개선 |
| 상태 | ✅ 완료 |
| 발견일 | 2026-03-18 |
| 완료일 | 2026-03-18 |

## 배경

스케줄 및 레시피 기능 전체 QA 분석을 통해 발견된 버그와 코드 품질 이슈를 일괄 수정.

## 수정 내용

### P0 — 즉시 수정

#### 1. recipe_mention 알림 미구현 (`RecipeComments.tsx`)
- `mentioned_profile_id`가 DB에 저장되지만 알림은 발송되지 않던 문제
- `submitReply()`에서 mentionedId가 parentAuthorId와 다를 때 `recipe_mention` 알림 추가
- 현재 구현에서 mentionedId === parentAuthorId이므로 실질적 중복 없음; 미래 @멘션 확장 시 대비

#### 2. schedule_slots 시간 겹침 DB 제약 추가 (DB 마이그레이션)
- 클라이언트 검증만 있고 DB 수준 차단이 없던 문제 → `docs/db-issues/004-...` 참조
- `btree_gist` 확장 + EXCLUSION CONSTRAINT 추가 (`migrations/014_...sql`)

### P1 — 중요 이슈

#### 3. Supabase 클라이언트 `useMemo` 통일
| 파일 | 변경 |
|------|------|
| `src/app/recipes/page.tsx` | `createClient()` → `useMemo(() => createClient(), [])` |
| `src/app/recipes/[id]/page.tsx` | 동일 |
| `src/app/admin/recipes/page.tsx` | 동일 |

렌더마다 클라이언트 재생성 방지 → 성능 향상, 구독 누수 방지

#### 4. `any` 타입 제거 (`admin/schedules/substitutes/page.tsx`)
- `fetchRequests()`의 `data.map((r: any) => ...)` 제거
- `SubstituteRequestRow` 인터페이스 신규 정의 후 `data as unknown as SubstituteRequestRow[]`로 타입 안전성 확보

#### 5. 대타 알림 중복 발송 방지 (`admin/schedules/substitutes/page.tsx`)
- `handleApprove()`에서 `eligibleIds`를 `Array.from(new Set(eligibleIds))`로 중복 제거 후 알림 발송

#### 6. Null 안전성 강화 (`RecipeComments.tsx`)
- `comment.profiles.name.charAt(0)` → `(comment.profiles?.name || "?").charAt(0)`
- 대댓글 렌더링의 `reply.profiles.name/color_hex` 모두 optional chaining 적용

### P2 — 개선

#### 7. 시간 계산 중복 코드 제거 (`schedule/page.tsx`)
- `reqStart`, `reqEnd` 계산에 `reduce` 중복 코드 있었음
- 이미 선언된 `toMin()` 헬퍼를 앞으로 이동하여 재사용

## 결과

- 빌드 ✅ 성공 (`npm run build`)
- TypeScript 오류 없음
- DB EXCLUSION CONSTRAINT 정상 적용 (contype: 'x' 확인)
