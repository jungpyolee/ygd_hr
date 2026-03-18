"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { X, UploadCloud, LogOut, LayoutDashboard } from "lucide-react";
import { toast } from "sonner";
import { DatePicker } from "@/components/ui/date-picker";
import { sendNotification } from "@/lib/notifications";
import ConfirmDialog from "@/components/ui/confirm-dialog";

interface MyInfoModalProps {
  profile: any;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

type DocKey =
  | "employment_contract_url"
  | "health_cert_url";

export default function MyInfoModal({
  profile,
  isOpen,
  onClose,
  onUpdate,
}: MyInfoModalProps) {
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    ...profile,
    health_cert_date: profile.health_cert_date
      ? new Date(profile.health_cert_date)
      : undefined,
  });

  const [uploading, setUploading] = useState(false);
  const supabase = createClient();

  if (!isOpen) return null;

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    column: DocKey
  ) => {
    if (!profile || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    setUploading(true);

    try {
      const fileExt = file.name.split(".").pop();
      const filePath = `${profile.id}/${column}_${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("hr-documents")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      await supabase
        .from("profiles")
        .update({ [column]: filePath })
        .eq("id", profile.id);
      setEditForm((prev: any) => ({ ...prev, [column]: filePath }));
      toast.success("서류가 업로드되었습니다.");
      onUpdate();
    } catch (err) {
      toast.error("서류 업로드에 실패했어요", { description: "잠시 후 다시 시도해주세요" });
    } finally {
      if (column === "health_cert_url") {
        await sendNotification({
          target_role: "admin",
          type: "document_upload",
          title: "📝 서류 업로드 알림",
          content: `${profile.name}님이 보건증 사본을 업로드했어요.`,
          source_id: profile.id,
        });
      }
      setUploading(false);
    }
  };

  const handleViewDocument = async (path: string) => {
    if (path.startsWith("http")) return window.open(path, "_blank");
    const { data } = await supabase.storage
      .from("hr-documents")
      .createSignedUrl(path, 60);
    if (data) window.open(data.signedUrl, "_blank");
  };

  const handleSaveProfile = async () => {
    if (!editForm.name?.trim()) return toast.error("이름을 입력해주세요");

    const { error } = await supabase
      .from("profiles")
      .update({
        name: editForm.name,
        phone: editForm.phone,
        bank_name: editForm.bank_name,
        account_number: editForm.account_number,
        health_cert_date: editForm.health_cert_date
          ? new Date(editForm.health_cert_date).toISOString().split("T")[0]
          : null,
      })
      .eq("id", profile.id);

    if (error) return toast.error("저장에 실패했어요", { description: "잠시 후 다시 시도해주세요" });

    // 🚀 토스 스타일 UX 라이팅 로직
    const fieldNames: Record<string, string> = {
      name: "이름",
      phone: "연락처",
      bank_name: "은행",
      account_number: "계좌번호",
      health_cert_date: "보건증 만료일",
    };

    const changedLabels = Object.keys(fieldNames)
      .filter((key) => {
        const oldValue = profile[key as keyof typeof profile];
        let newValue = editForm[key as keyof typeof editForm];

        // 날짜 비교를 위한 포맷팅 처리
        if (key === "health_cert_date" && newValue instanceof Date) {
          newValue = newValue.toISOString().split("T")[0];
        }

        return newValue !== oldValue;
      })
      .map((key) => fieldNames[key]);

    // 수정된 항목이 있을 때만 알림 전송
    // 🚀 수정된 모든 항목 나열 로직
    if (changedLabels.length > 0) {
      // 1. 한국어 조사(와/과) 처리 함수
      const getPostposition = (word: string) => {
        const lastChar = word.charCodeAt(word.length - 1);
        const hasBatchim = (lastChar - 0xac00) % 28 !== 0;
        return hasBatchim ? "과" : "와";
      };

      // 2. 항목들을 "항목1, 항목2와 항목3" 형태로 결합
      let summary = "";
      if (changedLabels.length === 1) {
        summary = changedLabels[0];
      } else {
        const lastItem = changedLabels.pop(); // 마지막 항목 추출
        summary = `${changedLabels.join(", ")}${getPostposition(
          changedLabels[changedLabels.length - 1]
        )} ${lastItem}`;
      }

      await sendNotification({
        target_role: "admin",
        type: "profile_update",
        title: "📝 정보 수정 알림",
        content: `${profile.name}님이 ${summary} 정보를 수정했어요.`, // "ㅇㅇㅇ님이 연락처와 계좌번호 정보를 수정했어요."
        source_id: profile.id,
      });
    }

    toast.success("정보를 수정했어요");
    onUpdate();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[49] flex items-center justify-center p-5">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-sm bg-white rounded-[32px] px-6 pb-6 shadow-2xl animate-in slide-in-from-bottom-5 duration-300 max-h-[90vh] overflow-y-auto scrollbar-hide">
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-6 sticky top-0 bg-white z-20 pt-4 border-b border-slate-50 pb-3">
          <h2 className="text-xl font-bold text-[#191F28]">내 정보 수정</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F4F6] text-[#8B95A1] active:scale-90 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          {/* 프로필 요약 */}
          <div className="flex items-center gap-4 px-1">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-inner"
              style={{ backgroundColor: profile?.color_hex }}
            >
              {profile?.name.charAt(0)}
            </div>
            <div>
              <p className="font-bold text-[#191F28] text-lg">
                {profile?.name}
              </p>
              <p className="text-sm text-[#8B95A1]">{profile?.email}</p>
            </div>
          </div>

          <div className="space-y-5">
            {/* 연락처 */}
            <div>
              <label className="block text-[12px] font-bold text-[#8B95A1] mb-1.5 ml-1 text-xs uppercase">
                연락처
              </label>
              <input
                type="tel"
                value={editForm.phone || ""}
                onChange={(e) =>
                  setEditForm({ ...editForm, phone: e.target.value })
                }
                className="w-full px-4 py-3 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[15px] focus:outline-none focus:border-[#3182F6] transition-all"
                placeholder="010-0000-0000"
              />
            </div>

            {/* 🚀 보건증 만료일 (UI를 다른 input과 일치시킴) */}
            <div className="relative">
              <label className="block text-[12px] font-bold text-[#8B95A1] mb-1.5 ml-1 text-xs uppercase flex items-center gap-1">
                보건증 만료일
              </label>
              {/* 💡 클릭 시 무반응 해결: DatePicker를 감싸는 div에 포인터 이벤트가 잘 전달되도록 하고, 
                스타일을 일반 input과 동일하게 입혔습니다.
              */}
              <div className="w-full">
                <DatePicker
                  value={editForm.health_cert_date}
                  onChange={(date) =>
                    setEditForm({ ...editForm, health_cert_date: date })
                  }
                  placeholder="날짜 선택"
                  // 💡 UI 통일: 배경색, 보더, 라운딩을 다른 input과 똑같이 맞춤
                  className="w-full h-[48px] px-4 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[15px] font-medium text-[#191F28] justify-start text-left focus:ring-0 focus:border-[#3182F6] shadow-none"
                />
              </div>
              <p className="text-[11px] text-[#8B95A1] mt-1.5 ml-1">
                만료일이 지나면 대시보드에 경고가 표시됩니다.
              </p>
            </div>

            {/* 은행 정보 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-bold text-[#8B95A1] mb-1.5 ml-1 text-xs uppercase">
                  은행명
                </label>
                <input
                  type="text"
                  value={editForm.bank_name || ""}
                  onChange={(e) =>
                    setEditForm({ ...editForm, bank_name: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[15px] focus:outline-none focus:border-[#3182F6] transition-all"
                  placeholder="은행명"
                />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-[#8B95A1] mb-1.5 ml-1 text-xs uppercase">
                  계좌번호
                </label>
                <input
                  type="text"
                  value={editForm.account_number || ""}
                  onChange={(e) =>
                    setEditForm({ ...editForm, account_number: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[15px] focus:outline-none focus:border-[#3182F6] transition-all"
                  placeholder="계좌번호"
                />
              </div>
            </div>
          </div>

          <div className="h-[1px] bg-slate-100" />

          {/* 서류 관리 */}
          <div className="space-y-3">
            <h3 className="text-[14px] font-bold text-[#191F28] flex justify-between px-1">
              증빙 서류{" "}
              {uploading && (
                <span className="text-[#3182F6] text-xs animate-pulse font-normal">
                  업로드 중...
                </span>
              )}
            </h3>
            {[
              {
                label: "보건증 사본",
                key: "health_cert_url" as const,
                url: editForm.health_cert_url,
              },
            ].map((doc) => (
              <div
                key={doc.key}
                className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-100"
              >
                <span className="text-[13px] font-semibold text-[#4E5968] ml-1">
                  {doc.label}
                </span>
                {doc.url ? (
                  <button
                    onClick={() => handleViewDocument(doc.url!)}
                    className="px-4 py-1.5 bg-white border border-slate-200 text-[#3182F6] rounded-xl text-[12px] font-bold shadow-sm active:scale-95 transition-all"
                  >
                    보기
                  </button>
                ) : (
                  <div className="relative">
                    <button className="flex items-center gap-1.5 px-4 py-1.5 bg-white border border-slate-200 text-[#4E5968] rounded-xl text-[12px] font-bold shadow-sm active:scale-95 transition-all">
                      <UploadCloud className="w-3.5 h-3.5 text-[#8B95A1]" />{" "}
                      첨부
                    </button>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => handleFileUpload(e, doc.key)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      disabled={uploading}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={handleSaveProfile}
            className="w-full py-4 bg-[#3182F6] text-white rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-blue-500/20 mt-4"
          >
            저장하기
          </button>

          <div className="h-[1px] bg-slate-100 mt-4" />

          {profile?.role === "admin" && (
            <button
              onClick={() => { onClose(); window.location.href = "/admin"; }}
              className="w-full py-3.5 bg-[#F2F4F6] text-[#4E5968] rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all mt-3"
            >
              <LayoutDashboard className="w-4 h-4" />
              어드민 대시보드
            </button>
          )}

          <button
            onClick={() => setIsLogoutConfirmOpen(true)}
            className="w-full py-3.5 text-[#E03131] rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all hover:bg-red-50 mt-1"
          >
            <LogOut className="w-4 h-4" />
            로그아웃
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={isLogoutConfirmOpen}
        title="로그아웃할까요?"
        confirmLabel="로그아웃할게요"
        cancelLabel="취소"
        onConfirm={async () => {
          await supabase.auth.signOut();
          window.location.href = "/login";
        }}
        onCancel={() => setIsLogoutConfirmOpen(false)}
      />
    </div>
  );
}
