"use client";

import { useState } from "react";
import ReactNiceAvatar, { genConfig, AvatarFullConfig } from "react-nice-avatar";
import { X, Shuffle } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { toast } from "sonner";

interface AvatarEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  currentConfig?: AvatarFullConfig | null;
  onSave: (config: AvatarFullConfig) => void;
}

const SEX_OPTIONS = [
  { value: "man", label: "남성" },
  { value: "woman", label: "여성" },
] as const;

const HAIR_STYLE_OPTIONS = [
  { value: "normal", label: "보통" },
  { value: "thick", label: "두꺼운" },
  { value: "mohawk", label: "모히칸" },
  { value: "womanLong", label: "긴 머리" },
  { value: "womanShort", label: "짧은 머리" },
] as const;

const HAT_STYLE_OPTIONS = [
  { value: "none", label: "없음" },
  { value: "beanie", label: "비니" },
  { value: "turban", label: "터번" },
] as const;

const EYE_STYLE_OPTIONS = [
  { value: "circle", label: "동그란" },
  { value: "oval", label: "타원" },
  { value: "smile", label: "웃는" },
] as const;

const GLASSES_STYLE_OPTIONS = [
  { value: "none", label: "없음" },
  { value: "round", label: "둥근" },
  { value: "square", label: "사각" },
] as const;

const NOSE_STYLE_OPTIONS = [
  { value: "short", label: "짧은" },
  { value: "long", label: "긴" },
  { value: "round", label: "둥근" },
] as const;

const MOUTH_STYLE_OPTIONS = [
  { value: "laugh", label: "웃음" },
  { value: "smile", label: "미소" },
  { value: "peace", label: "평온" },
] as const;

const SHIRT_STYLE_OPTIONS = [
  { value: "hoody", label: "후드" },
  { value: "short", label: "반팔" },
  { value: "polo", label: "폴로" },
] as const;

const HAIR_COLORS = ["#000000", "#4a3728", "#8B4513", "#d4a853", "#e8c99a", "#c0392b", "#9b59b6", "#2980b9", "#7f8c8d"];
const SHIRT_COLORS = ["#3182F6", "#F04452", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c", "#e67e22", "#34495e", "#e74c3c"];
const BG_COLORS = ["#E8F3FF", "#FFF0F0", "#F0FFF4", "#FFFBF0", "#F5F0FF", "#FFF5F0", "#F0F9FF", "#F9F0FF", "#FFFFF0"];

function ColorPicker({
  colors,
  selected,
  onChange,
}: {
  colors: string[];
  selected?: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {colors.map((color) => (
        <button
          key={color}
          onClick={() => onChange(color)}
          className="w-8 h-8 rounded-full border-2 transition-transform active:scale-90"
          style={{
            backgroundColor: color,
            borderColor: selected === color ? "#3182F6" : "transparent",
            boxShadow: selected === color ? "0 0 0 2px #fff, 0 0 0 4px #3182F6" : "inset 0 0 0 1px rgba(0,0,0,0.1)",
          }}
        />
      ))}
    </div>
  );
}

function OptionChips<T extends string>({
  options,
  selected,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  selected?: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          className={`px-3 py-1.5 rounded-full text-[13px] font-semibold border transition-colors ${
            selected === value
              ? "bg-[#3182F6] text-white border-[#3182F6]"
              : "bg-white text-[#4E5968] border-[#E5E8EB]"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function AvatarEditorModal({
  isOpen,
  onClose,
  userId,
  currentConfig,
  onSave,
}: AvatarEditorModalProps) {
  const [config, setConfig] = useState<AvatarFullConfig>(
    () => currentConfig ?? genConfig(userId)
  );
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const update = (patch: Partial<AvatarFullConfig>) =>
    setConfig((prev) => ({ ...prev, ...patch }));

  const handleRandomize = () => setConfig(genConfig());

  const handleSave = async () => {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_config: config })
      .eq("id", userId);

    if (error) {
      toast.error("저장에 실패했어요", { description: "다시 시도해주세요." });
    } else {
      onSave(config);
      toast.success("아바타를 저장했어요.");
      onClose();
    }
    setSaving(false);
  };

  const sections = [
    {
      label: "성별",
      content: (
        <OptionChips
          options={SEX_OPTIONS}
          selected={config.sex}
          onChange={(v) => update({ sex: v })}
        />
      ),
    },
    {
      label: "헤어스타일",
      content: (
        <OptionChips
          options={HAIR_STYLE_OPTIONS}
          selected={config.hairStyle}
          onChange={(v) => update({ hairStyle: v })}
        />
      ),
    },
    {
      label: "머리 색",
      content: (
        <ColorPicker
          colors={HAIR_COLORS}
          selected={config.hairColor}
          onChange={(v) => update({ hairColor: v })}
        />
      ),
    },
    {
      label: "모자",
      content: (
        <OptionChips
          options={HAT_STYLE_OPTIONS}
          selected={config.hatStyle}
          onChange={(v) => update({ hatStyle: v })}
        />
      ),
    },
    {
      label: "눈",
      content: (
        <OptionChips
          options={EYE_STYLE_OPTIONS}
          selected={config.eyeStyle}
          onChange={(v) => update({ eyeStyle: v })}
        />
      ),
    },
    {
      label: "안경",
      content: (
        <OptionChips
          options={GLASSES_STYLE_OPTIONS}
          selected={config.glassesStyle}
          onChange={(v) => update({ glassesStyle: v })}
        />
      ),
    },
    {
      label: "코",
      content: (
        <OptionChips
          options={NOSE_STYLE_OPTIONS}
          selected={config.noseStyle}
          onChange={(v) => update({ noseStyle: v })}
        />
      ),
    },
    {
      label: "입",
      content: (
        <OptionChips
          options={MOUTH_STYLE_OPTIONS}
          selected={config.mouthStyle}
          onChange={(v) => update({ mouthStyle: v })}
        />
      ),
    },
    {
      label: "옷 스타일",
      content: (
        <OptionChips
          options={SHIRT_STYLE_OPTIONS}
          selected={config.shirtStyle}
          onChange={(v) => update({ shirtStyle: v })}
        />
      ),
    },
    {
      label: "옷 색",
      content: (
        <ColorPicker
          colors={SHIRT_COLORS}
          selected={config.shirtColor}
          onChange={(v) => update({ shirtColor: v })}
        />
      ),
    },
    {
      label: "배경 색",
      content: (
        <ColorPicker
          colors={BG_COLORS}
          selected={config.bgColor}
          onChange={(v) => update({ bgColor: v })}
        />
      ),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center font-pretendard">
      {/* 딤 */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* 모달 */}
      <div className="relative z-10 bg-white rounded-[28px] w-full max-w-sm mx-4 flex flex-col max-h-[90vh] shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#F2F4F6] shrink-0">
          <h2 className="text-[18px] font-bold text-[#191F28]">아바타 편집하기</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#F2F4F6] flex items-center justify-center"
          >
            <X className="w-4 h-4 text-[#4E5968]" />
          </button>
        </div>

        {/* 미리보기 */}
        <div className="flex flex-col items-center py-5 shrink-0">
          <ReactNiceAvatar style={{ width: 96, height: 96 }} {...config} />
          <button
            onClick={handleRandomize}
            className="mt-3 flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#F2F4F6] text-[13px] font-semibold text-[#4E5968] active:scale-95 transition-transform"
          >
            <Shuffle className="w-3.5 h-3.5" />
            랜덤으로 바꾸기
          </button>
        </div>

        {/* 옵션 목록 (스크롤) */}
        <div className="overflow-y-auto px-5 pb-4 flex-1">
          {sections.map(({ label, content }) => (
            <div key={label} className="mb-5">
              <p className="text-[12px] font-semibold text-[#8B95A1] mb-2">{label}</p>
              {content}
            </div>
          ))}
        </div>

        {/* 저장 버튼 */}
        <div className="px-5 pb-5 pt-3 shrink-0 border-t border-[#F2F4F6]">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-12 rounded-[14px] bg-[#3182F6] text-white text-[15px] font-bold disabled:opacity-50 active:scale-[0.99] transition-transform"
          >
            {saving ? "저장 중..." : "저장하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
