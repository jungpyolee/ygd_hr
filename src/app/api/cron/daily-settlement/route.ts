import { processSettlementCron } from "@/lib/credit-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Vercel Cron은 Authorization 헤더로 CRON_SECRET을 전송
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 어제 날짜 (KST 기준)
  const now = new Date();
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kstYesterday = new Date(kstMs - 24 * 60 * 60 * 1000);
  const targetDate = kstYesterday.toISOString().slice(0, 10);

  console.log(`[Cron] 자동 정산 시작: ${targetDate}`);

  const result = await processSettlementCron(targetDate);

  console.log(`[Cron] 자동 정산 완료: ${result.processed}건 처리`);

  return Response.json({
    targetDate,
    ...result,
  });
}
