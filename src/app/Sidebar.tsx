import { NavLink } from "react-router-dom";
import type { ToolGroup, ToolMeta } from "@/shared/types/tool";
import { cn } from "@/shared/lib/cn";
import { registry } from "./registry";

function groupTools(tools: ToolMeta[]): Map<ToolGroup, ToolMeta[]> {
  const byGroup = new Map<ToolGroup, ToolMeta[]>();
  for (const tool of tools) {
    const list = byGroup.get(tool.group) ?? [];
    list.push(tool);
    byGroup.set(tool.group, list);
  }
  for (const list of byGroup.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return byGroup;
}

export function Sidebar() {
  const groups = groupTools(registry);
  const hasTools = registry.length > 0;

  return (
    <aside className="flex h-full w-64 flex-col border-r border-border bg-surface">
      <div className="px-6 py-6">
        <NavLink to="/" className="block">
          <p className="text-sm font-semibold text-text">
            Logically India
          </p>
          <p className="text-xs text-text-muted">Internal Tools</p>
        </NavLink>
      </div>

      <nav className="flex-1 overflow-auto px-3 pb-6">
        {!hasTools && (
          <p className="px-3 text-xs text-text-subtle">
            No tools yet. Tools added to <span className="font-mono">src/app/registry.ts</span> appear here.
          </p>
        )}
        {[...groups.entries()].map(([group, tools]) => (
          <div key={group} className="mb-6">
            <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wide text-text-subtle">
              {group}
            </p>
            <ul className="space-y-0.5">
              {tools.map((tool) => (
                <li key={tool.slug}>
                  <NavLink
                    to={`/tools/${tool.slug}`}
                    className={({ isActive }) =>
                      cn(
                        "block rounded-md px-3 py-1.5 text-sm transition-colors duration-150",
                        isActive
                          ? "bg-surface-2 text-text"
                          : "text-text-muted hover:bg-surface-2 hover:text-text",
                      )
                    }
                  >
                    {tool.name}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
