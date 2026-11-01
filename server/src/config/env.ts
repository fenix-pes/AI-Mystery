import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

dotenv.config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must contain at least 32 characters"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.8-flash"),
  IMAGE_PROVIDER: z.enum(["none", "gemini"]).default("none"),
  IMAGE_PROVIDER_API_KEY: z.string().optional(),
  IMAGE_MODEL: z.string().default("gemini-3.1-flash-image"),
  GENERATION_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  GENERATION_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  GENERATION_MAX_REPAIRS: z.coerce.number().int().nonnegative().default(2)
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Server environment configuration is invalid");
}

export const env = parsed.data;
