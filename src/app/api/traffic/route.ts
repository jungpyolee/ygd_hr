import { NextResponse } from "next/server";

export const preferredRegion = "icn1";

/**
 * 삼청동 출근길 교통통제 API
 * TOPIS 내부 API에서 전체 교통통제 데이터를 가져와 출근 경로 관련만 필터링
 * summary 필드에서 통합 대안/도로 요약/시간 범위를 사전 계산
 */

// 삼청동(팔판동 39) 출근에 실제 영향을 주는 도로만 포함
// 종로11번 경로: 서울역↔세종대로↔경복궁↔삼청로↔삼청파출소
// 안국역 도보: 지하철이라 도로 통제 무관 (율곡로 버스정류장만 영향)
//
// 제외한 도로들:
// - 청계천로: 11번 경유 안 함, 삼청동 동선과 무관
// - 덕수궁길: 시청역 근처지만 11번 경로 아님
// - 소공로/남대문로/무교로: 시청역 남쪽, 11번 핵심 경로 아님
// - 인사동길/북촌로/창덕궁길: 관광 구간, 출근 동선 아님
// - 효자로/청파로/칠패로/새문안로/서소문로: 경복궁 서쪽/남쪽, 무관
// - 자하문로: 경복궁 북서쪽, 팔판동과 다른 방향
// - 돈화문로: 안국역 동쪽, 도보 경로와 무관
const ROUTE_ROADS = new Set([
  "세종대로",   // 종로11번 핵심 경로 (시청↔광화문)
  "삼청로",     // 종로11번 삼청동 진입로 + 경복궁역 도보 경로
  "사직로",     // 경복궁 앞 구간, 11번 경유 가능
  "종로",       // 직접 경유는 아니지만 광역 통제 시 간접 영향 큼
  "율곡로",     // 안국역 앞, 버스 정류장 영향
  "삼일대로",   // 안국역 남쪽, 광역 통제(마라톤 등) 시 포함됨
]);

// 통합 추천 경로
// 팔판동 39(삼청동 매장) 기준 실제 출근 경로:
// 1. 시청역 → 종로11번 버스 → 삼청파출소 하차 (세종대로→경복궁→삼청로 경유)
// 2. 안국역 1번출구 → 감고당길 → 팔판길 도보 15분 (주요 도로 안 거침, 가장 안전)
// 3. 광화문역 → 종로11번 or 도보 → 경복궁 지나서 삼청로 (~20분)
const ALT_ROUTES = {
  anguk: {
    keyword: "안국역",
    message: "안국역(3호선) 1번출구에서 도보 15분이 가장 확실해요",
  },
  gyeongbokgung: {
    keyword: "경복궁역",
    message: "경복궁역(3호선) 5번출구에서 도보 15분도 가능해요",
  },
} as const;

// 통제 도로별 출근 영향 + 대안 매핑
// 핵심: 안국역 1번출구 도보 경로(감고당길→팔판길)는 골목길이라 대부분의 대로 통제에 영향 없음
const COMMUTE_GUIDE: Record<string, { impact: string; alt: string }> = {
  "세종대로": {
    impact: "종로11번 버스가 운행하지 못할 수 있어요",
    alt: "안국역(3호선) 1번출구에서 도보 15분으로 출근하세요",
  },
  "삼청로": {
    impact: "종로11번 버스가 삼청동에 못 들어와요",
    alt: "안국역(3호선) 1번출구에서 도보 15분으로 출근하세요",
  },
  "사직로": {
    impact: "경복궁 앞 구간이 통제돼 종로11번에 영향이 있어요",
    alt: "안국역(3호선) 1번출구에서 도보로 출근하세요",
  },
  "종로": {
    impact: "종로 일대 버스가 우회할 수 있어요",
    alt: "지하철 3호선 안국역 1번출구에서 도보로 출근하세요",
  },
  "율곡로": {
    impact: "안국역 주변 버스 정류장 이용이 어려울 수 있어요",
    alt: "안국역 지하철 1번출구는 이용 가능해요",
  },
  "삼일대로": {
    impact: "안국역 근처 버스가 우회할 수 있어요",
    alt: "안국역(3호선) 1번출구에서 도보 15분이 확실해요",
  },
};

export interface TrafficIncident {
  type: string;
  detailType: string;
  info: string;
  startTime: string;
  endTime: string;
  controlType: string;
  roads: string[];
  guides: { road: string; impact: string; alt: string }[];
  ingYn: string;
  // 행사(마라톤 등) = "high" (진짜 전면 차단, 버스 운행 중단)
  // 집회 = "medium" (일부 차로 점유, 버스 지연 가능)
  // 공사/기타 = "low" (부분 통제, 영향 적음)
  severity: "high" | "medium" | "low";
}

export interface TrafficSummary {
  totalCount: number;
  primaryAlt: string;
  secondaryAlt: string | null;
  affectedRoadsSummary: string;
  hasFullControl: boolean;
  controlTimeRange: string;
}

// 10분 메모리 캐시
let cache: { data: TrafficIncident[]; ts: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000;

function parseRoads(roadNms: string): string[] {
  return roadNms.split(",").map((r) => r.trim()).filter(Boolean);
}

function isRelevant(roadNms: string, accInfo: string): boolean {
  const roads = parseRoads(roadNms);
  return roads.some((r) => ROUTE_ROADS.has(r)) ||
    [...ROUTE_ROADS].some((r) => accInfo.includes(r));
}

function buildGuides(roadNms: string, accInfo: string): { road: string; impact: string; alt: string }[] {
  const roads = parseRoads(roadNms);
  const guides: { road: string; impact: string; alt: string }[] = [];
  const seen = new Set<string>();

  for (const road of roads) {
    const guide = COMMUTE_GUIDE[road];
    if (guide && !seen.has(road)) {
      seen.add(road);
      guides.push({ road, ...guide });
    }
  }
  for (const [road, guide] of Object.entries(COMMUTE_GUIDE)) {
    if (!seen.has(road) && accInfo.includes(road)) {
      seen.add(road);
      guides.push({ road, ...guide });
    }
  }
  return guides;
}

function buildSummary(incidents: TrafficIncident[]): TrafficSummary {
  // 전체 도로 합산 + 대표 도로 결정
  const allRoads = new Set<string>();
  let hasFullControl = false;
  let minTime = "99:99";
  let maxTime = "00:00";

  // alt 빈도 집계
  const altCounts: Record<string, number> = {};

  for (const inc of incidents) {
    for (const road of inc.roads) {
      if (ROUTE_ROADS.has(road)) allRoads.add(road);
    }
    if (inc.controlType === "전체 통제") hasFullControl = true;

    // 시간 범위
    const st = inc.startTime?.slice(11, 16) ?? "";
    const et = inc.endTime?.slice(11, 16) ?? "";
    if (st && st < minTime) minTime = st;
    if (et && et > maxTime) maxTime = et;

    for (const g of inc.guides) {
      altCounts[g.alt] = (altCounts[g.alt] ?? 0) + 1;
    }
  }

  // 도로 요약: "세종대로 외 N개 도로" 형태
  const roadArr = [...allRoads];
  const affectedRoadsSummary =
    roadArr.length <= 2
      ? roadArr.join(", ")
      : `${roadArr[0]} 외 ${roadArr.length - 1}개 도로`;

  // 안국역 1번출구 도보가 항상 primaryAlt (골목길이라 대로 통제 영향 없음)
  const primaryAlt = ALT_ROUTES.anguk.message;

  // 삼청로가 통제 중이면 경복궁역 도보는 추천하지 않음 (삼청로 경유하므로)
  const samcheongControlled = allRoads.has("삼청로");
  const secondaryAlt = samcheongControlled ? null : ALT_ROUTES.gyeongbokgung.message;

  const controlTimeRange =
    minTime !== "99:99" && maxTime !== "00:00"
      ? `${minTime}~${maxTime}`
      : "";

  return {
    totalCount: incidents.length,
    primaryAlt,
    secondaryAlt,
    affectedRoadsSummary,
    hasFullControl,
    controlTimeRange,
  };
}

async function fetchTrafficData(): Promise<TrafficIncident[]> {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL) return cache.data;

  try {
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;

    const TOPIS_PROXY = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/topis-proxy`;
    const res = await fetch(TOPIS_PROXY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: "/map/accMap/selectAccAllListASC.do",
        body: `accDate=${dateStr}&trafficdataAppyYn=Y`,
      }),
      cache: "no-store",
    });

    const json = await res.json();
    const rows = json?.rows ?? (Array.isArray(json) ? json : []);

    const nowMs = now;
    const twoDaysLater = nowMs + 2 * 24 * 60 * 60 * 1000;
    const results: TrafficIncident[] = [];

    for (const r of rows) {
      const roadNms = r.roadNms ?? "";
      const accInfo = r.accInfo ?? "";
      if (!isRelevant(roadNms, accInfo)) continue;

      const clrMs = r.clrDate ?? 0;
      const occrMs = r.occrDate ?? 0;
      if (clrMs < nowMs && r.ingYn !== "Y") continue;
      if (occrMs > twoDaysLater) continue;
      if (occrMs > 0 && occrMs < nowMs - 365 * 24 * 60 * 60 * 1000) continue;

      const roads = parseRoads(roadNms);
      const guides = buildGuides(roadNms, accInfo);

      // severity 결정: 행사(마라톤 등)는 진짜 전면 차단, 집회는 일부 차로만 점유
      const dtype = r.accDtypeNm ?? "";
      const ctype = r.accRoadYn ?? "";
      const hasBusReroute = accInfo.includes("버스") && (accInfo.includes("우회") || accInfo.includes("임시"));
      let severity: "high" | "medium" | "low";
      if (dtype === "행사" && (ctype === "전체 통제" || hasBusReroute)) {
        severity = "high"; // 마라톤, 축제 등 — 도로 완전 차단, 버스 우회 확실
      } else if (dtype === "집회") {
        severity = "medium"; // 집회 — 일부 차로 점유, 나머지 통행 가능, 버스 지연
      } else if (ctype === "전체 통제") {
        severity = "medium"; // 기타 전체 통제
      } else {
        severity = "low"; // 부분 통제, 공사 등
      }

      results.push({
        type: r.accTypeNm ?? "",
        detailType: dtype,
        info: accInfo.replace(/\r\n/g, "\n").trim(),
        startTime: r.occrDt ?? "",
        endTime: r.clrDt ?? "",
        controlType: ctype,
        roads,
        guides,
        ingYn: r.ingYn ?? "N",
        severity,
      });
    }

    results.sort((a, b) => {
      if (a.ingYn === "Y" && b.ingYn !== "Y") return -1;
      if (a.ingYn !== "Y" && b.ingYn === "Y") return 1;
      return a.startTime.localeCompare(b.startTime);
    });

    cache = { data: results, ts: now };
    return results;
  } catch {
    return cache?.data ?? [];
  }
}

export async function GET() {
  const incidents = await fetchTrafficData();
  const summary = buildSummary(incidents);
  return NextResponse.json(
    { incidents, summary },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      },
    },
  );
}
