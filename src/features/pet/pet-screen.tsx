"use client";

import { Leaf, Palette } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
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
import {
  demoGetPet,
  demoGetPetImage,
  demoSavePetDrawing,
  demoSaveDecorations,
  subscribeDemoTasks,
} from "@/features/tasks/demo-task-store";
import styles from "./pet-screen.module.css";

const errorText = (cause: unknown, fallback: string) =>
  cause instanceof Error ? cause.message : fallback;

export function PetScreen() {
  const { user, demo } = useAuth();
  const [pet, setPet] = useState<PetDetails | null>(demo ? demoGetPet() : null);
  const [imageUrl, setImageUrl] = useState<string | null>(demo ? demoGetPetImage() : null);
  const [loadError, setLoadError] = useState("");
  const [imageError, setImageError] = useState("");
  const [reload, setReload] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [dirty, setDirty] = useState(false);
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
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!demo) return;
    return subscribeDemoTasks(() => {
      setPet(demoGetPet());
      setImageUrl(demoGetPetImage());
    });
  }, [demo]);
  useEffect(() => {
    if (demo || !user) return;
    let active = true;
    void getPetDetails(user.id)
      .then(async (next) => {
        if (!active) return;
        setPet(next);
        setLoadError("");
        try {
          const url = await getPetDrawingUrl(next.drawingPath);
          if (active) {
            setImageUrl(url);
            setImageError("");
          }
        } catch (cause) {
          if (active) setImageError(errorText(cause, "펫 그림을 불러오지 못했어요"));
        }
      })
      .catch((cause) => {
        if (active) setLoadError(errorText(cause, "펫 정보를 불러오지 못했어요"));
      });
    return () => {
      active = false;
    };
  }, [demo, user, reload]);
  useEffect(
    () => () => {
      if (!demo && imageUrl?.startsWith("blob:")) URL.revokeObjectURL(imageUrl);
    },
    [demo, imageUrl],
  );

  function beforeClose() {
    if (pending.current) return false;
    if (dirty) {
      setDiscard(true);
      return false;
    }
    return true;
  }
  function close() {
    setDrawing(false);
    setDirty(false);
    setDiscard(false);
    setError("");
  }
  async function save(blob: Blob) {
    if (pending.current || !pet) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      if (!demo && user) {
        const result = await savePetDrawing(user.id, blob);
        setPet((current) => (current ? { ...current, drawingPath: result.drawingPath } : current));
      }
      const url = URL.createObjectURL(blob);
      if (demo) demoSavePetDrawing(url);
      setImageUrl(url);
      setImageError("");
      close();
      setNotice(demo ? "미리보기에 반영했어요" : "펫 그림을 저장했어요");
    } catch (cause) {
      setError(errorText(cause, "펫 그림을 저장하지 못했어요"));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  async function decorate(change: Partial<PetDecorations>) {
    if (pending.current || !pet) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      const next = { ...pet.decorations, ...change };
      const saved = demo ? demoSaveDecorations(next) : await savePetDecorations(next);
      setPet((current) => (current ? { ...current, decorations: saved } : current));
      setNotice(demo ? "미리보기에 반영했어요" : "꾸미기를 저장했어요");
    } catch (cause) {
      setError(errorText(cause, "꾸미기를 저장하지 못했어요"));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  const nextUnlock = [
    { points: 5, label: "레몬 노랑 붓" },
    { points: 15, label: "잎사귀 모자" },
    { points: 30, label: "햇살 정원" },
  ].find((item) => item.points > (pet?.lemonPoints ?? 0));
  return (
    <AppShell>
      <PageHeading title="펫" />
      {notice ? (
        <p className="inline-alert" role="status">
          {notice}
        </p>
      ) : null}
      {error && !drawing ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      {!pet ? (
        <StatePanel
          kind={loadError ? "error" : "loading"}
          title={loadError || "펫 불러오는 중"}
          action={
            loadError ? (
              <Button variant="secondary" onClick={() => setReload((value) => value + 1)}>
                다시 시도
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={styles.layout}>
          <section className={styles.summary} aria-label="내 펫">
            <div className={styles.appearance}>
              <div
                className={`${styles.stage} ${pet.decorations.selectedBackground === "sunny-garden" ? styles.garden : ""}`}
              >
                {pet.decorations.selectedAccessory === "leaf-hat" ? (
                  <Leaf className={styles.accessory} size={36} aria-label="잎사귀 모자" />
                ) : null}
                <Image
                  src={imageUrl || "/images/lemon-pet-default.png"}
                  alt={imageUrl ? "내 펫" : "기본 레몬 펫"}
                  width={240}
                  height={240}
                  className={styles.image}
                  unoptimized={!!imageUrl}
                  priority
                />
              </div>
              <Button
                size="lg"
                fullWidth
                onClick={() => {
                  setError("");
                  setDiscard(false);
                  setDirty(false);
                  setDrawing(true);
                }}
                disabled={saving}
              >
                <Palette size={18} aria-hidden="true" />
                새로 그리기
              </Button>
            </div>
            <div className={styles.growth}>
              <span className={styles.level}>레벨 {pet.petLevel}</span>
              <h2>
                {pet.lemonPoints}
                <span> 포인트</span>
              </h2>
              <div
                className={styles.progress}
                role="progressbar"
                aria-label="다음 레벨까지"
                aria-valuemin={0}
                aria-valuemax={5}
                aria-valuenow={pet.lemonPoints % 5}
              >
                <span style={{ width: `${((pet.lemonPoints % 5) / 5) * 100}%` }} />
              </div>
              <p>다음 레벨까지 {5 - (pet.lemonPoints % 5)}점</p>
              <p className={styles.unlock}>
                {nextUnlock
                  ? `${nextUnlock.points - pet.lemonPoints}점 더 모으면 ${nextUnlock.label}`
                  : "모든 꾸미기를 열었어요"}
              </p>
            </div>
            {imageError ? (
              <div className={styles.imageError}>
                <p role="alert" className="form-error">
                  {imageError}
                </p>
                <Button variant="ghost" onClick={() => setReload((value) => value + 1)}>
                  그림 다시 불러오기
                </Button>
              </div>
            ) : null}
          </section>
          <section className={styles.decorations} aria-labelledby="decoration-heading">
            <h2 id="decoration-heading">꾸미기</h2>
            <label className={styles.setting}>
              <span>
                <strong>그리기 붓 색상</strong>
                <small>새로 그리는 선에 적용</small>
              </span>
              <select
                className="field__input"
                aria-label="그리기 붓 색상"
                value={pet.decorations.selectedColor}
                disabled={saving}
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
            <label className={styles.setting}>
              <strong>스티커</strong>
              <select
                className="field__input"
                aria-label="스티커"
                value={pet.decorations.selectedAccessory ?? ""}
                disabled={saving}
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
            <label className={styles.setting}>
              <strong>배경</strong>
              <select
                className="field__input"
                aria-label="배경"
                value={pet.decorations.selectedBackground ?? ""}
                disabled={saving}
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
          </section>
        </div>
      )}
      <Panel
        open={drawing}
        title="펫 그리기"
        description="저장하면 기존 그림이 바뀌어요"
        onBeforeClose={beforeClose}
        onClose={close}
      >
        {error ? (
          <p role="alert" className="form-error">
            {error}
          </p>
        ) : null}
        {discard ? (
          <div className={styles.discard}>
            <p>그리던 그림을 버릴까요?</p>
            <div className="button-row">
              <Button ref={continueRef} variant="secondary" onClick={() => setDiscard(false)}>
                계속 그리기
              </Button>
              <Button variant="danger" onClick={close}>
                그림 버리기
              </Button>
            </div>
          </div>
        ) : null}
        <div ref={editorRef} hidden={discard}>
          {drawing ? (
            <PetCanvas
              onSave={save}
              onDirtyChange={setDirty}
              strokeColor={
                pet?.decorations.selectedColor === "lemon-yellow" ? "#e7a900" : "#397a4b"
              }
            />
          ) : null}
        </div>
      </Panel>
    </AppShell>
  );
}
