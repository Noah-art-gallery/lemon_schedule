"use client";

import { Eraser, Save } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";

import { Button } from "@/components/ui/button";

interface PetCanvasProps {
  onSave: (blob: Blob) => Promise<void>;
  strokeColor: string;
}

export function PetCanvas({ onSave, strokeColor }: PetCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [saving, setSaving] = useState(false);

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
    if (context) context.strokeStyle = strokeColor;
  }, [strokeColor]);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const position = point(event);
    if (!context || !position) return;
    canvas?.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    context.beginPath();
    context.moveTo(position.x, position.y);
    context.lineTo(position.x + 0.1, position.y + 0.1);
    context.stroke();
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
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
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (blob) await onSave(blob);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pet-drawing">
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
      <div className="pet-drawing__actions">
        <Button size="sm" variant="ghost" onClick={clear} disabled={saving}>
          <Eraser size={16} aria-hidden="true" /> 다시 그리기
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          <Save size={16} aria-hidden="true" /> {saving ? "저장 중…" : "펫 저장"}
        </Button>
      </div>
    </div>
  );
}
