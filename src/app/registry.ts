import type { ToolMeta } from "@/shared/types/tool";

/**
 * Every tool registered here appears in the sidebar. Sidebar groups by
 * `meta.group` (see TOOL_CONTRACT.md) and sorts tools alphabetically
 * by `meta.name` within each group.
 */
export const registry: ToolMeta[] = [];
