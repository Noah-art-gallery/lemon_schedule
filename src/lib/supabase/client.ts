import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { AppError } from "@/lib/errors";
import { readPublicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

let browserClient: SupabaseClient<Database> | undefined;

export function getSupabaseClient(): SupabaseClient<Database> {
  if (browserClient) {
    return browserClient;
  }

  const env = readPublicEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new AppError(
      "SUPABASE_NOT_CONFIGURED",
      "서비스 연결 설정을 확인하지 못했어요. 관리자에게 문의해 주세요.",
    );
  }

  browserClient = createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );

  return browserClient;
}
