import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

export type ToolState = "idle" | "processing" | "success" | "error";

interface StateShellProps {
  state: ToolState;
  idle: ReactNode;
  processing: ReactNode;
  success: ReactNode;
  error: ReactNode;
  className?: string;
  /**
   * Minimum vertical space reserved so processing/success/error transitions
   * never cause layout shift (DESIGN.md UX law #8).
   */
  minHeight?: string;
}

export function StateShell({
  state,
  idle,
  processing,
  success,
  error,
  className,
  minHeight = "20rem",
}: StateShellProps) {
  return (
    <div
      className={cn("relative w-full", className)}
      style={{ minHeight }}
      data-state={state}
    >
      {state === "idle" && idle}
      {state === "processing" && processing}
      {state === "success" && success}
      {state === "error" && error}
    </div>
  );
}
