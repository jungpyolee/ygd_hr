"use client";

import { useEffect, useState } from "react";
// 💡 필요한 아이콘 추가: MoreHorizontal, Compass, Share, PlusSquare, AlertTriangle, MoveDown
import {
  Share,
  Compass,
  MoreHorizontal,
  PlusSquare,
  AlertTriangle,
  X,
  MoveDown,
} from "lucide-react";

export default function KakaoEscape() {
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isKakaoTalk = userAgent.includes("kakaotalk");

    if (isKakaoTalk) {
      setIsInAppBrowser(true);

      // 💡 안드로이드 카카오톡인 경우 외부 브라우저로 자동 점프 (유효)
      if (userAgent.includes("android")) {
        location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(
          location.href
        )}`;
      }
    }
  }, []);

  if (!isInAppBrowser) return null;

  // 💡 안드로이드는 자동 탈출하므로, iOS 전용으로 detailed prompt를 보여줍니다.
  return (
    <div className="fixed inset-0 z-[9999] bg-[#F2F4F6] flex flex-col items-center justify-center px-6 font-pretendard animate-in fade-in duration-300">
      <div className="w-full max-w-sm bg-white rounded-3xl p-8 text-center shadow-lg border border-slate-100">
        <div className="w-16 h-16 bg-[#FEE500] rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
          <AlertTriangle className="w-8 h-8 text-slate-800" />
        </div>

        <h1 className="text-xl font-bold text-[#191F28] mb-3 leading-tight">
          앱 설치를 위해
          <br />
          외부 브라우저로 열어주세요
        </h1>
        <p className="text-sm text-[#4E5968] mb-8 leading-relaxed">
          카카오톡 내부에서는 출퇴근 기능과
          <br />앱 설치가 정상적으로 작동하지 않아요.
        </p>

        {/* 💡 핵심: 완벽한 세로형 3단계 정밀 플로우 가이드 */}
        <div className="flex flex-col gap-4 items-center bg-[#F9FAFB] rounded-2xl p-5 text-left border border-slate-100">
          <p className="text-[14px] font-bold text-[#333D4B] self-start mb-1">
            👇 아래 순서대로 해주세요
          </p>

          {/* Step 1: 카톡 공유하기 */}
          <div className="w-full flex items-center gap-3 animate-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-1.5 bg-white px-2.5 py-2 rounded-xl shadow-sm border border-slate-100 flex-shrink-0">
              <Share className="w-4 h-4 text-blue-500" /> 공유하기
            </div>
            <p className="text-[13px] text-[#4E5968]">
              <strong>1. 우측 하단</strong>에 있는{" "}
              <strong className="text-[#191F28]">공유 아이콘</strong>을
              눌러주세요.
            </p>
          </div>

          {/* 💡 스텝 사이 세모 아이콘 */}
          <MoveDown className="w-5 h-5 text-slate-400 opacity-50" />

          {/* Step 2: 사파리로 열기 (탈출) */}
          <div className="w-full flex items-center gap-3 animate-in slide-in-from-top-3 duration-300">
            <div className="flex items-center gap-1.5 bg-white px-2.5 py-2 rounded-xl shadow-sm border border-slate-100 flex-shrink-0">
              <Compass className="w-4 h-4 text-blue-500" /> Safari로 열기
            </div>
            <p className="text-[13px] text-[#4E5968]">
              <strong>2. 나타난 목록</strong>에서{" "}
              <strong className="text-[#191F28]">'Safari로 열기'</strong>{" "}
              아이콘을 선택해 주세요.
            </p>
          </div>

          {/* 💡 스텝 사이 세모 아이콘 */}
          <MoveDown className="w-5 h-5 text-slate-400 opacity-50" />

          {/* Step 3: 사파리에서 앱 설치 (최종 정착) */}
          <div className="w-full space-y-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm animate-in slide-in-from-top-4 duration-400">
            <h4 className="text-[14px] font-bold text-[#333D4B]">
              3. 사파리에서 홈 화면에 추가
            </h4>
            <p className="text-[13px] text-[#4E5968] mb-2 leading-relaxed">
              사파리 브라우저 하단 메뉴에서 공유 버튼을 누르고, 홈 화면에 추가를
              선택하시면 됩니다.
            </p>

            {/* 💡 요청하신 3단계 플로우 UI 커스텀 이식 */}
            <div className="flex flex-wrap items-center justify-center gap-2 text-[11.5px] font-medium text-[#333D4B] bg-[#F2F4F6] p-2.5 rounded-xl">
              <div className="flex items-center gap-1.5 bg-white px-2 py-1.5 rounded shadow-sm">
                <MoreHorizontal className="w-3.5 h-3.5 text-slate-600" /> 3닷
                버튼
              </div>
              <span className="text-slate-400 text-[10px]">▶</span>
              <div className="flex items-center gap-1.5 bg-white px-2 py-1.5 rounded shadow-sm">
                <Share className="w-3.5 h-3.5 text-blue-500" /> 공유하기
              </div>
              <span className="text-slate-400 text-[10px]">▶</span>
              <div className="flex items-center gap-1.5 bg-white px-2 py-1.5 rounded shadow-sm">
                <PlusSquare className="w-3.5 h-3.5 text-slate-600" /> 홈 화면
                추가
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
