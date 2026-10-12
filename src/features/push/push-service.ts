import { Capacitor } from "@capacitor/core";
import { PushNotifications, type Token } from "@capacitor/push-notifications";

import { AppError } from "@/lib/errors";
import { getSupabaseClient } from "@/lib/supabase/client";

const deviceKey = "lemon-schedule-device-id";

export async function disableNativePush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await PushNotifications.unregister();
  } catch {
    throw new AppError("INVALID_INPUT", "휴대폰 알림 등록을 해제하지 못했어요.");
  }
}

function getDeviceId(): string {
  const existing = window.localStorage.getItem(deviceKey);
  if (existing) return existing;
  const next = crypto.randomUUID();
  window.localStorage.setItem(deviceKey, next);
  return next;
}

export type DevicePushStatus = "unsupported" | "off" | "denied" | "on";

async function currentUserId(expected?: string): Promise<string> {
  const { data, error } = await getSupabaseClient().auth.getUser();
  if (error || !data.user || (expected && data.user.id !== expected)) {
    throw new AppError("UNAUTHENTICATED", "로그인 상태를 확인해 주세요");
  }
  return data.user.id;
}

function pushError(cause: unknown, message: string): AppError {
  return cause instanceof AppError ? cause : new AppError("INVALID_INPUT", message);
}

export async function getDevicePushState(): Promise<{ status: DevicePushStatus }> {
  if (!Capacitor.isNativePlatform()) return { status: "unsupported" };
  try {
    const userId = await currentUserId();
    const permission = await PushNotifications.checkPermissions();
    if (permission.receive === "denied") return { status: "denied" };
    if (permission.receive !== "granted") return { status: "off" };
    const { data, error } = await getSupabaseClient()
      .from("device_tokens")
      .select("id, active")
      .eq("user_id", userId)
      .eq("device_id", getDeviceId())
      .eq("active", true)
      .maybeSingle();
    if (error) throw new AppError("INVALID_INPUT", "휴대폰 알림 상태를 확인하지 못했어요");
    await currentUserId(userId);
    return { status: data?.active ? "on" : "off" };
  } catch (cause) {
    throw pushError(cause, "휴대폰 알림 상태를 확인하지 못했어요");
  }
}

export async function registerPushToken(
  userId: string,
): Promise<{ deviceTokenId?: number; active: boolean }> {
  if (!Capacitor.isNativePlatform()) return { active: false };
  const platform = Capacitor.getPlatform();
  if (platform !== "android" && platform !== "ios") return { active: false };
  const handles: { remove(): Promise<void> }[] = [];
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let registrationStarted = false;
  try {
    await currentUserId(userId);
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== "granted") return { active: false };
    let resolveToken!: (token: Token) => void;
    let rejectToken!: (error: unknown) => void;
    const tokenReady = new Promise<Token>((resolve, reject) => {
      resolveToken = resolve;
      rejectToken = reject;
    });
    handles.push(await PushNotifications.addListener("registration", resolveToken));
    handles.push(await PushNotifications.addListener("registrationError", rejectToken));
    registrationStarted = true;
    const token = await Promise.race([
      PushNotifications.register().then(() => tokenReady),
      tokenReady,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new AppError("INVALID_INPUT", "알림 기기 등록 시간이 초과됐어요")),
          15000,
        );
      }),
    ]);
    await currentUserId(userId);
    const { data, error } = await getSupabaseClient()
      .from("device_tokens")
      .upsert(
        { user_id: userId, device_id: getDeviceId(), token: token.value, platform, active: true },
        { onConflict: "user_id,device_id" },
      )
      .select("id, active")
      .single();
    if (error || !data) throw new AppError("INVALID_INPUT", "휴대폰 알림 기기를 등록하지 못했어요");
    await currentUserId(userId);
    return { deviceTokenId: data.id, active: data.active };
  } catch (cause) {
    if (registrationStarted) await disableNativePush();
    throw pushError(cause, "휴대폰 알림 기기를 등록하지 못했어요");
  } finally {
    if (timeout) clearTimeout(timeout);
    const cleanup = await Promise.allSettled(handles.map((handle) => handle.remove()));
    if (cleanup.some((result) => result.status === "rejected")) {
      if (registrationStarted) await disableNativePush();
      throw new AppError("INVALID_INPUT", "휴대폰 알림 연결을 정리하지 못했어요");
    }
  }
}

export async function unregisterPushToken(userId: string): Promise<{ active: false }> {
  if (!Capacitor.isNativePlatform()) return { active: false };
  const results = await Promise.allSettled([
    Promise.resolve().then(async () => {
      const { error } = await getSupabaseClient()
        .from("device_tokens")
        .delete()
        .eq("user_id", userId)
        .eq("device_id", getDeviceId());
      if (error) throw new AppError("INVALID_INPUT", "휴대폰 알림 기기를 해제하지 못했어요");
    }),
    disableNativePush(),
  ]);
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") {
    throw pushError(failure.reason, "휴대폰 알림 기기를 해제하지 못했어요");
  }
  return { active: false };
}

export async function listenForPushNavigation(): Promise<() => Promise<void>> {
  if (!Capacitor.isNativePlatform()) return async () => {};
  const handle = await PushNotifications.addListener(
    "pushNotificationActionPerformed",
    (action) => {
      const target = action.notification.data?.target;
      if (typeof target !== "string") return;
      if (/^\/(?:friends|notifications|pet|profile)?\/?(?:\?[^#]*)?$/.test(target)) {
        window.location.assign(target);
      }
    },
  );
  return () => handle.remove();
}
