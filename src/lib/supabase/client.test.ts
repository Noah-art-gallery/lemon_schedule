import { describe, expect, it } from "vitest";

import { getSupabaseClient } from "@/lib/supabase/client";

describe("getSupabaseClient", () => {
  it("fails clearly when public Supabase configuration is absent", () => {
    expect(() => getSupabaseClient()).toThrow("Supabase 연결 정보가 없습니다");
  });
});
