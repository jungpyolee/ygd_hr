"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { ChevronLeft, CheckCircle2, UploadCloud } from "lucide-react";
import { format } from "date-fns";
import { DatePicker } from "@/components/ui/date-picker";

interface OnboardingProps {
  onComplete: () => void;
}

export default function OnboardingFunnel({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  // 폼 상태
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [joinDate, setJoinDate] = useState<Date | undefined>(undefined);

  // 🚀 파일 업로드 상태
  const [healthCert, setHealthCert] = useState<File | null>(null);
  const [bankCopy, setBankCopy] = useState<File | null>(null);
  const [idCopy, setIdCopy] = useState<File | null>(null);

  // 파일 Input 참조 (숨김 처리용)
  const healthRef = useRef<HTMLInputElement>(null);
  const bankRef = useRef<HTMLInputElement>(null);
  const idRef = useRef<HTMLInputElement>(null);

  const handleNext = () => setStep((prev) => prev + 1);
  const handlePrev = () => setStep((prev) => Math.max(1, prev - 1));

  const isValidName = name.trim().length >= 2 && name.trim().length <= 4;
  const phoneRegex = /^010-\d{3,4}-\d{4}$/;
  const isValidPhone = phoneRegex.test(phone);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/[^0-9]/g, "");
    let formatted = rawValue;
    if (rawValue.length > 3 && rawValue.length <= 7) {
      formatted = `${rawValue.slice(0, 3)}-${rawValue.slice(3)}`;
    } else if (rawValue.length > 7) {
      formatted = `${rawValue.slice(0, 3)}-${rawValue.slice(
        3,
        7
      )}-${rawValue.slice(7, 11)}`;
    }
    setPhone(formatted);
  };

  // 🚀 파일 업로드 헬퍼 함수
  const uploadToStorage = async (
    file: File,
    prefix: string,
    userId: string
  ) => {
    const fileExt = file.name.split(".").pop();
    const filePath = `${userId}/${prefix}_${Date.now()}.${fileExt}`;

    const { error } = await supabase.storage
      .from("hr-documents")
      .upload(filePath, file);

    if (error) throw error;
    return filePath; // Private 버킷이므로 경로만 저장
  };

  const handleSubmit = async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      try {
        let healthUrl = null;
        let bankUrl = null;
        let idUrl = null;

        // 선택된 파일이 있으면 스토리지에 먼저 업로드
        if (healthCert)
          healthUrl = await uploadToStorage(healthCert, "health", user.id);
        if (bankCopy)
          bankUrl = await uploadToStorage(bankCopy, "bank", user.id);
        if (idCopy) idUrl = await uploadToStorage(idCopy, "id", user.id);

        // DB에 유저 정보와 파일 경로 저장
        await supabase
          .from("profiles")
          .update({
            name: name.trim(),
            phone,
            join_date: joinDate ? format(joinDate, "yyyy-MM-dd") : null,
            health_cert_url: healthUrl,
            bank_account_copy_url: bankUrl,
            resident_register_url: idUrl,
          })
          .eq("id", user.id);
      } catch (error) {
        console.error("업로드 중 에러 발생:", error);
        alert("서류 업로드 중 문제가 발생했습니다. 나중에 다시 시도해주세요.");
      }
    }

    setLoading(false);
    onComplete();
  };

  // 선택된 파일 개수
  const selectedFilesCount = [healthCert, bankCopy, idCopy].filter(
    Boolean
  ).length;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col animate-in fade-in duration-300">
      <header className="h-14 flex items-center px-4">
        {step > 1 && (
          <button
            onClick={handlePrev}
            className="p-2 -ml-2 text-[#191F28] active:scale-95"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
      </header>

      <main className="flex-1 px-6 pt-4 pb-32 overflow-y-auto">
        {step === 1 && (
          <div className="animate-in slide-in-from-right-4 duration-300">
            <h1 className="text-2xl font-bold text-[#191F28] mb-2">
              환영합니다!
              <br />
              이름을 알려주세요
            </h1>
            <p
              className={`text-sm mb-10 transition-colors ${
                name.length > 0 && !isValidName
                  ? "text-red-500 font-medium"
                  : "text-[#8B95A1]"
              }`}
            >
              {name.length > 0 && !isValidName
                ? "이름은 2~4자로 입력해 주세요."
                : "실명으로 2~4자 입력해 주세요."}
            </p>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
              maxLength={4}
              className="w-full text-2xl font-bold text-[#191F28] placeholder:text-[#D1D6DB] border-b-2 border-[#F2F4F6] focus:border-[#3182F6] outline-none pb-3 transition-colors bg-transparent"
            />
          </div>
        )}

        {step === 2 && (
          <div className="animate-in slide-in-from-right-4 duration-300">
            <h1 className="text-2xl font-bold text-[#191F28] mb-2">
              연락처를 남겨주세요
            </h1>
            <p
              className={`text-sm mb-10 transition-colors ${
                phone.length > 0 && !isValidPhone
                  ? "text-red-500 font-medium"
                  : "text-[#8B95A1]"
              }`}
            >
              {phone.length > 0 && !isValidPhone
                ? "올바른 휴대폰 번호를 입력해 주세요."
                : "업무 관련 연락 시 사용됩니다."}
            </p>
            <input
              autoFocus
              type="tel"
              value={phone}
              onChange={handlePhoneChange}
              placeholder="010-0000-0000"
              maxLength={13}
              className="w-full text-2xl font-bold text-[#191F28] placeholder:text-[#D1D6DB] border-b-2 border-[#F2F4F6] focus:border-[#3182F6] outline-none pb-3 transition-colors bg-transparent"
            />
          </div>
        )}

        {step === 3 && (
          <div className="animate-in slide-in-from-right-4 duration-300">
            <h1 className="text-2xl font-bold text-[#191F28] mb-2">
              입사일이 언제인가요?
            </h1>
            <p className="text-[#8B95A1] text-sm mb-10">
              정확히 모른다면 건너뛸 수 있어요.
            </p>
            <DatePicker
              value={joinDate}
              onChange={setJoinDate}
              placeholder="YYYY. MM. DD"
              className="text-2xl font-bold text-[#191F28] h-auto px-0 py-1 pb-3 border-0 border-b-2 border-[#F2F4F6] rounded-none focus-visible:ring-0 focus:border-[#3182F6] shadow-none data-[state=open]:border-[#3182F6] bg-transparent hover:bg-transparent data-[state=open]:bg-transparent transition-all"
            />
          </div>
        )}

        {/* 🚀 Step 4: 서류 업로드 UX 추가 */}
        {step === 4 && (
          <div className="animate-in slide-in-from-right-4 duration-300 pb-10">
            <h1 className="text-2xl font-bold text-[#191F28] mb-2">
              필요한 서류를 등록해 주세요
            </h1>
            <p className="text-[#8B95A1] text-sm mb-8">
              미리 준비된 서류만 먼저 올려주세요.
              <br />
              나중에 [내 정보]에서 등록해도 괜찮아요.
            </p>

            {/* 숨겨진 Input들 */}
            <input
              type="file"
              accept="image/*,.pdf"
              ref={healthRef}
              className="hidden"
              onChange={(e) => setHealthCert(e.target.files?.[0] || null)}
            />
            <input
              type="file"
              accept="image/*,.pdf"
              ref={bankRef}
              className="hidden"
              onChange={(e) => setBankCopy(e.target.files?.[0] || null)}
            />
            <input
              type="file"
              accept="image/*,.pdf"
              ref={idRef}
              className="hidden"
              onChange={(e) => setIdCopy(e.target.files?.[0] || null)}
            />

            {/* 업로드 리스트 UI */}
            <div className="space-y-3">
              {[
                {
                  title: "보건증",
                  state: healthCert,
                  ref: healthRef,
                  desc: "요식업 필수 서류",
                },
                {
                  title: "계좌 사본",
                  state: bankCopy,
                  ref: bankRef,
                  desc: "급여 지급용",
                },
                {
                  title: "주민등록등본",
                  state: idCopy,
                  ref: idRef,
                  desc: "본인 확인용",
                },
              ].map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => item.ref.current?.click()}
                  className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all active:scale-[0.98] ${
                    item.state
                      ? "border-[#3182F6] bg-[#E8F3FF]"
                      : "border-slate-100 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-4 text-left">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        item.state ? "bg-[#3182F6]" : "bg-[#F2F4F6]"
                      }`}
                    >
                      {item.state ? (
                        <CheckCircle2 className="w-5 h-5 text-white" />
                      ) : (
                        <UploadCloud className="w-5 h-5 text-[#8B95A1]" />
                      )}
                    </div>
                    <div>
                      <p
                        className={`font-bold ${
                          item.state ? "text-[#3182F6]" : "text-[#333D4B]"
                        }`}
                      >
                        {item.title}
                      </p>
                      <p
                        className={`text-[13px] mt-0.5 ${
                          item.state ? "text-[#3182F6]/70" : "text-[#8B95A1]"
                        }`}
                      >
                        {item.state ? item.state.name : item.desc}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent">
        {step === 1 && (
          <button
            onClick={handleNext}
            disabled={!isValidName}
            className="w-full py-4 rounded-2xl font-bold text-lg text-white bg-[#3182F6] disabled:bg-[#D1D6DB] transition-colors active:scale-[0.98]"
          >
            다음
          </button>
        )}

        {step === 2 && (
          <button
            onClick={handleNext}
            disabled={!isValidPhone}
            className="w-full py-4 rounded-2xl font-bold text-lg text-white bg-[#3182F6] disabled:bg-[#D1D6DB] transition-colors active:scale-[0.98]"
          >
            다음
          </button>
        )}

        {step === 3 && (
          <button
            onClick={handleNext}
            className="w-full py-4 rounded-2xl font-bold text-lg text-white bg-[#3182F6] transition-colors active:scale-[0.98]"
          >
            {joinDate ? "다음" : "건너뛰기"}
          </button>
        )}

        {/* 🚀 Step 4: 파일 선택 여부에 따른 똑똑한 버튼 문구 */}
        {step === 4 && (
          <button
            onClick={handleSubmit}
            disabled={loading}
            className={`w-full py-4 rounded-2xl font-bold text-lg text-white transition-colors active:scale-[0.98] ${
              loading ? "bg-[#D1D6DB]" : "bg-[#3182F6]"
            }`}
          >
            {loading
              ? "저장 중이에요..."
              : selectedFilesCount > 0
              ? `${selectedFilesCount}개의 서류 제출하고 시작하기`
              : "서류는 나중에 등록할게요"}
          </button>
        )}
      </footer>
    </div>
  );
}
