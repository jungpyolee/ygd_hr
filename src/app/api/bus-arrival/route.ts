import { NextResponse } from "next/server";

export const preferredRegion = "icn1";

/**
 * 종로11 버스 도착정보 API
 * TOPIS 내부 프록시를 통해 서울시 버스정보시스템 데이터를 조회
 * API 키 불필요 (TOPIS가 서버측에서 ServiceKey 처리)
 */

const BUS_ROUTE_ID = "100900007"; // 종로11
const OUTBOUND_ARS_ID = "01529";  // 삼청파출소 (서울역 방향) — 퇴근
const INBOUND_ARS_ID = "02507";   // 시청역1호선 (삼청동 방향) — 출근
const STATION_ORD = 4;            // 삼청파출소 순번 (하행)
const TOTAL_STATIONS = 11;

// Supabase Edge Function 프록시 경유 (Vercel→TOPIS 직접 호출 차단 대응)
const TOPIS_PROXY = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/topis-proxy`;

async function callTopis(endpoint: string, body: string): Promise<any> {
  const res = await fetch(TOPIS_PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint, body }),
    cache: "no-store",
  });
  return res.json();
}

export interface BusArrivalData {
  routeName: string;
  term: number;
  outbound: {                     // 퇴근: 삼청파출소 → 서울역
    stationName: string;
    buses: BusInfo[];
  };
  inbound: {                      // 출근: 시청역 → 삼청동
    stationName: string;
    buses: BusInfo[];
  };
  isRunning: boolean;
  updatedAt: string;
}

export interface BusInfo {
  arrMsg: string;
  sectOrd: number;
  stationNm: string;
  traTime: number; // 도착 예상 초
  isArrive: boolean;
  congestion: number; // 3=여유, 4=보통, 5=혼잡, 6=매우혼잡
  plainNo: string;
}

// 캐시 없음 — 서울시 버스 GPS가 10~15초마다 갱신되므로 매번 최신 데이터 조회
// 동일 초 내 중복 호출만 방지 (1초)
let cache: { data: BusArrivalData; ts: number } | null = null;
const CACHE_TTL = 1_000;

interface StationArrival {
  buses: BusInfo[];
  term: number;
}

function parseStationRow(row: any): StationArrival {
  const buses: BusInfo[] = [];
  const msg1 = (row.arrmsg1 ?? "").trim();
  const msg2 = (row.arrmsg2 ?? "").trim();

  if (msg1 && msg1 !== "출발대기" && msg1 !== "운행종료") {
    buses.push({
      arrMsg: msg1,
      sectOrd: parseInt(row.sectOrd1) || 0,
      stationNm: (row.stationNm1 ?? "").trim(),
      traTime: parseInt(row.traTime1) || 0,
      isArrive: row.isArrive1 === "1",
      congestion: parseInt(row.congetion1) || 0,
      plainNo: (row.plainNo1 ?? "").trim(),
    });
  }
  if (msg2 && msg2 !== "출발대기" && msg2 !== "운행종료") {
    buses.push({
      arrMsg: msg2,
      sectOrd: parseInt(row.sectOrd2) || 0,
      stationNm: (row.stationNm2 ?? "").trim(),
      traTime: parseInt(row.traTime2) || 0,
      isArrive: row.isArrive2 === "1",
      congestion: parseInt(row.congetion2) || 0,
      plainNo: (row.plainNo2 ?? "").trim(),
    });
  }

  return { buses, term: parseInt(row.term) || 10 };
}

async function fetchStationArrival(arsId: string): Promise<StationArrival | null> {
  try {
    const json = await callTopis(
      "/map/getBusStn.do",
      `url=/getStationByUidDetourAt&arsId=${arsId}`,
    );
    const rows = json?.rows ?? [];
    const row = rows.find((r: any) => r.rtNm === "종로11");
    if (!row) return null;
    return parseStationRow(row);
  } catch {
    return null;
  }
}

function isOperatingHours(): boolean {
  const now = new Date();
  // Vercel 서버는 UTC 기준 → KST(UTC+9)로 변환
  const kstHour = (now.getUTCHours() + 9) % 24;
  // 종로11: 첫차 06:00 ~ 막차 23:00
  return kstHour >= 6 && kstHour < 23;
}

async function fetchBusArrivalData(): Promise<BusArrivalData> {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL) return cache.data;

  const empty: BusArrivalData = {
    routeName: "종로11",
    term: 10,
    outbound: { stationName: "삼청파출소", buses: [] },
    inbound: { stationName: "시청역", buses: [] },
    isRunning: false,
    updatedAt: new Date().toISOString(),
  };

  if (!isOperatingHours()) {
    cache = { data: empty, ts: now };
    return empty;
  }

  // 삼청파출소(퇴근) + 시청역(출근) 동시 조회
  const [outboundArr, inboundArr] = await Promise.all([
    fetchStationArrival(OUTBOUND_ARS_ID),
    fetchStationArrival(INBOUND_ARS_ID),
  ]);

  const outboundBuses = outboundArr?.buses ?? [];
  const inboundBuses = inboundArr?.buses ?? [];
  const term = outboundArr?.term ?? inboundArr?.term ?? 10;

  const isRunning = outboundBuses.length > 0 || inboundBuses.length > 0;

  const data: BusArrivalData = {
    routeName: "종로11",
    term,
    outbound: { stationName: "삼청파출소", buses: outboundBuses },
    inbound: { stationName: "시청역", buses: inboundBuses },
    isRunning,
    updatedAt: new Date().toISOString(),
  };

  cache = { data, ts: now };
  return data;
}

export async function GET() {
  const data = await fetchBusArrivalData();
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "no-cache",
    },
  });
}
