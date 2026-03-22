/**
 * 클라이언트에서 에러를 서버로 전송하는 헬퍼.
 * - level "error" → DB 저장 + 이메일 발송 (5분 내 중복 제외)
 * - level "warn"  → DB 저장만
 */
export async function logError({
  message,
  error,
  source,
  context,
  level = "error",
}: {
  message: string;
  error?: unknown;
  source?: string;
  context?: Record<string, unknown>;
  level?: "error" | "warn" | "info";
}) {
  try {
    const stack = error instanceof Error ? error.stack : undefined;
    const url = typeof window !== "undefined" ? window.location.href : undefined;

    await fetch("/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, stack, source, context, url, level }),
    });
  } catch {
    // 로깅 실패는 조용히 무시 (무한루프 방지)
    console.error("[logError] 전송 실패:", message);
  }
}
