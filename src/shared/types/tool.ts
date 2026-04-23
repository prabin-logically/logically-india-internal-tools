export type ToolGroup =
  | "Converters"
  | "Query Builders"
  | "Report Helpers"
  | "Text Utilities"
  | "Data Tools";

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
