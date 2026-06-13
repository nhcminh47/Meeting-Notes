import type { PropsWithChildren } from "react";

export type SemanticVariant =
  | "neutral"
  | "ready"
  | "processing"
  | "paused"
  | "success"
  | "warning"
  | "error";

export function Badge({
  children,
  variant = "neutral",
  className = ""
}: PropsWithChildren<{ variant?: SemanticVariant; className?: string }>) {
  return (
    <span className={`badge badge--${variant} ${className}`.trim()}>{children}</span>
  );
}
