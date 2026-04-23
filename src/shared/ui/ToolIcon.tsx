import { Box, FileCheck2 } from "lucide-react";

/**
 * Map of icon names (as used in tool `meta.icon`) to lucide-react components.
 * Named imports so the bundle tree-shakes — add entries here when a new tool
 * references an icon name that isn't already mapped. Unknown names fall back
 * to `Box` so a typo in meta never breaks render.
 */
const ICONS: { [name: string]: typeof Box } = {
  FileCheck2,
};

interface ToolIconProps {
  name: string;
  className?: string;
}

export function ToolIcon({ name, className }: ToolIconProps) {
  const Icon = ICONS[name] ?? Box;
  return <Icon className={className} aria-hidden />;
}
