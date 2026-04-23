import { convertToHtml, images as mammothImages } from "mammoth";
import JSZip from "jszip";

/* ──────────────────────────────────────────────────────────────────────────
 * Types
 * ────────────────────────────────────────────────────────────────────────── */

export interface ExtractedImage {
  filename: string;
  data: Uint8Array<ArrayBuffer>;
  contentType: string | undefined;
}

export interface ConvertedDoc {
  markdown: string;
  images: ExtractedImage[];
  warnings: Array<{ type: string; message: string }>;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Filename + content-type helpers
 * ────────────────────────────────────────────────────────────────────────── */

export function slugify(name: string): string {
  return name
    .replace(/\.docx$/i, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function extFromContentType(ct: string | undefined): string {
  if (!ct) return "png";
  if (ct.includes("png")) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("bmp")) return "bmp";
  if (ct.includes("tiff")) return "tiff";
  if (ct.includes("svg")) return "svg";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("emf") || ct.includes("x-emf")) return "emf";
  if (ct.includes("wmf") || ct.includes("x-wmf")) return "wmf";
  return "png";
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/* ──────────────────────────────────────────────────────────────────────────
 * HTML → Markdown. Ported byte-for-byte from the original standalone HTML
 * tool so the output format matches what the team is already used to.
 * Regex-based; fragile for arbitrary HTML but fine for mammoth's output.
 * ────────────────────────────────────────────────────────────────────────── */

export function cleanMarkdown(html: string): string {
  let md = html;
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "\n# $1\n");
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "\n## $1\n");
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "\n### $1\n");
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, "\n#### $1\n");
  md = md.replace(/<h5[^>]*>(.*?)<\/h5>/gi, "\n##### $1\n");
  md = md.replace(/<h6[^>]*>(.*?)<\/h6>/gi, "\n###### $1\n");
  md = md.replace(/<strong>(.*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b>(.*?)<\/b>/gi, "**$1**");
  md = md.replace(/<em>(.*?)<\/em>/gi, "*$1*");
  md = md.replace(/<i>(.*?)<\/i>/gi, "*$1*");
  md = md.replace(/<u>(.*?)<\/u>/gi, "_$1_");
  md = md.replace(/<a\s+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");

  // Tables
  md = md.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_match, inner: string) => {
    const rows: string[][] = [];
    const rowMatches = inner.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? [];
    for (const row of rowMatches) {
      const cells: string[] = [];
      const cellMatches = row.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) ?? [];
      for (const cell of cellMatches) {
        cells.push(cell.replace(/<[^>]+>/g, "").trim());
      }
      rows.push(cells);
    }
    if (rows.length === 0) return "";
    const first = rows[0];
    if (!first) return "";
    const maxCols = Math.max(...rows.map((r) => r.length));
    for (const r of rows) {
      while (r.length < maxCols) r.push("");
    }
    let t = "\n| " + first.join(" | ") + " |\n";
    t += "| " + first.map(() => "---").join(" | ") + " |\n";
    for (let i = 1; i < rows.length; i++) {
      t += "| " + rows[i]!.join(" | ") + " |\n";
    }
    return t + "\n";
  });

  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, c: string) => {
    return "- " + c.replace(/<[^>]+>/g, "").trim() + "\n";
  });
  md = md.replace(/<\/?[ou]l[^>]*>/gi, "\n");
  md = md.replace(/<br\s*\/?>/gi, "\n");
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n$1\n");
  md = md.replace(/<[^>]+>/g, "");
  md = md.replace(/&nbsp;/g, " ");
  md = md.replace(/&amp;/g, "&");
  md = md.replace(/&lt;/g, "<");
  md = md.replace(/&gt;/g, ">");
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");
  md = md.replace(/\n{3,}/g, "\n\n");
  return md.trim() + "\n";
}

/* ──────────────────────────────────────────────────────────────────────────
 * Core conversion — docx ArrayBuffer → { markdown, images, warnings }
 *
 * Uses mammoth's image-element hook to pull embedded images out as separate
 * files referenced by path. EMF/WMF vector formats are dropped (Claude
 * can't interpret them) — the corresponding `<img>` tag is stripped.
 * ────────────────────────────────────────────────────────────────────────── */

export async function convertDocx(
  file: File,
): Promise<ConvertedDoc> {
  const buffer = await file.arrayBuffer();
  const slug = slugify(file.name);
  const images: ExtractedImage[] = [];
  let imgIndex = 0;

  const options = {
    convertImage: mammothImages.imgElement(async (image) => {
      const b64 = await image.read("base64");
      imgIndex++;
      const ext = extFromContentType(image.contentType);
      if (ext === "emf" || ext === "wmf") {
        return { src: "" };
      }
      const filename = `${slug}_img_${String(imgIndex).padStart(3, "0")}.${ext}`;
      images.push({
        filename,
        data: base64ToBytes(b64),
        contentType: image.contentType,
      });
      return { src: `images/${filename}` };
    }),
  };

  const result = await convertToHtml({ arrayBuffer: buffer }, options);
  let html = result.value;

  // Strip empty img tags (skipped EMF/WMF).
  html = html.replace(/<img\s+src=""\s*\/?>/gi, "");
  // Convert remaining image tags to markdown image syntax.
  html = html.replace(/<img\s+src="([^"]+)"[^>]*\/?>/gi, "![]($1)");

  return {
    markdown: cleanMarkdown(html),
    images,
    warnings: result.messages,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * ZIP packaging
 *
 *   single:  {slug}/
 *              {slug}.md
 *              images/{slug}_img_NNN.{ext}
 *
 *   bulk:    converted_reports/
 *              {slug-1}.md
 *              {slug-2}.md
 *              images/{slug-1}_img_NNN.{ext}
 *              images/{slug-2}_img_NNN.{ext}
 *              ...
 * ────────────────────────────────────────────────────────────────────────── */

export interface ZippableDoc {
  sourceName: string;
  markdown: string;
  images: ExtractedImage[];
}

export async function buildZipSingle(doc: ZippableDoc): Promise<Blob> {
  const zip = new JSZip();
  const slug = slugify(doc.sourceName);
  const folder = zip.folder(slug);
  if (!folder) throw new Error("JSZip folder creation failed");
  folder.file(`${slug}.md`, doc.markdown);
  if (doc.images.length > 0) {
    const imgFolder = folder.folder("images");
    if (!imgFolder) throw new Error("JSZip images folder creation failed");
    for (const img of doc.images) {
      imgFolder.file(img.filename, img.data);
    }
  }
  return await zip.generateAsync({ type: "blob" });
}

export async function buildZipBulk(docs: ZippableDoc[]): Promise<Blob> {
  const zip = new JSZip();
  const folder = zip.folder("converted_reports");
  if (!folder) throw new Error("JSZip folder creation failed");
  let imgFolder: JSZip | null = null;
  for (const doc of docs) {
    const slug = slugify(doc.sourceName);
    folder.file(`${slug}.md`, doc.markdown);
    if (doc.images.length > 0) {
      if (!imgFolder) {
        imgFolder = folder.folder("images");
        if (!imgFolder) throw new Error("JSZip images folder creation failed");
      }
      for (const img of doc.images) {
        imgFolder.file(img.filename, img.data);
      }
    }
  }
  return await zip.generateAsync({ type: "blob" });
}
