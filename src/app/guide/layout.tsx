import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "이용가이드 | 연경당 HR",
  description: "연경당 HR 앱 이용가이드 — 출퇴근, 스케줄, 레시피, 공지사항 사용법",
};

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return children;
}
