# [BUG-011] "오늘 하루 보지 않기" 이후에도 PWA 설치 배너가 재표시됨

| 항목 | 내용 |
|------|------|
| 유형 | 버그 수정 |
| 상태 | ✅ 완료 |
| 파일 | `src/components/PWAInstallPrompt.tsx` |
| 발견일 | 2026-03-17 |
| 완료일 | 2026-03-17 |

---

## 배경

"오늘 하루 보지 않기" 버튼을 클릭해도 다른 페이지로 이동하거나 잠시 후 배너가
다시 표시되는 문제. 특히 Android Chrome에서 빈번하게 발생.

---

## 원인 분석

`useEffect` 는 컴포넌트 마운트 시 1회 실행되며, 아래 순서로 동작한다.

```
1. localStorage("hide_pwa_prompt_until") 체크
2. 유효하면 return → 핸들러 미등록 (배너 안 뜸)
3. 유효하지 않으면 beforeinstallprompt 핸들러 등록
```

**문제**: 핸들러 등록 이후 사용자가 "오늘 하루 보지 않기"를 클릭하면
localStorage에 만료 시간이 저장되고 `setShowBanner(false)`가 호출된다.
그러나 **이미 등록된 핸들러는 localStorage를 재확인하지 않는다.**

```typescript
// ❌ 수정 전 — beforeinstallprompt 재발화 시 localStorage 무시
const handler = (e: Event) => {
  e.preventDefault();
  setDeferredPrompt(e as BeforeInstallPromptEvent);
  setShowBanner(true); // 무조건 true
};
```

Android Chrome은 동일 세션에서 `beforeinstallprompt`를 여러 번 재발화할 수 있다.
컴포넌트는 루트 레이아웃에 위치해 페이지 이동 시에도 언마운트되지 않으므로,
재발화된 이벤트가 핸들러를 통해 배너를 다시 표시하는 구조였다.

타임존 문제가 아님 — `new Date()` 는 로컬 시간 기준으로 정확하게 동작함.

---

## 수정 내용

핸들러 내부에서 localStorage를 재확인하도록 수정.

```typescript
// ✅ 수정 후 — 재발화 시에도 localStorage 확인
const handler = (e: Event) => {
  e.preventDefault();
  const hideUntilVal = localStorage.getItem("hide_pwa_prompt_until");
  if (hideUntilVal && new Date().getTime() < parseInt(hideUntilVal, 10)) return;
  setDeferredPrompt(e as BeforeInstallPromptEvent);
  setShowBanner(true);
};
```

---

## 결과

- "오늘 하루 보지 않기" 클릭 이후 `beforeinstallprompt`가 재발화되어도 배너 미표시
- 자정 이후에는 localStorage 만료로 정상적으로 다시 표시됨
