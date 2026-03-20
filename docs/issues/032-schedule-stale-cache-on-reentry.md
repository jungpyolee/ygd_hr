# [BUG-032] 스케줄 삭제 후 재진입 시 이전 스케줄 잔류

| 항목 | 내용 |
|------|------|
| 유형 | 버그 수정 |
| 상태 | ✅ 완료 |
| 파일 | `src/app/schedule/page.tsx` |
| 발견일 | 2026-03-21 |
| 완료일 | 2026-03-21 |

## 배경

어드민이 특정 직원의 스케줄 슬롯을 삭제한 후, 해당 직원이 스케줄 페이지를 나갔다가 다시 진입했을 때 삭제된 스케줄이 그대로 표시됐다. 강제 새로고침(pull-to-refresh 등)을 해야만 사라지는 문제.

## 원인 분석

`schedule-slots` SWR 훅에 `revalidateOnMount` 옵션이 없었고, `dedupingInterval: 30_000`(30초)이 설정되어 있었다.

SWR은 `revalidateOnMount`가 명시되지 않은 경우, dedupingInterval 이내에 같은 키로 이미 데이터를 가져왔다면 컴포넌트가 다시 마운트되어도 재요청을 건너뛴다. 따라서 30초 이내에 페이지를 나갔다 돌아오면 캐시된 이전 스케줄 데이터가 그대로 표시된다.

## 수정 내용

`schedule-slots` SWR 옵션에 `revalidateOnMount: true` 추가.

```typescript
// src/app/schedule/page.tsx L113~136
{ dedupingInterval: 30_000, revalidateOnFocus: true, revalidateOnMount: true }
```

`revalidateOnMount: true`는 dedupingInterval과 무관하게 컴포넌트 마운트 시 항상 서버에서 최신 데이터를 가져오도록 강제한다.

## 결과

스케줄 페이지 재진입 시 항상 최신 데이터를 가져오므로, 어드민이 삭제한 스케줄이 재진입 즉시 반영된다.
