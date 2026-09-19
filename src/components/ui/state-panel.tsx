import { AlertCircle, Inbox, LoaderCircle, LockKeyhole, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type StateKind = "empty" | "error" | "forbidden" | "loading";

const icons: Record<StateKind, LucideIcon> = {
  empty: Inbox,
  error: AlertCircle,
  forbidden: LockKeyhole,
  loading: LoaderCircle,
};

interface StatePanelProps {
  kind: StateKind;
  title: string;
  description: string;
  action?: ReactNode;
}

export function StatePanel({ kind, title, description, action }: StatePanelProps) {
  const Icon = icons[kind];

  return (
    <section className="state-panel" aria-live={kind === "error" ? "assertive" : "polite"}>
      <span className={`state-panel__icon state-panel__icon--${kind}`} aria-hidden="true">
        <Icon size={24} className={kind === "loading" ? "spin" : ""} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div className="state-panel__action">{action}</div> : null}
    </section>
  );
}
