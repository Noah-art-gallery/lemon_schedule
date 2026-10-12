import { createClient } from "@supabase/supabase-js";

const edgeRuntime = globalThis as typeof globalThis & {
  Deno: {
    env: { get(name: string): string | undefined };
    serve(handler: (request: Request) => Response | Promise<Response>): void;
  };
};

type Device = { device_id: string; token: string; platform: "android" | "ios" };
type SendResult = { messageId: string };

const encoder = new TextEncoder();
let googleAccessToken: { value: string; expiresAt: number } | null = null;
let appleProviderToken: { value: string; expiresAt: number } | null = null;

function requiredEnv(name: string): string {
  const value = edgeRuntime.Deno.env.get(name);
  if (!value) throw new Error("MISSING_" + name);
  return value;
}

function sameSecret(actual: string | null, expected: string): boolean {
  const a = encoder.encode(actual ?? "");
  const b = encoder.encode(expected);
  let different = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    different |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return different === 0;
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function jwtPart(value: unknown): string {
  return base64Url(encoder.encode(JSON.stringify(value)));
}

function pkcs8(pem: string): Uint8Array {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----[^-]+-----/g, "")
    .replace(/\s/g, "");
  return Uint8Array.from(atob(body), (character) => character.charCodeAt(0));
}

async function signedJwt(
  header: Record<string, string>,
  payload: Record<string, string | number>,
  algorithm: "RS256" | "ES256",
  privateKey: string,
): Promise<string> {
  const input = jwtPart(header) + "." + jwtPart(payload);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8(privateKey) as BufferSource,
    algorithm === "RS256"
      ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }
      : { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    algorithm === "RS256" ? { name: "RSASSA-PKCS1-v1_5" } : { name: "ECDSA", hash: "SHA-256" },
    key,
    encoder.encode(input),
  );
  return input + "." + base64Url(new Uint8Array(signature));
}

async function fcmAccessToken(): Promise<string> {
  if (googleAccessToken && googleAccessToken.expiresAt > Date.now() + 60000) {
    return googleAccessToken.value;
  }
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signedJwt(
    { alg: "RS256", typ: "JWT" },
    {
      iss: requiredEnv("FCM_CLIENT_EMAIL"),
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    },
    "RS256",
    requiredEnv("FCM_PRIVATE_KEY"),
  );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error("FCM_AUTH_" + response.status);
  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("FCM_AUTH_RESPONSE");
  googleAccessToken = {
    value: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  return body.access_token;
}

async function apnsProviderToken(): Promise<string> {
  if (appleProviderToken && appleProviderToken.expiresAt > Date.now() + 60000) {
    return appleProviderToken.value;
  }
  const now = Math.floor(Date.now() / 1000);
  const value = await signedJwt(
    { alg: "ES256", kid: requiredEnv("APNS_KEY_ID") },
    { iss: requiredEnv("APNS_TEAM_ID"), iat: now },
    "ES256",
    requiredEnv("APNS_PRIVATE_KEY"),
  );
  appleProviderToken = { value, expiresAt: Date.now() + 50 * 60 * 1000 };
  return value;
}

async function sendToDevice(device: Device, target: string, body: string): Promise<SendResult> {
  const title = "레몬스케줄";
  if (device.platform === "android") {
    const response = await fetch(
      "https://fcm.googleapis.com/v1/projects/" +
        encodeURIComponent(requiredEnv("FCM_PROJECT_ID")) +
        "/messages:send",
      {
        method: "POST",
        headers: {
          authorization: "Bearer " + (await fcmAccessToken()),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: { token: device.token, notification: { title, body }, data: { target } },
        }),
      },
    );
    if (!response.ok) throw new Error("FCM_SEND_" + response.status);
    const result = (await response.json()) as { name?: string };
    return { messageId: result.name ?? "accepted" };
  }
  const host =
    edgeRuntime.Deno.env.get("APNS_USE_SANDBOX") === "true"
      ? "api.sandbox.push.apple.com"
      : "api.push.apple.com";
  const response = await fetch(
    "https://" + host + "/3/device/" + encodeURIComponent(device.token),
    {
      method: "POST",
      headers: {
        authorization: "bearer " + (await apnsProviderToken()),
        "apns-topic": requiredEnv("APNS_BUNDLE_ID"),
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      },
      body: JSON.stringify({ aps: { alert: { title, body }, sound: "default" }, target }),
    },
  );
  if (!response.ok) throw new Error("APNS_SEND_" + response.status);
  return { messageId: response.headers.get("apns-id") ?? "accepted" };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

edgeRuntime.Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const webhookSecret = edgeRuntime.Deno.env.get("PUSH_WEBHOOK_SECRET");
  if (!webhookSecret || webhookSecret.length < 32) return json({ error: "NOT_CONFIGURED" }, 503);
  if (!sameSecret(request.headers.get("x-lemon-webhook-secret"), webhookSecret)) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  let notificationId: number;
  try {
    const event = (await request.json()) as {
      type?: string;
      table?: string;
      record?: { id?: number };
    };
    notificationId = event.record?.id as number;
    if (
      event.type !== "INSERT" ||
      event.table !== "notifications" ||
      !Number.isSafeInteger(notificationId) ||
      notificationId < 1
    ) {
      return json({ error: "INVALID_EVENT" }, 400);
    }
  } catch {
    return json({ error: "INVALID_JSON" }, 400);
  }

  try {
    const admin = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: { autoRefreshToken: false, persistSession: false },
      },
    );
    const { data: notification, error: notificationError } = await admin
      .from("notifications")
      .select(
        "id, recipient_id, actor_id, occurrence_id, encouragement_id, connection_request_id, notification_type",
      )
      .eq("id", notificationId)
      .maybeSingle();
    if (notificationError) throw new Error("NOTIFICATION_QUERY");
    if (
      !notification ||
      !["connection_request", "connection_accepted", "encouragement_received"].includes(
        notification.notification_type,
      )
    ) {
      return json({ skipped: "DIRECT_NOTIFICATION_ONLY" });
    }
    if (!notification.actor_id || notification.actor_id === notification.recipient_id) {
      return json({ skipped: "ACTOR_UNAVAILABLE" });
    }

    const [low, high] = [notification.actor_id, notification.recipient_id].sort();
    const [{ data: connection, error: connectionError }, { data: blocks, error: blocksError }] =
      await Promise.all([
        admin
          .from("connections")
          .select("user_low_id")
          .eq("user_low_id", low)
          .eq("user_high_id", high)
          .maybeSingle(),
        admin
          .from("blocks")
          .select("blocker_id")
          .in("blocker_id", [low, high])
          .in("blocked_id", [low, high]),
      ]);
    if (connectionError || blocksError) throw new Error("CONNECTION_QUERY");
    if ((blocks?.length ?? 0) > 0) return json({ skipped: "BLOCKED" });
    if (notification.notification_type !== "connection_request" && !connection) {
      return json({ skipped: "NOT_CONNECTED" });
    }

    let target: string;
    let body: string;
    if (
      notification.notification_type === "connection_request" ||
      notification.notification_type === "connection_accepted"
    ) {
      if (!notification.connection_request_id) return json({ skipped: "REQUEST_UNAVAILABLE" });
      const { data: connectionRequest, error } = await admin
        .from("connection_requests")
        .select("requester_id, addressee_id, status")
        .eq("id", notification.connection_request_id)
        .maybeSingle();
      if (error) throw new Error("REQUEST_QUERY");
      const incoming = notification.notification_type === "connection_request";
      if (
        !connectionRequest ||
        connectionRequest.requester_id !==
          (incoming ? notification.actor_id : notification.recipient_id) ||
        connectionRequest.addressee_id !==
          (incoming ? notification.recipient_id : notification.actor_id) ||
        connectionRequest.status !== (incoming ? "pending" : "accepted")
      ) {
        return json({ skipped: "REQUEST_UNAVAILABLE" });
      }
      target = incoming
        ? "/friends/?request=" + notification.connection_request_id
        : "/friends/?friend=" + encodeURIComponent(notification.actor_id);
      body = incoming ? "새 친구 요청이 있어요" : "친구 요청이 수락됐어요";
    } else {
      if (!notification.encouragement_id || !notification.occurrence_id) {
        return json({ skipped: "ENCOURAGEMENT_UNAVAILABLE" });
      }
      const { data: encouragement, error: encouragementError } = await admin
        .from("encouragements")
        .select("occurrence_id, author_id, owner_id, visibility")
        .eq("id", notification.encouragement_id)
        .maybeSingle();
      if (encouragementError) throw new Error("ENCOURAGEMENT_QUERY");
      if (
        !encouragement ||
        encouragement.occurrence_id !== notification.occurrence_id ||
        encouragement.author_id !== notification.actor_id ||
        encouragement.owner_id !== notification.recipient_id ||
        encouragement.visibility !== "visible"
      ) {
        return json({ skipped: "ENCOURAGEMENT_UNAVAILABLE" });
      }
      const { data: occurrence, error: occurrenceError } = await admin
        .from("task_occurrences")
        .select("id, task_id, owner_id, status")
        .eq("id", notification.occurrence_id)
        .maybeSingle();
      if (occurrenceError) throw new Error("OCCURRENCE_QUERY");
      if (
        !occurrence ||
        occurrence.owner_id !== notification.recipient_id ||
        occurrence.status !== "completed"
      ) {
        return json({ skipped: "NOT_COMPLETED" });
      }
      const { data: task, error: taskError } = await admin
        .from("tasks")
        .select("id")
        .eq("id", occurrence.task_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (taskError) throw new Error("TASK_QUERY");
      if (!task) return json({ skipped: "TASK_DELETED" });
      target =
        "/?occurrence=" +
        notification.occurrence_id +
        "&encouragement=" +
        notification.encouragement_id;
      body = "새 응원이 도착했어요";
    }

    const { data: devices, error: devicesError } = await admin
      .from("device_tokens")
      .select("device_id, token, platform")
      .eq("user_id", notification.recipient_id)
      .eq("active", true);
    if (devicesError) throw new Error("DEVICE_QUERY");
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    for (const device of (devices ?? []) as Device[]) {
      const { data: claim, error: claimError } = await admin
        .from("push_delivery_attempts")
        .insert({
          notification_id: notificationId,
          device_id: device.device_id,
          platform: device.platform,
        })
        .select("id")
        .single();
      if (claimError?.code === "23505") {
        skipped += 1;
        continue;
      }
      if (claimError || !claim) throw new Error("CLAIM_FAILED");
      try {
        const result = await sendToDevice(device, target, body);
        const { error } = await admin
          .from("push_delivery_attempts")
          .update({
            status: "sent",
            provider_message_id: result.messageId,
            finished_at: new Date().toISOString(),
          })
          .eq("id", claim.id);
        if (error) throw new Error("STATUS_UPDATE_FAILED");
        sent += 1;
      } catch (cause) {
        const errorCode =
          cause instanceof Error && /^(?:FCM|APNS|MISSING|STATUS)_[A-Z0-9_]+$/.test(cause.message)
            ? cause.message
            : "PROVIDER_FAILED";
        const { error: failedStatusError } = await admin
          .from("push_delivery_attempts")
          .update({
            status: "failed",
            error_code: errorCode.slice(0, 80),
            finished_at: new Date().toISOString(),
          })
          .eq("id", claim.id);
        if (failedStatusError) throw new Error("DELIVERY_STATUS_WRITE_FAILED");
        failed += 1;
      }
    }
    return json({ sent, failed, skipped });
  } catch (cause) {
    console.error(
      "push dispatch failed",
      cause instanceof Error && /^[A-Z_]+$/.test(cause.message) ? cause.message : "UNKNOWN",
    );
    return json({ error: "DISPATCH_FAILED" }, 500);
  }
});
