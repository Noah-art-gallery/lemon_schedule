"use client";

import { Palette, Sparkles } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatePanel } from "@/components/ui/state-panel";
import { useAuth } from "@/features/auth/auth-provider";
import { PetCanvas } from "./pet-canvas";
import {
  getPetDetails,
  getPetDrawingUrl,
  savePetDecorations,
  savePetDrawing,
  type PetDecorations,
  type PetDetails,
} from "./pet-service";

const blankPet: PetDetails = {
  drawingPath: null,
  lemonPoints: 0,
  petLevel: 1,
  unlockCount: 0,
  unlockedItems: [],
  decorations: {
    selectedColor: "leaf-green",
    selectedAccessory: null,
    selectedBackground: null,
  },
};
const demoPet: PetDetails = { ...blankPet, lemonPoints: 3 };

export function PetScreen() {
  const { user, demo } = useAuth();
  const [pet, setPet] = useState<PetDetails>(demo ? demoPet : blankPet);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [showCanvas, setShowCanvas] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (demo || !user) return;
    try {
      const next = await getPetDetails(user.id);
      setPet(next);
      setImageUrl(await getPetDrawingUrl(next.drawingPath));
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "펫 정보를 불러오지 못했어요.");
    }
  }, [demo, user]);

  useEffect(() => {
    if (demo || !user) return;
    let active = true;
    void getPetDetails(user.id)
      .then(async (next) => ({ next, url: await getPetDrawingUrl(next.drawingPath) }))
      .then(({ next, url }) => {
        if (active) {
          setPet(next);
          setImageUrl(url);
        }
      })
      .catch((cause: unknown) => {
        if (active)
          setNotice(cause instanceof Error ? cause.message : "펫 정보를 불러오지 못했어요.");
      });
    return () => {
      active = false;
    };
  }, [demo, user]);

  async function save(blob: Blob) {
    if (demo || !user) {
      setNotice(
        "미리보기에서는 그림이 저장되지 않아요. Supabase 연결 후 나만의 펫을 저장할 수 있어요.",
      );
      setShowCanvas(false);
      return;
    }
    try {
      await savePetDrawing(user.id, blob);
      await load();
      setShowCanvas(false);
      setNotice("나만의 레몬 펫을 저장했어요!");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "펫 그림을 저장하지 못했어요.");
    }
  }

  async function decorate(change: Partial<PetDecorations>) {
    const next = { ...pet.decorations, ...change };
    if (demo) {
      setNotice("미리보기에서는 꾸미기가 저장되지 않아요.");
      return;
    }
    try {
      const saved = await savePetDecorations(next);
      setPet((current) => ({ ...current, decorations: saved }));
      setNotice("펫 꾸미기를 저장했어요.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "펫 꾸미기를 저장하지 못했어요.");
    }
  }

  const progress = pet.lemonPoints % 5;

  return (
    <AppShell>
      <PageHeading
        eyebrow="MY LEMON PET"
        title="나만의 펫"
        description="직접 그린 펫과 함께 완료를 차곡차곡 쌓아보세요."
      />
      {notice ? (
        <p className="inline-alert" role="status">
          {notice}
        </p>
      ) : null}
      <section className="pet-page-grid">
        <Card
          tone="lemon"
          className={`pet-stage ${pet.decorations.selectedBackground === "sunny-garden" ? "is-garden" : ""} ${pet.decorations.selectedColor === "lemon-yellow" ? "is-yellow" : ""}`.trim()}
        >
          <span className="level-badge">LEVEL {pet.petLevel}</span>
          {pet.decorations.selectedAccessory === "leaf-hat" ? (
            <span className="pet-stage__accessory" aria-label="잎사귀 모자">
              🍃
            </span>
          ) : null}
          {imageUrl ? (
            // Signed URLs are private storage assets and are only rendered for the owner.
            <Image
              src={imageUrl}
              alt="내가 직접 그린 레몬 펫"
              width={360}
              height={360}
              unoptimized
              className="pet-stage__image"
            />
          ) : (
            <Image
              src="/images/lemon-pet-default.png"
              alt="아직 직접 그린 펫이 없을 때 보이는 기본 레몬 펫"
              width={360}
              height={360}
              className="pet-stage__image"
              priority
            />
          )}
          <div className="pet-stage__message">
            <Sparkles size={17} aria-hidden="true" /> 오늘의 완료를 기다리고 있어요!
          </div>
        </Card>
        <Card className="pet-details">
          <p className="eyebrow">GROWTH</p>
          <h2>레몬 포인트 {pet.lemonPoints}</h2>
          <p>할 일을 처음 완료할 때마다 1포인트를 받아요.</p>
          <div className="level-progress" aria-label={`다음 레벨까지 ${progress} / 5 포인트`}>
            <span style={{ width: `${(progress / 5) * 100}%` }} />
          </div>
          {showCanvas ? (
            <PetCanvas
              onSave={save}
              strokeColor={pet.decorations.selectedColor === "lemon-yellow" ? "#e7a900" : "#397a4b"}
            />
          ) : (
            <Button fullWidth size="lg" onClick={() => setShowCanvas(true)}>
              <Palette size={18} aria-hidden="true" /> 빈 도화지에서 그리기
            </Button>
          )}
          <div className="pet-decoration-controls">
            <p className="pet-unlocks">잠금 해제한 꾸미기 {pet.unlockCount}개</p>
            <label className="field">
              <span className="field__label">그리기 색상</span>
              <select
                className="field__input"
                value={pet.decorations.selectedColor}
                onChange={(event) =>
                  void decorate({
                    selectedColor: event.target.value as PetDecorations["selectedColor"],
                  })
                }
              >
                <option value="leaf-green">잎사귀 초록</option>
                <option value="lemon-yellow" disabled={!pet.unlockedItems.includes("lemon-yellow")}>
                  레몬 노랑 · 5점
                </option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">스티커</span>
              <select
                className="field__input"
                value={pet.decorations.selectedAccessory ?? ""}
                onChange={(event) =>
                  void decorate({ selectedAccessory: event.target.value ? "leaf-hat" : null })
                }
              >
                <option value="">없음</option>
                <option value="leaf-hat" disabled={!pet.unlockedItems.includes("leaf-hat")}>
                  잎사귀 모자 · 15점
                </option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">배경</span>
              <select
                className="field__input"
                value={pet.decorations.selectedBackground ?? ""}
                onChange={(event) =>
                  void decorate({ selectedBackground: event.target.value ? "sunny-garden" : null })
                }
              >
                <option value="">기본</option>
                <option value="sunny-garden" disabled={!pet.unlockedItems.includes("sunny-garden")}>
                  햇살 정원 · 30점
                </option>
              </select>
            </label>
          </div>
        </Card>
      </section>
      {!demo && !user && !notice ? (
        <StatePanel
          kind="empty"
          title="로그인이 필요해요"
          description="내 펫은 나만 볼 수 있어요."
        />
      ) : null}
    </AppShell>
  );
}
