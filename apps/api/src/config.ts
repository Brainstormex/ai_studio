import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const jwtAccessSecret = required("JWT_ACCESS_SECRET", "dev-access-secret-change-me");
const jwtRefreshSecret = required("JWT_REFRESH_SECRET", "dev-refresh-secret-change-me");

if (
  nodeEnv === "production" &&
  (jwtAccessSecret.includes("change-me") || jwtRefreshSecret.includes("change-me"))
) {
  throw new Error("Refusing to start: set strong JWT_ACCESS_SECRET and JWT_REFRESH_SECRET in production");
}

export const config = {
  port: Number(process.env.API_PORT ?? 4000),
  nodeEnv,
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  jwtAccessSecret,
  jwtRefreshSecret,
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",
  databaseUrl: required(
    "DATABASE_URL",
    "postgresql://studio:studio@localhost:5432/studio?schema=public",
  ),
};
