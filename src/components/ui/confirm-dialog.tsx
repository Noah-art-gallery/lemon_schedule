"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  error?: string;
  history?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  loading = false,
  error,
  history,
}: ConfirmDialogProps) {
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <Panel
      open={open}
      title={title}
      onClose={onCancel}
      onBeforeClose={() => !loading}
      initialFocusRef={cancel}
      history={history}
      className="panel--confirm"
      footer={
        <>
          <Button
            ref={cancel}
            type="button"
            variant="secondary"
            disabled={loading}
            onClick={onCancel}
          >
            취소
          </Button>
          <Button type="button" variant="danger" loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="confirm-description">{description}</p>
      {error ? (
        <p role="alert" className="field__help field__help--error">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
