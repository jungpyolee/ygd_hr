"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { getDistance } from "@/lib/utils/distance";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendNotification } from "@/lib/notifications";
import ConfirmDialog from "@/components/ui/confirm-dialog";

// 부모에게서 받을 Props 정의
interface AttendanceCardProps {
  stores: any[];
  lastLog: any; // { type, attendance_type, time, date, store }
  locationState: any;
  radius: number;
  onSuccess: () => void;
}

interface PendingLocation {
  lat: number;
  lng: number;
  nearestStore: any; // { id, name, distance }
}

export default function AttendanceCard({
  stores,
  lastLog,
  locationState,
  radius,
  onSuccess,
}: AttendanceCardProps) {
  const [loading, setLoading] = useState(false);

  // 원격퇴근 폼 상태
  const [showRemoteOutForm, setShowRemoteOutForm] = useState(false);
  const [remoteReason, setRemoteReason] = useState("");

  // 출장출근 확인 다이얼로그 상태
  const [showBizTripConfirm, setShowBizTripConfirm] = useState(false);

  // 위치 정보를 임시 보관 (반경 초과 시)
  const [pendingLocation, setPendingLocation] =
    useState<PendingLocation | null>(null);

  const supabase = createClient();

  // ─── 핵심 저장 로직 ────────────────────────────────────────────────────────
  const processAttendance = async ({
    type,
    nearestStore,
    lat,
    lng,
    attendanceType,
    distanceM,
    reason,
  }: {
    type: "IN" | "OUT";
    nearestStore: any | null;
    lat: number;
    lng: number;
    attendanceType: string;
    distanceM: number;
    reason?: string;
  }) => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const insertData: Record<string, any> = {
      profile_id: user?.id,
      type,
      user_lat: lat,
      user_lng: lng,
      distance_m: distanceM,
      attendance_type: attendanceType,
    };

    if (nearestStore) {
      insertData.store_id = nearestStore.id;
      if (type === "IN") insertData.check_in_store_id = nearestStore.id;
      else insertData.check_out_store_id = nearestStore.id;
    }

    if (reason) insertData.reason = reason;

    const { data: logData, error } = await supabase
      .from("attendance_logs")
      .insert(insertData)
      .select(`id, profile_id, profiles (name)`)
      .single();

    if (error) {
      const msg = error.message || "";
      if (msg.includes("DUPLICATE_ATTENDANCE_TYPE")) {
        toast.error(
          type === "IN" ? "이미 출근 상태예요" : "이미 퇴근 상태예요",
          {
            description: "페이지를 새로고침하면 정확한 상태를 확인할 수 있어요",
          },
        );
      } else if (msg.includes("INVALID_CHECKOUT_NO_CHECKIN")) {
        toast.error("출근 기록이 없어요", {
          description: "먼저 출근 버튼을 눌러주세요",
        });
      } else {
        toast.error("기록에 실패했어요. 다시 시도해주세요.");
      }
      setLoading(false);
      return;
    }

    const employeeName = (logData.profiles as any)?.name || "누군가";

    // ── 알림 발송 ──────────────────────────────────────────────
    let notifType: string;
    let notifTitle: string;
    let notifContent: string;

    if (attendanceType === "regular") {
      notifType = type === "IN" ? "attendance_in" : "attendance_out";
      notifTitle = type === "IN" ? "☀️ 출근 알림" : "🌙 퇴근 알림";
      notifContent = `${employeeName}님이 ${nearestStore.name}${
        type === "IN" ? "으로 출근했어요" : "에서 퇴근했어요"
      }`;
    } else if (attendanceType === "remote_out") {
      notifType = "attendance_remote_out";
      notifTitle = "📍 원격퇴근 알림";
      notifContent = `${employeeName}님이 ${
        pendingLocation?.nearestStore?.name || "매장"
      }에서 ${Math.round(distanceM)}m 거리에서 원격퇴근했어요`;
    } else if (attendanceType === "business_trip_in") {
      notifType = "attendance_business_trip_in";
      notifTitle = "✈️ 출장출근 알림";
      notifContent = `${employeeName}님이 출장출근했어요`;
    } else {
      // business_trip_out
      notifType = "attendance_business_trip_out";
      notifTitle = "✈️ 출장퇴근 알림";
      notifContent = `${employeeName}님이 출장퇴근했어요`;
    }

    await sendNotification({
      target_role: "admin",
      type: notifType,
      title: notifTitle,
      content: notifContent,
      source_id: logData.id,
    });

    // ── 토스트 ──────────────────────────────────────────────
    if (attendanceType === "regular") {
      toast.success(
        type === "IN"
          ? `${nearestStore.name}으로 출근했어요`
          : `${nearestStore.name}에서 퇴근했어요`,
      );
    } else if (attendanceType === "remote_out") {
      toast.success("원격퇴근 처리됐어요");
    } else if (attendanceType === "business_trip_in") {
      toast.success("출장출근 처리됐어요");
    } else {
      toast.success("출장퇴근 처리됐어요");
    }

    onSuccess();
    setLoading(false);
  };

  // ─── 출퇴근 버튼 탭 ────────────────────────────────────────────────────────
  const handleAttendance = async (type: "IN" | "OUT") => {
    if (stores.length === 0) return toast.error("매장 정보를 불러오고 있어요.");
    if (locationState.status !== "ready")
      return toast.error("위치 정보를 가져올 수 없어요.");

    setLoading(true);
    const { lat, lng } = locationState;

    const nearestStore = stores
      .map((s) => ({ ...s, distance: getDistance(lat, lng, s.lat, s.lng) }))
      .sort((a, b) => a.distance - b.distance)[0];

    // ── 반경 초과 분기 ──────────────────────────────────────
    if (nearestStore.distance > radius) {
      setLoading(false);
      setPendingLocation({ lat, lng, nearestStore });

      if (type === "IN") {
        // 출장출근 확인 다이얼로그
        setShowBizTripConfirm(true);
      } else {
        // 원격퇴근 or 출장퇴근 폼
        const isBizTrip = lastLog?.attendance_type === "business_trip_in";
        setRemoteReason(isBizTrip ? "출장" : "");
        setShowRemoteOutForm(true);
      }
      return;
    }

    // ── 일반 출퇴근 ────────────────────────────────────────
    await processAttendance({
      type,
      nearestStore,
      lat,
      lng,
      attendanceType: "regular",
      distanceM: nearestStore.distance,
    });
  };

  // ─── 출장출근 확인 ─────────────────────────────────────────────────────────
  const confirmBizTrip = async () => {
    setShowBizTripConfirm(false);
    if (!pendingLocation) return;

    await processAttendance({
      type: "IN",
      nearestStore: null,
      lat: pendingLocation.lat,
      lng: pendingLocation.lng,
      attendanceType: "business_trip_in",
      distanceM: pendingLocation.nearestStore.distance,
    });
    setPendingLocation(null);
  };

  // ─── 원격/출장 퇴근 제출 ──────────────────────────────────────────────────
  const submitRemoteOut = async () => {
    if (!remoteReason.trim()) return;
    if (!pendingLocation) return;

    const isBizTrip = lastLog?.attendance_type === "business_trip_in";
    setShowRemoteOutForm(false);

    await processAttendance({
      type: "OUT",
      nearestStore: null,
      lat: pendingLocation.lat,
      lng: pendingLocation.lng,
      attendanceType: isBizTrip ? "business_trip_out" : "remote_out",
      distanceM: pendingLocation.nearestStore.distance,
      reason: remoteReason.trim(),
    });

    setRemoteReason("");
    setPendingLocation(null);
  };

  const isBizTripOut =
    showRemoteOutForm && lastLog?.attendance_type === "business_trip_in";

  return (
    <>
      <section className="bg-white rounded-[28px] p-6 shadow-sm border border-slate-100">
        <div className="flex justify-between items-start mb-8">
          <div className="space-y-1">
            <span className="text-sm font-medium text-[#4E5968]">
              현재 근무 상태
            </span>
            <div className="flex items-center gap-2">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  lastLog?.type === "IN"
                    ? "bg-[#3182F6] animate-pulse"
                    : "bg-[#D1D6DB]"
                }`}
              />
              <div className="text-2xl font-bold text-[#191F28]">
                {lastLog?.type === "IN"
                  ? `${lastLog.store} 근무 중`
                  : "출근 전이에요"}
              </div>
            </div>
            {/* 출장출근 중 뱃지 */}
            {lastLog?.type === "IN" &&
              lastLog?.attendance_type === "business_trip_in" && (
                <span className="inline-block text-[11px] font-bold bg-[#FFF3BF] text-[#E67700] px-2 py-0.5 rounded-md">
                  ✈️ 출장중
                </span>
              )}
          </div>
          {lastLog && (
            <div className="text-right">
              <p className="text-xs text-[#8B95A1] font-medium">
                마지막 {lastLog.type === "IN" ? "출근" : "퇴근"}
              </p>
              <p className="text-sm font-bold text-[#4E5968]">
                <span className="text-[12px] font-normal mr-1">
                  {lastLog.date}
                </span>
                {lastLog.time}
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3">
          <Button
            onClick={() => handleAttendance("IN")}
            disabled={loading || lastLog?.type === "IN"}
            className="h-16 rounded-2xl bg-[#3182F6] text-white font-bold text-lg hover:bg-[#1B64DA] disabled:bg-[#D1D6DB] transition-all"
          >
            {loading ? "위치 확인 중..." : "출근하기"}
          </Button>
          <Button
            onClick={() => handleAttendance("OUT")}
            disabled={loading || lastLog?.type !== "IN"}
            className={`h-16 rounded-2xl font-bold text-lg transition-all ${
              lastLog?.type === "IN" && !loading
                ? "bg-[#E8F3FF] text-[#3182F6] border-2 border-[#3182F6]/30"
                : "bg-[#F2F4F6] text-[#4E5968] disabled:opacity-50"
            }`}
          >
            퇴근하기
          </Button>
        </div>
      </section>

      {/* ── 출장출근 확인 다이얼로그 ─────────────────────────────── */}
      <ConfirmDialog
        isOpen={showBizTripConfirm}
        title="출장 중이신가요?"
        description={`현재 가장 가까운 매장에서 ${Math.round(
          pendingLocation?.nearestStore?.distance ?? 0,
        )}m 떨어져 있어요. 출장 중이라면 출장 출근으로 처리해요.`}
        confirmLabel="출장 출근할게요"
        cancelLabel="취소"
        onConfirm={confirmBizTrip}
        onCancel={() => {
          setShowBizTripConfirm(false);
          setPendingLocation(null);
        }}
      />

      {/* ── 원격퇴근 / 출장퇴근 폼 ──────────────────────────────── */}
      {showRemoteOutForm && (
        <div className="fixed inset-0 z-[300] flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => {
              setShowRemoteOutForm(false);
              setRemoteReason("");
              setPendingLocation(null);
            }}
          />
          <div className="relative w-full max-w-md bg-white rounded-t-[28px] px-5 pt-8 pb-10 shadow-2xl animate-in slide-in-from-bottom duration-300">
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-9 h-1 bg-[#D1D6DB] rounded-full" />
            <h3 className="text-[18px] font-bold text-[#191F28] mb-2">
              {isBizTripOut ? "출장퇴근 처리" : "원격퇴근 처리"}
            </h3>
            <p className="text-[14px] text-[#6B7684] mb-5">
              매장에서{" "}
              {Math.round(pendingLocation?.nearestStore?.distance ?? 0)}m 떨어져
              있어요.{" "}
              {isBizTripOut
                ? "출장 퇴근으로 처리해요."
                : "퇴근 사유를 적어주세요."}
            </p>
            <textarea
              value={remoteReason}
              onChange={(e) => setRemoteReason(e.target.value)}
              placeholder={
                isBizTripOut ? "출장" : "퇴근을 늦게 누른 이유를 적어주세요"
              }
              readOnly={isBizTripOut}
              className="w-full h-24 rounded-2xl border border-slate-200 p-4 text-[14px] text-[#191F28] resize-none focus:outline-none focus:border-[#3182F6] mb-4 bg-white disabled:bg-[#F2F4F6]"
            />
            <button
              onClick={submitRemoteOut}
              disabled={!remoteReason.trim() || loading}
              className="w-full h-14 rounded-2xl bg-[#3182F6] text-white font-bold text-[16px] disabled:bg-[#D1D6DB] mb-2 transition-colors"
            >
              퇴근할게요
            </button>
            <button
              onClick={() => {
                setShowRemoteOutForm(false);
                setRemoteReason("");
                setPendingLocation(null);
              }}
              className="w-full h-12 rounded-2xl bg-[#F2F4F6] text-[#4E5968] font-bold text-[15px]"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </>
  );
}
