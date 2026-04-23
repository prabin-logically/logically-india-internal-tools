import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { NavLink } from "react-router-dom";
import { PanelLeftClose, Search, X } from "lucide-react";
import type { ToolGroup, ToolMeta } from "@/shared/types/tool";
import { ToolIcon } from "@/shared/ui/ToolIcon";
import { cn } from "@/shared/lib/cn";
import { registry } from "./registry";

interface SidebarProps {
  open: boolean;
  onToggle: () => void;
  /** Increments when the parent wants us to focus the search input. */
  focusSearchSignal: number;
}

function groupTools(tools: ToolMeta[]): Array<[ToolGroup, ToolMeta[]]> {
  const byGroup = new Map<ToolGroup, ToolMeta[]>();
  for (const tool of tools) {
    const list = byGroup.get(tool.group) ?? [];
    list.push(tool);
    byGroup.set(tool.group, list);
  }
  for (const list of byGroup.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return [...byGroup.entries()];
}

function matchesQuery(tool: ToolMeta, q: string): boolean {
  return (
    tool.name.toLowerCase().includes(q) ||
    tool.description.toLowerCase().includes(q) ||
    tool.group.toLowerCase().includes(q)
  );
}

export function Sidebar({ open, onToggle, focusSearchSignal }: SidebarProps) {
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusSearchSignal > 0) {
      // Wait a tick so the sidebar is visible before focusing (width transition).
      requestAnimationFrame(() => {
        searchRef.current?.focus();
        searchRef.current?.select();
      });
    }
  }, [focusSearchSignal]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? registry.filter((t) => matchesQuery(t, q)) : registry),
    [q],
  );
  const groups = useMemo(() => groupTools(filtered), [filtered]);

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (search) {
        e.preventDefault();
        setSearch("");
      }
    }
  };

  return (
    <aside
      aria-hidden={!open}
      className={cn(
        "flex h-full flex-shrink-0 flex-col overflow-hidden border-r border-border bg-surface",
        "transition-[width] duration-200 ease-out",
        open ? "w-64" : "w-0",
      )}
    >
      <div className="flex h-full w-64 flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-4 pb-3 pt-4">
          <NavLink
            to="/"
            className="block rounded-md px-1 py-0.5 transition-colors duration-150 hover:bg-surface-2"
          >
            <p className="text-sm font-semibold text-text">
              Logically India
            </p>
            <p className="text-[11px] text-text-muted">Internal Tools</p>
          </NavLink>
          <button
            type="button"
            onClick={onToggle}
            aria-label="Hide sidebar"
            title="Hide sidebar (⌘\ / Ctrl+\\)"
            className="rounded-md p-1 text-text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-text"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pb-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-subtle"
              aria-hidden
            />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="Search tools"
              aria-label="Search tools"
              className={cn(
                "w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-7 text-sm text-text",
                "placeholder:text-text-subtle",
                "transition-colors duration-150 focus:border-border-strong focus:outline-none",
              )}
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  searchRef.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-text"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-auto pb-4">
          {groups.length === 0 && (
            <p className="px-4 text-xs text-text-subtle">
              {q
                ? "No tools match your search."
                : "No tools registered yet."}
            </p>
          )}
          {groups.map(([group, tools]) => (
            <div key={group} className="mb-5 first:mt-1">
              <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-subtle">
                {group}
              </p>
              <ul className="space-y-0.5">
                {tools.map((tool) => (
                  <li key={tool.slug}>
                    <NavLink
                      to={`/tools/${tool.slug}`}
                      className={({ isActive }) =>
                        cn(
                          "mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors duration-150",
                          isActive
                            ? "bg-surface-2 text-text"
                            : "text-text-muted hover:bg-surface-2 hover:text-text",
                        )
                      }
                    >
                      <ToolIcon
                        name={tool.icon}
                        className="h-4 w-4 flex-shrink-0"
                      />
                      <span className="truncate">{tool.name}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer hint */}
        <div className="border-t border-border px-4 py-2">
          <p className="text-[10px] text-text-subtle">
            <span className="font-mono">⌘K</span> search ·{" "}
            <span className="font-mono">⌘\</span> toggle
          </p>
        </div>
      </div>
    </aside>
  );
}
