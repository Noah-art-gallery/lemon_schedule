import { beforeEach, expect, test, vi } from "vitest";
import { profileInputSchema, updateProfile } from "./profile-service";

const rpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: () => ({ rpc }) }));
beforeEach(() => rpc.mockReset());

test("선택한 프로필 이모지를 기존 부분 수정 RPC로 보내고 응답에서 보존한다", async () => {
  rpc.mockResolvedValue({
    data: {
      profileId: "owner",
      displayName: "하윤",
      timeZone: "Asia/Seoul",
      avatarKey: "cat",
      updatedAt: "2026-10-12T00:00:00Z",
    },
    error: null,
  });
  const result = await updateProfile({ avatarKey: "cat" });
  expect(rpc).toHaveBeenCalledWith("update_my_profile", {
    new_display_name: null,
    new_time_zone: null,
    new_avatar_key: "cat",
  });
  expect(result).toMatchObject({ avatarKey: "cat", displayName: "하윤" });
});

test("지원하지 않는 프로필 이모지는 RPC 호출 전에 거부한다", async () => {
  expect(profileInputSchema.safeParse({ avatarKey: "unknown" }).success).toBe(false);
  await expect(updateProfile({ avatarKey: "unknown" } as never)).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  expect(rpc).not.toHaveBeenCalled();
});

test("닉네임만 수정할 때 이모지 생략은 null로 전달한다", async () => {
  rpc.mockResolvedValue({
    data: {
      profileId: "owner",
      displayName: "유나",
      timeZone: "Asia/Seoul",
      avatarKey: "fox",
      updatedAt: "2026-10-12T00:00:00Z",
    },
    error: null,
  });
  expect((await updateProfile({ displayName: "유나" })).avatarKey).toBe("fox");
  expect(rpc).toHaveBeenCalledWith("update_my_profile", {
    new_display_name: "유나",
    new_time_zone: null,
    new_avatar_key: null,
  });
});
