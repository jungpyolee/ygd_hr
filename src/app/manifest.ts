import type { MetadataRoute } from "next";

const isDev = process.env.NEXT_PUBLIC_APP_ENV === "dev";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: isDev ? "연경당 테섭" : "연경당 HR",
    short_name: isDev ? "테섭" : "연경당",
    description: "연경당 통합 근태 관리 서비스",
    start_url: "/",
    display_override: ["standalone", "minimal-ui", "browser"],
    display: "standalone",
    orientation: "portrait",
    scope: "/",
    background_color: "#F2F4F6",
    theme_color: "#3182F6",
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
