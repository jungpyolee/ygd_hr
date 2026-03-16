# [BUG-001] sw.ts - Serwist import 에러

| 항목 | 내용 |
|------|------|
| **유형** | 버그 수정 |
| **상태** | ✅ 완료 |
| **파일** | `src/app/sw.ts` |
| **발견일** | 2026-03-16 |
| **완료일** | 2026-03-16 |

---

## 배경 (Background)

프로젝트 초기 빌드 시 아래 경고가 출력됨.
빌드 자체는 통과되지만 Service Worker가 올바르게 초기화되지 않아
PWA 오프라인 기능 및 캐싱 전략이 실제로는 작동하지 않는 상태.

```
./src/app/sw.ts
Attempted import error: 'Serwist' is not exported from '@serwist/sw' (imported as 'Serwist').
```

---

## 원인 분석 (Investigation)

### 에러 위치
`src/app/sw.ts` 5번 라인:
```typescript
import { Serwist } from "@serwist/sw";
```

### 조사 과정

1. `@serwist/sw` 패키지의 실제 exports 확인:
   ```
   node_modules/@serwist/sw/dist/index.d.ts
   ```
   ```typescript
   export type { RuntimeCaching } from "serwist";
   export { disableDevLogs } from "serwist";
   export { fallbacks, handlePrecaching, installSerwist, registerRuntimeCaching } from "serwist/legacy";
   ```
   → `Serwist` 클래스가 존재하지 않음

2. `serwist` 메인 패키지 exports 확인:
   ```
   node_modules/serwist/dist/index.js
   ```
   → `Serwist` 클래스가 여기서 export됨 ✅

### 결론
`@serwist/sw`는 v9.x에서 `Serwist` 클래스를 직접 export하지 않고
`serwist` 메인 패키지에서만 export함.
공식 문서 변경사항을 반영하지 못한 코드.

---

## 수정 내용 (Fix)

### 변경 파일
`src/app/sw.ts`

### 변경 사항
```diff
- import { Serwist } from "@serwist/sw";
+ import { Serwist } from "serwist";
```

기존에 `// @ts-ignore`로 임시 억제하던 타입 에러도 함께 제거.

---

## 결과 (Result)

- 빌드 시 `Attempted import error` 경고 제거
- Service Worker가 `Serwist` 클래스를 정상적으로 참조
- PWA 캐싱 전략 (`defaultCache`) 및 `precacheEntries` 정상 동작
- `serwist.addEventListeners()` 정상 등록

---

## 참고

- `@serwist/sw` 패키지는 v9.x부터 `Serwist` 클래스를 re-export하지 않음
- 올바른 import 경로: `import { Serwist } from "serwist"`
- 관련 패키지 버전: `@serwist/sw@9.5.6`, `serwist@9.5.6`
