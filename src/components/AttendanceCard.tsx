"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { getDistance } from "@/lib/utils/distance";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { sendNotification, type NotificationType } from "@/lib/notifications";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import LocationPermissionGuide from "@/components/LocationPermissionGuide";
import ChecklistSheet from "@/components/ChecklistSheet";
import StoreSelectorSheet from "@/components/StoreSelectorSheet";
import type { GeoState } from "@/lib/hooks/useGeolocation";
import type { ChecklistTemplate, ChecklistDraft } from "@/types/checklist";
import { useWorkplaces } from "@/lib/hooks/useWorkplaces";

interface TodaySlot {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  store_id: string;
  position_keys: string[];
  notes: string | null;
}

interface AttendanceCardProps {
  stores: any[];
  lastLog: any;
  locationState: GeoState;
  radius: number;
  todaySlots: TodaySlot[];
  onSuccess: () => void;
  onRetryLocation: () => Promise<GeoState>;
  onFetchForAttendance: () => Promise<GeoState>;
}

interface PendingLocation {
  lat: number;
  lng: number;
  nearestStore: any;
}

export default function AttendanceCard({
  stores,
  lastLog,
  locationState,
  radius,
  todaySlots,
  onSuccess,
  onRetryLocation,
  onFetchForAttendance,
}: AttendanceCardProps) {
  const { byId } = useWorkplaces();
  const [loading, setLoading] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // 체크리스트 상태
  const [showChecklist, setShowChecklist] = useState(false);
  const [checklistItems, setChecklistItems] = useState<ChecklistTemplate[]>([]);
  const [checklistTrigger, setChecklistTrigger] = useState<"check_in" | "check_out">("check_in");
  const [pendingLogId, setPendingLogId] = useState<string | null>(null);
  const [pendingCheckoutCheckedIds, setPendingCheckoutCheckedIds] = useState<string[]>([]);

  // 원격퇴근 폼 상태
  const [showRemoteOutForm, setShowRemoteOutForm] = useState(false);
  const [remoteReason, setRemoteReason] = useState("");

  // 출장출근 확인 다이얼로그 상태
  const [showBizTripConfirm, setShowBizTripConfirm] = useState(false);

  // 위치 정보를 임시 보관 (반경 초과 시)
  const [pendingLocation, setPendingLocation] =
    useState<PendingLocation | null>(null);

  // 위치 권한 안내 바텀시트
  const [showPermissionGuide, setShowPermissionGuide] = useState(false);
  // 위치 재시도 후 재개할 출퇴근 타입
  const [pendingType, setPendingType] = useState<"IN" | "OUT" | null>(null);

  // 위치 실패 fallback — 매장 수동 선택
  const [showStoreSelector, setShowStoreSelector] = useState(false);
  const [storeSelectorType, setStoreSelectorType] = useState<"IN" | "OUT" | null>(null);

  const supabase = useMemo(() => createClient(), []);
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const isProcessingRef = useRef(false);

  // 체크리스트 재개 상태
  const [pendingResume, setPendingResume] = useState<{
    trigger: "check_in" | "check_out";
    checkedIds: string[];
    logId?: string;
    totalItems: number;
  } | null>(null);
  const [checklistInitialIds, setChecklistInitialIds] = useState<string[]>([]);

  // ─── localStorage draft 헬퍼 ──────────────────────────────────────────────
  const getDraftKey = (uid: string, trigger: "check_in" | "check_out") =>
    `checklist_draft_${uid}_${trigger}`;

  const saveDraft = (uid: string, draft: ChecklistDraft) =>
    localStorage.setItem(getDraftKey(uid, draft.trigger), JSON.stringify(draft));

  const loadDraft = (uid: string, trigger: "check_in" | "check_out"): ChecklistDraft | null => {
    try {
      const raw = localStorage.getItem(getDraftKey(uid, trigger));
      if (!raw) return null;
      const draft: ChecklistDraft = JSON.parse(raw);
      const today = new Date().toISOString().slice(0, 10);
      if (draft.userId !== uid || draft.date !== today) {
        localStorage.removeItem(getDraftKey(uid, trigger));
        return null;
      }
      return draft;
    } catch { return null; }
  };

  const clearDraft = (uid: string, trigger: "check_in" | "check_out") =>
    localStorage.removeItem(getDraftKey(uid, trigger));

  // ─── 체크리스트 헬퍼 ───────────────────────────────────────────────────────
  const fetchChecklistItems = async (trigger: "check_in" | "check_out") => {
    const todaySlot = todaySlots[0] ?? null;

    // 오늘 배정된 스케줄 없으면 체크리스트 없음
    if (!todaySlot) return [];

    const { data } = await supabase
      .from("checklist_templates")
      .select("*")
      .eq("trigger", trigger)
      .eq("is_active", true)
      .order("order_index");

    const all = (data as ChecklistTemplate[]) ?? [];

    // 오늘 슬롯의 work_location / position_keys 기준으로 필터링
    // position_keys가 빈 배열이면 position_key=null인 공통 항목만 표시
    return all.filter((item) => {
      if (item.work_location && item.work_location !== byId[todaySlot.store_id]?.work_location_key)
        return false;
      if (item.position_key && !todaySlot.position_keys.includes(item.position_key))
        return false;
      return true;
    });
  };

  // ─── 체크리스트 재개 감지 ──────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    checkPendingResume();
  }, [userId, lastLog]); // eslint-disable-line react-hooks/exhaustive-deps

  const checkPendingResume = async () => {
    if (!userId) return;

    // check_in draft: localStorage + DB 조합
    const inDraft = loadDraft(userId, "check_in");
    if (inDraft?.attendanceLogId) {
      const { data: submission } = await supabase
        .from("checklist_submissions")
        .select("id")
        .eq("attendance_log_id", inDraft.attendanceLogId)
        .maybeSingle();
      if (!submission) {
        setPendingResume({ trigger: "check_in", checkedIds: inDraft.checkedIds, logId: inDraft.attendanceLogId, totalItems: inDraft.totalItems ?? 0 });
        return;
      }
      clearDraft(userId, "check_in");
    }

    // check_out draft는 퇴근 버튼 탭 시 자동 복원 — 별도 배너 불필요
  };

  // ─── 체크리스트 재개 핸들러 ────────────────────────────────────────────────
  const handleResumeChecklist = async () => {
    if (!pendingResume || !userId) return;
    const { trigger, checkedIds, logId } = pendingResume;
    setPendingResume(null);

    const items = await fetchChecklistItems(trigger);
    if (items.length === 0) {
      // 템플릿이 사라진 경우 draft 정리
      clearDraft(userId, trigger);
      if (trigger === "check_in") onSuccess();
      return;
    }

    if (trigger === "check_in" && logId) setPendingLogId(logId);
    setChecklistItems(items);
    setChecklistTrigger(trigger);
    setChecklistInitialIds(checkedIds);
    setShowChecklist(true);
  };

  const saveChecklistSubmission = async (
    trigger: "check_in" | "check_out",
    checkedIds: string[],
    logId: string | null,
    totalItems: number
  ) => {
    if (!userId) return;
    const { error } = await supabase.from("checklist_submissions").insert({
      profile_id: userId,
      trigger,
      attendance_log_id: logId,
      checked_item_ids: checkedIds,
      all_checked: checkedIds.length === totalItems,
    });
    if (error) {
      toast.error("체크리스트 저장에 실패했어요", {
        description: "출퇴근은 정상 처리됐어요. 관리자에게 문의해 주세요.",
      });
    }
  };

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

    const insertData: Record<string, any> = {
      profile_id: userId,
      type,
      user_lat: lat,
      user_lng: lng,
      distance_m: distanceM,
      attendance_type: attendanceType,
    };

    if (nearestStore) {
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
    let notifType: NotificationType;
    let notifTitle: string;
    let notifContent: string;

    if (attendanceType === "fallback_in" || attendanceType === "fallback_out") {
      notifType = attendanceType === "fallback_in" ? "attendance_fallback_in" : "attendance_fallback_out";
      notifTitle = attendanceType === "fallback_in" ? "⚠️ 수동 출근 알림" : "⚠️ 수동 퇴근 알림";
      notifContent = `${employeeName}님이 위치 확인 실패로 ${nearestStore?.name ?? "매장"}을(를) 직접 선택해 ${
        attendanceType === "fallback_in" ? "출근했어요" : "퇴근했어요"
      }`;
    } else if (attendanceType === "regular") {
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
      }에서 ${Math.round(distanceM)}m 거리에서 원격 퇴근했어요`;
    } else if (attendanceType === "business_trip_in") {
      notifType = "attendance_business_trip_in";
      notifTitle = "✈️ 출장 출근 알림";
      notifContent = `${employeeName}님이 출장 출근했어요`;
    } else {
      notifType = "attendance_business_trip_out";
      notifTitle = "✈️ 출장 퇴근 알림";
      notifContent = `${employeeName}님이 출장 퇴근했어요`;
    }

    const { error: notifError } = await sendNotification({
      target_role: "admin",
      type: notifType,
      title: notifTitle,
      content: notifContent,
      source_id: logData.id,
    });
    if (notifError) {
      console.error("[sendNotification] 관리자 알림 발송 실패:", notifError.message);
    }

    // ── 토스트 ──────────────────────────────────────────────
    if (attendanceType === "fallback_in" || attendanceType === "fallback_out") {
      toast.success(
        attendanceType === "fallback_in"
          ? `${nearestStore?.name ?? "매장"}으로 출근했어요`
          : `${nearestStore?.name ?? "매장"}에서 퇴근했어요`,
        { description: "위치 확인 없이 처리됐어요" },
      );
    } else if (attendanceType === "regular") {
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

    // ── 출근 후 check_in 체크리스트 ──────────────────────────
    if (type === "IN") {
      const items = await fetchChecklistItems("check_in");
      if (items.length > 0) {
        setPendingLogId(logData.id);
        setChecklistItems(items);
        setChecklistTrigger("check_in");
        setChecklistInitialIds([]);
        setShowChecklist(true);
        // 이탈 재개를 위해 draft 저장
        if (userId) {
          saveDraft(userId, {
            userId,
            date: new Date().toISOString().slice(0, 10),
            trigger: "check_in",
            attendanceLogId: logData.id,
            checkedIds: [],
            totalItems: items.length,
          });
        }
        setLoading(false);
        return;
      }
    }

    // ── check_out 체크리스트 submission 저장 ─────────────────
    if (type === "OUT" && pendingCheckoutCheckedIds.length > 0) {
      await saveChecklistSubmission("check_out", pendingCheckoutCheckedIds, logData.id, checklistItems.length);
      setPendingCheckoutCheckedIds([]);
    }
    if (type === "OUT" && userId) clearDraft(userId, "check_out");

    onSuccess();
    setLoading(false);
  };

  // ─── 좌표 확정 후 출퇴근 진행 ─────────────────────────────────────────────
  const proceedWithCoordinates = async (
    type: "IN" | "OUT",
    lat: number,
    lng: number
  ) => {
    if (stores.length === 0) {
      toast.error("매장 정보를 불러오고 있어요.", {
        description: "잠시 후 다시 시도해주세요",
      });
      return;
    }

    const nearestStore = stores
      .map((s) => ({ ...s, distance: getDistance(lat, lng, s.lat, s.lng) }))
      .sort((a, b) => a.distance - b.distance)[0];

    if (nearestStore.distance > radius) {
      setPendingLocation({ lat, lng, nearestStore });
      if (type === "IN") {
        setShowBizTripConfirm(true);
      } else {
        const isBizTrip = lastLog?.attendance_type === "business_trip_in";
        setRemoteReason(isBizTrip ? "출장" : "");
        setShowRemoteOutForm(true);
      }
      return;
    }

    await processAttendance({
      type,
      nearestStore,
      lat,
      lng,
      attendanceType: "regular",
      distanceM: nearestStore.distance,
    });
  };

  // ─── 체크리스트 완료 핸들러 ────────────────────────────────────────────────
  const handleChecklistComplete = async (checkedIds: string[]) => {
    setShowChecklist(false);
    setChecklistInitialIds([]);
    if (checklistTrigger === "check_in") {
      // 출근 체크리스트: submission 저장 후 onSuccess
      await saveChecklistSubmission("check_in", checkedIds, pendingLogId, checklistItems.length);
      if (userId) clearDraft(userId, "check_in");
      setPendingLogId(null);
      setPendingResume(null);
      onSuccess();
    } else {
      // 퇴근 체크리스트: 완료 후 GPS → 퇴근 처리
      setPendingCheckoutCheckedIds(checkedIds);
      await runCheckoutFlow();
    }
  };

  const handleChecklistClose = () => {
    // check_in: X 눌러서 이탈 → draft 유지, 이어서 배너 표시 (퇴근버튼 안 뜸)
    setShowChecklist(false);
    setChecklistInitialIds([]);
    // pendingResume가 없는 경우(첫 진입 후 X)에도 배너가 뜨도록 설정
    if (!pendingResume && userId && pendingLogId) {
      const draft = loadDraft(userId, "check_in");
      setPendingResume({
        trigger: "check_in",
        checkedIds: draft?.checkedIds ?? [],
        logId: pendingLogId,
        totalItems: draft?.totalItems ?? checklistItems.length,
      });
    }
    // onSuccess() 호출 안 함 → 퇴근하기 버튼 안 뜸
  };

  const handleCheckoutChecklistClose = () => {
    // check_out: 닫기만 (draft 유지 → 퇴근하기 재탭 시 자동 복원)
    setShowChecklist(false);
    setChecklistInitialIds([]);
  };

  // 퇴근 GPS+기록 실행 (체크리스트 완료 후 or 체크리스트 없을 때)
  const runCheckoutFlow = async () => {
    setIsRetrying(true);
    setPendingType("OUT");

    try {
      const result = await onFetchForAttendance();

      if (result.status === "ready") {
        setPendingType(null);
        await proceedWithCoordinates("OUT", result.lat!, result.lng!);
        return;
      }
      if (result.status === "denied") {
        setShowPermissionGuide(true);
        return;
      }
      const retryResult = await onRetryLocation();
      if (retryResult.status === "ready") {
        setPendingType(null);
        await proceedWithCoordinates("OUT", retryResult.lat!, retryResult.lng!);
        return;
      }
      if (retryResult.status === "denied") {
        setShowPermissionGuide(true);
        return;
      }

      // GPS 재시도까지 실패 → 매장 수동 선택 fallback
      openStoreFallback("OUT");
    } finally {
      setIsRetrying(false);
    }
  };

  // ─── 출퇴근 버튼 탭 ────────────────────────────────────────────────────────
  const handleAttendance = async (type: "IN" | "OUT") => {
    if (isProcessingRef.current) return; // 중복 클릭 방지
    isProcessingRef.current = true;
    try {
      // 퇴근: 체크리스트 먼저 확인
      if (type === "OUT") {
        const items = await fetchChecklistItems("check_out");
        if (items.length > 0) {
          // 이탈 후 재개: 기존 draft 있으면 체크 상태 복원
          const outDraft = userId ? loadDraft(userId, "check_out") : null;
          const initialIds = outDraft?.checkedIds ?? [];
          setChecklistItems(items);
          setChecklistTrigger("check_out");
          setChecklistInitialIds(initialIds);
          setShowChecklist(true);
          // 신규 시작이면 draft 생성
          if (!outDraft && userId) {
            saveDraft(userId, {
              userId,
              date: new Date().toISOString().slice(0, 10),
              trigger: "check_out",
              attendanceLogId: null,
              checkedIds: [],
              totalItems: items.length,
            });
          }
          return;
        }
        // 체크리스트 없으면 바로 퇴근 흐름
        await runCheckoutFlow();
        return;
      }

      setIsRetrying(true);
      setPendingType(type);

      try {
        // 출퇴근 기록은 항상 10초 캐시 기준으로 신선한 위치 사용
        const result = await onFetchForAttendance();

        if (result.status === "ready") {
          setPendingType(null);
          await proceedWithCoordinates(type, result.lat!, result.lng!);
          return;
        }

        if (result.status === "denied") {
          setShowPermissionGuide(true);
          return;
        }

        // timeout / unavailable → 권한은 있으나 GPS 응답 없음, onRetryLocation으로 재시도
        const retryResult = await onRetryLocation();
        if (retryResult.status === "ready") {
          setPendingType(null);
          await proceedWithCoordinates(type, retryResult.lat!, retryResult.lng!);
          return;
        }

        if (retryResult.status === "denied") {
          setShowPermissionGuide(true);
          return;
        }

        // GPS 재시도까지 실패 → 매장 수동 선택 fallback
        openStoreFallback(type);
      } finally {
        setIsRetrying(false);
      }
    } finally {
      isProcessingRef.current = false;
    }
  };

  // ─── 권한 안내 확인 후 재시도 ──────────────────────────────────────────────
  const handlePermissionConfirm = async () => {
    setShowPermissionGuide(false);
    const type = pendingType;
    if (!type) return;

    setIsRetrying(true);

    try {
      const result = await onRetryLocation();

      if (result.status === "ready") {
        setPendingType(null);
        await proceedWithCoordinates(type, result.lat!, result.lng!);
        return;
      }

      // 권한 안내 후에도 여전히 실패 → 매장 수동 선택 fallback
      openStoreFallback(type);
    } finally {
      setIsRetrying(false);
    }
  };

  // ─── 위치 실패 fallback ────────────────────────────────────────────────────
  const openStoreFallback = (type: "IN" | "OUT") => {
    setPendingType(null);
    setStoreSelectorType(type);
    setShowStoreSelector(true);
  };

  const handleStoreFallbackSelect = async (store: { id: string; name: string; lat: number; lng: number }) => {
    setShowStoreSelector(false);
    const type = storeSelectorType!;
    setStoreSelectorType(null);

    await processAttendance({
      type,
      nearestStore: store,
      lat: store.lat,
      lng: store.lng,
      attendanceType: type === "IN" ? "fallback_in" : "fallback_out",
      distanceM: 0,
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

  const isButtonBusy = loading || isRetrying;

  // 출근 기록은 됐지만 check_in 체크리스트 미완료 상태
  // (lastLog 갱신 전에도 체크리스트 배너를 정확히 보여주기 위해)
  const hasPendingCheckIn = !!pendingLogId || pendingResume?.trigger === "check_in";
  const isCheckedIn = lastLog?.type === "IN" || hasPendingCheckIn;

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
            {lastLog?.type === "IN" &&
              lastLog?.attendance_type === "business_trip_in" && (
                <span className="inline-block text-[11px] font-bold bg-[#FFF3BF] text-[#E67700] px-2 py-0.5 rounded-md">
                  ✈️ 출장중
                </span>
              )}
            {todaySlots[0]?.position_keys && todaySlots[0].position_keys.length > 0 && (
              <div className="flex gap-1 mt-1">
                {todaySlots[0].position_keys.map((pos) => (
                  <span
                    key={pos}
                    className="inline-block text-[11px] font-bold bg-[#E8F3FF] text-[#3182F6] px-2 py-0.5 rounded-md"
                  >
                    {pos === "hall" ? "홀" : pos === "kitchen" ? "주방" : pos === "showroom" ? "쇼룸" : pos}
                  </span>
                ))}
              </div>
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

        {/* ── 위치 탐색 중 오버레이 ────────────────────────────── */}
        {isRetrying && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#F2F4F6] mb-3">
            <div className="cat-spinner shrink-0" />
            <div>
              <p className="text-[13px] font-bold text-[#191F28]">위치를 찾고 있어요</p>
              <p className="text-[11px] text-[#8B95A1]">GPS 신호를 확인하는 중이에요</p>
            </div>
          </div>
        )}

        {/* ── 상태 기반 단일 CTA ──────────────────────────────── */}
        {!isCheckedIn ? (
          /* 출근 전 → 출근하기 버튼만 */
          <Button
            onClick={() => handleAttendance("IN")}
            disabled={isButtonBusy}
            className="w-full h-16 rounded-2xl bg-[#3182F6] text-white font-bold text-lg hover:bg-[#1B64DA] disabled:bg-[#D1D6DB] transition-all"
          >
            {isButtonBusy ? (
              <span className="flex items-center gap-2">
                <div className="cat-spinner" /> 처리 중...
              </span>
            ) : "출근하기"}
          </Button>
        ) : hasPendingCheckIn ? (
          /* 출근 후 + check_in 체크리스트 미완료 → 이어서 하기 */
          <button
            onClick={handleResumeChecklist}
            disabled={isButtonBusy}
            className="w-full flex items-center justify-between px-5 py-4 rounded-2xl bg-[#FFF3BF] border border-[#FFE066] active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            <div className="flex items-center gap-3 text-left">
              <span className="text-[20px]">📋</span>
              <div>
                <p className="text-[15px] font-bold text-[#E67700]">
                  출근 체크리스트를 완료해 주세요
                </p>
                <p className="text-[12px] text-[#F59E0B] mt-0.5">
                  {(() => {
                    const total = pendingResume?.totalItems ?? 0;
                    const checked = pendingResume?.checkedIds.length ?? 0;
                    const remaining = total - checked;
                    return remaining > 0 ? `${remaining}개 항목이 남았어요` : "오픈 준비 항목을 확인해 주세요";
                  })()}
                </p>
              </div>
            </div>
            <span className="text-[13px] font-bold text-[#E67700] shrink-0 ml-3">
              이어서 하기 →
            </span>
          </button>
        ) : (
          /* 출근 후 + check_in 완료 → 퇴근하기 버튼만 */
          <Button
            onClick={() => handleAttendance("OUT")}
            disabled={isButtonBusy}
            className="w-full h-16 rounded-2xl bg-[#E8F3FF] text-[#3182F6] border-2 border-[#3182F6]/30 font-bold text-lg hover:bg-[#D6EAFF] disabled:opacity-50 transition-all"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <div className="cat-spinner" /> 처리 중...
              </span>
            ) : "퇴근하기"}
          </Button>
        )}
      </section>

      {/* ── 체크리스트 바텀시트 ──────────────────────────────────── */}
      <ChecklistSheet
        isOpen={showChecklist}
        trigger={checklistTrigger}
        items={checklistItems}
        initialCheckedIds={checklistInitialIds}
        onCheck={(ids) => {
          if (!userId) return;
          const draft = loadDraft(userId, checklistTrigger);
          if (draft) saveDraft(userId, { ...draft, checkedIds: ids });
        }}
        onComplete={handleChecklistComplete}
        onClose={checklistTrigger === "check_in" ? handleChecklistClose : handleCheckoutChecklistClose}
      />

      {/* ── 위치 권한 안내 ───────────────────────────────────── */}
      <LocationPermissionGuide
        isOpen={showPermissionGuide}
        onConfirm={handlePermissionConfirm}
        onCancel={() => {
          setShowPermissionGuide(false);
          setPendingType(null);
        }}
      />

      {/* ── 위치 실패 매장 수동 선택 ─────────────────────────────── */}
      <StoreSelectorSheet
        isOpen={showStoreSelector}
        type={storeSelectorType ?? "IN"}
        stores={stores}
        onSelect={handleStoreFallbackSelect}
        onCancel={() => {
          setShowStoreSelector(false);
          setStoreSelectorType(null);
        }}
      />

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
