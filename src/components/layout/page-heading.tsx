import type { ReactNode } from "react";

interface PageHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function PageHeading({ title, description, action }: PageHeadingProps) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        {description ? <p className="page-heading__description">{description}</p> : null}
      </div>
      {action ? <div className="page-heading__action">{action}</div> : null}
    </header>
  );
}
