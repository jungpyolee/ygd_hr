# [BUG-002] 위치 권한 허용 상태에서도 위치 정보를 못 가져오는 이슈

| 항목 | 내용 |
|------|------|
| **유형** | 버그 수정 |
| **상태** | ✅ 완료 |
| **파일** | `src/app/page.tsx` |
| **발견일** | 2026-03-16 |
| **완료일** | 2026-03-16 |

---

## 배경 (Background)

위치 권한을 허용했음에도 불구하고 위치 정보를 가져오지 못하는 현상 발생.
브라우저 콘솔에 다음 메시지가 출력됨:

```
CoreLocationProvider: CoreLocation framework reported a kCLErrorLocationUnknown failure.
```

결과적으로 `locationState.status`가 `"unavailable"`로 설정되어 출퇴근 버튼 클릭 시
"위치 정보를 가져올 수 없어요." 토스트가 표시되고 출퇴근 기록이 불가능한 상태가 됨.

---

## 원인 분석 (Investigation)

### 에러 정체: `kCLErrorLocationUnknown`

Apple CoreLocation 프레임워크의 에러 코드로,
`PERMISSION_DENIED`(권한 거부)와 **완전히 다른 의미**임.

| CoreLocation 에러 | Web Geolocation API 코드 | 의미 |
|---|---|---|
| `kCLErrorDenied` | `PERMISSION_DENIED` (1) | 사용자가 권한 거부 → 진짜 불가 |
| `kCLErrorLocationUnknown` | `POSITION_UNAVAILABLE` (2) | **일시적으로** 위치 파악 불가 → 재시도 가능 |
| (timeout) | `TIMEOUT` (3) | 제한 시간 초과 → 재시도 가능 |

`kCLErrorLocationUnknown`이 발생하는 주요 상황:
- GPS가 아직 위성 신호를 잡지 못한 초기 상태 (cold start)
- 실내, 지하 등 GPS 신호가 약한 환경
- Wi-Fi가 꺼져 있어 Wi-Fi 포지셔닝도 불가한 상태
- 앱 최초 실행 직후 CoreLocation이 웜업되지 않은 상태

즉, **일시적인 상태**임에도 영구적 실패처럼 처리되는 것이 문제.

---

### 코드 문제 분석

**문제 코드** (`src/app/page.tsx` 35~44번 라인):

```typescript
navigator.geolocation.getCurrentPosition(
  (pos) => setLocationState({ status: "ready", ... }),
  () => setLocationState({ status: "unavailable" }),  // ← 모든 에러를 동일하게 처리
  { enableHighAccuracy: true }
);
```

#### 문제 1: 에러 코드 미구분
에러 콜백이 에러 종류를 전혀 구분하지 않음.
- `PERMISSION_DENIED` → 진짜 불가, `"unavailable"` 처리 적절
- `POSITION_UNAVAILABLE` (`kCLErrorLocationUnknown`) → 일시적 실패, **재시도 필요**
- `TIMEOUT` → 제한 시간 초과, **재시도 필요**

#### 문제 2: `getCurrentPosition` 단 1회 시도
`getCurrentPosition`은 한 번만 시도하고 끝남.
`kCLErrorLocationUnknown`처럼 재시도하면 성공할 수 있는 경우에도
즉시 포기하고 `"unavailable"` 상태로 확정시켜버림.

#### 문제 3: `enableHighAccuracy: true` 전용 시도
고정밀 GPS 모드는:
- 위성 신호 획득까지 수~수십 초 소요
- 실내에서 실패할 확률 높음
- 실패 시 Wi-Fi/셀 기반 저정밀 위치(`enableHighAccuracy: false`)로 폴백 없음

저정밀 모드는 Wi-Fi만 켜져 있어도 수 미터~수십 미터 오차로 빠르게 응답 가능하며,
100m 반경 출근 판단에는 충분히 유효함.

---

## 1차 수정 시도 및 실패 (2026-03-16)

### 시도한 방법
`getCurrentPosition` 1차(고정밀) 실패 시 → 2차(저정밀)로 재시도하는 폴백 구조.

### 결과: 실패
콘솔에 `kCLErrorLocationUnknown`이 **2번** 출력됨.
1차 시도 실패 로그 + 2차 시도 실패 로그가 각각 찍힌 것.
두 번 다 실패해서 위치 상태는 여전히 `"unavailable"`.

### 실패 원인 분석
`getCurrentPosition`은 **단발성**이기 때문에 GPS 웜업이 끝나기 전에 시도하면
재시도를 1번 더 해도 여전히 GPS가 준비되지 않아 실패함.
`kCLErrorLocationUnknown`은 "영원히 불가"가 아니라 "아직 준비 중"이라는 신호인데,
`getCurrentPosition`은 이 신호를 받으면 그냥 포기하는 구조.

---

## 최종 수정 내용 (Fix)

### 핵심 전략 변경
`getCurrentPosition` (단발) → `watchPosition` (지속 감시)

`watchPosition`은:
- 에러가 나도 내부적으로 계속 모니터링을 유지
- GPS 웜업 완료 시 자동으로 성공 콜백 호출
- `PERMISSION_DENIED`일 때만 명시적으로 중단

### 변경 파일
`src/app/page.tsx`

### 변경 사항

```diff
- navigator.geolocation.getCurrentPosition(
-   (pos) =>
-     setLocationState({ status: "ready", lat: ..., lng: ... }),
-   () => setLocationState({ status: "unavailable" }),
-   { enableHighAccuracy: true }
- );
+ const watchId = navigator.geolocation.watchPosition(
+   (pos) =>
+     setLocationState({ status: "ready", lat: ..., lng: ... }),
+   (err) => {
+     if (err.code === err.PERMISSION_DENIED) {
+       // 권한 거부만 즉시 종료
+       navigator.geolocation.clearWatch(watchId);
+       setLocationState({ status: "unavailable" });
+     }
+     // kCLErrorLocationUnknown / TIMEOUT → watchPosition이 계속 재시도
+   },
+   { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
+ );
+
+ return () => navigator.geolocation.clearWatch(watchId); // 컴포넌트 언마운트 시 정리
```

---

## 2차 수정 시도 및 실패 (2026-03-16)

### 시도한 방법
`watchPosition`으로 교체 — 에러가 나도 GPS 준비될 때까지 계속 대기.

### 결과: 부분 실패
모바일에선 유효하지만, **맥 데스크탑에서 "위치 확인 중..."이 영원히 지속**.

### 실패 원인
맥에는 GPS 칩이 없기 때문에 `enableHighAccuracy: true` 모드가 절대 성공할 수 없음.
`watchPosition`이 `kCLErrorLocationUnknown`을 무시하고 계속 대기하도록 했더니
저정밀 Wi-Fi 기반 폴백이 트리거되지 않아 무한 로딩 상태로 빠짐.

---

## 최종 수정 내용 (Fix)

### 전략: watchPosition + 타임아웃 폴백 조합

- `watchPosition` (고정밀): 계속 감시, GPS 잡히면 즉시 성공
- **8초 타임아웃**: GPS 미해결 시 `getCurrentPosition` 저정밀로 폴백
- 저정밀도 실패 시: `"unavailable"` 확정
- 언마운트 시: `clearWatch` + `clearTimeout` 정리

### 변경 파일
`src/app/page.tsx`

### 최종 코드
```typescript
let resolved = false;

const onSuccess = (pos: GeolocationPosition) => {
  resolved = true;
  setLocationState({ status: "ready", lat: ..., lng: ... });
};

const watchId = navigator.geolocation.watchPosition(
  onSuccess,
  (err) => {
    if (err.code === err.PERMISSION_DENIED) {
      resolved = true;
      navigator.geolocation.clearWatch(watchId);
      setLocationState({ status: "unavailable" });
    }
    // kCLErrorLocationUnknown / TIMEOUT → 계속 대기
  },
  { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
);

// 8초 후에도 GPS 미획득 시 Wi-Fi 기반 저정밀로 폴백
const fallbackTimer = setTimeout(() => {
  if (!resolved) {
    navigator.geolocation.getCurrentPosition(
      onSuccess,
      () => { if (!resolved) setLocationState({ status: "unavailable" }); },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }
}, 8000);

return () => {
  navigator.geolocation.clearWatch(watchId);
  clearTimeout(fallbackTimer);
};
```

---

## 결과 (Result)

| 상황 | 최초 | 1차 수정 | 2차 수정 | 최종 수정 |
|------|------|---------|---------|---------|
| GPS cold start (모바일) | 즉시 실패 | 2번 실패 | GPS 잡힐 때까지 대기 → 성공 | 동일 |
| 맥 데스크탑 (GPS 없음) | 즉시 실패 | 2번 실패 | 무한 로딩 | 8초 후 Wi-Fi 폴백 → 성공 |
| 권한 거부 | 실패 | 실패 | 즉시 불가 | 즉시 불가 |

- `kCLErrorLocationUnknown` 콘솔 로그는 브라우저 내부 로그라 완전히 제거 불가
- GPS가 8초 내 잡히면 즉시 성공, 못 잡으면 Wi-Fi 기반으로 폴백
- `clearWatch` + `clearTimeout` 정리로 메모리 누수 방지

---

## 참고

- [MDN - Geolocation API error codes](https://developer.mozilla.org/en-US/docs/Web/API/GeolocationPositionError)
- `kCLErrorLocationUnknown` = Web API `POSITION_UNAVAILABLE` (code 2)
- `kCLErrorDenied` = Web API `PERMISSION_DENIED` (code 1)
- 저정밀 모드(`enableHighAccuracy: false`)는 GPS 불필요, Wi-Fi/셀 기반으로 빠르게 응답
