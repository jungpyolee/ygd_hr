"use client";

import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";

export default function KakaoEscape() {
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    // 카카오톡, 라인, 인스타그램, 네이버 등 대표적인 인앱 브라우저 감지
    const targetInApp = ["kakaotalk", "line", "instagram", "naver"];
    const isMatched = targetInApp.some((keyword) =>
      userAgent.includes(keyword)
    );

    if (isMatched) {
      setIsInAppBrowser(true);

      // 💡 안드로이드 카카오톡인 경우 '외부 브라우저로 열기' 강제 실행 꼼수
      if (userAgent.includes("kakaotalk") && userAgent.includes("android")) {
        location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(
          location.href
        )}`;
      }
    }
  }, []);

  // 인앱 브라우저가 아니면 아무것도 렌더링하지 않음
  if (!isInAppBrowser) return null;

  // 아이폰이거나 자동 탈출이 실패했을 때 보여줄 전체 화면 안내
  return (
    <div className="fixed inset-0 z-[9999] bg-[#F2F4F6] flex flex-col items-center justify-center px-6 font-pretendard">
      <div className="w-full max-w-sm bg-white rounded-3xl p-8 text-center shadow-lg border border-slate-100">
        <div className="w-16 h-16 bg-[#FEE500] rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
          <AlertCircle className="w-8 h-8 text-slate-800" />
        </div>
        <h1 className="text-xl font-bold text-[#191F28] mb-3 leading-tight">
          앱 설치를 위해
          <br />
          기본 브라우저로 열어주세요
        </h1>
        <p className="text-sm text-[#4E5968] mb-8 leading-relaxed">
          카카오톡 내부에서는 출퇴근 기능과
          <br />앱 설치가 정상적으로 작동하지 않아요.
        </p>

        <div className="bg-[#F9FAFB] rounded-2xl p-4 text-left space-y-3">
          <p className="text-[13px] font-bold text-[#333D4B]">
            👇 이렇게 열어보세요
          </p>
          <ul className="text-[13px] text-[#4E5968] space-y-2">
            <li>
              <span className="font-bold text-[#3182F6]">아이폰:</span> 우측
              하단의
              <span className="inline-block mx-1 bg-white p-1 rounded shadow-sm border text-[10px]">
                🧭
              </span>
              (사파리 아이콘) 클릭
            </li>
            <li>
              <span className="font-bold text-[#3182F6]">안드로이드:</span> 우측
              상단의
              <span className="font-bold mx-1">⋮</span> 클릭 후<br />
              <span className="font-semibold text-slate-700">
                '다른 브라우저로 열기'
              </span>{" "}
              클릭
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
