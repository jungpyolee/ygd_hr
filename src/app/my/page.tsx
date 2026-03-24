"use client";

import { useState } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import {
  Clock,
  BookOpen,
  ChevronRight,
  LogOut,
  LayoutDashboard,
  Pencil,
} from "lucide-react";
import MyInfoModal from "@/components/MyInfoModal";
import PushNotificationSettings from "@/components/PushNotificationSettings";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import AvatarDisplay from "@/components/AvatarDisplay";
import AvatarEditorModal from "@/components/AvatarEditorModal";

export default function MyPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAvatarEditorOpen, setIsAvatarEditorOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  const { data: profile, mutate } = useSWR(
    user ? ["my-profile", user.id] : null,
    async ([, userId]) => {
      const supabase = createClient();
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
      return data;
    },
    { dedupingInterval: 60_000 }
  );

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const menuItems = [
    { icon: Clock, label: "근무 기록", description: "출퇴근 내역 확인하기", onClick: () => router.push("/attendances") },
    { icon: BookOpen, label: "이용 가이드", description: "앱 사용 방법 안내", onClick: () => router.push("/guide") },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#F2F4F6] font-pretendard pb-24">
      <header className="px-5 pt-5 pb-4">
        <h1 className="text-[22px] font-bold text-[#191F28]">마이</h1>
      </header>

      {/* 프로필 카드 */}
      <div className="px-5 mb-4">
        <button
          onClick={() => profile && setIsEditModalOpen(true)}
          className="w-full bg-white rounded-[24px] p-5 border border-slate-100 flex items-center gap-4 active:scale-[0.99] transition-transform text-left"
        >
          <div className="relative shrink-0">
            {profile && (
              <AvatarDisplay
                userId={profile.id}
                avatarConfig={profile.avatar_config}
                size={56}
              />
            )}
            <button
              onClick={(e) => { e.stopPropagation(); profile && setIsAvatarEditorOpen(true); }}
              className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#3182F6] flex items-center justify-center shadow"
            >
              <Pencil className="w-2.5 h-2.5 text-white" />
            </button>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[17px] font-bold text-[#191F28]">{profile?.name ?? "이름 없음"}</p>
            <p className="text-[13px] text-[#8B95A1] mt-0.5">{profile?.phone ?? "전화번호 미등록"}</p>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[13px] font-semibold text-[#3182F6]">편집하기</span>
            <ChevronRight className="w-4 h-4 text-[#3182F6]" />
          </div>
        </button>
      </div>

      {/* 메뉴 */}
      <div className="px-5 mb-4">
        <div className="bg-white rounded-[24px] border border-slate-100 overflow-hidden">
          {menuItems.map(({ icon: Icon, label, description, onClick }, i) => (
            <button key={label} onClick={onClick}
              className={`w-full flex items-center gap-4 px-5 py-4 text-left active:bg-[#F9FAFB] transition-colors ${i < menuItems.length - 1 ? "border-b border-[#F2F4F6]" : ""}`}>
              <div className="w-10 h-10 rounded-full bg-[#F2F4F6] flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-[#4E5968]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold text-[#191F28]">{label}</p>
                <p className="text-[12px] text-[#8B95A1] mt-0.5">{description}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-[#D1D6DB] shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* 알림 설정 */}
      <div className="px-5 mb-4">
        <div className="bg-white rounded-[24px] border border-slate-100 px-5 py-4">
          <p className="text-[13px] font-semibold text-[#8B95A1] mb-3">알림 설정</p>
          <PushNotificationSettings />
        </div>
      </div>

      {/* 어드민 이동 */}
      {profile?.role === "admin" && (
        <div className="px-5 mb-4">
          <button onClick={() => router.push("/admin")}
            className="w-full bg-[#E8F3FF] rounded-[20px] px-5 py-4 flex items-center gap-3 active:scale-[0.99] transition-transform">
            <LayoutDashboard className="w-5 h-5 text-[#3182F6]" />
            <span className="text-[15px] font-bold text-[#3182F6]">관리자 대시보드로 이동하기</span>
            <ChevronRight className="w-4 h-4 text-[#3182F6] ml-auto" />
          </button>
        </div>
      )}

      {/* 로그아웃 */}
      <div className="px-5">
        <button onClick={() => setIsLogoutConfirmOpen(true)}
          className="w-full bg-white rounded-[20px] px-5 py-4 flex items-center gap-3 border border-slate-100 active:scale-[0.99] transition-transform">
          <LogOut className="w-5 h-5 text-[#F04452]" />
          <span className="text-[15px] font-bold text-[#F04452]">로그아웃</span>
        </button>
      </div>

      {profile && (
        <MyInfoModal isOpen={isEditModalOpen} profile={profile}
          onClose={() => setIsEditModalOpen(false)} onUpdate={() => mutate()} />
      )}

      {profile && (
        <AvatarEditorModal
          isOpen={isAvatarEditorOpen}
          onClose={() => setIsAvatarEditorOpen(false)}
          userId={profile.id}
          currentConfig={profile.avatar_config}
          onSave={(config) => mutate({ ...profile, avatar_config: config }, false)}
        />
      )}

      <ConfirmDialog
        isOpen={isLogoutConfirmOpen}
        title="로그아웃 할까요?"
        description="다시 로그인하려면 이메일과 비밀번호가 필요해요."
        confirmLabel="로그아웃하기"
        variant="destructive"
        onConfirm={handleLogout}
        onCancel={() => setIsLogoutConfirmOpen(false)}
      />
    </div>
  );
}
