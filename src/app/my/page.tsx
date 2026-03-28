"use client";

import { useState, useEffect, useMemo } from "react";
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
  Bus,
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
  const [hasGuideUpdate, setHasGuideUpdate] = useState(false);
  const [busCardMode, setBusCardMode] = useState<"all" | "outbound-only" | "hidden">("all");

  useEffect(() => {
    const check = () => {
      const seen = localStorage.getItem("guide_seen_version");
      setHasGuideUpdate(seen !== "v1.0.5");
    };
    check();
    setBusCardMode((localStorage.getItem("bus-card-mode") as any) ?? "all");
    window.addEventListener("guide-version-seen", check);
    return () => window.removeEventListener("guide-version-seen", check);
  }, []);

  const { data: profile, mutate } = useSWR(
    user ? ["my-profile", user.id] : null,
    async ([, userId]) => {
      const supabase = createClient();
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
      return data;
    },
    { dedupingInterval: 60_000 }
  );

  // 카페 근무 가능 여부 (어드민이거나 최근 60일 내 카페 스케줄 있으면)
  const { data: stores } = useSWR(
    user ? "my-stores" : null,
    async () => {
      const supabase = createClient();
      const { data } = await supabase.from("stores").select("id, work_location_key");
      return data ?? [];
    },
    { dedupingInterval: 60 * 60 * 1000 },
  );
  const cafeStoreId = useMemo(() => stores?.find((s: any) => s.work_location_key === "cafe")?.id, [stores]);

  const { data: isCafeWorker } = useSWR(
    profile?.role !== "admin" && cafeStoreId && user?.id
      ? ["my-cafe-check", user.id, cafeStoreId]
      : null,
    async ([, userId, storeId]) => {
      const supabase = createClient();
      const { count } = await supabase
        .from("employee_store_assignments")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", userId)
        .eq("store_id", storeId)
        .limit(1);
      return (count ?? 0) > 0;
    },
    { dedupingInterval: 60 * 60 * 1000 },
  );

  const showBusSetting = profile?.role === "admin" || isCafeWorker === true;

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const menuItems = [
    { icon: Clock, label: "근무 기록", description: "출퇴근 내역 확인하기", onClick: () => router.push("/attendances"), showDot: false },
    { icon: BookOpen, label: "이용 가이드", description: "앱 사용 방법 안내", onClick: () => router.push("/guide"), showDot: hasGuideUpdate },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#F2F4F6] font-pretendard pb-24">
      <header className="px-5 pt-5 pb-4">
        <h1 className="text-[22px] font-bold text-[#191F28]">마이</h1>
      </header>

      {/* 프로필 카드 */}
      <div className="px-5 mb-4">
        <div className="w-full bg-white rounded-[24px] p-5 border border-slate-100 flex items-center gap-4">
          {/* 아바타 + 연필 → 아바타 편집 */}
          <button
            onClick={() => profile && setIsAvatarEditorOpen(true)}
            className="relative shrink-0 active:scale-95 transition-transform"
          >
            {profile && (
              <AvatarDisplay
                userId={profile.id}
                avatarConfig={profile.avatar_config}
                size={56}
              />
            )}
            <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#3182F6] flex items-center justify-center shadow pointer-events-none">
              <Pencil className="w-2.5 h-2.5 text-white" />
            </span>
          </button>

          {/* 프로필 정보 + 연필 → 내 정보 수정 */}
          <button
            onClick={() => profile && setIsEditModalOpen(true)}
            className="flex-1 min-w-0 flex items-center gap-2 text-left active:opacity-70 transition-opacity"
          >
            <div className="flex-1 min-w-0">
              <p className="text-[17px] font-bold text-[#191F28]">{profile?.name ?? "이름 없음"}</p>
              <p className="text-[13px] text-[#8B95A1] mt-0.5">{profile?.phone ?? "전화번호 미등록"}</p>
            </div>
            <Pencil className="w-4 h-4 text-[#3182F6] shrink-0" />
          </button>
        </div>
      </div>

      {/* 메뉴 */}
      <div className="px-5 mb-4">
        <div className="bg-white rounded-[24px] border border-slate-100 overflow-hidden">
          {menuItems.map(({ icon: Icon, label, description, onClick, showDot }, i) => (
            <button key={label} onClick={onClick}
              className={`w-full flex items-center gap-4 px-5 py-4 text-left active:bg-[#F9FAFB] transition-colors ${i < menuItems.length - 1 ? "border-b border-[#F2F4F6]" : ""}`}>
              <div className="relative w-10 h-10 rounded-full bg-[#F2F4F6] flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-[#4E5968]" />
                {showDot && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
                )}
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

      {/* 버스 정보 설정 (카페 근무 가능 직원 + 어드민만) */}
      {showBusSetting && (
        <div className="px-5 mb-4">
          <div className="bg-white rounded-[24px] border border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <Bus className="w-4 h-4 text-[#16A34A]" />
              <p className="text-[13px] font-semibold text-[#8B95A1]">종로11 버스 정보</p>
            </div>
            <div className="space-y-1.5">
              {([
                { value: "all" as const, label: "출퇴근 모두 보기" },
                { value: "outbound-only" as const, label: "퇴근 정보만 보기" },
                { value: "hidden" as const, label: "버스 정보 안 보기" },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setBusCardMode(opt.value);
                    localStorage.setItem("bus-card-mode", opt.value);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-[13px] transition-colors ${
                    busCardMode === opt.value
                      ? "bg-[#E8F3FF] font-bold text-[#3182F6]"
                      : "text-[#4E5968] hover:bg-[#F9FAFB]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

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
