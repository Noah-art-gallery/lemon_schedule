"use client";

import { Bell, Check, Copy, LogOut, PencilLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ProfileAvatar, avatarOptions } from "@/components/ui/profile-avatar";
import { Panel } from "@/components/ui/panel";
import { StatePanel } from "@/components/ui/state-panel";
import { useAuth } from "@/features/auth/auth-provider";
import { signOut } from "@/features/auth/auth-service";
import {
  getDevicePushState,
  registerPushToken,
  unregisterPushToken,
  type DevicePushStatus,
} from "@/features/push/push-service";
import { getProfileDetails, updateProfile, type ProfileDetails } from "./profile-service";
import {
  demoGetProfile,
  demoUpdateProfile,
  subscribeDemoTasks,
} from "@/features/tasks/demo-task-store";
import styles from "./profile-screen.module.css";

const normalizeAvatar = (value?: string) =>
  avatarOptions.find((option) => option.key === value)?.key ?? "lemon";

const errorText = (cause: unknown, fallback: string) =>
  cause instanceof Error ? cause.message : fallback;

export function ProfileScreen() {
  const router = useRouter();
  const { user, demo } = useAuth();
  const [profile, setProfile] = useState<ProfileDetails | null>(demo ? demoGetProfile() : null);
  const [loadError, setLoadError] = useState("");
  const [panel, setPanel] = useState<"profile" | null>(null);
  const [draft, setDraft] = useState({
    displayName: "",
    timeZone: "",
    avatarKey: normalizeAvatar(),
  });
  const [discard, setDiscard] = useState(false);
  const continueRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const wasDiscarding = useRef(false);
  useEffect(() => {
    if (discard) continueRef.current?.focus();
    else if (wasDiscarding.current)
      editorRef.current?.querySelector<HTMLElement>("input, button:not(:disabled)")?.focus();
    wasDiscarding.current = discard;
  }, [discard]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pushState, setPushState] = useState<DevicePushStatus | "loading" | "error">("loading");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");
  const pushRef = useRef(false);

  const load = useCallback(async () => {
    if (demo || !user) return;
    setLoadError("");
    try {
      setProfile(await getProfileDetails(user.id));
    } catch (cause) {
      setLoadError(errorText(cause, "프로필을 불러오지 못했어요"));
    }
  }, [demo, user]);

  useEffect(() => {
    if (!demo) return;
    return subscribeDemoTasks(() => setProfile(demoGetProfile()));
  }, [demo]);
  useEffect(() => {
    if (demo || !user) return;
    let active = true;
    void getProfileDetails(user.id)
      .then((data) => {
        if (active) setProfile(data);
      })
      .catch((cause) => {
        if (active) setLoadError(errorText(cause, "프로필을 불러오지 못했어요"));
      });
    return () => {
      active = false;
    };
  }, [demo, user]);

  const checkPush = useCallback(async () => {
    setPushError("");
    setPushState("loading");
    try {
      setPushState((await getDevicePushState()).status);
    } catch (cause) {
      setPushState("error");
      setPushError(errorText(cause, "알림 상태를 확인하지 못했어요"));
    }
  }, []);
  useEffect(() => {
    let active = true;
    void getDevicePushState()
      .then((result) => {
        if (active) setPushState(result.status);
      })
      .catch((cause) => {
        if (active) {
          setPushState("error");
          setPushError(errorText(cause, "알림 상태를 확인하지 못했어요"));
        }
      });
    return () => {
      active = false;
    };
  }, []);

  function openProfile() {
    if (!profile) return;
    setDraft({
      displayName: profile.displayName,
      timeZone: profile.timeZone,
      avatarKey: normalizeAvatar(profile.avatarKey),
    });
    setError("");
    setDiscard(false);
    setPanel("profile");
  }
  function beforeClose() {
    if (busyRef.current) return false;
    if (
      panel === "profile" &&
      profile &&
      (draft.displayName !== profile.displayName ||
        draft.timeZone !== profile.timeZone ||
        draft.avatarKey !== normalizeAvatar(profile.avatarKey))
    ) {
      setDiscard(true);
      return false;
    }
    return true;
  }
  function close() {
    if (beforeClose()) {
      setPanel(null);
      setError("");
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current || !profile) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const next = demo ? demoUpdateProfile(draft) : await updateProfile(draft);
      setProfile((current) =>
        current
          ? {
              ...current,
              displayName: next.displayName,
              timeZone: next.timeZone,
              avatarKey: normalizeAvatar(next.avatarKey),
            }
          : current,
      );
      setPanel(null);
      setMessage(demo ? "미리보기에 반영했어요" : "프로필을 저장했어요");
    } catch (cause) {
      setError(errorText(cause, "프로필을 저장하지 못했어요"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function copyInvite() {
    if (!profile) return;
    setError("");
    setMessage("");
    try {
      await navigator.clipboard.writeText(
        `${profile.inviteCode}\n${window.location.origin}/signup/?invite=${encodeURIComponent(profile.inviteCode)}`,
      );
      setMessage("초대 코드와 링크를 복사했어요");
    } catch {
      setError("복사하지 못했어요. 초대 코드를 직접 선택해 복사해 주세요");
    }
  }
  async function logout() {
    if (busyRef.current || pushRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!demo && user) await signOut();
      router.replace("/login/");
    } catch (cause) {
      setError(errorText(cause, "로그아웃하지 못했어요"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function changePush() {
    if (pushRef.current || busyRef.current || !user || demo) return;
    pushRef.current = true;
    setPushBusy(true);
    setPushError("");
    try {
      if (pushState === "on") await unregisterPushToken(user.id);
      else await registerPushToken(user.id);
      setPushState((await getDevicePushState()).status);
    } catch (cause) {
      setPushState("error");
      setPushError(errorText(cause, "알림 설정을 변경하지 못했어요"));
    } finally {
      pushRef.current = false;
      setPushBusy(false);
    }
  }
  const statusText = {
    unsupported: "휴대폰 앱에서 설정할 수 있어요",
    off: "꺼짐",
    denied: "기기 설정에서 알림 권한을 허용해 주세요",
    on: "켜짐",
    loading: "알림 상태 확인 중",
    error: "알림 상태 확인 필요",
  }[pushState];
  return (
    <AppShell>
      <PageHeading title="내 정보" />
      {message ? (
        <p className="inline-alert" role="status">
          {message}
        </p>
      ) : null}
      {error && !panel ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {!profile ? (
        <StatePanel
          kind={loadError ? "error" : "loading"}
          title={loadError || "프로필 불러오는 중"}
          action={
            loadError ? (
              <Button variant="secondary" onClick={() => void load()}>
                다시 시도
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={styles.settings}>
          <section className={styles.identity} aria-label="프로필">
            <ProfileAvatar avatarKey={profile.avatarKey} />
            <div className={styles.identityText}>
              <h2>{profile.displayName}</h2>
              <p>{profile.timeZone}</p>
            </div>
            <Button variant="ghost" aria-label="프로필 수정" onClick={openProfile}>
              <PencilLine size={17} aria-hidden="true" />
              수정
            </Button>
          </section>
          <section className={styles.group} aria-labelledby="invite-heading">
            <div className={styles.row}>
              <div>
                <h2 id="invite-heading">내 초대 코드</h2>
                <p className={styles.code}>{profile.inviteCode}</p>
              </div>
              <Button variant="ghost" onClick={() => void copyInvite()}>
                <Copy size={17} aria-hidden="true" />
                복사
              </Button>
            </div>
          </section>
          <section className={styles.group} aria-labelledby="push-heading">
            <div className={styles.row}>
              <div>
                <h2 id="push-heading">
                  <Bell size={18} aria-hidden="true" />
                  휴대폰 알림
                </h2>
                <p aria-live="polite">{statusText}</p>
              </div>
              {(pushState === "on" || pushState === "off") && !demo ? (
                <Button
                  variant="ghost"
                  loading={pushBusy}
                  disabled={busy}
                  onClick={() => void changePush()}
                >
                  {pushState === "on" ? "알림 끄기" : "알림 켜기"}
                </Button>
              ) : null}
              {pushState === "error" || pushState === "denied" ? (
                <Button
                  variant="ghost"
                  aria-label="알림 상태 다시 확인"
                  onClick={() => void checkPush()}
                >
                  다시 확인
                </Button>
              ) : null}
            </div>
            {pushState === "on" || pushState === "off" ? (
              <p className={styles.note}>받은 응원과 친구 연결 소식을 알려드려요</p>
            ) : null}
            {pushError ? (
              <p role="alert" className="form-error">
                {pushError}
              </p>
            ) : null}
          </section>
          <section className={styles.group} aria-label="계정 관리">
            <button
              className={styles.action}
              type="button"
              disabled={busy || pushBusy}
              onClick={() => void logout()}
            >
              <LogOut size={18} aria-hidden="true" />
              <span>{busy && !panel ? "로그아웃 중" : "로그아웃"}</span>
            </button>
          </section>
        </div>
      )}
      <Panel
        open={panel !== null}
        title="프로필 수정"
        onClose={() => {
          setPanel(null);
          setError("");
        }}
        onBeforeClose={beforeClose}
      >
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {panel === "profile" ? (
          <>
            {discard ? (
              <div className={styles.discard}>
                <p>변경한 내용을 버릴까요?</p>
                <div className="button-row">
                  <Button ref={continueRef} variant="secondary" onClick={() => setDiscard(false)}>
                    계속 수정
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      setDiscard(false);
                      setPanel(null);
                      setError("");
                    }}
                  >
                    변경 버리기
                  </Button>
                </div>
              </div>
            ) : null}
            <div ref={editorRef} hidden={discard}>
              <form className="form-stack" onSubmit={save}>
                <Field
                  label="닉네임"
                  name="displayName"
                  value={draft.displayName}
                  onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
                  maxLength={40}
                  required
                  disabled={busy}
                />
                <fieldset className={styles.avatarPicker} disabled={busy}>
                  <legend>프로필 이미지</legend>
                  <div className={styles.avatarGrid}>
                    {avatarOptions.map((option) => (
                      <label key={option.key} className={styles.avatarOption}>
                        <input
                          type="radio"
                          name="avatarKey"
                          value={option.key}
                          aria-label={option.label}
                          checked={draft.avatarKey === option.key}
                          onChange={() => setDraft({ ...draft, avatarKey: option.key })}
                        />
                        <ProfileAvatar avatarKey={option.key} size={36} />
                        {draft.avatarKey === option.key ? (
                          <Check className={styles.avatarCheck} size={18} aria-hidden="true" />
                        ) : null}
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Field
                  label="시간대"
                  name="timeZone"
                  value={draft.timeZone}
                  onChange={(event) => setDraft({ ...draft, timeZone: event.target.value })}
                  required
                  disabled={busy}
                />
                <div className="button-row">
                  <Button type="button" variant="secondary" disabled={busy} onClick={close}>
                    취소
                  </Button>
                  <Button type="submit" loading={busy}>
                    저장
                  </Button>
                </div>
              </form>
            </div>
          </>
        ) : null}
      </Panel>
    </AppShell>
  );
}
