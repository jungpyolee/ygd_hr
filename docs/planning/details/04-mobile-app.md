# 04. 모바일 네이티브 앱 전환 상세 계획

> **작성일**: 2026-03-25
> **현재 상태**: PWA (Serwist 9.5 + Next.js 16 App Router)
> **목표**: iOS + Android 네이티브 앱 출시 (웹 앱 병행 운영)
> **앱 이름**: 출첵

---

## 목차

1. [기술 스택 선택 분석](#1-기술-스택-선택-분석)
2. [네이티브 전환 기능 매핑](#2-네이티브-전환-기능-매핑)
3. [앱스토어 준비](#3-앱스토어-준비)
4. [딥링크 설정](#4-딥링크-설정)
5. [푸시 알림 네이티브 전환](#5-푸시-알림-네이티브-전환)
6. [개발 일정 추정](#6-개발-일정-추정)
7. [PWA와 네이티브 앱 병행 전략](#7-pwa와-네이티브-앱-병행-전략)
8. [체크리스트](#8-체크리스트)

---

## 1. 기술 스택 선택 분석

### 1-1. 후보 비교표

| 기준 | React Native (Expo) | Flutter | Capacitor/Ionic | WebView Wrapper |
|------|---------------------|---------|-----------------|-----------------|
| **코드 재사용** | 비즈니스 로직 재사용 (Supabase, date-fns 등). UI는 새로 작성 | 전부 새로 작성 (Dart) | 기존 Next.js 코드 80~90% 재사용 | 기존 코드 95%+ 재사용 |
| **언어** | TypeScript/JSX (현재 스택과 동일) | Dart (학습 필요) | TypeScript (동일) | TypeScript (동일) |
| **네이티브 성능** | 네이티브 렌더링, 우수 | 자체 렌더링 엔진, 최상 | WebView 기반, 보통 | WebView 기반, 제한적 |
| **GPS 백그라운드** | expo-location 지원 | geolocator 패키지 지원 | @capacitor/geolocation 지원 | 제한적 |
| **푸시 알림** | expo-notifications (FCM/APNs 통합) | firebase_messaging | @capacitor/push-notifications | 제한적 |
| **카카오 SDK** | react-native-kakao 커뮤니티 패키지 | kakao_flutter_sdk 공식 | JS SDK 직접 사용 가능 | JS SDK 직접 사용 가능 |
| **Apple Sign In** | expo-apple-authentication (공식) | sign_in_with_apple (공식) | @capacitor/sign-in-with-apple | 웹 OAuth만 가능 |
| **카메라** | expo-camera / expo-image-picker | image_picker | @capacitor/camera | input[type=file] 만 가능 |
| **오프라인** | AsyncStorage + 로컬 DB | Hive/Drift 로컬 DB | Capacitor Preferences + SQLite | Service Worker (현재와 동일) |
| **앱 업데이트** | EAS Update (OTA) | 코드 푸시 없음, 스토어 업데이트만 | Live Update (Appflow, 유료) | 웹 배포 = 자동 업데이트 |
| **빌드/배포** | EAS Build (클라우드) | Xcode + Android Studio | Xcode + Android Studio (or Appflow) | Xcode + Android Studio |
| **학습 비용** | 낮음 (TypeScript + React) | 높음 (Dart + 위젯 체계) | 매우 낮음 (기존 코드 재사용) | 거의 없음 |
| **커뮤니티/생태계** | 매우 큼 (Meta, Expo) | 큼 (Google) | 보통 (Ionic 팀) | 해당 없음 |
| **개발 기간 (추정)** | 8~12주 | 14~20주 | 4~6주 | 1~2주 |

### 1-2. 각 옵션 상세 분석

#### Option A: React Native (Expo)

**장점**
- TypeScript + React 기반 — 현재 스택과 기술 연속성 최상
- Expo SDK 통합: GPS, 카메라, 푸시, Apple Sign In 모두 공식 지원
- EAS Update로 스토어 심사 없이 JS 번들 OTA 업데이트 가능
- 네이티브 렌더링으로 60fps 부드러운 UI
- 생태계가 가장 크고 한국어 자료 풍부

**단점**
- UI를 React Native 컴포넌트로 새로 작성해야 함 (shadcn/Tailwind 불가)
- shadcn/ui 대신 NativeWind 또는 react-native-paper 등 대체 필요
- Expo 무료 빌드 한도 (월 30회, 이후 $99/월)
- 일부 웹 전용 라이브러리 호환 불가 (Serwist, html2canvas 등)

#### Option B: Flutter

**장점**
- Google의 자체 렌더링 엔진으로 iOS/Android 동일한 UI 보장
- 카카오 SDK 공식 Flutter 패키지 존재
- 성능 최상

**단점**
- Dart 언어 학습 필요 — 현재 팀 TypeScript 전문
- 기존 코드 재사용 불가 — 전부 새로 작성
- Supabase Flutter SDK는 있지만, 현재 서버 로직(API Routes)과 연동 구조 재설계 필요
- 개발 기간 가장 긴 편 (14~20주)
- 1인 개발 시 두 코드베이스 유지 부담 큼

#### Option C: Capacitor (Ionic)

**장점**
- 기존 Next.js 웹 앱을 거의 그대로 네이티브 쉘에 감쌈
- Tailwind CSS, shadcn/ui, 현재 UI 코드 그대로 사용
- Capacitor 플러그인으로 GPS, 카메라, 푸시 등 네이티브 기능 접근
- JS SDK(카카오)도 웹뷰에서 직접 동작
- 개발 기간 가장 짧음 (4~6주)

**단점**
- 성능: WebView 기반이라 복잡한 애니메이션에서 네이티브 대비 열세
- "네이티브 느낌" 부족 — 스크롤 바운스, 제스처, 화면 전환 등
- 앱스토어 심사 시 "웹뷰 앱" 리젝 가능성 (특히 Apple — 4.2 디자인 가이드라인)
- 백그라운드 GPS 동작이 네이티브 대비 제한적
- Capacitor 버전 업데이트 시 Next.js 호환성 이슈 발생 가능

#### Option D: WebView Wrapper (WKWebView/WebView 단순 래핑)

**장점**
- 구현이 가장 빠름 (1~2주)
- 기존 코드 100% 재사용
- 웹 배포 = 앱 자동 업데이트

**단점**
- Apple 앱스토어 리젝 가능성 매우 높음 (단순 WebView 래핑 금지)
- 네이티브 기능 접근 불가 (푸시, 백그라운드 GPS 등)
- PWA 대비 장점이 거의 없음
- Apple Sign In 네이티브 구현 불가
- 사실상 PWA와 동일 — 스토어 등록 의미 없음

### 1-3. 추천: React Native (Expo) -- 1순위

**추천 근거:**

1. **기술 연속성**: TypeScript + React 기반이라 학습 비용 최소
2. **네이티브 기능 완전 지원**: GPS 백그라운드, 푸시(FCM/APNs), Apple Sign In 모두 Expo SDK 공식 지원
3. **OTA 업데이트**: EAS Update로 스토어 심사 없이 빠른 버그 수정 가능 (소규모 운영에 필수)
4. **Supabase 공식 지원**: `@supabase/supabase-js`가 React Native에서 완벽 동작
5. **카카오 SDK**: `@react-native-kakao/core` + `@react-native-kakao/share` 커뮤니티 패키지 활발
6. **1인 개발 최적**: 웹과 모바일이 같은 언어/패러다임이라 컨텍스트 스위칭 최소

**비즈니스 로직 재사용 가능 범위:**
- Supabase 클라이언트 설정 및 쿼리 로직 (70% 재사용)
- date-fns 유틸리티 (100% 재사용)
- 타입 정의 (100% 재사용)
- 급여 계산, 크레딧 엔진 등 순수 함수 (100% 재사용)
- API Routes는 웹 서버에서 호스팅, 앱은 API 호출

**차선책: Capacitor** — 만약 개발 기간이 절대적으로 부족하거나, 네이티브 UI 퀄리티보다 빠른 출시가 우선이라면 Capacitor로 4~6주 내 출시 후 추후 React Native로 전환하는 전략도 가능.

### 1-4. React Native (Expo) 프로젝트 구조 (안)

```
chulchek-app/                          # 별도 저장소
├── app/                               # Expo Router (파일 기반 라우팅)
│   ├── (auth)/
│   │   ├── login.tsx                  # 로그인 (이메일 + 카카오 + Apple)
│   │   ├── signup.tsx                 # 회원가입
│   │   └── callback.tsx               # OAuth 콜백
│   ├── (app)/
│   │   ├── (tabs)/
│   │   │   ├── index.tsx              # 홈 (출퇴근)
│   │   │   ├── calendar.tsx           # 스케줄
│   │   │   ├── store.tsx              # 공지/레시피
│   │   │   └── my.tsx                 # 마이페이지
│   │   ├── admin/
│   │   │   ├── index.tsx              # 관리자 대시보드
│   │   │   ├── employees.tsx
│   │   │   ├── attendance.tsx
│   │   │   ├── calendar.tsx
│   │   │   ├── payroll.tsx
│   │   │   └── ...
│   │   ├── attendances.tsx
│   │   ├── credit-history.tsx
│   │   └── guide.tsx
│   ├── join.tsx                        # 초대 수락
│   ├── create-organization.tsx         # 조직 생성
│   └── select-organization.tsx         # 조직 선택
├── components/                         # UI 컴포넌트
│   ├── ui/                            # shadcn 대체 자체 디자인 시스템
│   │   ├── Button.tsx
│   │   ├── BottomSheet.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   └── ...
│   ├── AttendanceButton.tsx
│   ├── StoreDistanceList.tsx
│   └── ...
├── lib/                               # 공유 비즈니스 로직 (웹에서 복사/공유)
│   ├── supabase.ts                    # Supabase 클라이언트 (SecureStore 기반 세션)
│   ├── types.ts                       # 공유 타입
│   ├── credit-engine.ts               # 크레딧 계산 (순수 함수)
│   ├── payroll-calc.ts                # 급여 계산 (순수 함수)
│   ├── tier-utils.ts                  # 티어 유틸 (순수 함수)
│   ├── notifications.ts               # 알림 타입/헬퍼
│   └── hooks/
│       ├── useGeolocation.ts          # expo-location 기반 재작성
│       ├── useAuth.ts
│       └── usePushNotification.ts
├── assets/                            # 아이콘, 스플래시, 폰트
│   ├── icon.png
│   ├── splash.png
│   └── fonts/
│       └── Pretendard-*.otf
├── app.json                            # Expo 설정
├── eas.json                            # EAS Build 설정
├── package.json
└── tsconfig.json
```

---

## 2. 네이티브 전환 기능 매핑

### 2-1. GPS / 위치 서비스

| 항목 | 현재 PWA | 네이티브 앱 (Expo) |
|------|----------|-------------------|
| **라이브러리** | `navigator.geolocation` (Web API) | `expo-location` |
| **정확도** | `enableHighAccuracy: true` | `Location.Accuracy.High` |
| **캐시** | `maximumAge: 45000` (표시용) / `10000` (출퇴근) | 동일 전략 적용 |
| **권한** | 브라우저 팝업 | OS 네이티브 권한 다이얼로그 |
| **백그라운드** | 불가 | `Location.startLocationUpdatesAsync()` 가능 |
| **정확도 향상** | GPS만 의존 | GPS + Wi-Fi + 셀룰러 삼각측량 |

**현재 코드 (`useGeolocation.ts`) -> 네이티브 전환:**

```typescript
// 현재 PWA: navigator.geolocation.getCurrentPosition()
// -> Expo: Location.getCurrentPositionAsync()

import * as Location from 'expo-location';

export async function getLocationForAttendance() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    return { status: 'denied' as const };
  }

  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
    // maximumAge는 Expo에서 직접 지원하지 않으므로
    // 타임스탬프 기반 캐시 로직 직접 구현
  });

  return {
    status: 'ready' as const,
    lat: location.coords.latitude,
    lng: location.coords.longitude,
  };
}
```

**백그라운드 위치 (향후 확장):**
- 출퇴근 시점에만 위치 확인하므로 현재 단계에서는 포그라운드만 필요
- 향후 "자동 출퇴근" 기능 시 geofencing 활용 가능:
  - `Location.startGeofencingAsync()` — 매장 반경 진입/이탈 감지
  - 배터리 소모 우려 있으므로 사용자 옵트인 방식 권장
  - iOS 백그라운드 위치 사유를 앱스토어 심사 시 명확히 설명 필요

### 2-2. 푸시 알림 (FCM / APNs)

| 항목 | 현재 PWA | 네이티브 앱 (Expo) |
|------|----------|-------------------|
| **프로토콜** | Web Push (VAPID) | FCM (Android) + APNs (iOS) |
| **라이브러리** | `web-push` (서버) + Service Worker | `expo-notifications` |
| **토큰 저장** | `push_subscriptions` (endpoint, p256dh, auth_key) | `device_tokens` (신규 테이블) |
| **페이로드** | JSON (title, body, icon, tag, url) | FCM/APNs 형식 |
| **서버** | Next.js API Route + web-push | Supabase Edge Function + FCM HTTP v1 API |

상세 내용은 [5. 푸시 알림 네이티브 전환](#5-푸시-알림-네이티브-전환) 참조.

### 2-3. 카메라 / 갤러리 (서류 촬영)

| 항목 | 현재 PWA | 네이티브 앱 (Expo) |
|------|----------|-------------------|
| **구현** | `<input type="file" accept="image/*">` | `expo-image-picker` |
| **카메라 직접** | 모바일 브라우저에서 자동 지원 | `ImagePicker.launchCameraAsync()` |
| **갤러리** | 파일 선택기 | `ImagePicker.launchImageLibraryAsync()` |
| **이미지 리사이즈** | 서버사이드 또는 Canvas API | `ImageManipulator` (expo-image-manipulator) |
| **권한** | 브라우저 자동 처리 | `Camera.requestCameraPermissionsAsync()` |

```typescript
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

async function pickDocument() {
  // 카메라 또는 갤러리 선택 바텀시트 표시
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.8,
    allowsEditing: true,
  });

  if (!result.canceled) {
    // 리사이즈 후 업로드
    const resized = await ImageManipulator.manipulateAsync(
      result.assets[0].uri,
      [{ resize: { width: 1200 } }],
      { format: ImageManipulator.SaveFormat.JPEG, compress: 0.8 }
    );

    // Supabase Storage 업로드
    const formData = new FormData();
    formData.append('file', {
      uri: resized.uri,
      type: 'image/jpeg',
      name: `doc-${Date.now()}.jpg`,
    } as unknown as Blob);

    await supabase.storage
      .from('hr-documents')
      .upload(`path/${fileName}`, formData);
  }
}
```

### 2-4. 카카오 SDK (딥링크 + 공유)

| 항목 | 현재 PWA (계획) | 네이티브 앱 (Expo) |
|------|-----------------|-------------------|
| **SDK** | Kakao JavaScript SDK (웹) | `@react-native-kakao/core` + `@react-native-kakao/share` |
| **로그인** | Supabase OAuth (Kakao Provider) | Supabase OAuth (웹뷰) 또는 네이티브 Kakao Login |
| **공유** | `Kakao.Share.sendDefault()` | `KakaoShare.sendDefault()` |
| **딥링크** | URL (`https://출첵.app/join?code=XXX`) | Universal Link + Kakao Custom Scheme |

**카카오 앱키 등록:**
- 카카오 디벨로퍼스 > 앱 설정 > 플랫폼
  - iOS: Bundle ID 등록
  - Android: 패키지명 + 키해시 등록
  - Web: 도메인 등록 (기존)

```typescript
// 카카오 공유 (직원 초대)
import { KakaoShare } from '@react-native-kakao/share';

async function shareInviteViaKakao(orgName: string, inviteCode: string, slug: string) {
  await KakaoShare.sendDefault({
    objectType: 'feed',
    content: {
      title: '출첵 - 직원 초대',
      description: `${orgName}에서 함께 일해요!`,
      imageUrl: 'https://출첵.app/og-invite.png',
      link: {
        mobileWebUrl: `https://출첵.app/join?code=${inviteCode}&org=${slug}`,
        webUrl: `https://출첵.app/join?code=${inviteCode}&org=${slug}`,
      },
    },
    buttons: [{
      title: '초대 수락하기',
      link: {
        mobileWebUrl: `https://출첵.app/join?code=${inviteCode}&org=${slug}`,
        webUrl: `https://출첵.app/join?code=${inviteCode}&org=${slug}`,
      },
    }],
  });
}
```

### 2-5. Apple Sign In (네이티브)

| 항목 | 현재 PWA (계획) | 네이티브 앱 |
|------|-----------------|------------|
| **구현** | Supabase OAuth 리다이렉트 | `expo-apple-authentication` (네이티브 다이얼로그) |
| **UX** | 브라우저 리다이렉트 -> 콜백 | 네이티브 Face ID/Touch ID 연동 바텀시트 |
| **필수 여부** | 선택 (웹은 필수 아님) | **필수** (앱에서 SNS 로그인 제공 시 Apple 필수 — App Store 가이드라인) |

```typescript
import * as AppleAuthentication from 'expo-apple-authentication';

async function signInWithApple() {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  // Supabase에 Apple ID 토큰으로 인증
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken!,
  });
}
```

**주의사항:**
- `signInWithIdToken()`은 Supabase v2에서 지원 — 네이티브 앱에서 OAuth 리다이렉트 대신 사용
- Apple은 최초 로그인에서만 이름/이메일 제공 — 반드시 첫 로그인 시 저장
- 카카오 로그인도 동일 패턴 적용 가능: 카카오 네이티브 SDK -> ID Token -> Supabase `signInWithIdToken()`

### 2-6. 오프라인 모드

| 항목 | 현재 PWA | 네이티브 앱 |
|------|----------|------------|
| **캐시** | Serwist (Service Worker precache + runtime cache) | `expo-secure-store` + `@react-native-async-storage/async-storage` |
| **전략** | Network-first (Serwist defaultCache) | 동일 — 네트워크 우선, 실패 시 캐시 |
| **오프라인 출퇴근** | 불가 | 로컬 큐 -> 연결 복구 시 동기화 (향후) |

**Phase 1 (출시 시):**
- 오프라인 시 "인터넷 연결을 확인해주세요" 안내
- 이전에 로드된 스케줄/공지는 로컬 캐시에서 읽기 전용 표시

**Phase 2 (향후):**
- 오프라인 출퇴근 기록을 로컬 큐에 저장
- 연결 복구 시 자동 동기화
- 충돌 해결 로직 (서버 타임스탬프 우선)

---

## 3. 앱스토어 준비

### 3-1. Apple Developer Program

| 항목 | 상세 |
|------|------|
| **비용** | $99/년 (약 13만원) |
| **계정** | 개인 또는 조직 (사업자 등록증 필요) |
| **공유** | Apple Developer 팀 멤버로 초대 가능 (Admin/Developer 역할) |
| **필수 설정** | Certificates, Identifiers, Profiles |
| **추천** | 개인 계정으로 시작 -> 법인 설립 시 조직 계정 전환 |

**등록 절차:**
1. [developer.apple.com](https://developer.apple.com) 가입
2. Apple Developer Program 등록 ($99 결제)
3. App ID 등록 (Bundle Identifier: `com.chulchek.app`)
4. Push Notification 기능 활성화
5. Sign In with Apple 기능 활성화
6. Associated Domains 기능 활성화 (Universal Links용)
7. Provisioning Profile 생성 (개발용 + 배포용)

### 3-2. Google Play Console

| 항목 | 상세 |
|------|------|
| **비용** | $25 일회성 |
| **계정** | Google 계정 |
| **공유** | Play Console 사용자 초대 가능 |
| **필수 설정** | 서명 키, 앱 콘텐츠 정보 |

**등록 절차:**
1. [play.google.com/console](https://play.google.com/console) 가입 ($25 결제)
2. 개발자 프로필 설정 (이름, 주소, 연락처)
3. 앱 생성 (패키지명: `com.chulchek.app`)
4. Firebase 프로젝트 연결 (FCM용)
5. 앱 서명 키 관리 (Google Play App Signing 권장)

### 3-3. 앱 이름, 설명, 준비물

#### 앱 기본 정보

| 항목 | 내용 |
|------|------|
| **앱 이름** | 출첵 - 매장 출퇴근 관리 |
| **부제 (iOS)** | 위치 기반 스마트 근태 관리 |
| **짧은 설명 (Android)** | GPS 기반 출퇴근, 스케줄, 급여까지 한 번에 |
| **카테고리** | 비즈니스 (Business) |
| **연령 등급** | 4+ (iOS) / 전체이용가 (Android) |
| **개인정보처리방침 URL** | `https://출첵.app/privacy` (필수) |
| **지원 URL** | `https://출첵.app/support` |

#### 앱 설명 (긴 설명)

```
출첵은 매장 사장님과 직원을 위한 스마트 출퇴근 관리 앱이에요.

주요 기능:
- GPS 기반 출퇴근: 매장 근처에서만 출퇴근 가능
- 스마트 스케줄: 주간 근무표 한눈에 확인
- 실시간 알림: 출퇴근, 스케줄 변경, 대타 요청 알림
- 급여 자동 계산: 스케줄 기반 급여 계산 + 공제 자동 처리
- 근태 크레딧: 성실한 근태 기록이 점수로 쌓여요
- 대타 요청: 한 번에 대타 요청하고 수락받기
- 레시피 관리: 매장 레시피를 팀과 공유
- 다중 매장: 여러 매장 한 번에 관리

카페, 식당, 공장 등 어떤 매장이든 쉽고 빠르게 시작해요.
```

#### 필수 에셋

| 에셋 | iOS 규격 | Android 규격 |
|------|----------|-------------|
| **앱 아이콘** | 1024x1024 (PNG, 투명 불가) | 512x512 (PNG, 32-bit) |
| **스크린샷** | 6.7" (1290x2796), 6.5" (1284x2778), 5.5" (1242x2208) | 최소 2장, 16:9 또는 9:16 |
| **기능 그래픽 (Android)** | 해당 없음 | 1024x500 (PNG/JPEG) |
| **프리뷰 비디오 (선택)** | 30초 이내 | 30초~2분 |
| **스플래시 스크린** | LaunchScreen.storyboard | Expo SplashScreen |

**스크린샷 촬영 계획 (최소 5장):**
1. 로그인 화면 (카카오 + Apple 버튼)
2. 홈 화면 (출퇴근 버튼 + 매장 거리 표시)
3. 스케줄 캘린더
4. 관리자 대시보드
5. 급여 정산 화면

### 3-4. 심사 가이드라인 주의사항

#### Apple App Store

| 가이드라인 | 주의사항 | 대응 |
|-----------|---------|------|
| **4.2 Minimum Functionality** | 단순 WebView 래핑 리젝 | React Native 네이티브 UI 사용 |
| **4.2 Design** | 웹사이트를 그대로 앱으로 포장 금지 | 네이티브 UI 컴포넌트 + 터치 최적화 |
| **4.8 Sign In with Apple** | 소셜 로그인 제공 시 Apple 로그인 필수 | 카카오 + Apple 동시 제공 |
| **5.1.1 Data Collection** | 위치 데이터 수집 사유 명시 | 출퇴근 기록을 위한 위치 확인 명시 |
| **5.1.2 Data Use** | 개인정보처리방침 필수 | 웹 개인정보처리방침 페이지 |
| **2.5.4 Background** | 백그라운드 위치 사용 시 사유 필수 | Phase 1에서는 포그라운드만 사용 |
| **3.1.1 In-App Purchase** | 디지털 콘텐츠 판매 시 IAP 필수 | SaaS 구독은 B2B이므로 외부 결제 가능 (Reader Rule) |

**중요: B2B SaaS 앱의 결제 예외**
- 출첵은 B2B SaaS (사업주가 구독) -> App Store 외부 결제 허용
- 앱 내에서 개인 소비자에게 직접 판매하지 않으므로 IAP 필수 아님
- 단, 심사 시 "Business use only" 임을 명확히 기재

#### Google Play Store

| 가이드라인 | 주의사항 | 대응 |
|-----------|---------|------|
| **위치 권한** | `ACCESS_FINE_LOCATION` 사유 설명 | 앱 콘텐츠 > 권한 선언 작성 |
| **데이터 보안** | 데이터 안전 섹션 필수 작성 | 수집 데이터 항목별 기재 |
| **타겟 API 수준** | 최신 API 레벨 요구 | Expo SDK가 자동 관리 |
| **콘텐츠 등급** | IARC 설문 응답 | 비즈니스 앱 — 전체이용가 |

---

## 4. 딥링크 설정

### 4-1. 전체 딥링크 아키텍처

```
[사용자가 링크 클릭]
  │
  ├── 앱 설치됨
  │   ├── iOS: Universal Link -> 앱 직접 열림
  │   └── Android: App Link -> 앱 직접 열림
  │
  └── 앱 미설치
      ├── iOS: 웹 폴백 (Safari) -> 앱스토어 배너 표시
      └── Android: 웹 폴백 (Chrome) -> Play 스토어 배너 표시
```

### 4-2. Universal Links (iOS)

**설정 파일: `apple-app-site-association` (AASA)**

웹 서버 (`https://출첵.app/.well-known/apple-app-site-association`):
```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appIDs": ["TEAM_ID.com.chulchek.app"],
        "components": [
          { "/": "/join", "comment": "초대 수락" },
          { "/": "/join?*", "comment": "초대 수락 (쿼리 포함)" },
          { "/": "/*/", "comment": "조직 홈" },
          { "/": "/*/admin/*", "comment": "관리자 페이지" }
        ]
      }
    ]
  }
}
```

**Next.js에서 AASA 서빙:**
```typescript
// src/app/.well-known/apple-app-site-association/route.ts
export async function GET() {
  return Response.json({
    applinks: {
      apps: [],
      details: [{
        appIDs: ["TEAM_ID.com.chulchek.app"],
        components: [
          { "/": "/join", "comment": "invite" },
          { "/": "/join?*", "comment": "invite with params" },
        ]
      }]
    }
  }, {
    headers: { 'Content-Type': 'application/json' }
  });
}
```

**Expo 앱 설정 (`app.json`):**
```json
{
  "expo": {
    "ios": {
      "associatedDomains": ["applinks:출첵.app"]
    }
  }
}
```

### 4-3. App Links (Android)

**설정 파일: `assetlinks.json`**

웹 서버 (`https://출첵.app/.well-known/assetlinks.json`):
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.chulchek.app",
    "sha256_cert_fingerprints": ["SHA256_FINGERPRINT_HERE"]
  }
}]
```

**Expo 앱 설정 (`app.json`):**
```json
{
  "expo": {
    "android": {
      "intentFilters": [{
        "action": "VIEW",
        "autoVerify": true,
        "data": [{
          "scheme": "https",
          "host": "출첵.app",
          "pathPrefix": "/join"
        }],
        "category": ["BROWSABLE", "DEFAULT"]
      }]
    }
  }
}
```

### 4-4. 카카오톡 초대 딥링크 흐름

```
[사장님] 직원 초대 버튼 탭
  │
  ├── 1. 서버에서 초대 코드 생성 (tenant_invites 테이블)
  │
  ├── 2. 카카오 공유 API 호출
  │     KakaoShare.sendDefault({
  │       content: {
  │         title: '출첵 - 직원 초대',
  │         link: {
  │           // ❶ 웹 URL (앱 미설치 시 웹으로 이동)
  │           mobileWebUrl: 'https://출첵.app/join?code=ABC123&org=yeonggyeongdang',
  │           webUrl: 'https://출첵.app/join?code=ABC123&org=yeonggyeongdang',
  │         }
  │       },
  │       // ❷ 앱 설치 시 앱 열기 (선택 — 카카오 커스텀 URL 스킴)
  │       installUrl: 'https://출첵.app/join?code=ABC123&org=yeonggyeongdang'
  │     })
  │
  ├── 3. 직원이 카카오톡 메시지 수신
  │
  └── 4. "초대 수락하기" 버튼 탭
        │
        ├── 앱 설치됨 → Universal Link/App Link로 앱 열림
        │   └── /join?code=ABC123&org=yeonggyeongdang 화면으로 이동
        │       ├── 로그인됨 → 즉시 조직 가입
        │       └── 미로그인 → 회원가입/로그인 → 자동 가입
        │
        └── 앱 미설치 → 웹 브라우저로 이동
            └── 웹에서 /join 페이지 표시
                ├── Smart App Banner (iOS): "출첵 앱에서 열기"
                ├── 웹에서 그대로 가입도 가능 (PWA)
                └── 앱 설치 유도 배너 표시
```

### 4-5. 앱 미설치 시 웹 폴백 전략

```typescript
// src/app/join/page.tsx (웹)
// 앱 설치 감지 -> 스토어 유도

export default function JoinPage({ searchParams }) {
  const { code, org } = searchParams;

  return (
    <div>
      {/* Smart App Banner (iOS Safari 자동 지원) */}
      <meta name="apple-itunes-app" content="app-id=APP_ID, app-argument=/join?code=${code}" />

      {/* Android: Play Store 배너 */}
      {/* 웹에서 직접 가입 UI도 제공 */}
      <JoinForm code={code} org={org} />

      {/* 앱 설치 유도 배너 */}
      <AppInstallBanner />
    </div>
  );
}
```

---

## 5. 푸시 알림 네이티브 전환

### 5-1. 현재 Web Push 구조

```
[현재 PWA]
  클라이언트: Service Worker (sw.ts) -> PushEvent -> showNotification()
  서버: web-push 라이브러리 (VAPID 키) -> Web Push Protocol
  DB: push_subscriptions (endpoint, p256dh, auth_key)
  흐름: Next.js API Route -> web-push -> 브라우저 Push Service -> SW
```

### 5-2. 네이티브 푸시 구조 (목표)

```
[네이티브 앱]
  클라이언트: expo-notifications -> FCM/APNs 토큰 발급
  서버: FCM HTTP v1 API (서버 키) -> FCM -> APNs
  DB: device_tokens (신규 테이블)
  흐름: Supabase Edge Function or Next.js API -> FCM API -> 디바이스
```

### 5-3. DB 변경

```sql
-- 네이티브 디바이스 토큰 저장 테이블
CREATE TABLE device_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token           text NOT NULL,                          -- FCM/APNs 디바이스 토큰
  platform        text NOT NULL,                          -- 'ios' | 'android'
  device_id       text,                                   -- 디바이스 식별자 (중복 방지)
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE(token)   -- 같은 토큰 중복 등록 방지
);

CREATE INDEX idx_device_tokens_profile ON device_tokens(profile_id);
CREATE INDEX idx_device_tokens_active ON device_tokens(is_active) WHERE is_active = true;
```

### 5-4. 서버사이드 발송 로직 변경

```
현재: push-server.ts (web-push 라이브러리)
  └── sendPushToProfile() -> push_subscriptions 조회 -> web-push.sendNotification()

변경 후: push-server.ts 확장
  └── sendPushToProfile()
      ├── push_subscriptions 조회 -> web-push.sendNotification()  [웹 유저]
      └── device_tokens 조회 -> FCM HTTP v1 API 호출             [앱 유저]
```

```typescript
// 추가될 FCM 발송 함수
import { google } from 'googleapis';

async function sendFCMNotification(
  tokens: string[],
  payload: PushPayload
): Promise<void> {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!),
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  });
  const accessToken = await auth.getAccessToken();

  await Promise.allSettled(
    tokens.map((token) =>
      fetch(
        `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token,
              notification: {
                title: payload.title,
                body: payload.body,
              },
              data: {
                url: payload.url ?? '/',
                type: payload.type,
                notificationId: payload.notificationId ?? '',
              },
              apns: {
                payload: {
                  aps: { sound: 'default', badge: 1 },
                },
              },
              android: {
                notification: { sound: 'default' },
              },
            },
          }),
        }
      )
    )
  );
}
```

### 5-5. 클라이언트 토큰 등록 (앱)

```typescript
// lib/hooks/usePushNotification.ts (React Native)
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

export function usePushNotification() {
  async function registerForPush() {
    if (!Device.isDevice) return; // 시뮬레이터 제외

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    // Expo Push Token 대신 직접 FCM/APNs 토큰 사용
    const token = await Notifications.getDevicePushTokenAsync();

    // Supabase에 토큰 등록
    await supabase.from('device_tokens').upsert({
      profile_id: user.id,
      token: token.data,
      platform: Platform.OS, // 'ios' | 'android'
      device_id: Device.modelId,
    }, { onConflict: 'token' });
  }

  return { registerForPush };
}
```

### 5-6. 웹 + 네이티브 병행 발송

```typescript
// push-server.ts 수정 후 통합 흐름
export async function sendPushToProfile(
  profileId: string,
  payload: PushPayload
): Promise<void> {
  const [prefs, webSubs, deviceTokens] = await Promise.all([
    getPreferences(profileId),
    getWebSubscriptions(profileId),    // push_subscriptions (기존)
    getDeviceTokens(profileId),         // device_tokens (신규)
  ]);

  if (!prefs?.enabled) return;
  if (!isTypeEnabled(prefs.type_settings, payload.type)) return;

  // 웹 푸시 (기존 유저 유지)
  if (webSubs.length > 0) {
    await deliverWebPush(webSubs, payload);
  }

  // 네이티브 푸시 (신규)
  if (deviceTokens.length > 0) {
    await sendFCMNotification(
      deviceTokens.map(t => t.token),
      payload
    );
  }
}
```

---

## 6. 개발 일정 추정

### 6-1. 전제 조건
- 멀티테넌트 SaaS 전환(블루프린트 Phase 1~8) 완료 이후 시작
- 1인 개발 (정표)
- React Native (Expo) 선택 기준
- 웹 앱은 계속 운영 중

### 6-2. 단계별 일정

| Phase | 내용 | 예상 기간 | 누적 |
|-------|------|----------|------|
| **Phase 0** | 환경 세팅 + 계정 준비 | 1주 | 1주 |
| **Phase 1** | 핵심 인증 + 홈 화면 | 2주 | 3주 |
| **Phase 2** | 출퇴근 + GPS 연동 | 1.5주 | 4.5주 |
| **Phase 3** | 스케줄 + 캘린더 | 1.5주 | 6주 |
| **Phase 4** | 푸시 알림 (FCM/APNs) | 1주 | 7주 |
| **Phase 5** | 관리자 기능 | 2주 | 9주 |
| **Phase 6** | 카카오 SDK + 딥링크 | 1주 | 10주 |
| **Phase 7** | 테스트 + 버그 수정 | 1주 | 11주 |
| **Phase 8** | 앱스토어 심사 + 출시 | 1주 | 12주 |

**총 예상: 약 12주 (3개월)**

### 6-3. 상세 태스크

#### Phase 0: 환경 세팅 (1주)

```
□ Apple Developer Program 등록 ($99)
□ Google Play Console 등록 ($25)
□ Firebase 프로젝트 생성 (FCM용)
□ Expo 프로젝트 초기화 (npx create-expo-app)
□ Expo Router 설정
□ Supabase 클라이언트 설정 (expo-secure-store 세션 저장)
□ Pretendard 폰트 로드 (expo-font)
□ 기본 디자인 시스템 구축 (Button, Card, Input, BottomSheet)
□ 카카오 디벨로퍼스 플랫폼 등록 (iOS Bundle ID, Android 패키지명)
□ EAS Build 설정 (eas.json)
```

#### Phase 1: 인증 + 홈 (2주)

```
□ 로그인 화면 (이메일 + 카카오 + Apple)
□ Apple Sign In 네이티브 구현 (expo-apple-authentication)
□ 카카오 로그인 구현 (@react-native-kakao/user)
□ 이메일 로그인/회원가입
□ 인증 상태 관리 (AuthContext)
□ 조직 선택/생성/가입 화면
□ 하단 탭 네비게이션 (홈, 캘린더, 매장, 마이)
□ 홈 화면 (매장 거리 목록 + 출퇴근 버튼)
□ 마이페이지 기본
```

#### Phase 2: 출퇴근 + GPS (1.5주)

```
□ expo-location 연동 (useGeolocation 네이티브 재작성)
□ 위치 권한 요청 + 거부 시 안내
□ 매장 거리 계산 + 반경 확인
□ 출퇴근 기록 API 호출
□ 출퇴근 이력 화면
□ 원격/출장 출퇴근 모드
```

#### Phase 3: 스케줄 + 캘린더 (1.5주)

```
□ 주간 스케줄 캘린더 뷰
□ 일별 상세 스케줄
□ 대타 요청/수락 UI
□ 공지사항 리스트
□ 레시피 뷰어
```

#### Phase 4: 푸시 알림 (1주)

```
□ expo-notifications 설정
□ FCM 설정 (google-services.json, GoogleService-Info.plist)
□ 디바이스 토큰 등록 API
□ device_tokens 테이블 생성 (마이그레이션)
□ push-server.ts 확장 (FCM 발송 추가)
□ 알림 수신 핸들러 (앱 열려있을 때 / 백그라운드 / 종료 상태)
□ 알림 탭 시 해당 화면 이동
□ 푸시 설정 (알림 유형별 on/off)
```

#### Phase 5: 관리자 기능 (2주)

```
□ 관리자 대시보드 (출근 현황)
□ 직원 관리 (목록, 초대, 해제)
□ 근태 관리 (출퇴근 기록 조회/수정)
□ 통합 캘린더 (스케줄 편집)
□ 급여 정산 화면
□ 통계 화면
□ 매장 설정 (매장 추가/수정, 위치 설정)
```

#### Phase 6: 카카오 SDK + 딥링크 (1주)

```
□ @react-native-kakao/share 연동
□ 직원 초대 카카오 공유
□ Universal Links 설정 (AASA 파일)
□ App Links 설정 (assetlinks.json)
□ 딥링크 수신 핸들러 (Expo Linking)
□ 초대 딥링크 흐름 테스트
□ 앱 미설치 시 웹 폴백 확인
```

#### Phase 7: 테스트 (1주)

```
□ iOS 실기기 테스트 (출퇴근, 푸시, 딥링크)
□ Android 실기기 테스트
□ 다양한 네트워크 상태 테스트 (Wi-Fi, LTE, 오프라인)
□ GPS 정확도 검증 (여러 매장)
□ 푸시 알림 수신 테스트 (포그라운드/백그라운드/종료)
□ 딥링크 테스트 (카카오톡 -> 앱)
□ 다크 모드 테스트
□ 버그 수정 및 성능 최적화
```

#### Phase 8: 앱스토어 출시 (1주)

```
□ 앱 아이콘/스플래시 스크린 제작
□ 스크린샷 촬영 (iOS 3사이즈 + Android)
□ 앱 설명/키워드 작성
□ 개인정보처리방침 페이지 배포
□ TestFlight 배포 (iOS 내부 테스트)
□ Google Play 내부 테스트 트랙 배포
□ Apple App Store 심사 제출
□ Google Play 심사 제출
□ 심사 통과 후 정식 출시
```

---

## 7. PWA와 네이티브 앱 병행 전략

### 7-1. 병행 운영 원칙

```
출첵 플랫폼
  │
  ├── 웹 (Next.js PWA) — chulchek.app
  │   └── 모든 기능 100% 동작
  │       브라우저에서 바로 접근
  │       PWA 설치도 가능
  │       SEO, 앱스토어 없이 접근
  │
  └── 네이티브 앱 (React Native)
      ├── iOS (App Store)
      └── Android (Google Play)
          네이티브 푸시 (안정적)
          GPS 정확도 향상
          카메라/갤러리 네이티브 접근
          Apple Sign In 네이티브
```

**핵심 원칙: 웹이 1차, 앱은 보조가 아닌 "동등"**
- 웹을 먼저 업데이트하고, 앱이 따라가는 구조
- 단, 앱 전용 기능(백그라운드 푸시 등)은 앱에서만 동작
- 같은 Supabase 백엔드를 공유하므로 데이터는 항상 동기화

### 7-2. 코드 공유 전략

```
ygd_hr/                              (웹 — 기존 저장소)
  ├── src/
  │   ├── lib/
  │   │   ├── types.ts               ── 공유 가능 ──┐
  │   │   ├── credit-engine.ts       ── 공유 가능 ──┤
  │   │   ├── tier-utils.ts          ── 공유 가능 ──┤
  │   │   ├── payroll-calc.ts        ── 공유 가능 ──┤
  │   │   ├── notifications.ts       ── 공유 가능 ──┤ npm 패키지 또는
  │   │   ├── notificationUrls.ts    ── 공유 가능 ──┤ Git submodule
  │   │   └── push-server.ts         ── 서버 전용 ──┘
  │   └── ...
  └── ...

chulchek-app/                        (앱 — 별도 저장소)
  ├── lib/
  │   ├── shared/                    <-- 웹에서 복사 또는 패키지 참조
  │   │   ├── types.ts
  │   │   ├── credit-engine.ts
  │   │   ├── tier-utils.ts
  │   │   └── payroll-calc.ts
  │   ├── supabase.ts               (앱 전용 — SecureStore 기반)
  │   └── hooks/                     (앱 전용 — expo-location 등)
  └── ...
```

**공유 방식 선택지:**

| 방식 | 장점 | 단점 | 추천 |
|------|------|------|------|
| **수동 복사** | 간단, 의존성 없음 | 동기화 누락 가능 | MVP 단계 |
| **Git submodule** | 버전 관리 명확 | 운영 복잡 | 중기 |
| **npm 패키지 (private)** | 정석, 버전 관리 | 패키지 관리 오버헤드 | 장기 |
| **monorepo (Turborepo)** | 한 저장소에서 관리 | 초기 설정 복잡, 기존 구조 변경 필요 | 팀 규모 커질 때 |

**Phase 1 추천: 수동 복사** -> 앱 안정화 후 monorepo 또는 npm 패키지 전환

### 7-3. API 엔드포인트 공유

```
웹: Next.js API Routes (/api/...)
  └── 출퇴근 기록, 스케줄 조회, 알림 발송 등

앱: 동일 API 호출 (HTTPS)
  └── fetch('https://chulchek.app/api/...')
  └── 또는 Supabase 클라이언트 직접 호출 (RLS 적용)
```

- API Routes는 웹 서버(Vercel)에서 호스팅 — 앱도 같은 엔드포인트 호출
- 단순 CRUD는 Supabase 클라이언트 직접 호출 (RLS가 권한 관리)
- 복잡한 로직(푸시 발송, 급여 계산)은 API Routes 또는 Supabase Edge Functions 사용

### 7-4. 사용자 유도 전략

```
[웹 방문자]
  └── 하단 Smart App Banner: "출첵 앱으로 더 편하게 사용해보세요"
  └── 마이페이지 > "앱 다운로드" 섹션

[앱 미설치 딥링크]
  └── 웹에서 앱 설치 유도 배너

[앱 사용자]
  └── 웹으로 유도하지 않음 (앱 우선)
  └── 단, 일부 관리자 기능은 "웹에서 더 편하게 관리해요" 안내 가능
```

### 7-5. 버전 관리 전략

```
웹 버전: 자동 배포 (Vercel — 커밋마다)
  └── 사용자가 새로고침하면 최신 버전

앱 버전: EAS Update (OTA) + 스토어 업데이트
  ├── JS 번들 변경: EAS Update (심사 없이 즉시 배포)
  │   └── UI 수정, 로직 변경, 버그 수정
  ├── 네이티브 코드 변경: 스토어 업데이트 (심사 필요)
  │   └── 새 네이티브 모듈 추가, SDK 버전 업그레이드
  └── 강제 업데이트: 최소 버전 체크
      └── Supabase에 min_app_version 저장 -> 앱 시작 시 확인
```

---

## 8. 체크리스트

### 8-1. 계정 및 인증서

```
□ Apple Developer Program 등록 ($99/년)
   └── Apple ID: ________________
   └── Team ID: ________________
   └── 결제일: ________________

□ Google Play Console 등록 ($25 일회성)
   └── Google 계정: ________________
   └── 개발자 프로필 설정 완료

□ Firebase 프로젝트 생성
   └── 프로젝트명: chulchek
   └── iOS 앱 등록 (Bundle ID: com.chulchek.app)
   └── Android 앱 등록 (패키지명: com.chulchek.app)
   └── google-services.json 다운로드 (Android)
   └── GoogleService-Info.plist 다운로드 (iOS)
   └── FCM 서버 키 (서비스 계정) 발급

□ 카카오 디벨로퍼스 앱 등록
   └── 앱 키 (네이티브 앱 키): ________________
   └── iOS 플랫폼 등록 (Bundle ID)
   └── Android 플랫폼 등록 (패키지명 + 키해시)

□ Apple Sign In 설정
   └── App ID에 Sign In with Apple 활성화
   └── Supabase Apple Provider 설정
```

### 8-2. 프로젝트 설정

```
□ Expo 프로젝트 초기화
   └── npx create-expo-app chulchek-app --template tabs
   └── Expo Router 설정
   └── TypeScript 설정

□ EAS CLI 설정
   └── npm install -g eas-cli
   └── eas login
   └── eas build:configure

□ 앱 식별자 설정
   └── Bundle ID (iOS): com.chulchek.app
   └── Package Name (Android): com.chulchek.app
   └── app.json 설정 완료

□ 네이티브 모듈 설치
   └── expo-location
   └── expo-notifications
   └── expo-camera
   └── expo-image-picker
   └── expo-apple-authentication
   └── expo-secure-store
   └── expo-font (Pretendard)
   └── @react-native-kakao/core
   └── @react-native-kakao/share
   └── @react-native-kakao/user
   └── @supabase/supabase-js

□ Supabase 클라이언트 설정
   └── SecureStore 기반 세션 저장
   └── 환경변수 (.env)
```

### 8-3. 개발

```
□ 디자인 시스템 구축
   └── 컬러 토큰 (primary #3182F6 등)
   └── Button, Card, Input, BottomSheet 컴포넌트
   └── 토스 UX 가이드 반영 (~해요 체 등)

□ 인증 흐름
   └── 이메일 로그인/회원가입
   └── 카카오 네이티브 로그인
   └── Apple 네이티브 로그인
   └── 자동 로그인 (SecureStore 세션 유지)

□ 핵심 기능
   └── GPS 출퇴근 (expo-location)
   └── 스케줄 캘린더
   └── 관리자 대시보드
   └── 급여 정산

□ 푸시 알림
   └── device_tokens 테이블 마이그레이션
   └── FCM 발송 서버 로직
   └── 앱 토큰 등록
   └── 알림 수신/탭 핸들러

□ 카카오 SDK
   └── 카카오 공유 (직원 초대)
   └── 딥링크 수신 처리

□ 딥링크
   └── AASA 파일 배포 (Universal Links)
   └── assetlinks.json 배포 (App Links)
   └── 앱 내 딥링크 라우팅
```

### 8-4. 테스트

```
□ 기능 테스트
   └── 출퇴근 (GPS 반경 내/외)
   └── 스케줄 CRUD
   └── 알림 수신 (포그라운드/백그라운드/종료)
   └── 딥링크 (카카오 -> 앱)
   └── Apple/카카오 로그인
   └── 오프라인 상태 처리

□ 디바이스 테스트
   └── iPhone (최소 iOS 16+)
   └── Android (최소 API 26, Android 8.0+)
   └── 다양한 화면 크기

□ 보안 테스트
   └── 인증 토큰 SecureStore 저장 확인
   └── API 호출 시 인증 헤더 확인
   └── 민감 데이터 로그 미노출 확인
```

### 8-5. 배포

```
□ 앱 에셋 준비
   └── 앱 아이콘 (1024x1024)
   └── 스플래시 스크린
   └── 스크린샷 (iPhone 6.7", 6.5", 5.5" / Android)
   └── 기능 그래픽 (Android 1024x500)

□ 앱스토어 정보
   └── 앱 이름, 부제, 설명, 키워드
   └── 카테고리: 비즈니스
   └── 연령 등급 설정
   └── 개인정보처리방침 URL 배포

□ 빌드 및 제출
   └── eas build --platform ios --profile production
   └── eas build --platform android --profile production
   └── eas submit --platform ios
   └── eas submit --platform android

□ 심사 대응
   └── 데모 계정 준비 (Apple 심사용)
   └── 위치 권한 사유 설명 (Notes for reviewer)
   └── 푸시 알림 사유 설명
   └── 리젝 시 대응 계획

□ 출시 후
   └── Crashlytics / Sentry 모니터링 설정
   └── EAS Update 테스트 (OTA 업데이트)
   └── 앱 설치 유도 배너 웹에 추가
   └── 사용자 가이드 업데이트
```

---

## 부록 A: Firebase 프로젝트 설정 요약

```
Firebase Console > 프로젝트 생성 (chulchek)
  │
  ├── iOS 앱 추가
  │   └── Bundle ID: com.chulchek.app
  │   └── GoogleService-Info.plist 다운로드 → Expo 프로젝트에 추가
  │
  ├── Android 앱 추가
  │   └── 패키지명: com.chulchek.app
  │   └── SHA-1 (디버그): keytool -list -v -keystore ~/.android/debug.keystore
  │   └── google-services.json 다운로드 → Expo 프로젝트에 추가
  │
  └── Cloud Messaging
      └── 서버 키 (레거시) → 사용 안 함
      └── FCM HTTP v1 API → 서비스 계정 JSON으로 인증
      └── 서비스 계정 JSON → FIREBASE_SERVICE_ACCOUNT 환경변수
```

## 부록 B: Expo app.json 예시

```json
{
  "expo": {
    "name": "출첵",
    "slug": "chulchek",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "scheme": "chulchek",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#F2F4F6"
    },
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.chulchek.app",
      "associatedDomains": ["applinks:chulchek.app"],
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "출퇴근 기록을 위해 현재 위치를 확인해요.",
        "NSLocationAlwaysAndWhenInUseUsageDescription": "자동 출퇴근 기능을 위해 위치 정보가 필요해요.",
        "NSCameraUsageDescription": "서류 촬영을 위해 카메라 접근이 필요해요.",
        "NSPhotoLibraryUsageDescription": "서류 이미지를 선택하기 위해 사진 접근이 필요해요."
      },
      "config": {
        "usesNonExemptEncryption": false
      }
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#F2F4F6"
      },
      "package": "com.chulchek.app",
      "intentFilters": [
        {
          "action": "VIEW",
          "autoVerify": true,
          "data": [
            {
              "scheme": "https",
              "host": "chulchek.app",
              "pathPrefix": "/join"
            },
            {
              "scheme": "https",
              "host": "chulchek.app",
              "pathPrefix": "/"
            }
          ],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ],
      "permissions": [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "CAMERA",
        "READ_EXTERNAL_STORAGE",
        "RECEIVE_BOOT_COMPLETED",
        "VIBRATE"
      ],
      "googleServicesFile": "./google-services.json"
    },
    "plugins": [
      "expo-router",
      "expo-font",
      "expo-secure-store",
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "자동 출퇴근 기능을 위해 위치 정보가 필요해요.",
          "locationWhenInUsePermission": "출퇴근 기록을 위해 현재 위치를 확인해요."
        }
      ],
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#3182F6"
        }
      ],
      [
        "expo-camera",
        {
          "cameraPermission": "서류 촬영을 위해 카메라 접근이 필요해요."
        }
      ],
      [
        "expo-image-picker",
        {
          "photosPermission": "서류 이미지를 선택하기 위해 사진 접근이 필요해요."
        }
      ],
      "expo-apple-authentication"
    ]
  }
}
```

## 부록 C: 비용 요약

| 항목 | 비용 | 주기 |
|------|------|------|
| Apple Developer Program | $99 (약 13만원) | 연간 |
| Google Play Console | $25 (약 3.3만원) | 일회성 |
| Firebase (Spark Plan) | 무료 | - |
| EAS Build (Free Tier) | 무료 (월 30회) | - |
| EAS Build (Production) | $99/월 (필요 시) | 월간 |
| Expo 계정 | 무료 | - |
| **초기 비용 합계** | **약 16.3만원** | |
| **연간 유지 비용** | **약 13만원** (Apple만) | |

> Firebase Spark(무료) 플랜: FCM 무제한, Analytics 무료.
> EAS Build 무료 티어로 시작 -> 빌드 빈도 높아지면 유료 전환 검토.
