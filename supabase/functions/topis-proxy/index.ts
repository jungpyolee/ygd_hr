import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const TOPIS_BASE = "https://topis.seoul.go.kr";
const HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded",
  Referer: "https://topis.seoul.go.kr/map/openBusMap.do",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  try {
    const { endpoint, body } = await req.json();

    // 허용된 TOPIS 엔드포인트만 프록시
    const ALLOWED = [
      "/map/getBusStn.do",
      "/map/accMap/selectAccAllListASC.do",
    ];
    if (!ALLOWED.includes(endpoint)) {
      return new Response(JSON.stringify({ error: "not allowed" }), {
        status: 403,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const res = await fetch(`${TOPIS_BASE}${endpoint}`, {
      method: "POST",
      headers: HEADERS,
      body,
    });

    const data = await res.text();

    return new Response(data, {
      status: res.status,
      headers: {
        ...CORS,
        "Content-Type": "application/json",
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      },
    );
  }
});
