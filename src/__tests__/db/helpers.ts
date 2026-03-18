/**
 * DB RLS 통합 테스트 헬퍼
 * - Production DB (ymvdjxzkjodasctktunh) 대상
 * - 테스트 유저 생성/삭제, 로그인, 클라이언트 생성
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const PROD_URL = process.env.SUPABASE_PROD_URL!;
const PROD_ANON_KEY = process.env.SUPABASE_PROD_ANON_KEY!;
const PROD_SERVICE_KEY = process.env.SUPABASE_PROD_SERVICE_KEY!;
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN!;
const PROD_REF = "ymvdjxzkjodasctktunh";

/** RLS 완전 우회 — 테스트 데이터 셋업/정리 전용 */
export const serviceClient: SupabaseClient = createClient(
  PROD_URL,
  PROD_SERVICE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

/** Supabase Admin Auth API로 유저 생성 (서비스 롤 키 사용) */
export async function createAuthUser(
  email: string,
  password: string
): Promise<{ id: string; email: string }> {
  const res = await fetch(`${PROD_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: PROD_SERVICE_KEY,
      Authorization: `Bearer ${PROD_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`createAuthUser failed: ${JSON.stringify(data)}`);
  return data as { id: string; email: string };
}

/** Supabase Admin Auth API로 유저 삭제 */
export async function deleteAuthUser(userId: string): Promise<void> {
  if (!userId) return;
  const res = await fetch(`${PROD_URL}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: {
      apikey: PROD_SERVICE_KEY,
      Authorization: `Bearer ${PROD_SERVICE_KEY}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    console.warn(`deleteAuthUser(${userId}) 실패: ${text}`);
  }
}

/** 이메일/비밀번호로 로그인해 JWT 반환 */
export async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${PROD_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: PROD_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`signIn(${email}) 실패: ${JSON.stringify(data)}`);
  return (data as { access_token: string }).access_token;
}

/** JWT로 RLS가 적용된 유저 클라이언트 생성 */
export function createUserClient(jwt: string): SupabaseClient {
  return createClient(PROD_URL, PROD_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 단언 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

/** 성공 + 1개 이상 행 반환 기대 */
export async function expectRows<T>(
  label: string,
  fn: () => Promise<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const { data, error } = await fn();
  if (error) throw new Error(`[${label}] 에러 발생 (성공 기대): ${JSON.stringify(error)}`);
  if (!data || data.length === 0)
    throw new Error(`[${label}] 빈 결과 (행 반환 기대)`);
  return data;
}

/** 성공 + 정확히 N개 행 반환 기대 */
export async function expectCount<T>(
  label: string,
  expected: number,
  fn: () => Promise<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const { data, error } = await fn();
  if (error) throw new Error(`[${label}] 에러 발생 (성공 기대): ${JSON.stringify(error)}`);
  if ((data?.length ?? 0) !== expected)
    throw new Error(`[${label}] 행 수 불일치: 기대=${expected}, 실제=${data?.length}`);
  return data ?? [];
}

/** RLS 차단으로 빈 배열 반환 기대 (SELECT 차단) */
export async function expectEmpty<T>(
  label: string,
  fn: () => Promise<{ data: T[] | null; error: unknown }>
): Promise<void> {
  const { data, error } = await fn();
  if (error) throw new Error(`[${label}] 에러 발생 (빈 결과 기대): ${JSON.stringify(error)}`);
  if (data && data.length > 0)
    throw new Error(`[${label}] 행이 반환됨 (차단 기대): ${JSON.stringify(data)}`);
}

/** RLS 차단으로 에러 반환 기대 (INSERT/UPDATE WITH CHECK 차단) */
export async function expectError(
  label: string,
  fn: () => Promise<{ data: unknown; error: unknown }>
): Promise<void> {
  const { error } = await fn();
  if (!error)
    throw new Error(`[${label}] 에러 없음 (에러 기대): RLS 정책이 예상대로 작동하지 않음`);
}

/** 성공 (에러 없음) 기대 — INSERT/UPDATE/DELETE */
export async function expectSuccess(
  label: string,
  fn: () => Promise<{ data: unknown; error: unknown }>
): Promise<void> {
  const { error } = await fn();
  if (error)
    throw new Error(`[${label}] 에러 발생 (성공 기대): ${JSON.stringify(error)}`);
}
