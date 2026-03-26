"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { sendNotification, type NotificationType } from "@/lib/notifications";
import { toast } from "sonner";
import { CheckCircle, XCircle, Loader2, LogIn } from "lucide-react";

type Status = "loading" | "success" | "error" | "not-logged-in";

export default function QRAttendPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [subMessage, setSubMessage] = useState("");
  const processedRef = useRef(false);

  const storeId = searchParams.get("s");
  const token = searchParams.get("token");

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setStatus("not-logged-in");
      return;
    }

    if (!storeId || !token) {
      setStatus("error");
      setMessage("잘못된 QR 코드예요");
      setSubMessage("관리자에게 문의해주세요");
      return;
    }

    if (processedRef.current) return;
    processedRef.current = true;

    processQRAttendance();
  }, [authLoading, user]);

  const processQRAttendance = async () => {
    try {
      // 1. 토큰 검증
      const { data: store, error: storeError } = await supabase
        .from("stores")
        .select("id, name, qr_token, lat, lng")
        .eq("id", storeId!)
        .single();

      if (storeError || !store || store.qr_token !== token) {
        setStatus("error");
        setMessage("유효하지 않은 QR 코드예요");
        setSubMessage("관리자에게 새 QR 코드를 요청해주세요");
        return;
      }

      // 2. 마지막 출퇴근 기록 확인 → IN/OUT 자동 판별
      const todayKST = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
      }).format(new Date());

      const { data: lastLog } = await supabase
        .from("attendance_logs")
        .select("type, attendance_type, created_at")
        .eq("profile_id", user!.id)
        .gte("created_at", `${todayKST}T00:00:00+09:00`)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const type: "IN" | "OUT" =
        lastLog?.type === "IN" ? "OUT" : "IN";

      // 3. 출퇴근 기록 삽입
      const insertData: Record<string, unknown> = {
        profile_id: user!.id,
        type,
        user_lat: store.lat,
        user_lng: store.lng,
        distance_m: 0,
        attendance_type: type === "IN" ? "qr_in" : "qr_out",
      };

      if (type === "IN") insertData.check_in_store_id = store.id;
      else insertData.check_out_store_id = store.id;

      const { data: logData, error: insertError } = await supabase
        .from("attendance_logs")
        .insert(insertData)
        .select("id, profile_id, created_at, profiles (name)")
        .single();

      if (insertError) {
        const msg = insertError.message || "";
        if (msg.includes("DUPLICATE_ATTENDANCE_TYPE")) {
          setStatus("error");
          setMessage(
            type === "IN" ? "이미 출근 상태예요" : "이미 퇴근 상태예요"
          );
          setSubMessage("페이지를 닫아주세요");
        } else {
          setStatus("error");
          setMessage("기록에 실패했어요");
          setSubMessage("다시 시도해주세요");
        }
        return;
      }

      // 4. 알림 발송
      const employeeName =
        (logData.profiles as { name?: string })?.name || "누군가";
      const notifType: NotificationType =
        type === "IN" ? "attendance_qr_in" : "attendance_qr_out";
      const notifTitle =
        type === "IN" ? "📱 QR 출근 알림" : "📱 QR 퇴근 알림";
      const notifContent = `${employeeName}님이 ${store.name}에서 QR로 ${
        type === "IN" ? "출근했어요" : "퇴근했어요"
      }`;

      await sendNotification({
        target_role: "admin",
        type: notifType,
        title: notifTitle,
        content: notifContent,
        source_id: logData.id,
      });

      setStatus("success");
      setMessage(type === "IN" ? "출근 완료!" : "퇴근 완료!");
      setSubMessage(`${store.name} · QR 출퇴근`);

      toast.success(
        type === "IN"
          ? `${store.name}에 출근했어요`
          : `${store.name}에서 퇴근했어요`
      );
    } catch {
      setStatus("error");
      setMessage("오류가 발생했어요");
      setSubMessage("다시 시도해주세요");
    }
  };

  const goHome = () => router.push("/");
  const goLogin = () => router.push("/login");

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[#F2F4F6] p-5">
      <div className="w-full max-w-sm bg-white rounded-[28px] p-8 shadow-sm text-center">
        {status === "loading" && (
          <>
            <div className="w-16 h-16 rounded-full bg-[#E8F3FF] flex items-center justify-center mx-auto mb-5">
              <Loader2 className="w-8 h-8 text-[#3182F6] animate-spin" />
            </div>
            <h2 className="text-[20px] font-bold text-[#191F28] mb-2">
              처리 중이에요
            </h2>
            <p className="text-[14px] text-[#6B7684]">잠시만 기다려주세요</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="w-16 h-16 rounded-full bg-[#E8FFE8] flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <h2 className="text-[20px] font-bold text-[#191F28] mb-2">
              {message}
            </h2>
            <p className="text-[14px] text-[#6B7684] mb-6">{subMessage}</p>
            <button
              onClick={goHome}
              className="w-full h-14 rounded-2xl bg-[#3182F6] text-white font-bold text-[16px] active:scale-[0.98] transition-transform"
            >
              홈으로 돌아가기
            </button>
          </>
        )}

        {status === "error" && (
          <>
            <div className="w-16 h-16 rounded-full bg-[#FFE8E8] flex items-center justify-center mx-auto mb-5">
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-[20px] font-bold text-[#191F28] mb-2">
              {message}
            </h2>
            <p className="text-[14px] text-[#6B7684] mb-6">{subMessage}</p>
            <button
              onClick={goHome}
              className="w-full h-14 rounded-2xl bg-[#F2F4F6] text-[#4E5968] font-bold text-[16px] active:scale-[0.98] transition-transform"
            >
              홈으로 돌아가기
            </button>
          </>
        )}

        {status === "not-logged-in" && (
          <>
            <div className="w-16 h-16 rounded-full bg-[#E8F3FF] flex items-center justify-center mx-auto mb-5">
              <LogIn className="w-8 h-8 text-[#3182F6]" />
            </div>
            <h2 className="text-[20px] font-bold text-[#191F28] mb-2">
              로그인이 필요해요
            </h2>
            <p className="text-[14px] text-[#6B7684] mb-6">
              로그인하면 자동으로 출퇴근이 처리돼요
            </p>
            <button
              onClick={goLogin}
              className="w-full h-14 rounded-2xl bg-[#3182F6] text-white font-bold text-[16px] active:scale-[0.98] transition-transform"
            >
              로그인하기
            </button>
          </>
        )}
      </div>
    </div>
  );
}
