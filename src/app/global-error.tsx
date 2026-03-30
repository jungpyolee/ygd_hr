"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko" className="light">
      <body className="antialiased font-pretendard">
        <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-white">
          <p className="text-[64px] font-bold text-[#3182F6] leading-none">!</p>
          <p className="mt-4 text-lg font-semibold text-[#191F28]">
            앱에 문제가 발생했어요
          </p>
          <p className="mt-2 text-sm text-[#8B95A1] text-center">
            일시적인 오류일 수 있어요. 다시 시도해 주세요.
          </p>
          <button
            onClick={reset}
            className="mt-8 px-6 py-3 bg-[#3182F6] text-white text-sm font-semibold rounded-xl"
          >
            다시 시도하기
          </button>
        </div>
      </body>
    </html>
  );
}
