import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const createServerSupabase = async () => {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        // Server Components은 쿠키 쓰기 불가. 토큰 갱신은 middleware에서 처리됨.
        setAll() {},
      },
    }
  );
};
