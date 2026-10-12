"use client";

import { Eraser, Pencil, Save } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";

import { Button } from "@/components/ui/button";

interface PetCanvasProps {
  onSave: (blob: Blob) => Promise<void>;
  strokeColor: string;
  onDirtyChange?: (dirty: boolean) => void;
}

export function PetCanvas({ onSave, strokeColor, onDirtyChange }: PetCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState("");
  const [tool, setTool] = useState<"brush" | "eraser">("brush");
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const bounds = canvas.getBoundingClientRect();
    canvas.width = Math.round(bounds.width * ratio);
    canvas.height = Math.round(bounds.height * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 7;
  }, []);

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    context.strokeStyle = strokeColor;
    context.globalAlpha = opacity;
    context.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    context.lineWidth = tool === "eraser" ? 22 : 7;
  }, [opacity, strokeColor, tool]);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    if (savingRef.current) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const position = point(event);
    if (!context || !position) return;
    canvas?.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    onDirtyChange?.(true);
    context.beginPath();
    context.moveTo(position.x, position.y);
    context.lineTo(position.x + 0.1, position.y + 0.1);
    context.stroke();
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || savingRef.current) return;
    const context = canvasRef.current?.getContext("2d");
    const position = point(event);
    if (!context || !position) return;
    context.lineTo(position.x, position.y);
    context.stroke();
  }

  function stop() {
    drawingRef.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    onDirtyChange?.(true);
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas || savingRef.current) return;
    savingRef.current = true;
    setError("");
    setSaving(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("그림을 준비하지 못했어요. 다시 시도해 주세요");
      await onSave(blob);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "그림을 저장하지 못했어요");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="pet-drawing">
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      <canvas
        ref={canvasRef}
        className="pet-drawing__canvas"
        aria-label="나만의 레몬 펫을 그리는 도화지"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
        onPointerLeave={stop}
      />
      <div className="pet-drawing__toolbar">
        <div className="pet-drawing__tool-group" role="group" aria-label="그리기 도구">
          <Button
            size="sm"
            variant={tool === "brush" ? "secondary" : "ghost"}
            onClick={() => setTool("brush")}
            disabled={saving}
            aria-pressed={tool === "brush"}
          >
            <Pencil size={16} aria-hidden="true" /> 펜
          </Button>
          <Button
            size="sm"
            variant={tool === "eraser" ? "secondary" : "ghost"}
            onClick={() => setTool("eraser")}
            disabled={saving}
            aria-pressed={tool === "eraser"}
          >
            <Eraser size={16} aria-hidden="true" /> 지우개
          </Button>
        </div>
        <div className="pet-drawing__opacity" role="group" aria-label="선 농도">
          <span>농도</span>
          {[0.4, 0.7, 1].map((value) => (
            <Button
              key={value}
              size="sm"
              variant={opacity === value ? "secondary" : "ghost"}
              onClick={() => setOpacity(value)}
              disabled={saving}
              aria-pressed={opacity === value}
            >
              {Math.round(value * 100)}%
            </Button>
          ))}
        </div>
      </div>
      <div className="pet-drawing__actions">
        <Button size="sm" variant="ghost" onClick={clear} disabled={saving}>
          <Eraser size={16} aria-hidden="true" /> 전체 지우기
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          <Save size={16} aria-hidden="true" /> {saving ? "저장 중…" : "펫 저장"}
        </Button>
      </div>
    </div>
  );
}
