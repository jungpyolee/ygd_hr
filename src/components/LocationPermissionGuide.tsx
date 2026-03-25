"use client";

import { MapPin } from "lucide-react";

interface Props {
  isOpen: boolean;
  onConfirm: () => void; // "권한 설정했어요" → 닫고 retry
  onCancel: () => void; // "나중에 할게요"
}

export default function LocationPermissionGuide({
  isOpen,
  onConfirm,
  onCancel,
}: Props) {
  if (!isOpen) return null;

  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isIOSChrome = isIOS && /CriOS/.test(ua);
  const isIOSStandalone =
    isIOS &&
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const isAndroidStandalone =
    !isIOS && window.matchMedia("(display-mode: standalone)").matches;

  let label: string;
  let steps: string[];

  if (isIOS) {
    if (isIOSStandalone) {
      // 홈 화면에 추가된 PWA
      label = "iOS 설정 방법";
      steps = [
        "설정 앱을 열어요",
        '"연경당" → 위치를 탭해요',
        '"앱 사용 중 허용"을 선택해요',
      ];
    } else if (isIOSChrome) {
      // iOS Chrome 브라우저
      label = "iOS Chrome 설정 방법";
      steps = [
        "설정 앱을 열어요",
        '"Chrome" → 위치를 탭해요',
        '"앱 사용 중 허용"을 선택해요',
      ];
    } else {
      // iOS Safari (기본)
      label = "iOS Safari 설정 방법";
      steps = [
        "주소창 왼쪽 aA 버튼을 탭해요",
        '"웹사이트 설정"을 탭해요',
        '"위치" → "허용"을 선택해요',
      ];
    }
  } else if (isAndroidStandalone) {
    // Android 설치된 PWA (주소창 없음)
    label = "Android 설정 방법";
    steps = [
      "홈 화면의 앱 아이콘을 꾹 눌러요",
      '"사이트 설정"을 탭해요',
      '"권한 - 위치"를 허용으로 선택해요',
    ];
  } else {
    // Android Chrome 브라우저
    label = "Android 설정 방법";
    steps = [
      "주소창 왼쪽 자물쇠 아이콘을 탭해요",
      '"권한" → "위치"를 탭해요',
      '"허용"을 선택해요',
    ];
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-md bg-white rounded-t-[28px] px-5 pt-8 pb-10 shadow-2xl animate-in slide-in-from-bottom duration-300">
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-9 h-1 bg-[#D1D6DB] rounded-full" />

        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 bg-[#E8F3FF] rounded-full flex items-center justify-center shrink-0">
            <MapPin className="w-6 h-6 text-[#3182F6]" />
          </div>
          <div>
            <h3 className="text-[18px] font-bold text-[#191F28]">
              위치 권한이 필요해요
            </h3>
            <p className="text-[13px] text-[#6B7684]">
              출퇴근 기록을 위해 위치 접근이 필요해요
            </p>
          </div>
        </div>

        <div className="bg-[#F8F9FA] rounded-2xl p-4 mb-5 space-y-3">
          <p className="text-[12px] font-bold text-[#8B95A1] uppercase tracking-wide">
            {label}
          </p>
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-[#3182F6] flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[11px] font-bold text-white">
                  {i + 1}
                </span>
              </div>
              <p className="text-[14px] text-[#333D4B]">{step}</p>
            </div>
          ))}
        </div>

        <button
          onClick={onConfirm}
          className="w-full h-14 rounded-2xl bg-[#3182F6] text-white font-bold text-[16px] mb-2 active:scale-[0.98] transition-transform"
        >
          권한 설정했어요
        </button>
        <button
          onClick={onCancel}
          className="w-full h-12 rounded-2xl bg-[#F2F4F6] text-[#4E5968] font-bold text-[15px]"
        >
          나중에 할게요
        </button>
      </div>
    </div>
  );
}
