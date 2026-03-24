"use client";

import { useState } from "react";

const INDUSTRIES = [
  { id: "manufactured", emoji: "📦", label: "공산품" },
  { id: "agri", emoji: "🥬", label: "농수산물" },
  { id: "beverage", emoji: "🧃", label: "음료" },
  { id: "etc", emoji: "✨", label: "기타" },
];

export default function DemoPage() {
  const [step, setStep] = useState<"select" | "phone">("select");
  const [selected, setSelected] = useState<string | null>(null);
  const [phone, setPhone] = useState("");

  function handleSelect(id: string) {
    setSelected(id);
    setTimeout(() => setStep("phone"), 180);
  }

  function formatPhone(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  const selectedIndustry = INDUSTRIES.find((i) => i.id === selected);
  const isPhoneValid = phone.replace(/\D/g, "").length === 11;

  return (
    <div className="min-h-screen flex items-center justify-center px-5" style={{ background: "linear-gradient(135deg, #0f0c29, #1a1a2e, #16213e)" }}>
      <div className="w-full max-w-sm">

        {/* Step 1: 업종 선택 */}
        <div
          style={{
            transition: "opacity 0.2s, transform 0.2s",
            opacity: step === "select" ? 1 : 0,
            transform: step === "select" ? "translateY(0)" : "translateY(-16px)",
            pointerEvents: step === "select" ? "auto" : "none",
            position: step === "select" ? "relative" : "absolute",
            width: "100%",
          }}
        >
          <div className="text-center mb-8">
            <p className="text-sm font-semibold mb-2" style={{ color: "#6c63ff", letterSpacing: "0.12em" }}>DEMO</p>
            <h1 className="text-2xl font-bold text-white leading-snug">
              어떤 업종으로<br />체험하시겠어요?
            </h1>
            <p className="text-sm mt-2" style={{ color: "#8b9bbd" }}>업종을 선택하면 바로 시작해요</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {INDUSTRIES.map((item) => (
              <button
                key={item.id}
                onClick={() => handleSelect(item.id)}
                className="group relative flex flex-col items-center justify-center rounded-2xl py-7 gap-3 font-semibold text-base text-white transition-all duration-150 active:scale-95"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1.5px solid rgba(255,255,255,0.1)",
                  boxShadow: "0 2px 16px rgba(0,0,0,0.2)",
                  backdropFilter: "blur(8px)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(108,99,255,0.22)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "#6c63ff";
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 24px rgba(108,99,255,0.35)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.1)";
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 2px 16px rgba(0,0,0,0.2)";
                }}
              >
                <span className="text-4xl">{item.emoji}</span>
                <span>{item.label}</span>
                <span
                  className="absolute inset-0 rounded-2xl opacity-0 group-active:opacity-100 transition-opacity"
                  style={{ background: "rgba(108,99,255,0.18)" }}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: 전화번호 입력 */}
        <div
          style={{
            transition: "opacity 0.25s, transform 0.25s",
            opacity: step === "phone" ? 1 : 0,
            transform: step === "phone" ? "translateY(0)" : "translateY(20px)",
            pointerEvents: step === "phone" ? "auto" : "none",
            position: step === "phone" ? "relative" : "absolute",
            width: "100%",
          }}
        >
          <button
            onClick={() => { setStep("select"); setPhone(""); }}
            className="flex items-center gap-1 text-sm mb-7 transition-opacity hover:opacity-70"
            style={{ color: "#8b9bbd" }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            다시 선택하기
          </button>

          <div className="text-center mb-8">
            <div
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-5 text-sm font-semibold"
              style={{ background: "rgba(108,99,255,0.18)", color: "#a29bfe" }}
            >
              <span>{selectedIndustry?.emoji}</span>
              <span>{selectedIndustry?.label}</span>
            </div>
            <h1 className="text-2xl font-bold text-white leading-snug">
              전화번호를<br />입력해 주세요
            </h1>
            <p className="text-sm mt-2" style={{ color: "#8b9bbd" }}>체험 결과를 문자로 보내드려요</p>
          </div>

          <div className="space-y-3">
            <input
              type="tel"
              inputMode="numeric"
              placeholder="010-0000-0000"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              className="w-full rounded-2xl px-5 py-4 text-lg font-semibold text-white text-center tracking-widest outline-none transition-all"
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1.5px solid rgba(255,255,255,0.12)",
                caretColor: "#6c63ff",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#6c63ff";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(108,99,255,0.2)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />

            <button
              disabled={!isPhoneValid}
              className="w-full rounded-2xl py-4 text-base font-bold text-white transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: isPhoneValid
                  ? "linear-gradient(135deg, #6c63ff, #5a52d5)"
                  : "rgba(255,255,255,0.08)",
                boxShadow: isPhoneValid ? "0 4px 24px rgba(108,99,255,0.45)" : "none",
              }}
              onClick={() => {
                if (isPhoneValid) alert(`체험 시작! 업종: ${selectedIndustry?.label}, 전화번호: ${phone}`);
              }}
            >
              체험 시작하기
            </button>
          </div>

          <p className="text-center text-xs mt-5" style={{ color: "#4a5568" }}>
            개인정보는 체험 목적으로만 사용되며<br />체험 종료 후 즉시 삭제돼요
          </p>
        </div>

      </div>
    </div>
  );
}
