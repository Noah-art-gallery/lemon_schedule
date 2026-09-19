import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: "article" | "section" | "div";
  tone?: "plain" | "lemon" | "leaf";
  children: ReactNode;
}

export function Card({ as: Element = "div", tone = "plain", className = "", ...props }: CardProps) {
  return <Element className={`card card--${tone} ${className}`.trim()} {...props} />;
}
