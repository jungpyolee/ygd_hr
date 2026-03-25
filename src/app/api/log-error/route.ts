import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const getSupabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

// 동일 메시지 5분 내 중복 발송 방지
async function isRecentDuplicate(message: string): Promise<boolean> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { count } = await getSupabaseAdmin()
    .from("error_logs")
    .select("*", { count: "exact", head: true })
    .eq("message", message)
    .gte("created_at", fiveMinutesAgo);
  return (count ?? 0) > 0;
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  const resend = new Resend(process.env.RESEND_API_KEY);
  const ALERT_EMAIL = process.env.ERROR_ALERT_EMAIL!;
  try {
    const body = await req.json();
    const { message, stack, source, context, profileId, url, level = "error" } = body;

    if (!message) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    // 1. DB 저장
    await supabaseAdmin.from("error_logs").insert({
      message,
      stack: stack ?? null,
      source: source ?? "client",
      context: context ?? null,
      profile_id: profileId ?? null,
      url: url ?? null,
      level,
    });

    // 2. error 레벨만 이메일 발송 (warn/info는 DB만)
    if (level === "error") {
      const isDuplicate = await isRecentDuplicate(message);
      if (!isDuplicate) {
        await resend.emails.send({
          from: "YGD HR <onboarding@resend.dev>",
          to: ALERT_EMAIL,
          subject: `[YGD HR] 에러 발생: ${message.slice(0, 60)}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; padding: 24px;">
              <h2 style="color: #E03131; margin-bottom: 4px;">⚠️ 에러 발생</h2>
              <p style="color: #8B95A1; font-size: 13px; margin-top: 0;">${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>

              <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
                <tr>
                  <td style="padding: 8px 12px; background: #F9FAFB; font-weight: bold; width: 100px; border: 1px solid #E5E8EB; font-size: 13px;">메시지</td>
                  <td style="padding: 8px 12px; border: 1px solid #E5E8EB; font-size: 13px;">${message}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 12px; background: #F9FAFB; font-weight: bold; border: 1px solid #E5E8EB; font-size: 13px;">발생 위치</td>
                  <td style="padding: 8px 12px; border: 1px solid #E5E8EB; font-size: 13px;">${source ?? "-"}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 12px; background: #F9FAFB; font-weight: bold; border: 1px solid #E5E8EB; font-size: 13px;">URL</td>
                  <td style="padding: 8px 12px; border: 1px solid #E5E8EB; font-size: 13px;">${url ?? "-"}</td>
                </tr>
                ${context ? `
                <tr>
                  <td style="padding: 8px 12px; background: #F9FAFB; font-weight: bold; border: 1px solid #E5E8EB; font-size: 13px;">컨텍스트</td>
                  <td style="padding: 8px 12px; border: 1px solid #E5E8EB; font-size: 13px;"><pre style="margin: 0; font-size: 12px;">${JSON.stringify(context, null, 2)}</pre></td>
                </tr>` : ""}
                ${stack ? `
                <tr>
                  <td style="padding: 8px 12px; background: #F9FAFB; font-weight: bold; border: 1px solid #E5E8EB; font-size: 13px;">스택</td>
                  <td style="padding: 8px 12px; border: 1px solid #E5E8EB; font-size: 13px;"><pre style="margin: 0; font-size: 11px; overflow: auto;">${stack}</pre></td>
                </tr>` : ""}
              </table>
            </div>
          `,
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[log-error] API 내부 오류:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
