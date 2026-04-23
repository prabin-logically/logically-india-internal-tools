import type { ReactNode } from "react";
import type { ToolMeta } from "@/shared/types/tool";
import { cn } from "@/shared/lib/cn";

interface ToolShellProps {
  meta: ToolMeta;
  children: ReactNode;
  status?: ReactNode;
  className?: string;
}

export function ToolShell({ meta, children, status, className }: ToolShellProps) {
  return (
    <div className={cn("flex h-full flex-col", className)}>
      <header className="border-b border-border px-8 py-6">
        <div className="flex items-baseline gap-3 text-xs text-text-subtle">
          <span>{meta.group}</span>
          <span aria-hidden>/</span>
          <span>{meta.name}</span>
        </div>
        <h1 className="mt-2 text-xl font-semibold text-text">{meta.name}</h1>
        <p className="mt-1 text-sm text-text-muted">{meta.description}</p>
      </header>

      <main className="flex-1 overflow-auto px-8 py-6">{children}</main>

      <footer className="flex items-center justify-between border-t border-border px-8 py-3 text-xs text-text-subtle">
        <div className="flex items-center gap-3">
          <span className="font-mono">{meta.slug}</span>
          <span aria-hidden>·</span>
          <span>v{meta.version}</span>
          <span aria-hidden>·</span>
          <span>{meta.status}</span>
        </div>
        <div aria-live="polite">{status}</div>
      </footer>
    </div>
  );
}
