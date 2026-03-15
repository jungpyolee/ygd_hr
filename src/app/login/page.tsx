"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import IosInstallPrompt from "@/components/IosInstallPrompt";

export default function LoginPage() {
  const [isLoginMode, setIsLoginMode] = useState(true);

  // 💡 email 대신 userId 상태를 씁니다
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const router = useRouter();
  const supabase = createClient();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    // 🚀 핵심 꼼수: 아이디 뒤에 무조건 사내 도메인을 붙여서 이메일처럼 만듭니다.
    const fakeEmail = `${userId.trim()}@ygd.com`;

    if (isLoginMode) {
      const { error } = await supabase.auth.signInWithPassword({
        email: fakeEmail,
        password,
      });
      if (error) {
        setErrorMsg("아이디나 비밀번호가 맞지 않아요.");
        setLoading(false);
      } else {
        router.push("/");
      }
    } else {
      if (password !== passwordConfirm) {
        setErrorMsg("비밀번호가 서로 달라요.");
        setLoading(false);
        return;
      }
      if (!agreeTerms) {
        setErrorMsg("필수 동의 항목에 체크해 주세요.");
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.signUp({
        email: fakeEmail,
        password,
      });

      if (error) {
        // 이미 Rate Limit에 걸려있다면 이 에러가 뜰 수 있습니다.
        if (error.message.includes("rate_limit")) {
          setErrorMsg("너무 많은 시도가 있었어요. 잠시 후 다시 시도해주세요.");
        } else {
          setErrorMsg("가입에 실패했어요. 이미 있는 아이디일 수 있어요.");
        }
        setLoading(false);
      } else {
        toast.success("가입이 완료되었습니다! 로그인해 주세요.");
        setIsLoginMode(true);
        setPassword("");
        setPasswordConfirm("");
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col justify-center px-6 font-pretendard">
      <div className="w-full max-w-sm mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="mb-10">
          <h1 className="text-[26px] font-bold text-[#191F28] leading-tight mb-2">
            {isLoginMode ? (
              <>
                연경당 HR 이용을 위해
                <br />
                로그인이 필요해요
              </>
            ) : (
              <>
                연경당 합류를 환영해요!
                <br />
                계정을 만들어주세요
              </>
            )}
          </h1>
          <p className="text-[15px] text-[#8B95A1]">
            {isLoginMode
              ? "가입하신 아이디를 입력해주세요."
              : "업무에 사용할 아이디와 비밀번호를 설정해주세요."}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-[#4E5968] px-1">
              아이디
            </label>
            <div className="relative">
              <input
                type="text"
                value={userId}
                onChange={(e) =>
                  setUserId(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))
                } // 영문, 숫자만 허용
                placeholder="영문, 숫자"
                required
                className="w-full h-14 bg-[#F2F4F6] rounded-2xl pl-4 pr-24 text-[#191F28] font-medium placeholder:text-[#B0B8C1] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30 transition-all"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8B95A1] font-medium pointer-events-none">
                @ygd.com
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-[#4E5968] px-1">
              비밀번호
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호를 입력해주세요"
              required
              className="w-full h-14 bg-[#F2F4F6] rounded-2xl px-4 text-[#191F28] font-medium placeholder:text-[#B0B8C1] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30 transition-all"
            />
          </div>

          {!isLoginMode && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="space-y-1.5 mt-4">
                <label className="text-[13px] font-semibold text-[#4E5968] px-1">
                  비밀번호 확인
                </label>
                <input
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="비밀번호를 한 번 더 입력해주세요"
                  required
                  className="w-full h-14 bg-[#F2F4F6] rounded-2xl px-4 text-[#191F28] font-medium placeholder:text-[#B0B8C1] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30 transition-all"
                />
              </div>

              <button
                type="button"
                onClick={() => setAgreeTerms(!agreeTerms)}
                className="w-full flex items-center gap-3 p-4 bg-[#F9FAFB] rounded-2xl border border-slate-100 transition-colors active:scale-[0.98]"
              >
                <CheckCircle2
                  className={`w-6 h-6 ${
                    agreeTerms ? "text-[#3182F6]" : "text-[#D1D6DB]"
                  }`}
                />
                <span className="text-[14px] font-semibold text-[#4E5968] text-left">
                  [필수] 개인정보 수집·이용 및 위치정보 제공 동의
                </span>
              </button>
            </div>
          )}

          {errorMsg && (
            <p className="text-red-500 text-[13px] font-medium px-1 mt-2 animate-in fade-in">
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-14 mt-8 bg-[#3182F6] text-white font-bold text-[16px] rounded-2xl active:scale-[0.98] transition-transform disabled:bg-[#D1D6DB]"
          >
            {loading ? "처리 중..." : isLoginMode ? "로그인" : "가입하기"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => {
              setIsLoginMode(!isLoginMode);
              setErrorMsg("");
              setPassword("");
              setPasswordConfirm("");
            }}
            className="text-[14px] font-semibold text-[#8B95A1] hover:text-[#4E5968] transition-colors"
          >
            {isLoginMode
              ? "아직 계정이 없으신가요? 가입하기"
              : "이미 계정이 있으신가요? 로그인"}
          </button>
        </div>
      </div>
      {/* 🚀 아이폰 전용 설치 팝업을 여기에 배치! (로그인 화면 위에 스르륵 뜹니다) */}
      <IosInstallPrompt />
    </div>
  );
}
