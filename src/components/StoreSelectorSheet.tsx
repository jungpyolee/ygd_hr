"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface Store {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface StoreSelectorSheetProps {
  isOpen: boolean;
  type: "IN" | "OUT";
  stores: Store[];
  onSelect: (store: Store) => void;
  onCancel: () => void;
}

export default function StoreSelectorSheet({
  isOpen,
  type,
  stores,
  onSelect,
  onCancel,
}: StoreSelectorSheetProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedStore = stores.find((s) => s.id === selectedId) ?? null;

  const handleConfirm = () => {
    if (!selectedStore) return;
    setSelectedId(null);
    onSelect(selectedStore);
  };

  const handleCancel = () => {
    setSelectedId(null);
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-5">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleCancel}
      />
      <div className="relative w-full max-w-sm bg-white rounded-[28px] px-5 pt-7 pb-7 shadow-2xl animate-in fade-in zoom-in-95 duration-300">

        {/* 헤더 */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-[18px] font-bold text-[#191F28] mb-1">
              매장을 선택해 주세요
            </h3>
            <p className="text-[14px] text-[#6B7684]">
              위치를 확인할 수 없어요.{" "}
              {type === "IN" ? "출근할" : "퇴근할"} 매장을 선택해 주세요.
            </p>
          </div>
          <button
            onClick={handleCancel}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F4F6] text-[#8B95A1] hover:bg-[#E5E8EB] transition-colors shrink-0 ml-3 mt-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2 mb-6">
          {stores.map((store) => (
            <button
              key={store.id}
              onClick={() => setSelectedId(store.id)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all text-left ${
                selectedId === store.id
                  ? "border-[#3182F6] bg-[#E8F3FF]"
                  : "border-[#E5E8EB] bg-white"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                  selectedId === store.id ? "border-[#3182F6]" : "border-[#D1D6DB]"
                }`}
              >
                {selectedId === store.id && (
                  <div className="w-2.5 h-2.5 rounded-full bg-[#3182F6]" />
                )}
              </div>
              <span
                className={`text-[15px] font-bold ${
                  selectedId === store.id ? "text-[#3182F6]" : "text-[#191F28]"
                }`}
              >
                {store.name}
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={handleConfirm}
          disabled={!selectedStore}
          className="w-full h-14 rounded-2xl bg-[#3182F6] text-white font-bold text-[16px] disabled:bg-[#D1D6DB] mb-2 transition-colors"
        >
          {type === "IN" ? "출근할게요" : "퇴근할게요"}
        </button>
        <button
          onClick={handleCancel}
          className="w-full h-12 rounded-2xl bg-[#F2F4F6] text-[#4E5968] font-bold text-[15px]"
        >
          취소
        </button>
      </div>
    </div>
  );
}
