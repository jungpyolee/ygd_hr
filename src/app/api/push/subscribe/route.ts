import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

const getAdminSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

// POST — 구독 저장 (최초 구독 + 재구독 upsert)
export async function POST(req: NextRequest) {
  const adminSupabase = getAdminSupabase();
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { endpoint, keys } = body as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  // endpoint URL 기본 형식 검증
  try {
    const url = new URL(endpoint);
    if (!["https:", "http:"].includes(url.protocol)) throw new Error();
  } catch {
    return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });
  }

  // 구독 개수 제한 (기기당 1개씩, 최대 10기기)
  const { count } = await adminSupabase
    .from("push_subscriptions")
    .select("*", { count: "exact", head: true })
    .eq("profile_id", user.id);

  if ((count ?? 0) >= 10) {
    // 가장 오래된 구독 삭제 후 진행
    const { data: oldest } = await adminSupabase
      .from("push_subscriptions")
      .select("id")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();
    if (oldest) {
      await adminSupabase.from("push_subscriptions").delete().eq("id", oldest.id);
    }
  }

  // 구독 upsert (같은 endpoint = 업데이트)
  const { error: subError } = await adminSupabase
    .from("push_subscriptions")
    .upsert(
      {
        profile_id: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth_key: keys.auth,
      },
      { onConflict: "profile_id,endpoint" }
    );

  if (subError) {
    return NextResponse.json({ error: subError.message }, { status: 500 });
  }

  // push_preferences enabled=true — 항상 강제 업데이트 (ignoreDuplicates 제거)
  await adminSupabase
    .from("push_preferences")
    .upsert(
      { profile_id: user.id, enabled: true, updated_at: new Date().toISOString() },
      { onConflict: "profile_id" }
    );

  return NextResponse.json({ ok: true });
}

// DELETE — 구독 해제
export async function DELETE(req: NextRequest) {
  const adminSupabase = getAdminSupabase();
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { endpoint } = body as { endpoint: string };

  if (endpoint) {
    await adminSupabase
      .from("push_subscriptions")
      .delete()
      .eq("profile_id", user.id)
      .eq("endpoint", endpoint);
  } else {
    // endpoint 없이 호출 시 해당 유저의 모든 구독 삭제
    await adminSupabase
      .from("push_subscriptions")
      .delete()
      .eq("profile_id", user.id);
  }

  // preferences disabled
  await adminSupabase
    .from("push_preferences")
    .upsert(
      { profile_id: user.id, enabled: false, updated_at: new Date().toISOString() },
      { onConflict: "profile_id" }
    );

  return NextResponse.json({ ok: true });
}
