import { describe, expect, it } from "vitest";

import { getSupabaseClient } from "@/lib/supabase/client";

describe("getSupabaseClient", () => {
  it("fails clearly when public Supabase configuration is absent", () => {
    expect(() => getSupabaseClient()).toThrow("서비스 연결 설정을 확인하지 못했어요");
  });
});
