"use client";

import { useRouter } from "next/navigation";

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 pb-24 bg-white">
      <p className="text-[64px] font-bold text-[#3182F6] leading-none">404</p>
      <p className="mt-4 text-lg font-semibold text-[#191F28]">
        페이지를 찾을 수 없어요
      </p>
      <p className="mt-2 text-sm text-[#8B95A1] text-center">
        주소가 잘못되었거나 삭제된 페이지예요.
      </p>
      <button
        onClick={() => router.push("/")}
        className="mt-8 px-6 py-3 bg-[#3182F6] text-white text-sm font-semibold rounded-xl"
      >
        홈으로 돌아가기
      </button>
    </div>
  );
}
