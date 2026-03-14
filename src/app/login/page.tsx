"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast.error("정보를 다시 확인해주세요", {
        description: error.message,
      });
      setLoading(false);
      return;
    }

    toast.success("로그인 성공");
    router.push("/");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen flex-col bg-white px-6 py-20 md:items-center md:justify-center md:py-0">
      <div className="w-full max-w-[400px] space-y-12">
        {/* Header: 토스 특유의 굵고 큰 타이틀 */}
        <header className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 leading-tight">
            연경당 HR 이용을 위해
            <br />
            로그인이 필요해요
          </h1>
          <p className="text-slate-500 font-medium">
            사장님이 부여한 계정 정보를 입력해주세요.
          </p>
        </header>

        {/* Form Section */}
        <form onSubmit={handleLogin} className="space-y-8">
          <div className="space-y-6">
            <div className="space-y-2">
              <Label
                htmlFor="email"
                className="text-sm font-semibold text-slate-600 ml-1"
              >
                이메일
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="id@ygd.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-14 rounded-2xl border-none bg-slate-100 px-4 text-lg focus-visible:ring-2 focus-visible:ring-blue-500 transition-all placeholder:text-slate-400"
                required
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="password"
                className="text-sm font-semibold text-slate-600 ml-1"
              >
                비밀번호
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-14 rounded-2xl border-none bg-slate-100 px-4 text-lg focus-visible:ring-2 focus-visible:ring-blue-500 transition-all"
                required
              />
            </div>
          </div>

          {/* Bottom Button: 하단 고정 느낌 혹은 넓은 버튼 */}
          <Button
            className="w-full h-14 rounded-2xl text-lg font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-none transition-all active:scale-[0.98]"
            type="submit"
            disabled={loading}
          >
            {loading ? "확인 중..." : "로그인"}
          </Button>
        </form>
      </div>
    </div>
  );
}
