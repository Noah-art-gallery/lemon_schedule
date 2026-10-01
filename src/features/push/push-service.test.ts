import { beforeEach, describe, expect, it, vi } from "vitest";

import { disableNativePush } from "./push-service";

const { unregister } = vi.hoisted(() => ({ unregister: vi.fn() }));

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@capacitor/push-notifications", () => ({ PushNotifications: { unregister } }));

describe("계정 전환 시 네이티브 푸시 해제", () => {
  beforeEach(() => unregister.mockReset());

  it("기기 등록을 해제한다", async () => {
    unregister.mockResolvedValue(undefined);
    await expect(disableNativePush()).resolves.toBeUndefined();
    expect(unregister).toHaveBeenCalledOnce();
  });
});
