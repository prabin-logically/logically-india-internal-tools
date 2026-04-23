import { NavLink, useLocation } from "react-router-dom";
import { ChevronRight, PanelLeft, PanelLeftClose } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { registry } from "./registry";

interface TopBarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

function resolveCurrentLabel(pathname: string): string | null {
  if (pathname === "/") return null;
  const m = pathname.match(/^\/tools\/([^/]+)$/);
  if (m) {
    const slug = m[1];
    const tool = slug ? registry.find((t) => t.slug === slug) : undefined;
    return tool ? tool.name : "Tool not found";
  }
  return "Not found";
}

export function TopBar({ sidebarOpen, onToggleSidebar }: TopBarProps) {
  const location = useLocation();
  const current = resolveCurrentLabel(location.pathname);
  const Icon = sidebarOpen ? PanelLeftClose : PanelLeft;

  return (
    <header className="flex h-12 flex-shrink-0 items-center gap-2 border-b border-border bg-surface px-4">
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        title={`${sidebarOpen ? "Hide" : "Show"} sidebar (⌘\\ / Ctrl+\\)`}
        className="rounded-md p-1 text-text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-text"
      >
        <Icon className="h-4 w-4" />
      </button>

      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            cn(
              "rounded px-1.5 py-0.5 transition-colors duration-150",
              isActive
                ? "text-text"
                : "text-text-muted hover:text-text",
            )
          }
        >
          Home
        </NavLink>
        {current && (
          <>
            <ChevronRight
              className="h-3.5 w-3.5 text-text-subtle"
              aria-hidden
            />
            <span className="px-1.5 py-0.5 text-text">{current}</span>
          </>
        )}
      </nav>
    </header>
  );
}
