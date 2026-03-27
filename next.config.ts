import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts", // 서비스 워커 파일 위치
  swDest: "public/sw.js", // 빌드 결과물 위치
  disable: process.env.NODE_ENV === "development", // 개발 모드에서는 꺼둠
});

const nextConfig: NextConfig = {
  /* 기존 설정 유지 */
  reactCompiler: true,
  serverExternalPackages: ["pdf-parse"],
  webpack: (config) => {
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ymvdjxzkjodasctktunh.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

// 설정을 Serwist로 감싸서 export
export default withSerwist(nextConfig);
