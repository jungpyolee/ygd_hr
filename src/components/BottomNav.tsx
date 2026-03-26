"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Home, Calendar, Store, User } from "lucide-react";

const GUIDE_VERSION = "v1.0.5";

const tabs = [
  { href: "/", label: "홈", icon: Home },
  { href: "/calendar", label: "스케줄", icon: Calendar },
  { href: "/store", label: "매장", icon: Store },
  { href: "/my", label: "마이", icon: User },
];

const SHOW_PATHS = new Set(["/", "/calendar", "/store", "/my"]);

export default function BottomNav() {
  const pathname = usePathname();
  const [hasGuideUpdate, setHasGuideUpdate] = useState(false);

  useEffect(() => {
    const check = () => {
      const seen = localStorage.getItem("guide_seen_version");
      setHasGuideUpdate(seen !== GUIDE_VERSION);
    };
    check();
    window.addEventListener("guide-version-seen", check);
    return () => window.removeEventListener("guide-version-seen", check);
  }, []);

  if (!SHOW_PATHS.has(pathname)) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#E5E8EB]">
      <div className="flex items-center justify-around px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] max-w-lg mx-auto">
        {tabs.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          const showDot = href === "/my" && hasGuideUpdate;
          return (
            <Link
              key={href}
              href={href}
              className="relative flex flex-col items-center gap-1 px-5 py-1"
            >
              <div className="relative">
                <Icon
                  className={`w-6 h-6 transition-colors ${isActive ? "text-[#3182F6]" : "text-[#8B95A1]"}`}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                {showDot && (
                  <span className="absolute -top-0.5 -right-1 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </div>
              <span
                className={`text-[11px] font-semibold transition-colors ${isActive ? "text-[#3182F6]" : "text-[#8B95A1]"}`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
