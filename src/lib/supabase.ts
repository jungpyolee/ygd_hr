// src/lib/supabase.ts
import { createBrowserClient } from "@supabase/ssr";

export const createClient = () => {
  // 여기서 찍어보세요 (브라우저 콘솔에 뜹니다)
  console.log("URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log("KEY:", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
};
