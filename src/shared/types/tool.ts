export type ToolGroup = "LI Utilities" | "Claude Utilities";

export type ToolStatus = "stable" | "beta" | "experimental";

export interface ToolMeta {
  slug: string;
  name: string;
  group: ToolGroup;
  description: string;
  icon: string;
  status: ToolStatus;
  version: string;
}
