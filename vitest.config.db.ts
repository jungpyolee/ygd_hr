/**
 * DB 통합 테스트 전용 vitest 설정
 * - Production DB RLS 권한 검증
 * - Node.js 환경 (jsdom 아님)
 * - .env.local 자동 로드
 */
import { defineConfig } from "vitest/config";
import path from "path";
import { config as dotenvConfig } from "dotenv";

dotenvConfig({ path: path.resolve(process.cwd(), ".env.local") });

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/__tests__/db/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 60000,
    sequence: { concurrent: false },
    reporters: ["verbose"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
