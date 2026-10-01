"use client";

import { Ban, Copy, LogOut, PencilLine, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { useAuth } from "@/features/auth/auth-provider";
import { signOut } from "@/features/auth/auth-service";
import { unregisterPushToken } from "@/features/push/push-service";
import { getDeviceTimeZone } from "@/lib/time";

import {
  getProfileDetails,
  unblockUser,
  updateProfile,
  type ProfileDetails,
} from "./profile-service";

const demoProfile: ProfileDetails = {
  displayName: "레몬 친구",
  timeZone: "Asia/Seoul",
  inviteCode: "LEMON0001",
  lemonPoints: 2,
  petLevel: 1,
  blocked: [],
};

export function ProfileScreen() {
  const router = useRouter();
  const { user, demo } = useAuth();
  const [profile, setProfile] = useState<ProfileDetails>(demoProfile);
  const [editing, setEditing] = useState(false);
  const [showBlocked, setShowBlocked] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    if (demo || !user) return;
    try {
      setProfile(await getProfileDetails(user.id));
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "프로필을 불러오지 못했어요.");
    }
  }

  useEffect(() => {
    if (demo || !user) return;
    let active = true;
    void getProfileDetails(user.id)
      .then((data) => {
        if (active) setProfile(data);
      })
      .catch((cause: unknown) => {
        if (active) {
          setMessage(cause instanceof Error ? cause.message : "프로필을 불러오지 못했어요.");
        }
      });
    return () => {
      active = false;
    };
  }, [demo, user]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = {
      displayName: String(data.get("displayName") ?? ""),
      timeZone: String(data.get("timeZone") ?? ""),
    };
    try {
      if (!demo && user) await updateProfile(next);
      setProfile((current) => ({ ...current, ...next }));
      setEditing(false);
      setMessage("프로필을 저장했어요.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "프로필을 저장하지 못했어요.");
    }
  }

  async function copyInvite() {
    const link = `${window.location.origin}/signup/?invite=${profile.inviteCode}`;
    await navigator.clipboard.writeText(`${profile.inviteCode}\n${link}`);
    setMessage("초대 코드와 링크를 복사했어요.");
  }

  async function logout() {
    try {
      if (!demo && user) {
        await unregisterPushToken(user.id);
        await signOut();
      }
      router.replace("/login/");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "로그아웃하지 못했어요.");
    }
  }

  return (
    <AppShell>
      <PageHeading
        eyebrow="MY PROFILE"
        title="내 정보"
        description="프로필과 초대 정보를 관리해요."
      />
      {message ? (
        <p className="inline-alert" role="status">
          {message}
        </p>
      ) : null}
      <div className="settings-stack">
        <Card as="section" className="profile-card">
          <span className="profile-avatar" aria-hidden="true">
            {profile.displayName.slice(0, 1)}
          </span>
          {editing ? (
            <form className="profile-edit-form" onSubmit={save}>
              <Field
                label="닉네임"
                name="displayName"
                defaultValue={profile.displayName}
                maxLength={40}
                required
              />
              <Field
                label="시간대"
                name="timeZone"
                defaultValue={profile.timeZone || getDeviceTimeZone()}
                required
              />
              <div className="button-row">
                <Button type="submit" size="sm">
                  <Save size={16} aria-hidden="true" /> 저장
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  <X size={16} aria-hidden="true" /> 취소
                </Button>
              </div>
            </form>
          ) : (
            <>
              <div>
                <p className="eyebrow">NICKNAME</p>
                <h2>{profile.displayName}</h2>
                <p>
                  {profile.timeZone} · 레벨 {profile.petLevel} · {profile.lemonPoints}점
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                <PencilLine size={16} aria-hidden="true" /> 수정
              </Button>
            </>
          )}
        </Card>
        <Card as="section" className="invite-card">
          <div>
            <p className="eyebrow">MY INVITE CODE</p>
            <h2>{profile.inviteCode}</h2>
            <p>이 코드를 공유하면 상대가 연결 요청을 보낼 수 있어요.</p>
          </div>
          <Button variant="secondary" onClick={() => void copyInvite()}>
            <Copy size={17} aria-hidden="true" /> 복사
          </Button>
        </Card>
        <div className="settings-actions">
          <Button variant="ghost" onClick={() => setShowBlocked((value) => !value)}>
            <Ban size={18} aria-hidden="true" /> 차단 목록
          </Button>
          <Button variant="ghost" onClick={() => void logout()}>
            <LogOut size={18} aria-hidden="true" /> 로그아웃
          </Button>
        </div>
        {showBlocked ? (
          <Card as="section" className="blocked-list">
            <h2>차단한 사용자</h2>
            {profile.blocked.length === 0 ? (
              <p>차단한 사용자가 없어요.</p>
            ) : (
              profile.blocked.map((item) => (
                <div className="blocked-list__row" key={item.id}>
                  <span>{item.displayName}</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      if (!demo) await unblockUser(item.id);
                      await load();
                    }}
                  >
                    차단 해제
                  </Button>
                </div>
              ))
            )}
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
