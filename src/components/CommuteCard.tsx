"use client";

import { useState } from "react";
import {
  Bus,
  AlertTriangle,
  Construction,
  Users,
  Train,
  ChevronDown,
  ChevronUp,
  Settings,
  X,
} from "lucide-react";
import type { BusArrivalData, BusInfo } from "@/app/api/bus-arrival/route";
import type { TrafficIncident, TrafficSummary } from "@/app/api/traffic/route";

export type BusCardMode = "all" | "outbound-only" | "hidden";

interface CommuteCardProps {
  busData: BusArrivalData | null;
  busLoading: boolean;
  trafficData: { incidents: TrafficIncident[]; summary: TrafficSummary | null } | null;
  mode: BusCardMode;
  onModeChange: (mode: BusCardMode) => void;
}

function formatTime(bus: BusInfo): string {
  if (bus.isArrive || bus.arrMsg === "곧 도착") return "곧 도착";
  if (bus.traTime > 0) return `${Math.floor(bus.traTime / 60)}분`;
  const match = bus.arrMsg.match(/(\d+)분/);
  if (match) return `${match[1]}분`;
  return bus.arrMsg;
}

function formatStops(bus: BusInfo): string | null {
  const match = bus.arrMsg.match(/(\d+)번째\s*전/);
  if (!match) return null;
  const n = parseInt(match[1]) + 1;
  return `${n}정거장 전`;
}

function BusTimeDisplay({ bus }: { bus: BusInfo }) {
  const time = formatTime(bus);
  const stops = formatStops(bus);
  const isArriving = bus.isArrive || bus.arrMsg === "곧 도착";

  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-[14px] font-bold tabular-nums ${isArriving ? "text-[#16A34A]" : "text-[#191F28]"}`}>
        {time}
      </span>
      {stops && (
        <span className="text-[10px] text-[#8B95A1]">{stops}</span>
      )}
    </div>
  );
}

export default function CommuteCard({
  busData,
  busLoading,
  trafficData,
  mode,
  onModeChange,
}: CommuteCardProps) {
  const [alertOpen, setAlertOpen] = useState(false);
  const [busDetailOpen, setBusDetailOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const showInbound = mode === "all";

  const incidents = trafficData?.incidents ?? [];
  const summary = trafficData?.summary ?? null;
  const busLoaded = busData !== null;
  const busRunning = busData?.isRunning ?? false;

  // 스켈레톤
  if (busLoading && !busData) {
    return (
      <div className="bg-white rounded-[28px] p-5 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 bg-[#DCFCE7] rounded-full animate-pulse" />
          <div className="h-4 w-20 bg-[#F2F4F6] rounded animate-pulse" />
        </div>
        <div className="h-12 bg-[#F2F4F6] rounded-xl animate-pulse" />
      </div>
    );
  }

  // 운행시간 외
  if (!busRunning && !busLoading && incidents.length === 0) {
    return (
      <div className="bg-white rounded-[28px] px-5 py-4 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#F2F4F6] rounded-full flex items-center justify-center">
            <Bus className="w-4 h-4 text-[#8B95A1]" />
          </div>
          <h3 className="text-[15px] font-bold text-[#191F28]">종로11</h3>
          <span className="ml-auto text-[11px] font-bold text-[#8B95A1] bg-[#F2F4F6] px-2 py-1 rounded-full">
            운행종료
          </span>
        </div>
      </div>
    );
  }

  // === 버스 운행 안 함 + 통제 있음 ===
  if (busLoaded && !busRunning) {
    return (
      <div className="bg-white rounded-[28px] p-5 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 bg-[#FFF0E6] rounded-full flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-[#F97316]" />
          </div>
          <h3 className="text-[15px] font-bold text-[#191F28]">종로11</h3>
          <span className="ml-auto text-[11px] font-bold text-[#DC2626] bg-[#FEE2E2] px-2 py-1 rounded-full">
            운행 중단
          </span>
        </div>

        {/* 대안 */}
        <div className="bg-[#E8F3FF] rounded-xl p-3 mb-3">
          <div className="flex items-start gap-2">
            <Train className="w-4 h-4 text-[#3182F6] mt-0.5 shrink-0" />
            <p className="text-[13px] font-bold text-[#1B64DA]">
              {summary?.primaryAlt ?? "안국역(3호선) 1번출구에서 도보 15분이 가장 확실해요"}
            </p>
          </div>
        </div>

        {/* 통제 정보 (탭해서 열기) */}
        {incidents.length > 0 && (
          <>
            <button
              onClick={() => setAlertOpen(!alertOpen)}
              className="w-full flex items-center gap-1.5 py-1.5 text-[12px] text-[#F97316] font-medium"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>교통통제 {incidents.length}건</span>
              {alertOpen ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
            </button>
            <div
              className="grid transition-all duration-200"
              style={{ gridTemplateRows: alertOpen ? "1fr" : "0fr" }}
            >
              <div className="overflow-hidden">
                <div className="space-y-2 pt-1">
                  {incidents.map((inc, idx) => (
                    <div key={idx} className="bg-[#FEF2F2] rounded-lg p-2.5">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {inc.type === "집회및행사" ? (
                          <Users className="w-3 h-3 text-[#7C3AED]" />
                        ) : inc.detailType === "공사" || inc.detailType === "시설물보수" ? (
                          <Construction className="w-3 h-3 text-[#D97706]" />
                        ) : (
                          <AlertTriangle className="w-3 h-3 text-[#DC2626]" />
                        )}
                        <span className={`text-[10px] font-bold ${
                          inc.severity === "high" ? "text-[#DC2626]" : "text-[#D97706]"
                        }`}>
                          {inc.severity === "high" ? "전면 차단" : "일부 통제"}
                        </span>
                        <span className="text-[10px] text-[#8B95A1] tabular-nums ml-auto">
                          {inc.startTime?.slice(5)} ~ {inc.endTime?.slice(5)}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#991B1B] line-clamp-2">{inc.info}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // === 정상 운행 ===
  const inbound = busData?.inbound;
  const outbound = busData?.outbound;

  return (
    <div className="bg-white rounded-[28px] p-5 border border-slate-100 shadow-sm">
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 bg-[#DCFCE7] rounded-full flex items-center justify-center">
          <Bus className="w-4 h-4 text-[#16A34A]" />
        </div>
        <h3 className="text-[15px] font-bold text-[#191F28]">종로11</h3>
        <span className="text-[11px] font-bold text-[#16A34A] bg-[#DCFCE7] px-2 py-1 rounded-full ml-auto">
          정상 운행
        </span>
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#F2F4F6] transition-colors"
        >
          <Settings className="w-3.5 h-3.5 text-[#D1D6DB]" />
        </button>
      </div>

      {/* 설정 패널 */}
      {settingsOpen && (
        <div className="bg-[#F9FAFB] rounded-xl p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-bold text-[#4E5968]">버스 정보 설정</span>
            <button onClick={() => setSettingsOpen(false)}>
              <X className="w-3.5 h-3.5 text-[#8B95A1]" />
            </button>
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
                  onModeChange(opt.value);
                  if (opt.value === "hidden") return;
                  setSettingsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-[12px] transition-colors ${
                  mode === opt.value
                    ? "bg-white font-bold text-[#191F28] shadow-sm"
                    : "text-[#4E5968] hover:bg-white"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 출근/퇴근 + 드롭다운 */}
      {(() => {
        const hasNextIn = showInbound && (inbound?.buses.length ?? 0) > 1;
        const hasNextOut = (outbound?.buses.length ?? 0) > 1;
        const hasNext = hasNextIn || hasNextOut;
        return (
          <div>
            <button
              onClick={() => hasNext && setBusDetailOpen(!busDetailOpen)}
              className={`w-full bg-[#F9FAFB] rounded-xl px-3 py-2 ${hasNext ? "active:bg-[#F2F4F6] transition-colors" : ""}`}
            >
              {/* 출근 (showInbound일 때만) */}
              {showInbound && (
                <div className="flex items-center">
                  <span className="text-[11px] font-bold text-[#3182F6] w-8 shrink-0 text-left">출근</span>
                  <span className="text-[12px] text-[#8B95A1] w-16 shrink-0 text-left">시청역</span>
                  <div className="flex-1 flex items-center justify-end">
                    {inbound && inbound.buses.length > 0 ? (
                      <BusTimeDisplay bus={inbound.buses[0]} />
                    ) : (
                      <span className="text-[13px] text-[#8B95A1]">대기 중</span>
                    )}
                  </div>
                  {hasNext ? (
                    busDetailOpen ? <ChevronUp className="w-3.5 h-3.5 text-[#D1D6DB] ml-2 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-[#D1D6DB] ml-2 shrink-0" />
                  ) : <div className="w-3.5 ml-2 shrink-0" />}
                </div>
              )}

              {/* 퇴근 */}
              <div className={`flex items-center ${showInbound ? "mt-2" : ""}`}>
                <span className="text-[11px] font-bold text-[#8B5CF6] w-8 shrink-0 text-left">퇴근</span>
                <span className="text-[12px] text-[#8B95A1] w-16 shrink-0 text-left">삼청파출소</span>
                <div className="flex-1 flex items-center justify-end">
                  {outbound && outbound.buses.length > 0 ? (
                    <BusTimeDisplay bus={outbound.buses[0]} />
                  ) : (
                    <span className="text-[13px] text-[#8B95A1]">대기 중</span>
                  )}
                </div>
                {!showInbound && hasNext ? (
                  busDetailOpen ? <ChevronUp className="w-3.5 h-3.5 text-[#D1D6DB] ml-2 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-[#D1D6DB] ml-2 shrink-0" />
                ) : <div className="w-3.5 ml-2 shrink-0" />}
              </div>
            </button>

            {/* 다음 버스 (펼침) */}
            {hasNext && (
              <div
                className="grid transition-all duration-200"
                style={{ gridTemplateRows: busDetailOpen ? "1fr" : "0fr" }}
              >
                <div className="overflow-hidden">
                  <div className="bg-[#F9FAFB] rounded-xl px-3 py-2 mt-1">
                    <p className="text-[10px] font-bold text-[#8B95A1] mb-1.5">다음 버스</p>
                    {hasNextIn && (
                      <div className="flex items-center">
                        <span className="text-[11px] font-bold text-[#3182F6] w-8 shrink-0">출근</span>
                        <span className="text-[12px] text-[#8B95A1] w-16 shrink-0">시청역</span>
                        <div className="flex-1 flex items-center justify-end">
                          <BusTimeDisplay bus={inbound!.buses[1]} />
                        </div>
                        <div className="w-3.5 ml-2 shrink-0" />
                      </div>
                    )}
                    {hasNextOut && (
                      <div className={`flex items-center ${hasNextIn ? "mt-1.5" : ""}`}>
                        <span className="text-[11px] font-bold text-[#8B5CF6] w-8 shrink-0">퇴근</span>
                        <span className="text-[12px] text-[#8B95A1] w-16 shrink-0">삼청파출소</span>
                        <div className="flex-1 flex items-center justify-end">
                          <BusTimeDisplay bus={outbound!.buses[1]} />
                        </div>
                        <div className="w-3.5 ml-2 shrink-0" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* 통제 있으면 경고 뱃지 */}
      {incidents.length > 0 && (
        <>
          <button
            onClick={() => setAlertOpen(!alertOpen)}
            className="w-full flex items-center gap-1.5 pt-3 pb-1 text-[11px] text-[#F97316] font-medium"
          >
            <AlertTriangle className="w-3 h-3" />
            <span>교통통제 {incidents.length}건 — 현재 운행에 영향 없음</span>
            {alertOpen ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
          </button>
          <div
            className="grid transition-all duration-200"
            style={{ gridTemplateRows: alertOpen ? "1fr" : "0fr" }}
          >
            <div className="overflow-hidden">
              <div className="space-y-1.5 pt-1">
                {incidents.map((inc, idx) => (
                  <div key={idx} className="text-[11px] text-[#4E5968] py-1 px-2 bg-[#F9FAFB] rounded-lg">
                    <span className="font-bold">{inc.detailType}</span> · {inc.info.split("\n")[0]?.slice(0, 40)}
                    <span className="text-[#8B95A1] ml-1 tabular-nums">{inc.startTime?.slice(5)}~{inc.endTime?.slice(5)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      <p className="text-[10px] text-[#D1D6DB] mt-2 text-right">15초마다 갱신</p>
    </div>
  );
}
