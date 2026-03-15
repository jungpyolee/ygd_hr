"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { Users, Clock, LayoutDashboard, Settings } from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    const checkAdmin = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      // profiles 테이블에서 role 확인
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role === "admin") {
        setIsAdmin(true);
      } else {
        alert("접근 권한이 없습니다.");
        router.replace("/"); // 일반 유저면 메인으로 쫓아냄
      }
      setLoading(false);
    };

    checkAdmin();
  }, [router, supabase]);

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB]">
        확인 중...
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
      name: "설정",
      path: "/admin/settings",
      icon: <Settings className="w-5 h-5" />,
    },
  ];

  return (
    <div className="flex min-h-screen bg-[#F9FAFB]">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-100 p-6 flex flex-col">
        <h1 className="text-xl font-bold text-[#191F28] mb-10 tracking-tight">
          연경당 HR <span className="text-[#3182F6]">Admin</span>
        </h1>
        <nav className="space-y-2 flex-1">
          {menus.map((menu) => {
            const isActive = pathname === menu.path;
            return (
              <Link
                key={menu.name}
                href={menu.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${
                  isActive
                    ? "bg-[#E8F3FF] text-[#3182F6]"
                    : "text-[#4E5968] hover:bg-[#F2F4F6]"
                }`}
              >
                {menu.icon}
                {menu.name}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-10 overflow-y-auto">{children}</main>
    </div>
  );
}
