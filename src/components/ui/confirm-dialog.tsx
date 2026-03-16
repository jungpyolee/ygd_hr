"use client";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = "확인할게요",
  cancelLabel = "취소",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onCancel}
      />

      {/* Bottom Sheet */}
      <div className="relative w-full max-w-md bg-white rounded-t-[28px] px-5 pt-8 pb-10 shadow-2xl animate-in slide-in-from-bottom-4 duration-250">
        {/* Handle bar */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-9 h-1 bg-[#D1D6DB] rounded-full" />

        <h3 className="text-[18px] font-bold text-[#191F28] mb-2">{title}</h3>
        {description && (
          <p className="text-[14px] text-[#6B7684] leading-relaxed mb-6">
            {description}
          </p>
        )}

        <div className="flex flex-col gap-2.5 mt-6">
          <button
            onClick={onConfirm}
            className={`w-full h-14 rounded-2xl font-bold text-[16px] transition-all active:scale-[0.98] ${
              variant === "destructive"
                ? "bg-[#FFEBEB] text-[#E03131] hover:bg-[#FFD8D8]"
                : "bg-[#3182F6] text-white hover:bg-[#1B64DA]"
            }`}
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            className="w-full h-14 rounded-2xl font-bold text-[16px] text-[#4E5968] bg-[#F2F4F6] hover:bg-[#E5E8EB] transition-all active:scale-[0.98]"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
