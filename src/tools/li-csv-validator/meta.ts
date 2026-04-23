import type { ToolMeta } from "@/shared/types/tool";

export const meta: ToolMeta = {
  slug: "li-csv-validator",
  name: "LI CSV Validator",
  group: "LI-Utilities",
  description:
    "Validate and repair a CSV before ingesting into Logically Intelligence — checks columns, formats, encoding, and filename; applies only the fixes you approve.",
  icon: "FileCheck2",
  status: "beta",
  version: "0.1.0",
};
