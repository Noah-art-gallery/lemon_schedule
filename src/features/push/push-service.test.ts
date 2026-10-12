import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  disableNativePush,
  getDevicePushState,
  registerPushToken,
  unregisterPushToken,
} from "./push-service";

const mocks = vi.hoisted(() => ({
  native: vi.fn(),
  unregister: vi.fn(),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  register: vi.fn(),
  addListener: vi.fn(),
  remove: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: mocks.native, getPlatform: () => "ios" },
}));
vi.mock("@capacitor/push-notifications", () => ({ PushNotifications: mocks }));
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({ auth: { getUser: mocks.getUser }, from: mocks.from }),
}));
let row: { id: number; active: boolean } | null;
let queryError: unknown;
let filters: [string, unknown][];
let tokenCallback: (token: { value: string }) => void;

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  window.localStorage.setItem("lemon-schedule-device-id", "this-device");
  row = { id: 1, active: true };
  queryError = null;
  filters = [];
  mocks.native.mockReturnValue(true);
  mocks.unregister.mockResolvedValue(undefined);
  mocks.checkPermissions.mockResolvedValue({ receive: "granted" });
  mocks.requestPermissions.mockResolvedValue({ receive: "granted" });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "current-user" } }, error: null });
  mocks.addListener.mockImplementation(async (name: string, callback: typeof tokenCallback) => {
    if (name === "registration") tokenCallback = callback;
    return { remove: mocks.remove };
  });
  mocks.register.mockImplementation(async () => tokenCallback({ value: "test-token" }));
  mocks.from.mockImplementation(() => {
    const builder = {
      select: () => builder,
      delete: () => builder,
      upsert: () => builder,
      eq: (key: string, value: unknown) => {
        filters.push([key, value]);
        return builder;
      },
      maybeSingle: async () => ({ data: row, error: queryError }),
      single: async () => ({ data: row, error: queryError }),
      then: (resolve: (value: unknown) => void) => resolve({ data: row, error: queryError }),
    };
    return builder;
  });
});

describe("기기 알림 상태", () => {
  it("웹에서는 권한 요청이나 서버 조회를 하지 않는다", async () => {
    mocks.native.mockReturnValue(false);
    await expect(getDevicePushState()).resolves.toEqual({ status: "unsupported" });
    expect(mocks.checkPermissions).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("OS 허용과 현재 계정의 현재 기기 활성 등록을 확인한다", async () => {
    await expect(getDevicePushState()).resolves.toEqual({ status: "on" });
    expect(filters).toEqual(
      expect.arrayContaining([
        ["user_id", "current-user"],
        ["device_id", "this-device"],
        ["active", true],
      ]),
    );
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
  });
  it("OS 허용만 있고 서버 등록이 없으면 꺼짐이다", async () => {
    row = null;
    await expect(getDevicePushState()).resolves.toEqual({ status: "off" });
  });
  it("OS 거절과 아직 요청하지 않은 상태를 구분한다", async () => {
    mocks.checkPermissions.mockResolvedValue({ receive: "denied" });
    await expect(getDevicePushState()).resolves.toEqual({ status: "denied" });
    mocks.checkPermissions.mockResolvedValue({ receive: "prompt" });
    await expect(getDevicePushState()).resolves.toEqual({ status: "off" });
  });
  it("조회 실패를 꺼짐으로 숨기지 않는다", async () => {
    queryError = { message: "unavailable" };
    await expect(getDevicePushState()).rejects.toMatchObject({
      name: "AppError",
      code: "INVALID_INPUT",
    });
  });
  it("세션이 없으면 인증 오류를 반환한다", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(getDevicePushState()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("기기 등록과 해제", () => {
  it("OS 등록을 해제한다", async () => {
    await expect(disableNativePush()).resolves.toBeUndefined();
    expect(mocks.unregister).toHaveBeenCalledOnce();
  });
  it("명시적인 등록 요청에서만 권한을 요청한다", async () => {
    await expect(registerPushToken("current-user")).resolves.toEqual({
      active: true,
      deviceTokenId: 1,
    });
    expect(mocks.requestPermissions).toHaveBeenCalledOnce();
    expect(mocks.remove).toHaveBeenCalledTimes(2);
  });
  it("권한을 거절하면 등록하지 않는다", async () => {
    mocks.requestPermissions.mockResolvedValue({ receive: "denied" });
    await expect(registerPushToken("current-user")).resolves.toEqual({ active: false });
    expect(mocks.register).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("계정이 바뀐 등록 요청은 토큰을 저장하지 않고 OS 등록을 해제한다", async () => {
    mocks.getUser
      .mockResolvedValueOnce({ data: { user: { id: "current-user" } }, error: null })
      .mockResolvedValue({ data: { user: { id: "next-user" } }, error: null });
    await expect(registerPushToken("current-user")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.unregister).toHaveBeenCalled();
  });
  it("서버 등록 실패 시 OS 등록도 되돌린다", async () => {
    queryError = { message: "unavailable" };
    await expect(registerPushToken("current-user")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(mocks.unregister).toHaveBeenCalled();
  });
  it("OS 등록 실패도 계약 오류로 변환하고 정리한다", async () => {
    mocks.register.mockRejectedValue(new Error("native failure"));
    await expect(registerPushToken("current-user")).rejects.toMatchObject({
      name: "AppError",
      code: "INVALID_INPUT",
    });
    expect(mocks.unregister).toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalledTimes(2);
  });
  it("끄기는 서버 기기 행과 OS 등록을 함께 해제한다", async () => {
    await expect(unregisterPushToken("current-user")).resolves.toEqual({ active: false });
    expect(filters).toEqual([
      ["user_id", "current-user"],
      ["device_id", "this-device"],
    ]);
    expect(mocks.unregister).toHaveBeenCalled();
  });
  it("서버 삭제 실패해도 OS 해제를 시도하고 실패를 알린다", async () => {
    queryError = { message: "unavailable" };
    await expect(unregisterPushToken("current-user")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(mocks.unregister).toHaveBeenCalled();
  });
  it("OS 해제 실패를 성공으로 반환하지 않는다", async () => {
    mocks.unregister.mockRejectedValue(new Error("native failure"));
    await expect(unregisterPushToken("current-user")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });
});
