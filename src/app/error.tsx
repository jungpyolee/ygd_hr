"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ErrorBoundary]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 pb-24 bg-white">
      <p className="text-[64px] font-bold text-[#3182F6] leading-none">!</p>
      <p className="mt-4 text-lg font-semibold text-[#191F28]">
        문제가 발생했어요
      </p>
      <p className="mt-2 text-sm text-[#8B95A1] text-center">
        일시적인 오류일 수 있어요. 다시 시도해 주세요.
      </p>
      <div className="flex gap-3 mt-8">
        <button
          onClick={reset}
          className="px-6 py-3 bg-[#3182F6] text-white text-sm font-semibold rounded-xl"
        >
          다시 시도하기
        </button>
        <button
          onClick={() => (window.location.href = "/")}
          className="px-6 py-3 bg-[#F2F4F6] text-[#4E5968] text-sm font-semibold rounded-xl"
        >
          홈으로 가기
        </button>
      </div>
    </div>
  );
}
