import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET — 현재 유저 설정 조회
export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await adminSupabase
    .from("push_preferences")
    .select("enabled, type_settings")
    .eq("profile_id", user.id)
    .single();

  // 설정이 없으면 기본값 반환
  return NextResponse.json(data ?? { enabled: false, type_settings: {} });
}

// PUT — 설정 업데이트
export async function PUT(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { enabled, type_settings } = body as {
    enabled?: boolean;
    type_settings?: Record<string, boolean>;
  };

  // 입력 검증
  if (enabled !== undefined && typeof enabled !== "boolean") {
    return NextResponse.json({ error: "Invalid enabled value" }, { status: 400 });
  }
  if (type_settings !== undefined) {
    if (typeof type_settings !== "object" || Array.isArray(type_settings)) {
      return NextResponse.json({ error: "Invalid type_settings" }, { status: 400 });
    }
    // 값이 모두 boolean인지 확인
    for (const val of Object.values(type_settings)) {
      if (typeof val !== "boolean") {
        return NextResponse.json({ error: "Invalid type_settings values" }, { status: 400 });
      }
    }
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (enabled !== undefined) update.enabled = enabled;
  if (type_settings !== undefined) update.type_settings = type_settings;

  const { error } = await adminSupabase
    .from("push_preferences")
    .upsert(
      { profile_id: user.id, ...update },
      { onConflict: "profile_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
