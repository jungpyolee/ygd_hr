"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import Link from "next/link";
import { format, addDays, differenceInDays } from "date-fns";
import { sendNotification } from "@/lib/notifications";
import AdminPushToggle from "@/components/AdminPushToggle";
import PushPromptModal from "@/components/PushPromptModal";
import {
  Users,
  Clock,
  LayoutDashboard,
  Settings,
  Menu,
  X,
  Bell,
  BellDot,
  CheckCircle,
  CalendarClock,
  UserPlus,
  Info,
  User,
  BookOpen,
  CalendarDays,
  Megaphone,
  ClipboardList,
} from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // 🚀 알림 관련 상태
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNoti, setShowNoti] = useState(false);
  const [notis, setNotis] = useState<any[]>([]);
  const [pendingSubCount, setPendingSubCount] = useState(0);

  // 🚀 외부 클릭 감지를 위한 Ref 추가
  const notiRef = useRef<HTMLDivElement>(null);

  // 모바일 햄버거 메뉴 상태
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const { user, isLoading: authLoading } = useAuth();

  // 🚀 외부 영역 클릭 시 알림창 닫기 로직
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notiRef.current && !notiRef.current.contains(e.target as Node)) {
        setShowNoti(false);
      }
    };
    if (showNoti) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showNoti]);

  // 1. 관리자 권한 체크 (getUser() 제거 — useAuth()에서 user 재사용)
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }

    const checkAdmin = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role === "admin") {
        setIsAdmin(true);
        fetchNotis();
        fetchPendingSubCount();
        checkHealthCertExpiry();
      } else {
        toast.error("접근 권한이 없어요");
        router.replace("/");
      }
      setLoading(false);
    };

    checkAdmin();
  }, [user, authLoading, router, supabase]);

  // 2. 🚀 실시간 구독 — payload 직접 반영 (DB 풀 쿼리 제거)
  useEffect(() => {
    if (!isAdmin) return;

    const notiChannel = supabase
      .channel("admin-notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: "target_role=eq.admin" }, (payload) => {
        const newNoti = payload.new as any;
        setNotis((prev) => [newNoti, ...prev].slice(0, 15));
        setUnreadCount((prev) => prev + 1);
        if (newNoti.type === "substitute_filled") {
          fetchPendingSubCount();
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: "target_role=eq.all" }, (payload) => {
        const newNoti = payload.new as any;
        setNotis((prev) => [newNoti, ...prev].slice(0, 15));
        setUnreadCount((prev) => prev + 1);
      })
      .subscribe();

    // substitute_requests 상태 변경(승인/반려) 시 pending 카운트 갱신
    const subChannel = supabase
      .channel("substitute-requests-changes")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "substitute_requests" }, () => {
        fetchPendingSubCount();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "substitute_requests" }, () => {
        fetchPendingSubCount();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(notiChannel);
      supabase.removeChannel(subChannel);
    };
  }, [isAdmin]);

  const checkHealthCertExpiry = async () => {
    const today = new Date();
    const todayStr = format(today, "yyyy-MM-dd");
    const thirtyDaysLaterStr = format(addDays(today, 30), "yyyy-MM-dd");
    const tomorrowStr = format(addDays(today, 1), "yyyy-MM-dd");

    const { data: expiring } = await supabase
      .from("profiles")
      .select("id, name, health_cert_date")
      .not("health_cert_date", "is", null)
      .gte("health_cert_date", todayStr)
      .lte("health_cert_date", thirtyDaysLaterStr);

    if (!expiring || expiring.length === 0) return;

    const { data: todayNotis } = await supabase
      .from("notifications")
      .select("source_id")
      .eq("type", "health_cert_expiry")
      .gte("created_at", `${todayStr}T00:00:00+09:00`)
      .lt("created_at", `${tomorrowStr}T00:00:00+09:00`);

    const notifiedIds = new Set(todayNotis?.map((n) => n.source_id) ?? []);

    for (const emp of expiring) {
      if (notifiedIds.has(emp.id)) continue;
      const daysLeft = differenceInDays(
        new Date(emp.health_cert_date),
        today
      );
      await sendNotification({
        target_role: "admin",
        type: "health_cert_expiry",
        title: "보건증 만료 임박",
        content: `${emp.name}님의 보건증이 ${daysLeft === 0 ? "오늘" : `${daysLeft}일 후`} 만료돼요. 갱신을 안내해 주세요.`,
        source_id: emp.id,
      });
    }
  };

  const fetchPendingSubCount = async () => {
    const { count } = await supabase
      .from("substitute_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");
    setPendingSubCount(count ?? 0);
  };

  const fetchNotis = async () => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("target_role", "admin")
      .order("created_at", { ascending: false })
      .limit(15);

    if (data) {
      setNotis(data);
      setUnreadCount(data.filter((n) => !n.is_read).length);
    }
  };

  const markAllAsRead = async () => {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("target_role", "admin")
      .eq("is_read", false);

    if (!error) {
      setUnreadCount(0);
      fetchNotis();
    }
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB]">
        <div className="w-8 h-8 border-4 border-[#3182F6] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  if (!isAdmin) return null;

  const menus = [
    {
      name: "대시보드",
      path: "/admin",
      icon: <LayoutDashboard className="w-5 h-5" />,
    },
    {
      name: "직원 관리",
      path: "/admin/employees",
      icon: <Users className="w-5 h-5" />,
    },
    {
      name: "근태 조회",
      path: "/admin/attendance",
      icon: <Clock className="w-5 h-5" />,
    },
    {
      name: "스케줄 관리",
      path: "/admin/schedules",
      icon: <CalendarDays className="w-5 h-5" />,
    },
    {
      name: "레시피 관리",
      path: "/admin/recipes",
      icon: <BookOpen className="w-5 h-5" />,
    },
    {
      name: "공지사항 관리",
      path: "/admin/announcements",
      icon: <Megaphone className="w-5 h-5" />,
    },
    {
      name: "체크리스트 설정",
      path: "/admin/checklists",
      icon: <ClipboardList className="w-5 h-5" />,
    },
    {
      name: "직원 모드로 변경",
      path: "/",
      icon: <User className="w-5 h-5" />,
    },
  ];

  const getNotiIcon = (type: string) => {
    switch (type) {
      case "onboarding":
        return <UserPlus className="w-4 h-4 text-blue-500" />;
      case "attendance_in":
        return <CalendarClock className="w-4 h-4 text-green-500" />;
      case "attendance_out":
        return <CalendarClock className="w-4 h-4 text-orange-500" />;
      case "substitute_requested":
        return <CalendarDays className="w-4 h-4 text-purple-500" />;
      case "health_cert_expiry":
        return <Info className="w-4 h-4 text-amber-500" />;
      default:
        return <Info className="w-4 h-4 text-slate-400" />;
    }
  };

  // 🚀 알림 개별 클릭 핸들러
  const handleNotiClick = async (noti: any) => {
    // 1. 읽음 처리 (DB 업데이트)
    if (!noti.is_read) {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", noti.id);

      // 상태 즉시 반영 (다시 불러오기)
      fetchNotis();
    }

    // 2. 알림 타입에 따른 페이지 이동 (Deep Link)
    setShowNoti(false); // 알림창 닫기

    switch (noti.type) {
      case "onboarding":
      case "profile_update":
        // 직원 관리 페이지로 이동
        router.push("/admin/employees");
        break;
      case "attendance_in":
      case "attendance_out":
        // 근태 조회 페이지로 이동
        router.push("/admin/attendance");
        break;
      case "substitute_requested":
        router.push("/admin/schedules/substitutes");
        break;
      case "announcement":
        router.push("/admin/announcements");
        break;
      default:
        // 기본값은 대시보드
        router.push("/admin");
        break;
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F9FAFB] relative font-pretendard overflow-x-hidden">
      <PushPromptModal />
      {/* 💻 Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-white border-r border-slate-100 p-6 flex-col shrink-0 sticky top-0 h-screen">
        <h1 className="text-xl font-bold text-[#191F28] mb-10 tracking-tight">
          연경당 HR <span className="text-[#3182F6]">Admin</span>
        </h1>
        <nav className="space-y-2 flex-1">
          {menus.map((menu) => {
            const isActive = pathname === menu.path;
            const isSchedule = menu.name === "스케줄 관리";
            return (
              <Link
                key={menu.name}
                href={menu.path}
                className={`relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${
                  isActive
                    ? "bg-[#E8F3FF] text-[#3182F6]"
                    : "text-[#4E5968] hover:bg-[#F2F4F6]"
                }`}
              >
                {menu.icon}
                {menu.name}
                {isSchedule && pendingSubCount > 0 && (
                  <span className="ml-auto min-w-[20px] h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                    {pendingSubCount > 9 ? "9+" : pendingSubCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* 🚀 상단 헤더 (z-index 및 레이아웃 최적화) */}
        <header className="h-16 flex items-center justify-between md:justify-end px-5 md:px-10 sticky top-0 bg-white/80 backdrop-blur-md z-[100] border-b border-slate-50">
          <div className="md:hidden font-bold text-[#191F28]">연경당 Admin</div>

          <div className="relative" ref={notiRef}>
            <button
              onClick={() => setShowNoti(!showNoti)}
              className="p-2 rounded-full hover:bg-slate-100 transition-colors relative z-[110]"
            >
              {unreadCount > 0 ? (
                <BellDot className="w-6 h-6 text-[#3182F6] animate-pulse" />
              ) : (
                <Bell className="w-6 h-6 text-[#4E5968]" />
              )}
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
              )}
            </button>

            {/* 알림 드롭다운 */}
            {showNoti && (
              <div className="absolute right-0 mt-3 w-[320px] sm:w-[360px] bg-white rounded-[28px] shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200 z-[120]">
                <div className="p-5 border-b border-slate-50 flex justify-between items-center bg-white">
                  <h3 className="font-bold text-[#191F28]">최신 알림</h3>
                  <button
                    onClick={markAllAsRead}
                    className="text-[12px] font-bold text-[#3182F6] flex items-center gap-1 hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors"
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> 모두 읽음
                  </button>
                </div>
                <div className="max-h-[420px] overflow-y-auto scrollbar-hide">
                  {notis.length === 0 ? (
                    <div className="p-12 text-center text-[#8B95A1] text-[14px]">
                      새 알림이 없어요
                    </div>
                  ) : (
                    notis.map((n) => (
                      <button // 💡 div에서 button으로 교체 (text-left 추가)
                        key={n.id}
                        onClick={() => handleNotiClick(n)}
                        className={`w-full text-left p-4 border-b border-slate-50 last:border-0 hover:bg-[#F9FAFB] transition-colors ${
                          !n.is_read ? "bg-[#F2F8FF]/50" : ""
                        }`}
                      >
                        <div className="flex gap-3">
                          <div className="mt-1">{getNotiIcon(n.type)}</div>
                          <div className="flex-1">
                            <p className="text-[14px] font-bold text-[#191F28] mb-0.5">
                              {n.title}
                            </p>
                            <p className="text-[13px] text-[#4E5968] leading-snug">
                              {n.content}
                            </p>
                            <p className="text-[11px] text-[#8B95A1] mt-1.5 uppercase font-medium">
                              {new Intl.DateTimeFormat("ko-KR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              }).format(new Date(n.created_at))}
                            </p>
                          </div>
                          {!n.is_read && (
                            <div className="w-1.5 h-1.5 bg-[#3182F6] rounded-full mt-2" />
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
                <div className="border-t border-slate-100">
                  <AdminPushToggle />
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 w-full max-w-full p-5 pb-24 md:p-10">
          {children}
        </main>
      </div>

      {/* 📱 Mobile Menu (Z-index 조정) */}
      <div className="md:hidden fixed bottom-6 right-6 z-[90]">
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="w-14 h-14 bg-[#3182F6] text-white rounded-full shadow-lg shadow-blue-500/30 flex items-center justify-center active:scale-95 transition-all"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-[200] flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="relative bg-white rounded-t-[32px] p-6 pt-8 pb-10 animate-in slide-in-from-bottom-full duration-300 shadow-2xl">
            <div className="flex justify-between items-center mb-6 px-1">
              <h2 className="text-xl font-bold text-[#191F28]">메뉴</h2>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F4F6] text-[#8B95A1]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="space-y-3">
              {menus.map((menu) => {
                const isSchedule = menu.name === "스케줄 관리";
                return (
                  <Link
                    key={menu.name}
                    href={menu.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-bold text-[16px] border ${
                      pathname === menu.path
                        ? "bg-[#E8F3FF] border-[#E8F3FF] text-[#3182F6]"
                        : "bg-white border-slate-100 text-[#4E5968]"
                    }`}
                  >
                    <div className={pathname === menu.path ? "text-[#3182F6]" : "text-[#8B95A1]"}>
                      {menu.icon}
                    </div>
                    {menu.name}
                    {isSchedule && pendingSubCount > 0 && (
                      <span className="ml-auto min-w-[20px] h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                        {pendingSubCount > 9 ? "9+" : pendingSubCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}
