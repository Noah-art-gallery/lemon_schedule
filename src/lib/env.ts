import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_DEMO_MODE: z.enum(["0", "1"]).optional(),
  NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY: z
    .string()
    .regex(/^[a-f0-9]{32}$/i)
    .optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export function readPublicEnv(): PublicEnv {
  const values = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || undefined,
    NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE || undefined,
    NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY: process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY || undefined,
  };

  return publicEnvSchema.parse(values);
}

export function isDemoMode(env = readPublicEnv()): boolean {
  return process.env.NODE_ENV !== "production" && env.NEXT_PUBLIC_DEMO_MODE === "1";
}

export function hasSupabaseConfig(env = readPublicEnv()): boolean {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
