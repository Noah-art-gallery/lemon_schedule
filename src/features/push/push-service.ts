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

export async function registerPushToken(
  userId: string,
): Promise<{ deviceTokenId?: number; active: boolean }> {
  if (!Capacitor.isNativePlatform()) return { active: false };
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") return { active: false };
  let resolveToken!: (token: Token) => void;
  let rejectToken!: (error: unknown) => void;
  const tokenReady = new Promise<Token>((resolve, reject) => {
    resolveToken = resolve;
    rejectToken = reject;
  });
  const [registrationHandle, errorHandle] = await Promise.all([
    PushNotifications.addListener("registration", resolveToken),
    PushNotifications.addListener("registrationError", rejectToken),
  ]);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let token: Token;
  try {
    await PushNotifications.register();
    token = await Promise.race([
      tokenReady,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new AppError("INVALID_INPUT", "알림 기기 등록 시간이 초과됐어요.")),
          15000,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
    await Promise.all([registrationHandle.remove(), errorHandle.remove()]);
  }
  const platform = Capacitor.getPlatform();
  if (platform !== "android" && platform !== "ios") return { active: false };
  const { data, error } = await getSupabaseClient()
    .from("device_tokens")
    .upsert(
      {
        user_id: userId,
        device_id: getDeviceId(),
        token: token.value,
        platform,
        active: true,
      },
      { onConflict: "user_id,device_id" },
    )
    .select("id, active")
    .single();
  if (error) {
    await disableNativePush();
    throw new AppError("INVALID_INPUT", "휴대폰 알림 기기를 등록하지 못했어요.");
  }
  return { deviceTokenId: data.id, active: data.active };
}

export async function unregisterPushToken(userId: string): Promise<{ active: false }> {
  if (!Capacitor.isNativePlatform()) return { active: false };
  const { error } = await getSupabaseClient()
    .from("device_tokens")
    .delete()
    .eq("user_id", userId)
    .eq("device_id", getDeviceId());
  if (error) throw new AppError("INVALID_INPUT", "휴대폰 알림 기기를 해제하지 못했어요.");
  await disableNativePush();
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
