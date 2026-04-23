import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type RefObject,
} from "react";
import { Copy, FileText, Loader2, X } from "lucide-react";
import { ToolShell } from "@/shared/ui/ToolShell";
import { cn } from "@/shared/lib/cn";
import { meta } from "./meta";
import {
  buildZipBulk,
  buildZipSingle,
  convertDocx,
  slugify,
  type ExtractedImage,
} from "./logic";

/* ──────────────────────────────────────────────────────────────────────────
 * Per-file entry — idle → converting → done / error.
 * ────────────────────────────────────────────────────────────────────────── */

type FileStatus = "idle" | "converting" | "done" | "error";

interface FileEntry {
  id: number;
  raw: File;
  status: FileStatus;
  markdown?: string;
  images?: ExtractedImage[];
  error?: string;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function markdownSize(md: string): number {
  return new Blob([md]).size;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Tool() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [isPacking, setIsPacking] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextIdRef = useRef(1);

  const idle = useMemo(
    () => files.filter((f) => f.status === "idle"),
    [files],
  );
  const done = useMemo(
    () => files.filter((f) => f.status === "done"),
    [files],
  );
  const errored = useMemo(
    () => files.filter((f) => f.status === "error"),
    [files],
  );

  const addFiles = useCallback((list: FileList | File[]) => {
    const accepted = Array.from(list).filter((f) =>
      f.name.toLowerCase().endsWith(".docx"),
    );
    if (accepted.length === 0) return;
    setFiles((prev) => [
      ...prev,
      ...accepted.map<FileEntry>((raw) => ({
        id: nextIdRef.current++,
        raw,
        status: "idle",
      })),
    ]);
  }, []);

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  const removeFile = (id: number) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const resetAll = () => {
    setFiles([]);
    setExpandedId(null);
  };

  const convertAll = async () => {
    const toConvert = files.filter((f) => f.status === "idle");
    if (toConvert.length === 0) return;
    setIsConverting(true);
    for (const target of toConvert) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === target.id ? { ...f, status: "converting" } : f,
        ),
      );
      try {
        const result = await convertDocx(target.raw);
        setFiles((prev) =>
          prev.map((f) =>
            f.id === target.id
              ? {
                  ...f,
                  status: "done",
                  markdown: result.markdown,
                  images: result.images,
                }
              : f,
          ),
        );
      } catch (err) {
        console.error("docx-to-markdown convert error", err);
        const message =
          err instanceof Error ? err.message : "Unknown conversion error";
        setFiles((prev) =>
          prev.map((f) =>
            f.id === target.id
              ? { ...f, status: "error", error: message }
              : f,
          ),
        );
      }
    }
    setIsConverting(false);
  };

  const downloadZip = async () => {
    const doneFiles = files.filter((f) => f.status === "done");
    if (doneFiles.length === 0) return;
    setIsPacking(true);
    try {
      if (doneFiles.length === 1) {
        const f = doneFiles[0]!;
        const blob = await buildZipSingle({
          sourceName: f.raw.name,
          markdown: f.markdown ?? "",
          images: f.images ?? [],
        });
        triggerDownload(blob, `${slugify(f.raw.name)}.zip`);
      } else {
        const blob = await buildZipBulk(
          doneFiles.map((f) => ({
            sourceName: f.raw.name,
            markdown: f.markdown ?? "",
            images: f.images ?? [],
          })),
        );
        triggerDownload(blob, "converted_reports.zip");
      }
    } catch (err) {
      console.error("docx-to-markdown zip error", err);
    } finally {
      setIsPacking(false);
    }
  };

  const copyMarkdown = async (f: FileEntry) => {
    if (!f.markdown) return;
    try {
      await navigator.clipboard.writeText(f.markdown);
      setCopiedId(f.id);
      window.setTimeout(() => {
        setCopiedId((cur) => (cur === f.id ? null : cur));
      }, 1500);
    } catch (err) {
      console.error("clipboard write failed", err);
    }
  };

  const statusLabel = isConverting
    ? `Converting ${files.find((f) => f.status === "converting")?.raw.name ?? ""}...`
    : isPacking
      ? "Packing .zip..."
      : files.length === 0
        ? "Ready"
        : `${done.length} of ${files.length} converted`;

  return (
    <ToolShell meta={meta} status={statusLabel}>
      <div className="mx-auto max-w-3xl space-y-6">
        <Intro />

        <Dropzone
          ready
          dragActive={dragActive}
          setDragActive={setDragActive}
          onDrop={onDrop}
          onFileInputChange={onFileInputChange}
          fileInputRef={fileInputRef}
          hasFiles={files.length > 0}
        />

        {files.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium text-text">
                Files ({files.length})
              </h2>
              <button
                type="button"
                onClick={resetAll}
                className="text-xs text-text-muted transition-colors hover:text-text"
              >
                Clear all
              </button>
            </div>
            <ul className="mt-2 space-y-2">
              {files.map((f) => (
                <FileCard
                  key={f.id}
                  file={f}
                  expanded={expandedId === f.id}
                  copied={copiedId === f.id}
                  onToggleExpand={() =>
                    setExpandedId((cur) => (cur === f.id ? null : f.id))
                  }
                  onRemove={() => removeFile(f.id)}
                  onCopy={() => copyMarkdown(f)}
                />
              ))}
            </ul>
          </section>
        )}

        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={convertAll}
              disabled={idle.length === 0 || isConverting}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150",
                idle.length === 0 || isConverting
                  ? "cursor-not-allowed border border-border text-text-subtle"
                  : "bg-accent text-white hover:bg-accent-hover",
              )}
            >
              {isConverting
                ? "Converting..."
                : idle.length === 0
                  ? "Nothing to convert"
                  : `Convert ${idle.length} file${idle.length === 1 ? "" : "s"}`}
            </button>
            <button
              type="button"
              onClick={downloadZip}
              disabled={done.length === 0 || isPacking}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors duration-150",
                done.length === 0 || isPacking
                  ? "cursor-not-allowed border border-border text-text-subtle"
                  : "border border-success text-success hover:bg-surface-2",
              )}
            >
              {isPacking ? "Packing..." : "Download .zip"}
            </button>
          </div>
        )}

        {errored.length > 0 && (
          <p className="text-xs text-error">
            {errored.length} file{errored.length === 1 ? "" : "s"} failed
            to convert — remove and retry, or check the file is a valid
            .docx.
          </p>
        )}
      </div>
    </ToolShell>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Intro card — brief explainer + upload guidance
 * ────────────────────────────────────────────────────────────────────────── */

function Intro() {
  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-subtle">
        How this works
      </h3>
      <ol className="mt-2 space-y-1 text-sm text-text-muted">
        <li>
          <span className="mr-2 font-mono text-text">1.</span>
          Drop one or more <span className="font-mono">.docx</span>{" "}
          intelligence reports.
        </li>
        <li>
          <span className="mr-2 font-mono text-text">2.</span>
          Hit <span className="font-mono">Convert</span> — each file is
          parsed to Markdown with embedded images extracted alongside.
        </li>
        <li>
          <span className="mr-2 font-mono text-text">3.</span>
          Download the <span className="font-mono">.zip</span> and upload
          it to Claude as-is. Claude unpacks it natively — no base64
          bloat, no runtime parsing of binary formats.
        </li>
      </ol>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Dropzone — shared by idle + files-added states
 * ────────────────────────────────────────────────────────────────────────── */

interface DropzoneProps {
  ready: boolean;
  dragActive: boolean;
  setDragActive: (v: boolean) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onFileInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: RefObject<HTMLInputElement>;
  hasFiles: boolean;
}

function Dropzone({
  ready,
  dragActive,
  setDragActive,
  onDrop,
  onFileInputChange,
  fileInputRef,
  hasFiles,
}: DropzoneProps) {
  return (
    <section>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center justify-center rounded-lg border-2 border-dashed bg-surface px-6 text-center transition-colors duration-150",
          hasFiles ? "py-6" : "py-12",
          !ready && "opacity-50",
          dragActive
            ? "border-accent bg-accent/5"
            : "border-border hover:border-border-strong",
        )}
      >
        <p className="text-sm text-text">
          {hasFiles
            ? "Drop more .docx files or click to add"
            : "Drop .docx files here or click to browse"}
        </p>
        <p className="mt-1 text-xs text-text-subtle">
          Multiple files OK. Output is a single .zip you upload directly
          to Claude.
        </p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="mt-4 rounded-md border border-border-strong px-3 py-1.5 text-sm text-text transition-colors duration-150 hover:bg-surface-2"
        >
          Browse...
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          multiple
          className="hidden"
          onChange={onFileInputChange}
        />
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * File card — per-file row with status, inline expand for markdown preview
 * ────────────────────────────────────────────────────────────────────────── */

interface FileCardProps {
  file: FileEntry;
  expanded: boolean;
  copied: boolean;
  onToggleExpand: () => void;
  onRemove: () => void;
  onCopy: () => void;
}

function FileCard({
  file,
  expanded,
  copied,
  onToggleExpand,
  onRemove,
  onCopy,
}: FileCardProps) {
  const borderClass =
    file.status === "done"
      ? "border-success"
      : file.status === "error"
        ? "border-error"
        : "border-border";

  return (
    <li className={cn("rounded-md border bg-surface", borderClass)}>
      <div className="flex items-center gap-3 p-3">
        <StatusIcon status={file.status} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm text-text">
            {file.raw.name}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            {humanSize(file.raw.size)}
            {file.status === "done" && file.markdown !== undefined && (
              <>
                {" → "}
                {humanSize(markdownSize(file.markdown))} md
                {file.images && file.images.length > 0 && (
                  <>
                    {" · "}
                    <span className="text-warning">
                      {file.images.length} image
                      {file.images.length === 1 ? "" : "s"} extracted
                    </span>
                  </>
                )}
              </>
            )}
            {file.status === "error" && (
              <> — {file.error ?? "conversion failed"}</>
            )}
            {file.status === "converting" && <> — converting...</>}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          {file.status === "done" && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="rounded-md border border-border px-2 py-1 text-xs text-text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-text"
            >
              {expanded ? "Hide" : "Preview"}
            </button>
          )}
          {file.status !== "converting" && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${file.raw.name}`}
              className="rounded-md p-1 text-text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-text"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {expanded && file.status === "done" && file.markdown !== undefined && (
        <div className="border-t border-border bg-surface-2 px-3 py-2">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] uppercase tracking-wide text-text-subtle">
              {slugify(file.raw.name)}.md
            </p>
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-text-muted transition-colors duration-150 hover:bg-surface hover:text-text"
            >
              <Copy className="h-3 w-3" aria-hidden />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="mt-2 max-h-96 overflow-auto rounded-md border border-border bg-surface p-3 font-mono text-xs leading-relaxed text-text-muted">
            {file.markdown}
          </pre>
        </div>
      )}
    </li>
  );
}

function StatusIcon({ status }: { status: FileStatus }) {
  if (status === "converting") {
    return (
      <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-warning" />
    );
  }
  if (status === "done") {
    return (
      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-sm text-success">
        ✓
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-sm text-error">
        ✗
      </span>
    );
  }
  return (
    <FileText
      className="h-4 w-4 flex-shrink-0 text-text-subtle"
      aria-hidden
    />
  );
}
