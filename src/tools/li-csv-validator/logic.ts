import Papa from "papaparse";

/* ──────────────────────────────────────────────────────────────────────────
 * Schema constants — the LI ingestion contract.
 * Case-sensitive where the spec demands it.
 * ────────────────────────────────────────────────────────────────────────── */

export const REQUIRED_COLUMNS = [
  "Date",
  "Time",
  "Document ID",
  "Title",
  "Hit Sentence",
  "URL",
  "Author Handle",
  "Author Name",
  "Source Type",
  "Content Type",
  "Likes",
  "Shares",
  "Views",
  "Replies",
  "Reposts",
  "Engagement",
] as const;

export const NUMERIC_COLUMNS = [
  "Likes",
  "Shares",
  "Views",
  "Replies",
  "Reposts",
  "Engagement",
] as const;

export const SOURCE_TYPES = [
  "Twitter",
  "Youtube",
  "Pinterest",
  "Facebook",
  "Twitch",
  "online_news",
  "blog",
  "forum",
  "print",
  "reddit",
  "comments",
] as const;

export const CONTENT_TYPES = [
  "reply",
  "comment",
  "forum post reply",
  "blog post",
  "forum post",
  "news article",
  "video",
  "quote",
] as const;

/**
 * Short, user-facing schema hint per column. Intended to be surfaced in the
 * UI (e.g. under each mapping dropdown) so analysts know what LI expects
 * without leaving the tool. Keep each entry one line, concrete, and aligned
 * with what the importer actually accepts.
 *
 * `requirement` values:
 *   - "required" — value must be non-blank
 *   - "optional" — blank is allowed by the LI importer
 */
export interface ColumnSchema {
  expected: string;
  requirement: "required" | "optional";
}

export const COLUMN_SCHEMA: Record<string, ColumnSchema> = {
  Date: {
    expected: "YYYY-MM-DD · e.g. 2025-09-28",
    requirement: "required",
  },
  Time: {
    expected: "HH:MM (UTC preferred) · e.g. 23:58",
    requirement: "required",
  },
  "Document ID": {
    expected: "unique string per row — leave blank and we can generate one",
    requirement: "optional",
  },
  Title: {
    expected:
      "title of the post (Facebook post captions, YouTube titles, etc.)",
    requirement: "required",
  },
  "Hit Sentence": {
    expected:
      "text of the post matching the LI boolean (captions, video descriptions, etc.)",
    requirement: "required",
  },
  URL: {
    expected: "http(s):// URL of the post",
    requirement: "required",
  },
  "Author Handle": {
    expected: "e.g. @greenallan4 · if not available, copy from Author Name",
    requirement: "required",
  },
  "Author Name": {
    expected: "e.g. Al Green · if not available, copy from Author Handle",
    requirement: "required",
  },
  "Source Type": {
    expected: `case-sensitive, one of: ${SOURCE_TYPES.join(", ")}`,
    requirement: "required",
  },
  "Content Type": {
    expected: `case-sensitive, one of: ${CONTENT_TYPES.join(", ")}`,
    requirement: "required",
  },
  Likes: { expected: "integer ≥ 0 · use 0 if N/A", requirement: "required" },
  Shares: { expected: "integer ≥ 0 · use 0 if N/A", requirement: "required" },
  Views: { expected: "integer ≥ 0 · use 0 if N/A", requirement: "required" },
  Replies: { expected: "integer ≥ 0 · use 0 if N/A", requirement: "required" },
  Reposts: { expected: "integer ≥ 0 · use 0 if N/A", requirement: "required" },
  Engagement: {
    expected: "integer ≥ 0 · use 0 if N/A",
    requirement: "required",
  },
};

/* ──────────────────────────────────────────────────────────────────────────
 * Types
 * ────────────────────────────────────────────────────────────────────────── */

export type RawRow = Record<string, string>;

export type EncodingName =
  | "utf-16le-bom"
  | "utf-16be-bom"
  | "utf-8-bom"
  | "utf-8";

export interface ParsedFile {
  rows: RawRow[];
  headers: string[];
  delimiter: string;
  encoding: EncodingName;
  byteLength: number;
  filename: string;
}

export type IssueSeverity = "auto-fix" | "manual";

export interface Issue {
  id: string;
  severity: IssueSeverity;
  category: string;
  title: string;
  detail?: string;
  affectedRows?: number[];
  affectedColumns?: string[];
  fix?: ProposedFix;
  /**
   * Presence of `matcher` + `targetColumns` signals to the UI that this
   * manual issue supports the generic bulk-fill resolver:
   *   "for each row where matcher(row) is true, set every targetColumn
   *    to either a typed constant or the value from a copy-from column."
   * The matcher is evaluated at apply time on the current row state, so
   * earlier fixes in the pipeline can freely mutate rows without breaking
   * the matcher's contract (as long as the target column keeps its
   * canonical name).
   */
  matcher?: RowMatcher;
  targetColumns?: string[];
}

export type RowMatcher = (row: RawRow) => boolean;

export interface BulkFillResolution {
  constant?: string;
  copyFrom?: string;
}

export interface ProposedFix {
  id: string;
  label: string;
  description: string;
  apply: (rows: RawRow[], headers: string[]) => FixResult;
}

export interface FixResult {
  rows: RawRow[];
  headers: string[];
  changeCount: number;
  detail: string;
}

export interface ValidationResult {
  issues: Issue[];
  rowCount: number;
  columnCount: number;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Encoding — detect, decode, encode as UTF-16 LE BOM (the LI requirement).
 *
 * TextEncoder only supports UTF-8, so the UTF-16 LE path is hand-rolled.
 * charCodeAt returns UTF-16 code units directly — surrogate pairs are
 * preserved for non-BMP characters.
 * ────────────────────────────────────────────────────────────────────────── */

export function detectEncoding(buf: ArrayBuffer): EncodingName {
  const bytes = new Uint8Array(buf);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return "utf-16le-bom";
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return "utf-16be-bom";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    return "utf-8-bom";
  }
  return "utf-8";
}

export function decodeBuffer(buf: ArrayBuffer, encoding: EncodingName): string {
  const bytes = new Uint8Array(buf);
  switch (encoding) {
    case "utf-16le-bom":
      return new TextDecoder("utf-16le").decode(bytes.subarray(2));
    case "utf-16be-bom":
      return new TextDecoder("utf-16be").decode(bytes.subarray(2));
    case "utf-8-bom":
      return new TextDecoder("utf-8").decode(bytes.subarray(3));
    case "utf-8":
      return new TextDecoder("utf-8").decode(bytes);
  }
}

export function encodeUtf16LeBom(str: string): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(2 + str.length * 2);
  const out = new Uint8Array(buf);
  out[0] = 0xff;
  out[1] = 0xfe;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    out[2 + i * 2] = code & 0xff;
    out[3 + i * 2] = (code >> 8) & 0xff;
  }
  return out;
}

/* ──────────────────────────────────────────────────────────────────────────
 * CSV parse / serialize via papaparse. Header row is required.
 * ────────────────────────────────────────────────────────────────────────── */

export interface ParseError {
  message: string;
  row?: number;
}

export function parseCsvString(text: string): {
  rows: RawRow[];
  headers: string[];
  delimiter: string;
  errors: ParseError[];
} {
  const result = Papa.parse<RawRow>(text, {
    header: true,
    skipEmptyLines: "greedy",
  });
  const headers = (result.meta.fields ?? []).map((h) => h);
  const rows: RawRow[] = result.data.map((row) => {
    const normalized: RawRow = {};
    for (const h of headers) {
      const v = row[h];
      normalized[h] = v == null ? "" : String(v);
    }
    return normalized;
  });
  const errors: ParseError[] = result.errors.map((e) => ({
    message: e.message,
    ...(typeof e.row === "number" ? { row: e.row } : {}),
  }));
  return {
    rows,
    headers,
    delimiter: result.meta.delimiter,
    errors,
  };
}

export function serializeCsvString(rows: RawRow[], headers: string[]): string {
  return Papa.unparse(
    {
      fields: headers.slice(),
      data: rows.map((r) =>
        headers.map((h) => {
          const v = r[h];
          return v == null ? "" : v;
        }),
      ),
    },
    { newline: "\r\n" },
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Monitor ID and filename helpers.
 * ────────────────────────────────────────────────────────────────────────── */

const UUID_STRICT_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONITOR_URL_RE =
  /\/monitors\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export function extractMonitorId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(MONITOR_URL_RE);
  if (urlMatch && urlMatch[1]) return urlMatch[1].toLowerCase();
  if (UUID_STRICT_RE.test(trimmed)) return trimmed.toLowerCase();
  return null;
}

export function sanitizeFilenameSuffix(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "upload";
}

export function buildFilename(monitorId: string, suffix: string): string {
  return `${monitorId}_${sanitizeFilenameSuffix(suffix)}.csv`;
}

export function defaultFilenameSuffix(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  return `${y}${m}${d}_${hh}${mm}_UTC`;
}

export function hasMonitorIdPrefix(filename: string, monitorId: string): boolean {
  return filename.toLowerCase().startsWith(`${monitorId.toLowerCase()}_`);
}

/* ──────────────────────────────────────────────────────────────────────────
 * Field predicates / parsers.
 * ────────────────────────────────────────────────────────────────────────── */

function toLine(dataRowIdx: number): number {
  return dataRowIdx + 2; // +1 for 1-indexing, +1 for header line
}

function isBlank(v: string): boolean {
  return v == null || v.trim() === "";
}

function isBlankish(v: string): boolean {
  if (isBlank(v)) return true;
  const t = v.trim().toLowerCase();
  return t === "n/a" || t === "na" || t === "null" || t === "none";
}

function isStrictDate(v: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !isNaN(d.getTime()) && v === d.toISOString().slice(0, 10);
}

function isStrictTime(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

function isNonNegInt(v: string): boolean {
  return /^(0|[1-9]\d*)$/.test(v);
}

function isValidUrl(v: string): boolean {
  if (isBlank(v)) return false;
  try {
    const u = new URL(v.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Try to split an ISO-ish datetime into a (date, time) tuple where date is
 * YYYY-MM-DD and time is HH:MM. Only accepts unambiguous ISO forms where the
 * date is YYYY-MM-DD leading. Returns null if it can't.
 */
function tryIsoSplit(v: string): { date: string; time: string } | null {
  const m = v
    .trim()
    .match(
      /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/,
    );
  if (!m) return null;
  const datePart = m[1];
  if (!datePart || !isStrictDate(datePart)) return null;
  const hh = m[2];
  const mm = m[3];
  if (!hh || !mm) return null;
  const time = `${hh}:${mm}`;
  if (!isStrictTime(time)) return null;
  return { date: datePart, time };
}

/**
 * Try to convert DD/MM/YYYY or MM/DD/YYYY only when unambiguous.
 * - If the first number > 12, it must be DD/MM/YYYY.
 * - If the second number > 12, it must be MM/DD/YYYY.
 * - Otherwise returns null (ambiguous).
 */
function tryUnambiguousSlashDate(v: string): string | null {
  const m = v.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (!m || !m[1] || !m[2] || !m[3]) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const y = Number(m[3]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(y)) {
    return null;
  }
  let day: number | null = null;
  let mon: number | null = null;
  if (a > 12 && b >= 1 && b <= 12) {
    day = a;
    mon = b;
  } else if (b > 12 && a >= 1 && a <= 12) {
    day = b;
    mon = a;
  } else {
    return null;
  }
  const iso = `${y}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isStrictDate(iso) ? iso : null;
}

/**
 * Try to normalize a time string into HH:MM.
 * Accepts: HH:MM:SS, H:MM, 12-hour with AM/PM, ISO datetime.
 */
function tryNormalizeTime(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  if (isStrictTime(t)) return t;

  // Strip seconds: HH:MM:SS → HH:MM
  const hms = t.match(/^([01]?\d|2[0-3]):([0-5]\d):[0-5]\d$/);
  if (hms && hms[1] && hms[2]) {
    const h = hms[1].padStart(2, "0");
    return `${h}:${hms[2]}`;
  }

  // 12h AM/PM
  const ampm = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])$/);
  if (ampm && ampm[1] && ampm[2] && ampm[3]) {
    let h = Number(ampm[1]);
    const m = Number(ampm[2]);
    const isPm = ampm[3].toUpperCase() === "PM";
    if (h < 1 || h > 12 || m < 0 || m > 59) return null;
    if (h === 12) h = isPm ? 12 : 0;
    else if (isPm) h += 12;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  // ISO datetime → extract HH:MM
  const iso = tryIsoSplit(t);
  if (iso) return iso.time;

  // H:MM (single-digit hour)
  const short = t.match(/^(\d):([0-5]\d)$/);
  if (short && short[1] && short[2]) {
    return `${short[1].padStart(2, "0")}:${short[2]}`;
  }

  return null;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Header normalization — find case/whitespace-insensitive matches for the
 * required schema. Returns a rename map for columns that need it.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Normalize a column header for case/whitespace/camelCase/snake_case/kebab
 * insensitivity. Two headers normalize to the same key iff they're "the
 * same thing" in spirit: `Hit Sentence`, `hit_sentence`, `hitSentence`,
 * `Hit-Sentence`, `HIT.SENTENCE` all map to `hit sentence`.
 */
function normalizeHeaderKey(h: string): string {
  return h
    .trim()
    // Insert a space before a capital that follows a lowercase letter
    // (camelCase → camel Case).
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    // ...and between a letter+digit or digit+letter pair.
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    // Treat separators as spaces.
    .replace(/[_\-.]+/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface HeaderAnalysis {
  renames: Record<string, string>;
  missingRequired: string[];
  extraColumns: string[];
  hasUnresolvedAmbiguity: boolean;
}

export function analyzeHeaders(headers: string[]): HeaderAnalysis {
  const present = new Set(headers);
  const normalizedMap = new Map<string, string[]>();
  for (const h of headers) {
    const k = normalizeHeaderKey(h);
    const list = normalizedMap.get(k) ?? [];
    list.push(h);
    normalizedMap.set(k, list);
  }

  const renames: Record<string, string> = {};
  const matchedRequired = new Set<string>();
  let hasUnresolvedAmbiguity = false;

  for (const required of REQUIRED_COLUMNS) {
    if (present.has(required)) {
      matchedRequired.add(required);
      continue;
    }
    const k = normalizeHeaderKey(required);
    const candidates = normalizedMap.get(k);
    if (!candidates) continue;
    if (candidates.length > 1) {
      hasUnresolvedAmbiguity = true;
      continue;
    }
    const source = candidates[0];
    if (source && source !== required) {
      renames[source] = required;
      matchedRequired.add(required);
    }
  }

  const missingRequired = (REQUIRED_COLUMNS as readonly string[]).filter(
    (c) => !matchedRequired.has(c),
  );

  const postRenameSet = new Set(
    headers.map((h) => (renames[h] !== undefined ? renames[h] : h)),
  );
  const extraColumns = [...postRenameSet].filter(
    (h) => !(REQUIRED_COLUMNS as readonly string[]).includes(h),
  );

  return { renames, missingRequired, extraColumns, hasUnresolvedAmbiguity };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Validation — produces Issue[] from rows.
 *
 * We validate AFTER header renames are applied, so the rest of the rules
 * can assume required columns are present or absent by canonical name.
 * ────────────────────────────────────────────────────────────────────────── */

export function validate(rows: RawRow[], headers: string[]): ValidationResult {
  const analysis = analyzeHeaders(headers);
  const issues: Issue[] = [];

  /* ---- Structural: header rename, missing, extras ---- */
  if (Object.keys(analysis.renames).length > 0) {
    const pairs = Object.entries(analysis.renames);
    issues.push({
      id: "headers-rename",
      severity: "auto-fix",
      category: "Columns",
      title: `Rename ${pairs.length} header${pairs.length === 1 ? "" : "s"} to the LI schema`,
      detail: pairs.map(([from, to]) => `"${from}" → "${to}"`).join(", "),
      fix: makeRenameHeadersFix(analysis.renames),
    });
  }

  if (analysis.hasUnresolvedAmbiguity) {
    issues.push({
      id: "headers-ambiguous",
      severity: "manual",
      category: "Columns",
      title: "Ambiguous columns — multiple headers map to the same LI column",
      detail:
        "Two or more of your columns reduce to the same name after normalizing case and whitespace. Please rename them yourself so the mapping is unambiguous.",
    });
  }

  // Compute post-rename headers for the rest of validation.
  const effectiveHeaders = headers.map((h) =>
    analysis.renames[h] !== undefined ? analysis.renames[h]! : h,
  );
  const effectiveRows = rows.map((r) => {
    const out: RawRow = {};
    for (const h of headers) {
      const canonical =
        analysis.renames[h] !== undefined ? analysis.renames[h]! : h;
      out[canonical] = r[h] ?? "";
    }
    return out;
  });

  // One issue per missing required column — each gets its own resolver
  // row so the user can pick a different action (constant / copy-from /
  // delete-rows) per column.
  for (const missingCol of analysis.missingRequired) {
    issues.push({
      id: `missing:${missingCol}`,
      severity: "manual",
      category: missingCol,
      title: `${missingCol} — column missing`,
      detail: `${missingCol} isn't present in the uploaded CSV.`,
      affectedColumns: [missingCol],
      // Matcher runs at apply time on whatever row state exists. A missing
      // column means every row "needs" a value — matcher matches all rows.
      matcher: () => true,
      targetColumns: [missingCol],
    });
  }

  if (analysis.extraColumns.length > 0) {
    issues.push({
      id: "columns-extra",
      severity: "auto-fix",
      category: "Columns",
      title: `${analysis.extraColumns.length} extra column${analysis.extraColumns.length === 1 ? "" : "s"} not in the LI schema`,
      detail: `Extra: ${analysis.extraColumns.join(", ")}.`,
      affectedColumns: analysis.extraColumns,
      fix: makeDropColumnsFix(analysis.extraColumns),
    });
  }

  /* ---- Cell-level: only for columns that actually exist post-rename ---- */
  const has = (col: string) => effectiveHeaders.includes(col);

  if (has("Date")) {
    issues.push(...checkDateColumn(effectiveRows));
  }
  if (has("Time")) {
    issues.push(...checkTimeColumn(effectiveRows));
  }
  if (has("Source Type")) {
    issues.push(
      ...checkEnumColumn(
        effectiveRows,
        "Source Type",
        SOURCE_TYPES as readonly string[],
        "source-type",
      ),
    );
  }
  if (has("Content Type")) {
    issues.push(
      ...checkEnumColumn(
        effectiveRows,
        "Content Type",
        CONTENT_TYPES as readonly string[],
        "content-type",
      ),
    );
  }
  const presentNumericCols = (NUMERIC_COLUMNS as readonly string[]).filter(
    (c) => effectiveHeaders.includes(c),
  );
  if (presentNumericCols.length > 0) {
    issues.push(...checkNumericColumns(effectiveRows, presentNumericCols));
  }
  if (has("Author Handle") && has("Author Name")) {
    issues.push(...checkAuthorColumns(effectiveRows));
  }
  if (has("Document ID")) {
    issues.push(...checkDocumentIdColumn(effectiveRows));
  }
  if (has("URL")) {
    issues.push(...checkUrlColumn(effectiveRows));
  }
  if (has("Title")) {
    issues.push(...checkRequiredTextColumn(effectiveRows, "Title"));
  }
  if (has("Hit Sentence")) {
    issues.push(...checkRequiredTextColumn(effectiveRows, "Hit Sentence"));
  }

  /* ---- Whitespace sweep (one global fix) ---- */
  const whitespaceCount = countWhitespaceIssues(effectiveRows, effectiveHeaders);
  if (whitespaceCount > 0) {
    issues.push({
      id: "whitespace",
      severity: "auto-fix",
      category: "Whitespace",
      title: `${whitespaceCount} cell${whitespaceCount === 1 ? "" : "s"} with leading/trailing whitespace`,
      fix: makeTrimWhitespaceFix(),
    });
  }

  return {
    issues,
    rowCount: rows.length,
    columnCount: headers.length,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Per-column checks.
 * ────────────────────────────────────────────────────────────────────────── */

function checkDateColumn(rows: RawRow[]): Issue[] {
  const splittable: number[] = [];
  const inferrable: number[] = [];
  const ambiguous: Array<{ line: number; value: string }> = [];
  const invalid: Array<{ line: number; value: string }> = [];

  rows.forEach((r, i) => {
    const v = r["Date"] ?? "";
    if (isStrictDate(v)) return;
    if (isBlank(v)) {
      invalid.push({ line: toLine(i), value: "(blank)" });
      return;
    }
    if (tryIsoSplit(v)) {
      splittable.push(toLine(i));
      return;
    }
    if (tryUnambiguousSlashDate(v)) {
      inferrable.push(toLine(i));
      return;
    }
    // Ambiguous DD/MM vs MM/DD
    if (/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.test(v.trim())) {
      ambiguous.push({ line: toLine(i), value: v });
      return;
    }
    invalid.push({ line: toLine(i), value: v });
  });

  const issues: Issue[] = [];

  if (splittable.length > 0) {
    issues.push({
      id: "date-iso-split",
      severity: "auto-fix",
      category: "Date",
      title: `${splittable.length} Date value${splittable.length === 1 ? "" : "s"} contain an ISO datetime (date + time)`,
      detail: `Split each into the Date column (YYYY-MM-DD) and the Time column (HH:MM, UTC) — examples at line${splittable.length === 1 ? "" : "s"} ${previewLines(splittable)}.`,
      affectedRows: splittable,
      fix: makeSplitIsoDateTimeFix(),
    });
  }
  if (inferrable.length > 0) {
    issues.push({
      id: "date-infer-unambiguous",
      severity: "auto-fix",
      category: "Date",
      title: `${inferrable.length} Date value${inferrable.length === 1 ? "" : "s"} in DD/MM/YYYY or MM/DD/YYYY with unambiguous day`,
      detail: `Convert to YYYY-MM-DD. Applied only when one position is > 12, so the day vs month order is unambiguous — lines ${previewLines(inferrable)}.`,
      affectedRows: inferrable,
      fix: makeInferUnambiguousDateFix(),
    });
  }
  if (ambiguous.length > 0) {
    issues.push({
      id: "date-ambiguous",
      severity: "manual",
      category: "Date",
      title: `${ambiguous.length} Date value${ambiguous.length === 1 ? "" : "s"} are ambiguous (can't tell DD/MM from MM/DD)`,
      detail: `Fix these yourself and re-upload. Examples: ${ambiguous
        .slice(0, 5)
        .map((x) => `line ${x.line}: "${x.value}"`)
        .join("; ")}${ambiguous.length > 5 ? "…" : ""}.`,
      affectedRows: ambiguous.map((x) => x.line),
    });
  }
  if (invalid.length > 0) {
    issues.push({
      id: "date-invalid",
      severity: "manual",
      category: "Date",
      title: `${invalid.length} Date value${invalid.length === 1 ? "" : "s"} unparseable`,
      detail: `Examples: ${invalid
        .slice(0, 5)
        .map((x) => `line ${x.line}: "${x.value}"`)
        .join("; ")}${invalid.length > 5 ? "…" : ""}.`,
      affectedRows: invalid.map((x) => x.line),
      matcher: (row: RawRow) => {
        const v = row["Date"] ?? "";
        if (isStrictDate(v)) return false;
        if (tryIsoSplit(v)) return false;
        if (tryUnambiguousSlashDate(v)) return false;
        // Exclude ambiguous-slash — that's a separate (truly manual) issue.
        if (/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.test(v.trim())) {
          return false;
        }
        return true;
      },
      targetColumns: ["Date"],
    });
  }

  return issues;
}

function checkTimeColumn(rows: RawRow[]): Issue[] {
  const normalizable: number[] = [];
  const invalid: Array<{ line: number; value: string }> = [];

  rows.forEach((r, i) => {
    const v = r["Time"] ?? "";
    if (isStrictTime(v)) return;
    if (isBlank(v)) {
      invalid.push({ line: toLine(i), value: "(blank)" });
      return;
    }
    if (tryNormalizeTime(v) !== null) {
      normalizable.push(toLine(i));
      return;
    }
    invalid.push({ line: toLine(i), value: v });
  });

  const issues: Issue[] = [];
  if (normalizable.length > 0) {
    issues.push({
      id: "time-normalize",
      severity: "auto-fix",
      category: "Time",
      title: `${normalizable.length} Time value${normalizable.length === 1 ? "" : "s"} not in HH:MM`,
      detail: `Normalize from HH:MM:SS, 12-hour AM/PM, or ISO datetime — lines ${previewLines(normalizable)}.`,
      affectedRows: normalizable,
      fix: makeNormalizeTimeFix(),
    });
  }
  if (invalid.length > 0) {
    issues.push({
      id: "time-invalid",
      severity: "manual",
      category: "Time",
      title: `${invalid.length} Time value${invalid.length === 1 ? "" : "s"} unparseable`,
      detail: `Examples: ${invalid
        .slice(0, 5)
        .map((x) => `line ${x.line}: "${x.value}"`)
        .join("; ")}${invalid.length > 5 ? "…" : ""}.`,
      affectedRows: invalid.map((x) => x.line),
      matcher: (row: RawRow) => {
        const v = row["Time"] ?? "";
        if (isStrictTime(v)) return false;
        if (tryNormalizeTime(v) !== null) return false;
        return true;
      },
      targetColumns: ["Time"],
    });
  }
  return issues;
}

function checkEnumColumn(
  rows: RawRow[],
  column: string,
  allowlist: readonly string[],
  kind: "source-type" | "content-type",
): Issue[] {
  const caseMap = new Map<string, string>();
  for (const v of allowlist) caseMap.set(v.toLowerCase(), v);

  const caseFixable: number[] = [];
  const unknownByValue = new Map<string, number[]>();
  const blank: number[] = [];

  rows.forEach((r, i) => {
    const v = r[column] ?? "";
    if ((allowlist as readonly string[]).includes(v)) return;
    if (isBlank(v)) {
      blank.push(toLine(i));
      return;
    }
    const ci = caseMap.get(v.trim().toLowerCase());
    if (ci !== undefined) {
      caseFixable.push(toLine(i));
      return;
    }
    const list = unknownByValue.get(v) ?? [];
    list.push(toLine(i));
    unknownByValue.set(v, list);
  });

  const issues: Issue[] = [];
  if (caseFixable.length > 0) {
    issues.push({
      id: `${kind}-case`,
      severity: "auto-fix",
      category: column,
      title: `${caseFixable.length} ${column} value${caseFixable.length === 1 ? "" : "s"} have wrong case`,
      detail: `Case-normalize to the allowed spelling — ${column} is case-sensitive in LI. Lines ${previewLines(caseFixable)}.`,
      affectedRows: caseFixable,
      fix: makeCaseNormalizeEnumFix(column, allowlist, kind),
    });
  }

  // One issue per unique bad value — each gets its own resolver row in the
  // UI so different bad values can be mapped to different replacements.
  for (const [value, lines] of unknownByValue.entries()) {
    issues.push({
      id: `${kind}-unknown:${value}`,
      severity: "manual",
      category: column,
      title: `${lines.length} row${lines.length === 1 ? "" : "s"} with value "${value}" (not in allowed list)`,
      detail: `Allowed: ${allowlist.join(", ")}. Lines ${previewLines(lines)}.`,
      affectedRows: lines,
      matcher: (row: RawRow) => (row[column] ?? "") === value,
      targetColumns: [column],
    });
  }

  if (blank.length > 0) {
    issues.push({
      id: `${kind}-blank`,
      severity: "manual",
      category: column,
      title: `${blank.length} row${blank.length === 1 ? "" : "s"} with blank ${column}`,
      detail: `${column} is required. Lines ${previewLines(blank)}.`,
      affectedRows: blank,
      matcher: (row: RawRow) => isBlank(row[column] ?? ""),
      targetColumns: [column],
    });
  }
  return issues;
}

function checkNumericColumns(
  rows: RawRow[],
  presentCols: readonly string[],
): Issue[] {
  const blankishByCol: Record<string, number[]> = {};
  const invalidByCol: Record<string, Array<{ line: number; value: string }>> =
    {};

  for (const col of presentCols) {
    blankishByCol[col] = [];
    invalidByCol[col] = [];
  }

  rows.forEach((r, i) => {
    for (const col of presentCols) {
      const v = r[col] ?? "";
      if (isNonNegInt(v)) continue;
      if (isBlankish(v)) {
        blankishByCol[col]!.push(toLine(i));
      } else {
        invalidByCol[col]!.push({ line: toLine(i), value: v });
      }
    }
  });

  const issues: Issue[] = [];
  const totalBlankish = Object.values(blankishByCol).reduce(
    (n, l) => n + l.length,
    0,
  );
  if (totalBlankish > 0) {
    const breakdown = Object.entries(blankishByCol)
      .filter(([, l]) => l.length > 0)
      .map(([c, l]) => `${c}: ${l.length}`)
      .join(", ");
    issues.push({
      id: "numeric-blank",
      severity: "auto-fix",
      category: "Engagement",
      title: `${totalBlankish} engagement cell${totalBlankish === 1 ? "" : "s"} blank / N/A / null`,
      detail: `Replace with 0. ${breakdown}.`,
      fix: makeZeroBlankNumericFix(presentCols),
    });
  }

  for (const col of presentCols) {
    const inv = invalidByCol[col]!;
    if (inv.length === 0) continue;
    const samples = inv
      .slice(0, 5)
      .map((x) => `line ${x.line}: "${x.value}"`)
      .join("; ");
    issues.push({
      id: `numeric-invalid-${col.toLowerCase()}`,
      severity: "manual",
      category: "Engagement",
      title: `${inv.length} ${col} value${inv.length === 1 ? "" : "s"} not a non-negative integer`,
      detail: `Decimals, negatives, and other non-integer values. Examples: ${samples}${inv.length > 5 ? "…" : ""}.`,
      affectedRows: inv.map((x) => x.line),
      matcher: (row: RawRow) => {
        const v = row[col] ?? "";
        return !isNonNegInt(v) && !isBlankish(v);
      },
      targetColumns: [col],
    });
  }

  return issues;
}

function checkAuthorColumns(rows: RawRow[]): Issue[] {
  const fallbackRows: number[] = [];
  const bothBlank: number[] = [];

  rows.forEach((r, i) => {
    const handle = r["Author Handle"] ?? "";
    const name = r["Author Name"] ?? "";
    const handleBlank = isBlank(handle);
    const nameBlank = isBlank(name);
    if (handleBlank && nameBlank) bothBlank.push(toLine(i));
    else if (handleBlank || nameBlank) fallbackRows.push(toLine(i));
  });

  const issues: Issue[] = [];
  if (fallbackRows.length > 0) {
    issues.push({
      id: "author-fallback",
      severity: "auto-fix",
      category: "Author",
      title: `${fallbackRows.length} row${fallbackRows.length === 1 ? "" : "s"} missing Author Handle or Author Name`,
      detail: `Copy the non-blank value into the blank one per the LI spec. Lines ${previewLines(fallbackRows)}.`,
      affectedRows: fallbackRows,
      fix: makeCopyAuthorFallbackFix(),
    });
  }
  if (bothBlank.length > 0) {
    issues.push({
      id: "author-both-blank",
      severity: "manual",
      category: "Author",
      title: `${bothBlank.length} row${bothBlank.length === 1 ? "" : "s"} with both Author Handle and Author Name blank`,
      detail: `Per LI spec, pick one value (or another column's value) that will be written to both Author Handle and Author Name on these rows. Lines ${previewLines(bothBlank)}.`,
      affectedRows: bothBlank,
      matcher: (row: RawRow) =>
        isBlank(row["Author Handle"] ?? "") &&
        isBlank(row["Author Name"] ?? ""),
      targetColumns: ["Author Handle", "Author Name"],
    });
  }
  return issues;
}

function checkDocumentIdColumn(rows: RawRow[]): Issue[] {
  const blank: number[] = [];
  const seen = new Map<string, number[]>();

  rows.forEach((r, i) => {
    const v = (r["Document ID"] ?? "").trim();
    if (v === "") {
      blank.push(toLine(i));
      return;
    }
    const list = seen.get(v) ?? [];
    list.push(toLine(i));
    seen.set(v, list);
  });

  const duplicates = [...seen.entries()].filter(
    ([, lines]) => lines.length > 1,
  );

  const issues: Issue[] = [];
  if (blank.length > 0) {
    issues.push({
      id: "docid-blank",
      severity: "auto-fix",
      category: "Document ID",
      title: `${blank.length} row${blank.length === 1 ? "" : "s"} missing Document ID`,
      detail: `Blank Document IDs are allowed by LI, but you can optionally generate UUIDs for uniqueness. This fix is opt-in.`,
      affectedRows: blank,
      fix: makeGenerateDocumentIdsFix(),
    });
  }
  if (duplicates.length > 0) {
    const sample = duplicates
      .slice(0, 3)
      .map(([id, lines]) => `"${id}" on lines ${lines.join(", ")}`)
      .join("; ");
    issues.push({
      id: "docid-duplicate",
      severity: "manual",
      category: "Document ID",
      title: `${duplicates.length} Document ID${duplicates.length === 1 ? "" : "s"} duplicated across multiple rows`,
      detail: `Document IDs must be unique when present. Fix these yourself rather than have the tool choose which row keeps the ID. Examples: ${sample}${duplicates.length > 3 ? "…" : ""}.`,
      affectedRows: duplicates.flatMap(([, lines]) => lines),
    });
  }
  return issues;
}

function checkUrlColumn(rows: RawRow[]): Issue[] {
  const bad: Array<{ line: number; value: string }> = [];
  rows.forEach((r, i) => {
    const v = r["URL"] ?? "";
    if (!isValidUrl(v)) bad.push({ line: toLine(i), value: v || "(blank)" });
  });
  if (bad.length === 0) return [];
  const samples = bad
    .slice(0, 5)
    .map((x) => `line ${x.line}: "${x.value}"`)
    .join("; ");
  return [
    {
      id: "url-invalid",
      severity: "manual",
      category: "URL",
      title: `${bad.length} URL value${bad.length === 1 ? "" : "s"} blank or malformed`,
      detail: `URL must be http(s). Examples: ${samples}${bad.length > 5 ? "…" : ""}.`,
      affectedRows: bad.map((x) => x.line),
      matcher: (row: RawRow) => !isValidUrl(row["URL"] ?? ""),
      targetColumns: ["URL"],
    },
  ];
}

function checkRequiredTextColumn(rows: RawRow[], column: string): Issue[] {
  const blank: number[] = [];
  rows.forEach((r, i) => {
    if (isBlank(r[column] ?? "")) blank.push(toLine(i));
  });
  if (blank.length === 0) return [];
  return [
    {
      id: `text-blank-${column.toLowerCase().replace(/\s+/g, "-")}`,
      severity: "manual",
      category: column,
      title: `${blank.length} ${column} cell${blank.length === 1 ? "" : "s"} blank`,
      detail: `${column} is required. Lines ${previewLines(blank)}.`,
      affectedRows: blank,
      matcher: (row: RawRow) => isBlank(row[column] ?? ""),
      targetColumns: [column],
    },
  ];
}

function countWhitespaceIssues(rows: RawRow[], headers: string[]): number {
  let n = 0;
  for (const r of rows) {
    for (const h of headers) {
      const v = r[h];
      if (typeof v === "string" && v !== v.trim()) n++;
    }
  }
  return n;
}

function previewLines(lines: number[], max = 5): string {
  if (lines.length <= max) return lines.join(", ");
  return `${lines.slice(0, max).join(", ")}, +${lines.length - max} more`;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Fix factories — each returns a ProposedFix with a pure apply() that
 * produces a new (rows, headers) snapshot plus a change count and a
 * human-readable detail for the post-fix summary.
 * ────────────────────────────────────────────────────────────────────────── */

export function makeRenameHeadersFix(
  renames: Record<string, string>,
  opts: { id?: string; label?: string } = {},
): ProposedFix {
  const pairs = Object.entries(renames);
  const id = opts.id ?? "headers-rename";
  const label = opts.label ?? "Rename headers";
  return {
    id,
    label,
    description: `Rename ${pairs.length} header${pairs.length === 1 ? "" : "s"}`,
    apply: (rows, headers) => {
      // Only apply renames whose source header still exists in the current
      // (possibly-already-modified) header list — this makes the fix safe
      // to compose with other fixes that reorder or rename columns.
      const effective = pairs.filter(([from]) => headers.includes(from));
      const renameMap = Object.fromEntries(effective);
      const newHeaders = headers.map((h) => renameMap[h] ?? h);
      const newRows = rows.map((r) => {
        const out: RawRow = {};
        for (const h of headers) {
          const canonical = renameMap[h] ?? h;
          out[canonical] = r[h] ?? "";
        }
        return out;
      });
      return {
        rows: newRows,
        headers: newHeaders,
        changeCount: effective.length,
        detail:
          effective.length === 0
            ? "No-op (source headers no longer present)"
            : effective.map(([f, t]) => `"${f}" → "${t}"`).join(", "),
      };
    },
  };
}

export const BULK_FILL_FIX_ID_PREFIX = "bulkfill:";

/**
 * Generic "for each row where matcher() is true, set every targetColumn to
 * either a constant or a per-row copy of another column" fix. Used by
 * every manual issue that supports in-tool resolution. The matcher is
 * captured at validation time; the resolution comes from the user. Both
 * `constant` and `copyFrom` are optional — if neither is meaningful,
 * returns `null` so callers can skip.
 */
export function makeBulkFillFix(
  issueId: string,
  matcher: RowMatcher,
  targetColumns: string[],
  resolution: BulkFillResolution,
  opts: { label?: string } = {},
): ProposedFix | null {
  const constant =
    resolution.constant !== undefined ? resolution.constant.trim() : "";
  const copyFrom = (resolution.copyFrom ?? "").trim();
  const useConstant = constant !== "";
  const useCopyFrom = !useConstant && copyFrom !== "";
  if (!useConstant && !useCopyFrom) return null;

  const id = `${BULK_FILL_FIX_ID_PREFIX}${issueId}`;
  const label = opts.label ?? `Bulk fill ${targetColumns.join(" + ")}`;
  const description = useConstant
    ? `Set ${targetColumns.join(", ")} = "${constant}" on every matching row`
    : `Copy "${copyFrom}" into ${targetColumns.join(", ")} on every matching row`;

  return {
    id,
    label,
    description,
    apply: (rows, headers) => {
      const newHeaders = [...headers];
      for (const col of targetColumns) {
        if (!newHeaders.includes(col)) newHeaders.push(col);
      }
      let changed = 0;
      const newRows = rows.map((r) => {
        if (!matcher(r)) return r;
        const out: RawRow = { ...r };
        const value = useConstant ? constant : (r[copyFrom] ?? "").trim();
        for (const col of targetColumns) out[col] = value;
        changed++;
        return out;
      });
      const detail = useConstant
        ? `Set ${targetColumns.join(", ")} = "${constant}" in ${changed} row${changed === 1 ? "" : "s"}`
        : `Copied "${copyFrom}" → ${targetColumns.join(", ")} in ${changed} row${changed === 1 ? "" : "s"}`;
      return {
        rows: newRows,
        headers: newHeaders,
        changeCount: changed,
        detail,
      };
    },
  };
}

/**
 * User chose to drop the rows that match this issue's matcher from the
 * output CSV entirely. Used when there's no sensible value to backfill
 * (e.g., a row with no author AND no meaningful content).
 */
export function makeDeleteRowsFix(
  issueId: string,
  matcher: RowMatcher,
  opts: { label?: string } = {},
): ProposedFix {
  const id = `${BULK_FILL_FIX_ID_PREFIX}delete:${issueId}`;
  const label = opts.label ?? "Delete matching rows";
  return {
    id,
    label,
    description: "Remove rows matching this issue from the output CSV",
    apply: (rows, headers) => {
      const before = rows.length;
      const kept = rows.filter((r) => !matcher(r));
      const removed = before - kept.length;
      return {
        rows: kept,
        headers,
        changeCount: removed,
        detail: `Deleted ${removed} row${removed === 1 ? "" : "s"}`,
      };
    },
  };
}

function makeDropColumnsFix(columns: string[]): ProposedFix {
  return {
    id: "columns-drop",
    label: "Drop extra columns",
    description: `Drop ${columns.length} extra column${columns.length === 1 ? "" : "s"}`,
    apply: (rows, headers) => {
      // Only drop columns that still exist — preceding fixes (e.g., user
      // rename) may have renamed one of them to a canonical name.
      const actuallyDropping = columns.filter((c) => headers.includes(c));
      const keep = headers.filter((h) => !actuallyDropping.includes(h));
      const newRows = rows.map((r) => {
        const out: RawRow = {};
        for (const h of keep) out[h] = r[h] ?? "";
        return out;
      });
      return {
        rows: newRows,
        headers: keep,
        changeCount: actuallyDropping.length,
        detail:
          actuallyDropping.length === 0
            ? "No columns dropped (already renamed or removed by earlier fix)"
            : `Dropped: ${actuallyDropping.join(", ")}`,
      };
    },
  };
}

function makeSplitIsoDateTimeFix(): ProposedFix {
  return {
    id: "date-iso-split",
    label: "Split ISO datetimes",
    description: "Split ISO datetimes in Date into Date (YYYY-MM-DD) + Time (HH:MM)",
    apply: (rows, headers) => {
      let changed = 0;
      const newRows = rows.map((r) => {
        const v = r["Date"] ?? "";
        const split = tryIsoSplit(v);
        if (!split) return r;
        changed++;
        return { ...r, Date: split.date, Time: split.time };
      });
      // If any row was split and there's no Time column yet, add it so the
      // split time actually lands in the output.
      const newHeaders =
        changed > 0 && !headers.includes("Time")
          ? [...headers, "Time"]
          : headers;
      return {
        rows: newRows,
        headers: newHeaders,
        changeCount: changed,
        detail: `Split ${changed} ISO datetime value${changed === 1 ? "" : "s"}`,
      };
    },
  };
}

function makeInferUnambiguousDateFix(): ProposedFix {
  return {
    id: "date-infer-unambiguous",
    label: "Convert unambiguous slash dates",
    description:
      "Convert DD/MM/YYYY or MM/DD/YYYY to YYYY-MM-DD where day vs month is unambiguous",
    apply: (rows, headers) => {
      let changed = 0;
      const newRows = rows.map((r) => {
        const v = r["Date"] ?? "";
        if (isStrictDate(v)) return r;
        const iso = tryUnambiguousSlashDate(v);
        if (!iso) return r;
        changed++;
        return { ...r, Date: iso };
      });
      return {
        rows: newRows,
        headers,
        changeCount: changed,
        detail: `Converted ${changed} date${changed === 1 ? "" : "s"}`,
      };
    },
  };
}

function makeNormalizeTimeFix(): ProposedFix {
  return {
    id: "time-normalize",
    label: "Normalize time values",
    description:
      "Convert HH:MM:SS, AM/PM, and ISO datetimes into HH:MM (24h)",
    apply: (rows, headers) => {
      let changed = 0;
      const newRows = rows.map((r) => {
        const v = r["Time"] ?? "";
        if (isStrictTime(v)) return r;
        const norm = tryNormalizeTime(v);
        if (norm == null) return r;
        changed++;
        return { ...r, Time: norm };
      });
      return {
        rows: newRows,
        headers,
        changeCount: changed,
        detail: `Normalized ${changed} time value${changed === 1 ? "" : "s"}`,
      };
    },
  };
}

function makeCaseNormalizeEnumFix(
  column: string,
  allowlist: readonly string[],
  kind: "source-type" | "content-type",
): ProposedFix {
  const caseMap = new Map<string, string>();
  for (const v of allowlist) caseMap.set(v.toLowerCase(), v);
  return {
    id: `${kind}-case`,
    label: `Case-normalize ${column}`,
    description: `Normalize ${column} values to the allowed case-sensitive spelling`,
    apply: (rows, headers) => {
      let changed = 0;
      const newRows = rows.map((r) => {
        const v = r[column] ?? "";
        if ((allowlist as readonly string[]).includes(v)) return r;
        const ci = caseMap.get(v.trim().toLowerCase());
        if (ci === undefined) return r;
        changed++;
        return { ...r, [column]: ci };
      });
      return {
        rows: newRows,
        headers,
        changeCount: changed,
        detail: `Normalized ${changed} ${column} value${changed === 1 ? "" : "s"}`,
      };
    },
  };
}

function makeZeroBlankNumericFix(cols: readonly string[]): ProposedFix {
  return {
    id: "numeric-blank",
    label: "Zero blank engagement",
    description:
      "Replace blank / N/A / null engagement cells with 0 (only blank-like, not other non-integers)",
    apply: (rows, headers) => {
      // Defensive: only operate on columns that are still present in the
      // current header list — an earlier fix could have removed one.
      const presentCols = cols.filter((c) => headers.includes(c));
      let changed = 0;
      const newRows = rows.map((r) => {
        const out: RawRow = { ...r };
        for (const col of presentCols) {
          const v = out[col] ?? "";
          if (isNonNegInt(v)) continue;
          if (isBlankish(v)) {
            out[col] = "0";
            changed++;
          }
        }
        return out;
      });
      return {
        rows: newRows,
        headers,
        changeCount: changed,
        detail: `Filled ${changed} engagement cell${changed === 1 ? "" : "s"} with 0`,
      };
    },
  };
}

function makeCopyAuthorFallbackFix(): ProposedFix {
  return {
    id: "author-fallback",
    label: "Fill Author fallback",
    description:
      "Copy Author Name into blank Author Handle (or vice versa) per the LI spec",
    apply: (rows, headers) => {
      let changed = 0;
      const newRows = rows.map((r) => {
        const handle = r["Author Handle"] ?? "";
        const name = r["Author Name"] ?? "";
        if (isBlank(handle) && !isBlank(name)) {
          changed++;
          return { ...r, "Author Handle": name };
        }
        if (isBlank(name) && !isBlank(handle)) {
          changed++;
          return { ...r, "Author Name": handle };
        }
        return r;
      });
      return {
        rows: newRows,
        headers,
        changeCount: changed,
        detail: `Filled ${changed} author field${changed === 1 ? "" : "s"}`,
      };
    },
  };
}

function makeGenerateDocumentIdsFix(): ProposedFix {
  return {
    id: "docid-blank",
    label: "Generate Document IDs",
    description: "Generate UUIDs for rows with a blank Document ID",
    apply: (rows, headers) => {
      let changed = 0;
      const newRows = rows.map((r) => {
        const v = (r["Document ID"] ?? "").trim();
        if (v !== "") return r;
        changed++;
        return { ...r, "Document ID": crypto.randomUUID() };
      });
      return {
        rows: newRows,
        headers,
        changeCount: changed,
        detail: `Generated ${changed} Document ID${changed === 1 ? "" : "s"}`,
      };
    },
  };
}

function makeTrimWhitespaceFix(): ProposedFix {
  return {
    id: "whitespace",
    label: "Trim whitespace",
    description: "Trim leading and trailing whitespace on every string cell",
    apply: (rows, headers) => {
      let changed = 0;
      const newRows = rows.map((r) => {
        const out: RawRow = { ...r };
        for (const h of headers) {
          const v = out[h];
          if (typeof v === "string" && v !== v.trim()) {
            out[h] = v.trim();
            changed++;
          }
        }
        return out;
      });
      return {
        rows: newRows,
        headers,
        changeCount: changed,
        detail: `Trimmed ${changed} cell${changed === 1 ? "" : "s"}`,
      };
    },
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Ordered fix application. Structural fixes run first so subsequent fixes
 * see canonical column names.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Sentinel in FIX_APPLY_ORDER that marks where user bulk-fill / delete
 * fixes should run. Placed AFTER headers-rename (so their matchers see
 * canonical column names) and BEFORE columns-drop (so `copy-from` can
 * still read any source column that would otherwise be dropped as an
 * extra).
 */
export const BULK_FILL_SLOT = "__bulkfill_slot__";

export const FIX_APPLY_ORDER: readonly string[] = [
  "headers-rename",
  BULK_FILL_SLOT,
  "columns-drop",
  "date-iso-split",
  "date-infer-unambiguous",
  "time-normalize",
  "source-type-case",
  "content-type-case",
  "author-fallback",
  "docid-blank",
  "numeric-blank",
  "whitespace",
];

export interface AppliedFixSummary {
  id: string;
  label: string;
  detail: string;
  changeCount: number;
}

export function applyFixes(
  initialRows: RawRow[],
  initialHeaders: string[],
  issues: Issue[],
  selectedIds: Set<string>,
): {
  rows: RawRow[];
  headers: string[];
  applied: AppliedFixSummary[];
} {
  const byId = new Map<string, ProposedFix>();
  for (const issue of issues) {
    if (issue.fix && selectedIds.has(issue.fix.id)) {
      byId.set(issue.fix.id, issue.fix);
    }
  }

  let rows = initialRows;
  let headers = initialHeaders;
  const applied: AppliedFixSummary[] = [];
  const orderedSet = new Set(FIX_APPLY_ORDER);
  const ranBulkFills = new Set<string>();

  // First pass: run ordered fixes in their defined sequence. When we hit
  // the BULK_FILL_SLOT marker, run every bulk-fill / delete fix (i.e., any
  // fix whose id starts with BULK_FILL_FIX_ID_PREFIX and isn't otherwise
  // ordered) in insertion order.
  for (const id of FIX_APPLY_ORDER) {
    if (id === BULK_FILL_SLOT) {
      for (const [fixId, fix] of byId.entries()) {
        if (orderedSet.has(fixId)) continue;
        if (!fixId.startsWith(BULK_FILL_FIX_ID_PREFIX)) continue;
        const result = fix.apply(rows, headers);
        rows = result.rows;
        headers = result.headers;
        applied.push({
          id: fix.id,
          label: fix.label,
          detail: result.detail,
          changeCount: result.changeCount,
        });
        ranBulkFills.add(fixId);
      }
      continue;
    }
    const fix = byId.get(id);
    if (!fix) continue;
    const result = fix.apply(rows, headers);
    rows = result.rows;
    headers = result.headers;
    applied.push({
      id: fix.id,
      label: fix.label,
      detail: result.detail,
      changeCount: result.changeCount,
    });
  }

  // Catch-all: if someone adds a fix with a non-ordered, non-bulkfill id,
  // run it at the end so it isn't silently skipped.
  for (const [fixId, fix] of byId.entries()) {
    if (orderedSet.has(fixId)) continue;
    if (ranBulkFills.has(fixId)) continue;
    const result = fix.apply(rows, headers);
    rows = result.rows;
    headers = result.headers;
    applied.push({
      id: fix.id,
      label: fix.label,
      detail: result.detail,
      changeCount: result.changeCount,
    });
  }

  return { rows, headers, applied };
}
