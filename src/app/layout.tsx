import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "pretendard/dist/web/static/pretendard.css"; // 폰트 CSS 임포트
import { Toaster } from "sonner";
import Script from "next/script";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import KakaoEscape from "@/components/KakaoEscape";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
// 1. 뷰포트 설정: 주소창 제어 및 앱 느낌의 확대 방지
export const viewport: Viewport = {
  themeColor: "#3182F6", // 토스 블루 또는 연경당 포인트 컬러
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover", // iOS 노치 영역까지 앱 화면 채우기
};

// 2. 메타데이터 설정: PWA 및 iOS 아이콘 연동
export const metadata: Metadata = {
  title: "연경당 HR",
  description: "연경당 통합 근태 관리 서비스",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true, // 주소창 제거 핵심 설정
    statusBarStyle: "default", // 또는 "black-translucent" (상태바 투명)
    title: "연경당 HR",
    // startupImage는 생략 가능 (필요 시 추가)
  },
  formatDetection: {
    telephone: false, // 전화번호 자동 링크 방지 (UI 깨짐 방지)
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased font-pretendard`}
      >
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
