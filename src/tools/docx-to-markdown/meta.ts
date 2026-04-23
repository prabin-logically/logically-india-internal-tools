import type { ToolMeta } from "@/shared/types/tool";

export const meta: ToolMeta = {
  slug: "docx-to-markdown",
  name: "DOCX → Markdown",
  group: "Claude Utilities",
  description:
    "Convert .docx intelligence reports to Markdown + extracted images, packaged as a .zip you upload directly to Claude. Runs entirely in-browser via mammoth; preserves headings, tables, lists, emphasis, and links.",
  icon: "FileText",
  status: "stable",
  version: "1.0.0",
};
