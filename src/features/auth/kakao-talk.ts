import { z } from "zod";
import { readPublicEnv } from "@/lib/env";
import { getSupabaseClient } from "@/lib/supabase/client";

export const kakaoSdkUrl = "https://t1.kakaocdn.net/kakao_js_sdk/2.8.4/kakao.min.js";
export const kakaoSdkIntegrity =
  "sha384-BGX7Wb16GmRFagri4bLJV2DgipVZaU2AI812GZtHtHzzDQJnfHasDXN5houxv45w";
interface KakaoSdk {
  init(key: string): void;
  isInitialized(): boolean;
  Auth: {
    getAppKey(): string;
    authorize(options: {
      redirectUri: string;
      state: string;
      scope: string;
      throughTalk: boolean;
    }): void;
  };
}
declare global {
  interface Window {
    Kakao?: KakaoSdk;
  }
}
let sdkLoading: Promise<KakaoSdk> | undefined;
let prepared:
  | {
      redirect: string;
      expires: number;
      promise: Promise<{ sdk: KakaoSdk; state: string; redirectUri: string }>;
    }
  | undefined;

function loadSdk(key: string): Promise<KakaoSdk> {
  const initialize = () => {
    const sdk = window.Kakao;
    if (!sdk) throw new Error("KAKAO_SDK_UNAVAILABLE");
    if (!sdk.isInitialized()) sdk.init(key);
    if (sdk.Auth.getAppKey() !== key) throw new Error("KAKAO_APP_MISMATCH");
    return sdk;
  };
  if (window.Kakao) return Promise.resolve().then(initialize);
  if (!sdkLoading) {
    sdkLoading = new Promise<KakaoSdk>((resolve, reject) => {
      const script = document.createElement("script");
      const timer = window.setTimeout(() => {
        script.remove();
        reject(new Error("KAKAO_SDK_TIMEOUT"));
      }, 8000);
      script.src = kakaoSdkUrl;
      script.integrity = kakaoSdkIntegrity;
      script.crossOrigin = "anonymous";
      script.async = true;
      script.onload = () => {
        window.clearTimeout(timer);
        try {
          resolve(initialize());
        } catch (error) {
          reject(error);
        }
      };
      script.onerror = () => {
        window.clearTimeout(timer);
        script.remove();
        reject(new Error("KAKAO_SDK_UNAVAILABLE"));
      };
      document.head.append(script);
    }).catch((error) => {
      sdkLoading = undefined;
      throw error;
    });
  }
  return sdkLoading;
}

export async function prepareKakaoTalkLogin(redirect: string) {
  const env = readPublicEnv();
  if (!env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY) return null;
  if (prepared?.redirect === redirect && prepared.expires > Date.now()) return prepared.promise;
  const entry = {
    redirect,
    expires: Date.now() + 120000,
    promise: Promise.all([
      loadSdk(env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY),
      getSupabaseClient().functions.invoke("start-kakao-login", { body: { redirectTo: redirect } }),
    ]).then(([sdk, result]) => {
      if (result.error) throw result.error;
      const flow = z
        .object({ state: z.string().min(1).max(4096), redirectUri: z.string() })
        .parse(result.data);
      if (
        flow.redirectUri !== new URL("/auth/v1/callback", env.NEXT_PUBLIC_SUPABASE_URL).toString()
      ) {
        throw new Error("KAKAO_CALLBACK_MISMATCH");
      }
      return { sdk, ...flow };
    }),
  };
  prepared = entry;
  try {
    return await entry.promise;
  } catch (error) {
    if (prepared === entry) prepared = undefined;
    throw error;
  }
}

export async function startKakaoTalkLogin(redirect: string): Promise<boolean> {
  try {
    const flow = await prepareKakaoTalkLogin(redirect);
    if (!flow) return false;
    prepared = undefined; // OAuth state is single-use and stays only in memory.
    flow.sdk.Auth.authorize({
      redirectUri: flow.redirectUri,
      state: flow.state,
      scope: "profile_nickname",
      throughTalk: true,
    });
    return true;
  } catch {
    return false; // Preserve the existing REST login if SDK loading or preparation fails.
  }
}
