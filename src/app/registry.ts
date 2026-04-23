import type { ToolMeta } from "@/shared/types/tool";
import { meta as docxToMarkdown } from "@/tools/docx-to-markdown/meta";
import { meta as liCsvValidator } from "@/tools/li-csv-validator/meta";

/**
 * Every tool registered here appears in the sidebar. Sidebar groups by
 * `meta.group` (see TOOL_CONTRACT.md) and sorts tools alphabetically
 * by `meta.name` within each group.
 */
export const registry: ToolMeta[] = [liCsvValidator, docxToMarkdown];
