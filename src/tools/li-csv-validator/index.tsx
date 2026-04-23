import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type RefObject,
} from "react";
import { ToolShell } from "@/shared/ui/ToolShell";
import { StateShell, type ToolState } from "@/shared/ui/StateShell";
import { cn } from "@/shared/lib/cn";
import { meta } from "./meta";
import {
  applyFixes,
  buildFilename,
  COLUMN_SCHEMA,
  CONTENT_TYPES,
  defaultFilenameSuffix,
  decodeBuffer,
  detectEncoding,
  encodeUtf16LeBom,
  extractMonitorId,
  hasMonitorIdPrefix,
  makeBulkFillFix,
  makeDeleteRowsFix,
  parseCsvString,
  REQUIRED_COLUMNS,
  sanitizeFilenameSuffix,
  serializeCsvString,
  SOURCE_TYPES,
  validate,
  type AppliedFixSummary,
  type EncodingName,
  type Issue,
  type ParsedFile,
  type ProposedFix,
  type RawRow,
  type ValidationResult,
} from "./logic";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/* ──────────────────────────────────────────────────────────────────────────
 * Single-source-of-truth: every manual-but-fixable issue is resolved by ONE
 * of three actions. Store them keyed by issue id. Re-validation runs live
 * on the virtual state (= parsed data + resolutions + selected auto-fixes)
 * so the user sees the consequences of their choices as they make them.
 * ────────────────────────────────────────────────────────────────────────── */

type Resolution =
  | { action: "constant"; value: string }
  | { action: "copy-from"; source: string }
  | { action: "delete" };

type Stage =
  | { kind: "idle" }
  | { kind: "parsing"; filename: string; size: number }
  | {
      kind: "review";
      parsed: ParsedFile;
      /**
       * Set of auto-fix ids the user has EXPLICITLY disabled. Default is
       * empty — every auto-fix (including ones that only emerge after
       * resolutions are applied) runs unless the user toggles it off.
       */
      autoFixDisabled: Set<string>;
      resolutions: Record<string, Resolution>;
    }
  | { kind: "applying"; label: string }
  | {
      kind: "summary";
      originalParsed: ParsedFile;
      finalRows: RawRow[];
      finalHeaders: string[];
      applied: AppliedFixSummary[];
      postValidation: ValidationResult;
    }
  | { kind: "error"; title: string; message: string };

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function encodingLabel(enc: EncodingName): string {
  switch (enc) {
    case "utf-16le-bom":
      return "UTF-16 LE (BOM) — matches LI requirement";
    case "utf-16be-bom":
      return "UTF-16 BE (BOM) — will be re-encoded to UTF-16 LE on download";
    case "utf-8-bom":
      return "UTF-8 (BOM) — will be re-encoded to UTF-16 LE on download";
    case "utf-8":
      return "UTF-8 (no BOM) — will be re-encoded to UTF-16 LE on download";
  }
}

/** Build a ProposedFix from an (Issue, Resolution) pair, or null if the
 *  resolution is incomplete (e.g., empty constant / no copy-from picked). */
function buildFixForResolution(
  issue: Issue,
  resolution: Resolution,
): ProposedFix | null {
  if (!issue.matcher || !issue.targetColumns) return null;
  if (resolution.action === "delete") {
    return makeDeleteRowsFix(issue.id, issue.matcher, {
      label: `Delete rows: ${issue.title}`,
    });
  }
  if (resolution.action === "constant") {
    return makeBulkFillFix(
      issue.id,
      issue.matcher,
      issue.targetColumns,
      { constant: resolution.value },
      { label: issue.title },
    );
  }
  // copy-from
  return makeBulkFillFix(
    issue.id,
    issue.matcher,
    issue.targetColumns,
    { copyFrom: resolution.source },
    { label: issue.title },
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Live virtual state — applies current user config to the parsed data so
 * the issues list and preview always reflect what the download would
 * produce. Memoized so typing in a resolver doesn't rebuild on every key
 * unless needed.
 * ────────────────────────────────────────────────────────────────────────── */

interface VirtualState {
  rows: RawRow[];
  headers: string[];
  /** Issues that remain after applying current resolutions + auto-fixes. */
  issues: Issue[];
  /** The list of issues presented for user action — includes issues that
   *  emerged at any iteration plus any already-resolved initial issues
   *  kept so the user can still see/edit their resolution. */
  displayIssues: Issue[];
  applied: AppliedFixSummary[];
}

const MAX_APPLY_PASSES = 8;

/**
 * Apply the user's full configuration (auto-fixes + resolutions) with
 * fixed-point iteration. Each pass validates the current state, finds
 * resolutions whose issue ids match the CURRENT issues, and applies them
 * alongside every auto-fix that isn't explicitly disabled. Stops when a
 * pass has no new resolutions to apply.
 *
 * Iteration is necessary because some issues only emerge after others are
 * resolved — e.g., `Source Type: 27 rows with "mw"` only exists once the
 * user has mapped a source column to Source Type in pass 1.
 */
function computeVirtualState(
  parsed: ParsedFile,
  autoFixDisabled: Set<string>,
  resolutions: Record<string, Resolution>,
): VirtualState {
  let rows = parsed.rows;
  let headers = parsed.headers;
  const allApplied: AppliedFixSummary[] = [];
  const allSeenIssuesById = new Map<string, Issue>();
  const appliedResolutionIds = new Set<string>();

  for (let pass = 0; pass < MAX_APPLY_PASSES; pass++) {
    const current = validate(rows, headers);

    // Track every issue we've ever seen so the UI can show
    // already-resolved-away issues alongside the unresolved ones.
    for (const issue of current.issues) {
      if (!allSeenIssuesById.has(issue.id)) {
        allSeenIssuesById.set(issue.id, issue);
      }
    }

    // Build synthetic issues for resolutions that match this pass's
    // issues and haven't been applied yet.
    const resolutionIssues: Issue[] = [];
    const resolutionSelected: string[] = [];
    for (const issue of current.issues) {
      if (appliedResolutionIds.has(issue.id)) continue;
      const resolution = resolutions[issue.id];
      if (!resolution) continue;
      const fix = buildFixForResolution(issue, resolution);
      if (!fix) continue;
      resolutionIssues.push({
        id: `bulkfill-source:${issue.id}`,
        severity: "auto-fix",
        category: issue.category,
        title: issue.title,
        fix,
      });
      resolutionSelected.push(fix.id);
      appliedResolutionIds.add(issue.id);
    }

    // Every non-disabled auto-fix from the current issues runs this pass.
    // This lets newly-emerged auto-fixes (e.g., case-normalize that only
    // shows up after mapping creates a Source Type column) run by default.
    const autoFixSelected: string[] = [];
    for (const issue of current.issues) {
      if (
        issue.severity === "auto-fix" &&
        issue.fix &&
        !autoFixDisabled.has(issue.fix.id)
      ) {
        autoFixSelected.push(issue.fix.id);
      }
    }

    const issuesForApply = [...resolutionIssues, ...current.issues];
    const selectedForApply = new Set([...autoFixSelected, ...resolutionSelected]);

    const result = applyFixes(
      rows,
      headers,
      issuesForApply,
      selectedForApply,
    );
    rows = result.rows;
    headers = result.headers;

    // Merge applied entries — skip no-op runs, sum changeCounts when a
    // fix ran in multiple passes (idempotent auto-fixes), and track
    // whether this pass actually changed anything so we know when to stop.
    let madeProgress = false;
    for (const a of result.applied) {
      if (a.changeCount === 0) continue;
      madeProgress = true;
      const existing = allApplied.find((x) => x.id === a.id);
      if (existing) {
        existing.changeCount += a.changeCount;
      } else {
        allApplied.push({ ...a });
      }
    }

    // Terminate when no fix made any actual change — everything has
    // converged. This lets late-emerging auto-fixes (e.g., author-fallback
    // after Author Handle/Name are renamed in, case-normalize after
    // mapping creates a Source Type column) run in subsequent passes
    // even without any user resolutions.
    if (!madeProgress) break;
  }

  const final = validate(rows, headers);
  for (const issue of final.issues) {
    if (!allSeenIssuesById.has(issue.id)) {
      allSeenIssuesById.set(issue.id, issue);
    }
  }

  // Display list = final (still-unresolved) issues plus any issue that has
  // a resolution configured but is no longer surfacing (i.e., already
  // resolved away) so the user can still tweak the resolution.
  const finalIds = new Set(final.issues.map((i) => i.id));
  const resolvedButHidden: Issue[] = [];
  for (const issueId of Object.keys(resolutions)) {
    if (finalIds.has(issueId)) continue;
    const issue = allSeenIssuesById.get(issueId);
    if (issue) resolvedButHidden.push(issue);
  }
  const displayIssues = [...final.issues, ...resolvedButHidden];

  return {
    rows,
    headers,
    issues: final.issues,
    displayIssues,
    applied: allApplied,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Main component
 * ────────────────────────────────────────────────────────────────────────── */

export default function Tool() {
  const [monitorInput, setMonitorInput] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const monitorId = useMemo(
    () => extractMonitorId(monitorInput),
    [monitorInput],
  );
  const monitorInputShowsError =
    monitorInput.trim().length > 0 && monitorId === null;

  const handleFile = useCallback(
    async (file: File) => {
      if (!monitorId) {
        setStage({
          kind: "error",
          title: "Monitor ID required",
          message: "Enter the monitor UUID or LI URL before uploading.",
        });
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setStage({
          kind: "error",
          title: "File too large",
          message: `Max upload is ${humanSize(MAX_UPLOAD_BYTES)}. Your file is ${humanSize(file.size)}. Split the CSV or contact the team if your backfills routinely exceed this.`,
        });
        return;
      }
      setStage({
        kind: "parsing",
        filename: file.name,
        size: file.size,
      });
      try {
        const buffer = await file.arrayBuffer();
        const encoding = detectEncoding(buffer);
        const text = decodeBuffer(buffer, encoding);
        const parsed = parseCsvString(text);
        if (parsed.headers.length === 0) {
          setStage({
            kind: "error",
            title: "Couldn't parse CSV",
            message:
              "No header row detected. Make sure the first row contains column names and re-upload.",
          });
          return;
        }
        const parsedFile: ParsedFile = {
          rows: parsed.rows,
          headers: parsed.headers,
          delimiter: parsed.delimiter,
          encoding,
          byteLength: file.size,
          filename: file.name,
        };
        setStage({
          kind: "review",
          parsed: parsedFile,
          autoFixDisabled: new Set(),
          resolutions: {},
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error while parsing.";
        console.error("li-csv-validator parse error", err);
        setStage({
          kind: "error",
          title: "Parse failed",
          message,
        });
      }
    },
    [monitorId],
  );

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
    e.target.value = "";
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };

  const reset = () => {
    setStage({ kind: "idle" });
  };

  const toggleAutoFix = (id: string) => {
    if (stage.kind !== "review") return;
    const next = new Set(stage.autoFixDisabled);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setStage({ ...stage, autoFixDisabled: next });
  };

  const setResolution = (issueId: string, resolution: Resolution | null) => {
    if (stage.kind !== "review") return;
    const next = { ...stage.resolutions };
    if (resolution === null) {
      delete next[issueId];
    } else {
      next[issueId] = resolution;
    }
    setStage({ ...stage, resolutions: next });
  };

  const runFixes = async () => {
    if (stage.kind !== "review") return;
    const { parsed, autoFixDisabled, resolutions } = stage;

    setStage({
      kind: "applying",
      label: "Applying fixes...",
    });
    // Let the UI paint the "applying" label before heavy work.
    await new Promise((r) => setTimeout(r, 0));

    try {
      // Same iterative pipeline as the live preview — guarantees the
      // summary view matches what the user saw during review.
      const virtual = computeVirtualState(
        parsed,
        autoFixDisabled,
        resolutions,
      );
      setStage({
        kind: "summary",
        originalParsed: parsed,
        finalRows: virtual.rows,
        finalHeaders: virtual.headers,
        applied: virtual.applied,
        postValidation: { issues: virtual.issues, rowCount: virtual.rows.length, columnCount: virtual.headers.length },
      });
    } catch (err) {
      console.error("li-csv-validator apply error", err);
      setStage({
        kind: "error",
        title: "Applying fixes failed",
        message:
          err instanceof Error ? err.message : "Unknown error while applying fixes.",
      });
    }
  };

  const toolState: ToolState =
    stage.kind === "idle"
      ? "idle"
      : stage.kind === "parsing" || stage.kind === "applying"
        ? "processing"
        : stage.kind === "error"
          ? "error"
          : "success";

  const statusLabel =
    stage.kind === "parsing"
      ? `Parsing ${stage.filename}...`
      : stage.kind === "applying"
        ? stage.label
        : stage.kind === "review"
          ? `${stage.parsed.rows.length} row${stage.parsed.rows.length === 1 ? "" : "s"} · ${stage.parsed.headers.length} column${stage.parsed.headers.length === 1 ? "" : "s"}`
          : stage.kind === "summary"
            ? `${stage.applied.length} fix${stage.applied.length === 1 ? "" : "es"} applied`
            : stage.kind === "error"
              ? "Error"
              : "Ready";

  return (
    <ToolShell meta={meta} status={statusLabel}>
      <StateShell
        state={toolState}
        minHeight="32rem"
        idle={
          <IdleView
            monitorInput={monitorInput}
            setMonitorInput={setMonitorInput}
            monitorId={monitorId}
            monitorInputShowsError={monitorInputShowsError}
            dragActive={dragActive}
            setDragActive={setDragActive}
            onDrop={onDrop}
            onFileInputChange={onFileInputChange}
            fileInputRef={fileInputRef}
          />
        }
        processing={
          <ProcessingView
            label={
              stage.kind === "parsing"
                ? `Parsing ${stage.filename} (${humanSize(stage.size)})...`
                : stage.kind === "applying"
                  ? stage.label
                  : "Working..."
            }
          />
        }
        success={
          stage.kind === "review" ? (
            <ReviewView
              stage={stage}
              toggleAutoFix={toggleAutoFix}
              setResolution={setResolution}
              runFixes={runFixes}
              reset={reset}
            />
          ) : stage.kind === "summary" ? (
            <SummaryView
              stage={stage}
              monitorId={monitorId ?? ""}
              reset={reset}
            />
          ) : null
        }
        error={
          stage.kind === "error" ? (
            <ErrorView
              title={stage.title}
              message={stage.message}
              onReset={reset}
            />
          ) : null
        }
      />
    </ToolShell>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Idle
 * ────────────────────────────────────────────────────────────────────────── */

interface IdleViewProps {
  monitorInput: string;
  setMonitorInput: (v: string) => void;
  monitorId: string | null;
  monitorInputShowsError: boolean;
  dragActive: boolean;
  setDragActive: (v: boolean) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onFileInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: RefObject<HTMLInputElement>;
}

function IdleView({
  monitorInput,
  setMonitorInput,
  monitorId,
  monitorInputShowsError,
  dragActive,
  setDragActive,
  onDrop,
  onFileInputChange,
  fileInputRef,
}: IdleViewProps) {
  const ready = monitorId !== null;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <section className="rounded-md border border-border bg-surface p-4">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-subtle">
          How this works
        </h3>
        <ol className="mt-2 space-y-1 text-sm text-text-muted">
          <li>
            <span className="mr-2 font-mono text-text">1.</span>
            Paste your LI monitor URL or UUID.
          </li>
          <li>
            <span className="mr-2 font-mono text-text">2.</span>
            Upload the CSV — we&apos;ll flag every schema issue
            upfront.
          </li>
          <li>
            <span className="mr-2 font-mono text-text">3.</span>
            Resolve each issue in-tool, then download the fixed file
            (UTF-16 LE BOM, monitor-ID-prefixed filename — upload
            directly to LI).
          </li>
        </ol>
      </section>

      <section>
        <label
          htmlFor="monitor-input"
          className="block text-sm font-medium text-text"
        >
          Monitor ID or LI URL
        </label>
        <p className="mt-1 text-xs text-text-muted">
          Paste the full monitor URL (e.g.{" "}
          <span className="font-mono">
            https://app.logically.ai/.../monitors/&lt;uuid&gt;/...
          </span>
          ) or the raw UUID. The UUID is used as the filename prefix on
          download.
        </p>
        <input
          id="monitor-input"
          type="text"
          value={monitorInput}
          onChange={(e) => setMonitorInput(e.target.value)}
          placeholder="019d6325-25d9-7801-b431-9e8895fc9fba or full URL"
          className={cn(
            "mt-2 block w-full rounded-md border bg-surface px-3 py-2 font-mono text-sm text-text",
            "transition-colors duration-150 focus:outline-none",
            monitorInputShowsError
              ? "border-error"
              : monitorId
                ? "border-success"
                : "border-border",
          )}
        />
        <p
          className={cn(
            "mt-1 h-4 text-xs",
            monitorInputShowsError ? "text-error" : "text-text-muted",
          )}
          aria-live="polite"
        >
          {monitorInputShowsError
            ? "Couldn't find a UUID in that input."
            : monitorId
              ? `Parsed: ${monitorId}`
              : ""}
        </p>
      </section>

      <section>
        <p className="text-sm font-medium text-text">CSV file</p>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          className={cn(
            "mt-2 flex flex-col items-center justify-center rounded-lg border-2 border-dashed bg-surface px-6 py-12 text-center transition-colors duration-150",
            !ready && "opacity-50",
            dragActive
              ? "border-accent bg-accent/5"
              : "border-border hover:border-border-strong",
          )}
        >
          <p className="text-sm text-text">
            {ready ? "Drop a .csv file or click to browse" : "Enter a monitor ID to enable upload"}
          </p>
          <p className="mt-1 text-xs text-text-subtle">
            Up to {humanSize(MAX_UPLOAD_BYTES)}. Any encoding accepted (UTF-8, UTF-16, etc).
          </p>
          <button
            type="button"
            disabled={!ready}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "mt-4 rounded-md border px-3 py-1.5 text-sm transition-colors duration-150",
              ready
                ? "border-border-strong text-text hover:bg-surface-2"
                : "cursor-not-allowed border-border text-text-subtle",
            )}
            title={ready ? undefined : "Enter a monitor ID first"}
          >
            Browse...
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={onFileInputChange}
            disabled={!ready}
          />
        </div>
      </section>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Processing
 * ────────────────────────────────────────────────────────────────────────── */

function ProcessingView({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[20rem] items-center justify-center">
      <p className="text-sm text-text-muted" aria-live="polite">
        {label}
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Review — the new unified screen
 * ────────────────────────────────────────────────────────────────────────── */

interface ReviewViewProps {
  stage: Extract<Stage, { kind: "review" }>;
  toggleAutoFix: (id: string) => void;
  setResolution: (issueId: string, resolution: Resolution | null) => void;
  runFixes: () => void;
  reset: () => void;
}

function ReviewView({
  stage,
  toggleAutoFix,
  setResolution,
  runFixes,
  reset,
}: ReviewViewProps) {
  const { parsed, autoFixDisabled, resolutions } = stage;

  // Live virtual state — everything downstream derives from this.
  const virtual = useMemo(
    () => computeVirtualState(parsed, autoFixDisabled, resolutions),
    [parsed, autoFixDisabled, resolutions],
  );

  // Show auto-fix toggles for every auto-fix that's been emitted at any
  // point during iterative validation (including ones that only emerged
  // after resolutions mapped new columns in).
  const autoFixesSeen = useMemo(() => {
    const seen = new Map<string, Issue>();
    // Collect from initial state.
    for (const issue of validate(parsed.rows, parsed.headers).issues) {
      if (issue.severity === "auto-fix" && issue.fix && !seen.has(issue.fix.id)) {
        seen.set(issue.fix.id, issue);
      }
    }
    // Plus any from the applied list that might have emerged later.
    for (const applied of virtual.applied) {
      if (!seen.has(applied.id)) {
        // Synthesize a display-only issue so the toggle renders; actual
        // fix behavior comes from the current pass's validator.
        seen.set(applied.id, {
          id: applied.id,
          severity: "auto-fix",
          category: "Auto",
          title: applied.label,
        });
      }
    }
    return [...seen.values()];
  }, [parsed, virtual.applied]);

  // Manual issues split: resolvable (has matcher) vs truly-manual.
  const resolvableIssues = useMemo(
    () =>
      virtual.displayIssues.filter(
        (i) => i.severity === "manual" && i.matcher,
      ),
    [virtual.displayIssues],
  );
  const manualStay = useMemo(
    () =>
      virtual.displayIssues.filter(
        (i) => i.severity === "manual" && !i.matcher,
      ),
    [virtual.displayIssues],
  );
  const resolvedCount = resolvableIssues.filter((i) => resolutions[i.id])
    .length;

  // Group resolvable issues by category in REQUIRED_COLUMNS order.
  const resolvableByCategory = useMemo(() => {
    const m = new Map<string, Issue[]>();
    for (const issue of resolvableIssues) {
      const list = m.get(issue.category) ?? [];
      list.push(issue);
      m.set(issue.category, list);
    }
    const orderedCategories = [
      ...(REQUIRED_COLUMNS as readonly string[]),
      "Author",
      "Engagement",
    ];
    const ordered: Array<[string, Issue[]]> = [];
    const seen = new Set<string>();
    for (const cat of orderedCategories) {
      const list = m.get(cat);
      if (list) {
        ordered.push([cat, list]);
        seen.add(cat);
      }
    }
    for (const [cat, list] of m.entries()) {
      if (!seen.has(cat)) ordered.push([cat, list]);
    }
    return ordered;
  }, [resolvableIssues]);

  // Columns available to "copy from". Exclude the issue's target column(s)
  // itself; include every other current header.
  const copyFromCandidatesFor = (targetColumns: string[]): string[] =>
    parsed.headers.filter((h) => !targetColumns.includes(h));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <FileSummary parsed={parsed} />
      <FilePreview
        headers={parsed.headers}
        rows={parsed.rows}
        caption="File preview"
      />

      <LiveSummary
        totalIssues={resolvableIssues.length + manualStay.length}
        resolvedCount={resolvedCount}
        originalRowCount={parsed.rows.length}
        finalRowCount={virtual.rows.length}
        postIssueCount={virtual.issues.length}
      />

      {autoFixesSeen.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-text">
            Auto-fixes ({autoFixesSeen.length})
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            Tool-decided transformations. All run by default — un-tick
            anything you want to skip.
          </p>
          <ul className="mt-3 space-y-2">
            {autoFixesSeen.map((issue) => {
              const fixId = issue.fix?.id ?? issue.id;
              const enabled = !autoFixDisabled.has(fixId);
              return (
                <IssueRow
                  key={fixId}
                  issue={issue}
                  checked={enabled}
                  onToggle={() => toggleAutoFix(fixId)}
                />
              );
            })}
          </ul>
        </section>
      )}

      {resolvableByCategory.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-text">
            Needs your input ({resolvableIssues.length})
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            Pick one action per issue. Leave empty to skip (LI will
            reject those rows).
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-text-subtle">
            <span>Each issue:</span>
            <span className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-text-muted">
              type a value
            </span>
            <span>or</span>
            <span className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-text-muted">
              copy from column
            </span>
            <span>or</span>
            <span className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-text-muted">
              delete rows
            </span>
          </div>
          <div className="mt-3 space-y-5">
            {resolvableByCategory.map(([category, issues]) => {
              const targets = [
                ...new Set(issues.flatMap((i) => i.targetColumns ?? [])),
              ];
              const schemaLines = targets
                .map((col) => {
                  const schema = COLUMN_SCHEMA[col];
                  if (!schema) return null;
                  const prefix = targets.length > 1 ? `${col}: ` : "";
                  return {
                    key: col,
                    text: `${prefix}${schema.expected}`,
                    requirement: schema.requirement,
                  };
                })
                .filter((x): x is NonNullable<typeof x> => x !== null);
              return (
                <div key={category}>
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-subtle">
                    {category}
                  </p>
                  {schemaLines.length > 0 && (
                    <div className="mb-2 mt-1 space-y-0.5">
                      {schemaLines.map((line) => (
                        <p
                          key={line.key}
                          className="text-[11px] leading-snug text-text-subtle"
                        >
                          {line.text}{" "}
                          <span
                            className={
                              line.requirement === "required"
                                ? "text-text-muted"
                                : "text-text-subtle"
                            }
                          >
                            · {line.requirement}
                          </span>
                        </p>
                      ))}
                    </div>
                  )}
                  <ul className="space-y-2">
                    {issues.map((issue) => (
                      <li
                        key={issue.id}
                        className="rounded-md border border-warning bg-surface p-3"
                      >
                        <p className="text-sm text-text">{issue.title}</p>
                        {issue.detail && (
                          <p className="mt-0.5 text-xs text-text-muted">
                            {issue.detail}
                          </p>
                        )}
                        <div className="mt-2">
                          <ResolverWidget
                            issueId={issue.id}
                            resolution={resolutions[issue.id] ?? null}
                            setResolution={setResolution}
                            copyFromCandidates={copyFromCandidatesFor(
                              issue.targetColumns ?? [],
                            )}
                            constantPlaceholder={constantPlaceholderFor(
                              issue.targetColumns ?? [],
                            )}
                            {...(() => {
                              const id = constantDatalistIdFor(
                                issue.targetColumns ?? [],
                              );
                              return id
                                ? { constantDatalistId: id }
                                : {};
                            })()}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {manualStay.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-text">
            Fix in source CSV ({manualStay.length})
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            These don&apos;t fit the constant / copy-from / delete model.
            Resolve in your source CSV and re-upload.
          </p>
          <ul className="mt-3 space-y-2">
            {manualStay.map((issue) => (
              <IssueRow key={issue.id} issue={issue} />
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        <button
          type="button"
          onClick={runFixes}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-accent-hover"
        >
          Apply and continue
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-text-muted transition-colors duration-150 hover:bg-surface-2"
        >
          Upload a different file
        </button>
      </div>

      {/* Shared datalists for enum constants */}
      <datalist id="li-source-types">
        {SOURCE_TYPES.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id="li-content-types">
        {CONTENT_TYPES.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Live summary bar — updates continuously as the user configures actions
 * ────────────────────────────────────────────────────────────────────────── */

function LiveSummary({
  totalIssues,
  resolvedCount,
  originalRowCount,
  finalRowCount,
  postIssueCount,
}: {
  totalIssues: number;
  resolvedCount: number;
  originalRowCount: number;
  finalRowCount: number;
  postIssueCount: number;
}) {
  const allResolved = totalIssues > 0 && resolvedCount === totalIssues;
  const actionsClass = cn(
    "mt-0.5 font-mono text-sm",
    resolvedCount === 0
      ? "text-text-muted"
      : allResolved
        ? "text-success"
        : "text-text",
  );
  const remainingClass = cn(
    "mt-0.5 font-mono text-sm",
    postIssueCount === 0 ? "text-success" : "text-warning",
  );
  const rowsClass = cn(
    "mt-0.5 font-mono text-sm",
    finalRowCount < originalRowCount ? "text-warning" : "text-text",
  );
  return (
    <div className="rounded-md border border-border bg-surface-2 p-3 text-xs text-text">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <p className="text-text-subtle">Issues found</p>
          <p className="mt-0.5 font-mono text-sm text-text">{totalIssues}</p>
        </div>
        <div>
          <p className="text-text-subtle">Actions chosen</p>
          <p className={actionsClass}>{resolvedCount}</p>
        </div>
        <div>
          <p className="text-text-subtle">Remaining</p>
          <p className={remainingClass}>{postIssueCount}</p>
        </div>
        <div>
          <p className="text-text-subtle">Rows in output</p>
          <p className={rowsClass}>
            {finalRowCount}
            {finalRowCount < originalRowCount && (
              <span className="ml-1 text-[11px] text-text-subtle">
                (−{originalRowCount - finalRowCount})
              </span>
            )}
          </p>
        </div>
      </div>
      {postIssueCount === 0 && totalIssues > 0 && (
        <p className="mt-2 text-[11px] text-success">
          ✓ All issues resolved — ready to apply and download.
        </p>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Resolver widget — three mutually-exclusive actions
 * ────────────────────────────────────────────────────────────────────────── */

function constantDatalistIdFor(targetColumns: string[]): string | undefined {
  if (targetColumns.includes("Source Type")) return "li-source-types";
  if (targetColumns.includes("Content Type")) return "li-content-types";
  return undefined;
}

function constantPlaceholderFor(targetColumns: string[]): string {
  if (targetColumns.includes("Date")) return "2025-09-28";
  if (targetColumns.includes("Time")) return "23:58";
  if (
    targetColumns.some((c) =>
      ["Likes", "Shares", "Views", "Replies", "Reposts", "Engagement"].includes(
        c,
      ),
    )
  ) {
    return "0";
  }
  return "constant value";
}

interface ResolverWidgetProps {
  issueId: string;
  resolution: Resolution | null;
  setResolution: (issueId: string, resolution: Resolution | null) => void;
  copyFromCandidates: string[];
  constantDatalistId?: string;
  constantPlaceholder?: string;
}

function ResolverWidget({
  issueId,
  resolution,
  setResolution,
  copyFromCandidates,
  constantDatalistId,
  constantPlaceholder,
}: ResolverWidgetProps) {
  const constantActive = resolution?.action === "constant";
  const copyActive = resolution?.action === "copy-from";
  const deleteActive = resolution?.action === "delete";
  const constantValue = constantActive ? resolution.value : "";
  const copyFromValue = copyActive ? resolution.source : "";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_auto] items-center gap-2">
      <input
        type="text"
        value={constantValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") setResolution(issueId, null);
          else setResolution(issueId, { action: "constant", value: v });
        }}
        placeholder={constantPlaceholder}
        aria-label="Constant value"
        {...(constantDatalistId ? { list: constantDatalistId } : {})}
        className={cn(
          "w-full rounded-md border bg-surface px-2 py-1 font-mono text-sm text-text placeholder:text-text-subtle focus:outline-none",
          constantActive && constantValue.trim() !== ""
            ? "border-success-soft focus:border-success"
            : "border-border focus:border-border-strong",
        )}
      />
      <span
        aria-hidden
        className="px-1 text-xs uppercase tracking-wide text-text-subtle"
      >
        or
      </span>
      <select
        value={copyFromValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") setResolution(issueId, null);
          else setResolution(issueId, { action: "copy-from", source: v });
        }}
        aria-label="Copy from column"
        className={cn(
          "w-full rounded-md border bg-surface px-2 py-1 font-mono text-sm text-text focus:outline-none",
          copyActive
            ? "border-success-soft focus:border-success"
            : "border-border focus:border-border-strong",
        )}
      >
        <option value="">(copy from column)</option>
        {copyFromCandidates.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="px-1 text-xs uppercase tracking-wide text-text-subtle"
      >
        or
      </span>
      <button
        type="button"
        onClick={() =>
          setResolution(
            issueId,
            deleteActive ? null : { action: "delete" },
          )
        }
        aria-pressed={deleteActive}
        title={
          deleteActive
            ? "Click to undo — rows will not be deleted"
            : "Remove affected rows from the output entirely"
        }
        className={cn(
          "rounded-md border px-3 py-1 text-xs transition-colors duration-150",
          deleteActive
            ? "border-success-soft bg-surface-2 text-text"
            : "border-border text-text-muted hover:bg-surface-2 hover:text-text",
        )}
      >
        {deleteActive ? "✓ Delete rows" : "Delete rows"}
      </button>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * File preview — headers + first N rows, horizontal scroll, truncated cells
 * ────────────────────────────────────────────────────────────────────────── */

const PREVIEW_CELL_MAX_CHARS = 80;

function FilePreview({
  headers,
  rows,
  maxRows = 3,
  caption,
}: {
  headers: string[];
  rows: RawRow[];
  maxRows?: number;
  caption: string;
}) {
  const previewRows = rows.slice(0, maxRows);
  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-text">{caption}</h2>
        <p className="text-xs text-text-subtle">
          Showing {previewRows.length} of {rows.length} row
          {rows.length === 1 ? "" : "s"} · {headers.length} column
          {headers.length === 1 ? "" : "s"}
        </p>
      </div>
      <div className="mt-2 overflow-x-auto rounded-md border border-border bg-surface">
        <table className="min-w-full text-xs">
          <thead className="bg-surface-2">
            <tr>
              {headers.map((h) => (
                <th
                  key={h}
                  className="whitespace-nowrap border-b border-border px-3 py-2 text-left font-medium text-text"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.length === 0 ? (
              <tr>
                <td
                  colSpan={Math.max(1, headers.length)}
                  className="px-3 py-4 text-center italic text-text-subtle"
                >
                  (no data rows)
                </td>
              </tr>
            ) : (
              previewRows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-border last:border-b-0"
                >
                  {headers.map((h) => {
                    const raw = row[h] ?? "";
                    const truncated =
                      raw.length > PREVIEW_CELL_MAX_CHARS
                        ? `${raw.slice(0, PREVIEW_CELL_MAX_CHARS)}…`
                        : raw;
                    return (
                      <td
                        key={h}
                        className="whitespace-nowrap px-3 py-1.5 font-mono text-text-muted"
                        title={raw}
                      >
                        {raw === "" ? (
                          <span className="italic text-text-subtle">
                            (blank)
                          </span>
                        ) : (
                          truncated
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function IssueRow({
  issue,
  checked,
  onToggle,
}: {
  issue: Issue;
  checked?: boolean;
  onToggle?: () => void;
}) {
  const togglable = onToggle !== undefined;
  return (
    <li
      className={cn(
        "flex gap-3 rounded-md border border-border bg-surface p-3",
        issue.severity === "manual" && "border-warning",
      )}
    >
      {togglable && (
        <input
          type="checkbox"
          checked={!!checked}
          onChange={onToggle}
          className="mt-1"
          aria-label={`Apply fix: ${issue.title}`}
        />
      )}
      <div className="flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-text-subtle">
            {issue.category}
          </span>
          <p className="text-sm text-text">{issue.title}</p>
        </div>
        {issue.detail && (
          <p className="mt-1 text-xs text-text-muted">{issue.detail}</p>
        )}
      </div>
    </li>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Summary + download
 * ────────────────────────────────────────────────────────────────────────── */

interface SummaryViewProps {
  stage: Extract<Stage, { kind: "summary" }>;
  monitorId: string;
  reset: () => void;
}

function SummaryView({ stage, monitorId, reset }: SummaryViewProps) {
  const [suffix, setSuffix] = useState(() => defaultFilenameSuffix());
  const [downloadedAt, setDownloadedAt] = useState<Date | null>(null);
  const filename = buildFilename(monitorId, suffix);
  const previewSuffix = sanitizeFilenameSuffix(suffix);
  const filenameValidPrefix = hasMonitorIdPrefix(filename, monitorId);
  const manualRemaining = stage.postValidation.issues.filter(
    (i) => i.severity === "manual",
  );

  const download = () => {
    const csv = serializeCsvString(stage.finalRows, stage.finalHeaders);
    const bytes = encodeUtf16LeBom(csv);
    const blob = new Blob([bytes], { type: "text/csv;charset=utf-16le" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setDownloadedAt(new Date());
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <FileSummary parsed={stage.originalParsed} />
      <FilePreview
        headers={stage.finalHeaders}
        rows={stage.finalRows}
        caption="Final preview (what will download)"
      />

      <section>
        <h2 className="text-sm font-medium text-text">
          Fixes applied ({stage.applied.length})
        </h2>
        {stage.applied.length === 0 ? (
          <p className="mt-2 text-xs text-text-muted">
            No fixes applied — file will be re-encoded and renamed on
            download without content changes.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {stage.applied.map((a) => (
              <li
                key={a.id}
                className="flex items-start gap-3 rounded-md border border-border bg-surface p-3"
              >
                <span className="mt-0.5 text-xs text-success">✓</span>
                <div>
                  <p className="text-sm text-text">{a.label}</p>
                  <p className="mt-0.5 text-xs text-text-muted">{a.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {manualRemaining.length > 0 && (
        <section className="rounded-md border border-warning bg-surface p-4">
          <p className="text-sm font-medium text-text">
            {manualRemaining.length} issue
            {manualRemaining.length === 1 ? "" : "s"} still need your
            attention
          </p>
          <p className="mt-1 text-xs text-text-muted">
            These weren&apos;t resolved. You can still download, but LI
            will reject rows with these issues.
          </p>
          <ul className="mt-3 space-y-1">
            {manualRemaining.map((i) => (
              <li key={i.id} className="text-xs text-text-muted">
                <span className="text-text">{i.title}</span>
                {i.detail ? ` — ${i.detail}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-sm font-medium text-text">Download</h2>
        <div className="mt-2 rounded-md border border-border bg-surface p-4">
          <div className="grid grid-cols-[max-content_1fr] items-baseline gap-x-4 gap-y-2 text-sm">
            <span className="text-text-subtle">Monitor ID</span>
            <span className="font-mono text-text">{monitorId}</span>

            <label htmlFor="suffix-input" className="text-text-subtle">
              Suffix
            </label>
            <input
              id="suffix-input"
              type="text"
              value={suffix}
              onChange={(e) => setSuffix(e.target.value)}
              className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-text focus:border-border-strong focus:outline-none"
            />

            <span className="text-text-subtle">Cleaned suffix</span>
            <span className="font-mono text-text-muted">{previewSuffix}</span>

            <span className="text-text-subtle">Filename</span>
            <span className="font-mono text-text">{filename}</span>

            <span className="text-text-subtle">Encoding</span>
            <span className="text-text">UTF-16 LE with BOM</span>

            <span className="text-text-subtle">Rows</span>
            <span className="text-text">{stage.finalRows.length}</span>

            <span className="text-text-subtle">Columns</span>
            <span className="text-text">{stage.finalHeaders.length}</span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={download}
              disabled={!filenameValidPrefix}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150",
                filenameValidPrefix
                  ? "bg-accent text-white hover:bg-accent-hover"
                  : "cursor-not-allowed border border-border text-text-subtle",
              )}
            >
              Download CSV
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-md border border-border-strong px-3 py-1.5 text-sm text-text transition-colors duration-150 hover:bg-surface-2"
            >
              Start over
            </button>
          </div>
          <p className="mt-2 h-4 text-xs" aria-live="polite">
            {downloadedAt
              ? `Downloaded ${filename} at ${downloadedAt.toLocaleTimeString()}.`
              : ""}
          </p>
        </div>
      </section>
    </div>
  );
}

function FileSummary({ parsed }: { parsed: ParsedFile }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-md border border-border bg-surface px-3 py-2 text-xs">
      <span className="font-mono text-sm text-text">{parsed.filename}</span>
      <span aria-hidden className="text-text-subtle">
        ·
      </span>
      <span className="text-text-muted">{humanSize(parsed.byteLength)}</span>
      <span aria-hidden className="text-text-subtle">
        ·
      </span>
      <span className="text-text-muted">{encodingLabel(parsed.encoding)}</span>
      <span aria-hidden className="text-text-subtle">
        ·
      </span>
      <span className="text-text-muted">
        {parsed.rows.length} rows × {parsed.headers.length} columns
      </span>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Error
 * ────────────────────────────────────────────────────────────────────────── */

function ErrorView({
  title,
  message,
  onReset,
}: {
  title: string;
  message: string;
  onReset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl rounded-lg border border-error bg-surface p-6">
      <p className="text-sm font-medium text-text">{title}</p>
      <p className="mt-2 text-xs text-text-muted">{message}</p>
      <div className="mt-4">
        <button
          type="button"
          onClick={onReset}
          className="rounded-md border border-border-strong px-3 py-1.5 text-sm text-text transition-colors duration-150 hover:bg-surface-2"
        >
          Start over
        </button>
      </div>
    </div>
  );
}
