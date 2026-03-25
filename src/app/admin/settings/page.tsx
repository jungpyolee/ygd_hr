"use client";

import { useState } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase";
import { toast } from "sonner";

interface StoreSettings {
  id: string;
  name: string;
  overtime_unit: number;
  overtime_include_early: boolean;
  overtime_min_minutes: number;
  health_cert_warning_days: number;
}

const UNIT_OPTIONS = [
  { value: 15, label: "15분" },
  { value: 30, label: "30분" },
  { value: 60, label: "1시간" },
  { value: 0, label: "자유 입력" },
];

export default function AdminSettingsPage() {
  const [saving, setSaving] = useState(false);
  const [minMinutesInput, setMinMinutesInput] = useState<string | null>(null);
  const [healthWarningInput, setHealthWarningInput] = useState<string | null>(null);

  const {
    data: store,
    mutate,
    isLoading,
  } = useSWR<StoreSettings>("admin-store-settings", async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("stores")
      .select(
        "id, name, overtime_unit, overtime_include_early, overtime_min_minutes, health_cert_warning_days"
      )
      .order("display_order")
      .limit(1)
      .single();
    return data as StoreSettings;
  });

  const handleUnitChange = async (value: number) => {
    if (!store || saving) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("stores")
        .update({ overtime_unit: value })
        .eq("id", store.id);
      if (error) throw error;
      mutate({ ...store, overtime_unit: value }, false);
      toast.success("저장됐어요");
    } catch {
      mutate(); // 오류 시 서버 값으로 복구
      toast.error("저장에 실패했어요", {
        description: "잠시 후 다시 시도해주세요.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleIncludeEarlyChange = async (value: boolean) => {
    if (!store || saving) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("stores")
        .update({ overtime_include_early: value })
        .eq("id", store.id);
      if (error) throw error;
      mutate({ ...store, overtime_include_early: value }, false);
      toast.success("저장됐어요");
    } catch {
      mutate(); // 오류 시 서버 값으로 복구
      toast.error("저장에 실패했어요", {
        description: "잠시 후 다시 시도해주세요.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleMinMinutesBlur = async () => {
    if (!store || saving || minMinutesInput === null) return;
    const value = Math.max(1, parseInt(minMinutesInput) || 1);
    if (value === store.overtime_min_minutes) {
      setMinMinutesInput(null);
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("stores")
        .update({ overtime_min_minutes: value })
        .eq("id", store.id);
      if (error) throw error;
      mutate({ ...store, overtime_min_minutes: value }, false);
      setMinMinutesInput(null);
      toast.success("저장됐어요");
    } catch {
      setMinMinutesInput(null);
      mutate(); // 오류 시 서버 값으로 복구
      toast.error("저장에 실패했어요", {
        description: "잠시 후 다시 시도해주세요.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleHealthWarningBlur = async () => {
    if (!store || saving || healthWarningInput === null) return;
    const value = Math.max(1, parseInt(healthWarningInput) || 30);
    if (value === store.health_cert_warning_days) {
      setHealthWarningInput(null);
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("stores")
        .update({ health_cert_warning_days: value })
        .eq("id", store.id);
      if (error) throw error;
      mutate({ ...store, health_cert_warning_days: value }, false);
      setHealthWarningInput(null);
      toast.success("저장됐어요");
    } catch {
      setHealthWarningInput(null);
      mutate();
      toast.error("저장에 실패했어요", {
        description: "잠시 후 다시 시도해주세요.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h1 className="text-[22px] font-bold text-[#191F28] mb-6">매장 설정</h1>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-24 bg-[#F2F4F6] rounded-[20px] animate-pulse"
            />
          ))}
        </div>
      ) : !store ? (
        <p className="text-[14px] text-[#8B95A1]">매장 정보를 불러올 수 없어요.</p>
      ) : (
        <div className="space-y-4">
          {/* 추가근무 규칙 */}
          <section className="bg-white rounded-[20px] border border-[#E5E8EB] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#F2F4F6]">
              <p className="text-[16px] font-bold text-[#191F28]">
                추가근무 규칙
              </p>
              <p className="text-[12px] text-[#8B95A1] mt-0.5">
                추가근무 인정 방식과 기준을 설정해요
              </p>
            </div>

            <div className="divide-y divide-[#F2F4F6]">
              {/* 인정 단위 */}
              <div className="px-5 py-4">
                <p className="text-[14px] font-bold text-[#191F28] mb-3">
                  인정 단위
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {UNIT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleUnitChange(opt.value)}
                      disabled={saving}
                      className={`py-3 rounded-[12px] text-[14px] font-bold transition-all active:scale-[0.97] disabled:opacity-60 ${
                        store.overtime_unit === opt.value
                          ? "bg-[#3182F6] text-white"
                          : "bg-[#F2F4F6] text-[#4E5968]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-[12px] text-[#B0B8C1] mt-2">
                  {store.overtime_unit === 0
                    ? "분 단위로 직접 입력할 수 있어요"
                    : `추가근무를 ${UNIT_OPTIONS.find((o) => o.value === store.overtime_unit)?.label} 단위로 빠르게 등록할 수 있어요`}
                </p>
              </div>

              {/* 인정 기준 */}
              <div className="px-5 py-4">
                <p className="text-[14px] font-bold text-[#191F28] mb-3">
                  인정 기준
                </p>
                <div className="space-y-2">
                  <button
                    onClick={() =>
                      handleIncludeEarlyChange(
                        !store.overtime_include_early
                      )
                    }
                    disabled={saving}
                    className="w-full flex items-center justify-between py-3 px-4 rounded-[12px] bg-[#F8F9FA] disabled:opacity-60 active:bg-[#F2F4F6]"
                  >
                    <div className="text-left">
                      <p className="text-[14px] font-semibold text-[#191F28]">
                        일찍 출근한 시간 포함
                      </p>
                      <p className="text-[12px] text-[#8B95A1] mt-0.5">
                        스케줄보다 일찍 출근한 경우도 추가근무로 잡아요
                      </p>
                    </div>
                    <div
                      className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 shrink-0 ml-4 ${
                        store.overtime_include_early
                          ? "bg-[#3182F6]"
                          : "bg-[#D1D6DB]"
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                          store.overtime_include_early
                            ? "translate-x-5"
                            : "translate-x-0"
                        }`}
                      />
                    </div>
                  </button>
                </div>
              </div>

              {/* 최소 인정 기준 */}
              <div className="px-5 py-4">
                <p className="text-[14px] font-bold text-[#191F28] mb-1">
                  최소 표시 기준
                </p>
                <p className="text-[12px] text-[#8B95A1] mb-3">
                  이 값 이상 초과 근무한 경우만 확인 필요로 표시돼요
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={
                      minMinutesInput !== null
                        ? minMinutesInput
                        : store.overtime_min_minutes
                    }
                    onChange={(e) => setMinMinutesInput(e.target.value)}
                    onBlur={handleMinMinutesBlur}
                    disabled={saving}
                    className="w-24 bg-[#F2F4F6] rounded-[12px] px-4 py-2.5 text-[16px] font-bold text-[#191F28] outline-none text-center disabled:opacity-60"
                  />
                  <span className="text-[14px] font-semibold text-[#4E5968]">
                    분 이상
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* 보건증 관리 */}
          <section className="bg-white rounded-[20px] border border-[#E5E8EB] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#F2F4F6]">
              <p className="text-[16px] font-bold text-[#191F28]">
                보건증 관리
              </p>
              <p className="text-[12px] text-[#8B95A1] mt-0.5">
                보건증 만료 주의 표시 기준을 설정해요
              </p>
            </div>
            <div className="px-5 py-4">
              <p className="text-[14px] font-bold text-[#191F28] mb-1">
                만료 주의 기준
              </p>
              <p className="text-[12px] text-[#8B95A1] mb-3">
                만료일까지 이 일수 이하 남은 경우 주의로 표시돼요
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={
                    healthWarningInput !== null
                      ? healthWarningInput
                      : store.health_cert_warning_days
                  }
                  onChange={(e) => setHealthWarningInput(e.target.value)}
                  onBlur={handleHealthWarningBlur}
                  disabled={saving}
                  className="w-24 bg-[#F2F4F6] rounded-[12px] px-4 py-2.5 text-[16px] font-bold text-[#191F28] outline-none text-center disabled:opacity-60"
                />
                <span className="text-[14px] font-semibold text-[#4E5968]">
                  일 이내
                </span>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
