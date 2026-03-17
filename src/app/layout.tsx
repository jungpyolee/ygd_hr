import type { Metadata, Viewport } from "next";
import "./globals.css";
import "pretendard/dist/web/static/pretendard.css";
import { Toaster } from "sonner";
import Script from "next/script";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import KakaoEscape from "@/components/KakaoEscape";

const isDev = process.env.NEXT_PUBLIC_APP_ENV === "dev";
const appName = isDev ? "연경당 테섭" : "연경당 HR";

// 1. 뷰포트 설정: 주소창 제어 및 앱 느낌의 확대 방지 / 모바일 다크모드 비활성화
export const viewport: Viewport = {
  themeColor: "#3182F6", // 토스 블루 또는 연경당 포인트 컬러
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover", // iOS 노치 영역까지 앱 화면 채우기
  colorScheme: "light", // 항상 라이트 모드 (모바일 다크모드 미적용)
};

// 2. 메타데이터 설정: PWA 및 iOS 아이콘 연동
export const metadata: Metadata = {
  title: appName,
  description: "연경당 통합 근태 관리 서비스",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: appName,
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: [
      { url: "/icons/apple-touch-icon.png" },
      {
        url: "/icons/apple-touch-icon-180x180.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  openGraph: {
    title: appName,
    description: "연경당 통합 근무 관리시스템 ⏱️",
    url: "https://ygd-hr.vercel.app",
    siteName: appName,
    images: [
      {
        url: "/og-image.png",
        width: 800,
        height: 400,
        alt: "연경당 HR 썸네일 이미지",
      },
    ],
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: appName,
    description: "우리 매장 스마트 출퇴근 관리 ⏱️",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="light" suppressHydrationWarning>
      <body className="antialiased font-pretendard">
        <KakaoEscape />
        {children}
        <Toaster />
        <PWAInstallPrompt />
        <Script id="register-sw" strategy="afterInteractive">
          {`
    (function() {
      var isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (!('serviceWorker' in navigator)) return;

      if (isDev) {
        navigator.serviceWorker.getRegistrations().then(function(regs) {
          regs.forEach(function(reg) { reg.unregister(); });
        });
        return;
      }

      window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
          .then(function(reg) { console.log('ServiceWorker 등록 성공:', reg.scope); })
          .catch(function(err) { console.log('ServiceWorker 등록 실패:', err); });
      });
    })();
  `}
        </Script>
      </body>
    </html>
  );
}
