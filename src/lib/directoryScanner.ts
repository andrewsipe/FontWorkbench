/**
 * Directory scanner for font files.
 * Recursively collects font file handles and parses them via the FontLoader pipeline.
 * Tracks parent directory per file for Stage 9 rename (write-new-delete-old).
 */

import { loadFontFile } from "../engine/FontLoader";
import { parseOpentypeQuick } from "../engine/parsers/OpentypeParser";
import type { GeneralMetadata, MiscellaneousData } from "../types/extractors.types";
import type { CachedFont } from "../types/font.types";
import { getFontFormat } from "../utils/fontUtils";
import { decompressFont } from "../utils/woffDecompressor";

const FONT_EXTENSIONS = new Set([".ttf", ".otf", ".woff", ".woff2"]);

function hasFontExtension(name: string): boolean {
  const ext = name.toLowerCase().slice(name.lastIndexOf("."));
  return FONT_EXTENSIONS.has(ext);
}

export interface FontHandleWithParent {
  handle: FileSystemFileHandle;
  filePath: string;
  parentDirHandle: FileSystemDirectoryHandle;
}

export interface ScanResult {
  items: FontHandleWithParent[];
  /** filePath → parent directory handle, for Stage 9 rename lookup. */
  parentByPath: Map<string, FileSystemDirectoryHandle>;
}

/**
 * Recursively collect font file handles with path and parent directory.
 * Use this when you need the parent for renames (e.g. unprocessed scan, Stage 9).
 * Requests read permission before iterating.
 */
export async function collectFontHandlesWithParents(
  dirHandle: FileSystemDirectoryHandle
): Promise<ScanResult> {
  const items: FontHandleWithParent[] = [];
  const parentByPath = new Map<string, FileSystemDirectoryHandle>();
  const pathPrefix = dirHandle.name ?? "";

  if (typeof dirHandle.requestPermission === "function") {
    const permission = await dirHandle.requestPermission({ mode: "read" });
    if (permission !== "granted") {
      console.warn("[directoryScanner] Directory read permission not granted");
      return { items, parentByPath };
    }
  }

  async function scan(dir: FileSystemDirectoryHandle, prefix: string): Promise<void> {
    const iter = dir.entries();
    let result = await iter.next();
    while (!result.done) {
      const [name, entry] = result.value as [string, FileSystemHandle];
      const relPath = prefix ? `${prefix}/${name}` : name;

      if (entry.kind === "file" && hasFontExtension(name)) {
        const fileHandle = entry as FileSystemFileHandle;
        items.push({ handle: fileHandle, filePath: relPath, parentDirHandle: dir });
        parentByPath.set(relPath, dir);
      }
      if (entry.kind === "directory") {
        await scan(entry as FileSystemDirectoryHandle, relPath);
      }
      result = await iter.next();
    }
  }

  await scan(dirHandle, pathPrefix);
  return { items, parentByPath };
}

/**
 * Recursively collect all FileSystemFileHandle objects from a directory
 * that have font extensions (.ttf, .otf, .woff, .woff2).
 * Requests read permission before iterating so all entries are exposed.
 * For parent handle (e.g. Stage 9 rename), use collectFontHandlesWithParents instead.
 */
export async function collectFontHandles(
  dirHandle: FileSystemDirectoryHandle
): Promise<FileSystemFileHandle[]> {
  const { items } = await collectFontHandlesWithParents(dirHandle);
  return items.map((i) => i.handle);
}

/**
 * Given a FileSystemFileHandle, load and parse it through the existing FontLoader
 * pipeline, returning a CachedFont. Returns null if parsing fails.
 */
export async function parseFontHandle(handle: FileSystemFileHandle): Promise<CachedFont | null> {
  try {
    const file = await handle.getFile();
    const cachedFont = await loadFontFile(file, handle);
    return cachedFont;
  } catch (err) {
    console.warn("[directoryScanner] Failed to parse font:", handle.name, err);
    return null;
  }
}

/**
 * Fast listing-pass scan: reads only the name table, glyph count, feature tags,
 * and format — no hash, no worker, no cache write. Returns a lightweight CachedFont
 * with _quickLoad: true so the full pipeline can be deferred until the row is selected.
 */
export async function quickScanFontHandle(
  handle: FileSystemFileHandle
): Promise<CachedFont | null> {
  try {
    const file = await handle.getFile();
    const buffer = await file.arrayBuffer();
    const format = getFontFormat(file.name);

    let parseBuffer = buffer;
    if (format === "woff" || format === "woff2") {
      parseBuffer = await decompressFont(buffer);
    }

    const quick = parseOpentypeQuick(parseBuffer);

    let familyName = "Unknown";
    let styleName = "Regular";
    let numGlyphs = 0;
    let version = "";
    let postscriptName = "";
    let preferredFamily: string | undefined;
    let preferredSubfamily: string | undefined;
    let features: string[] = [];
    let isVariable = false;
    let availableTables: string[] = [];

    if (quick.success) {
      familyName = quick.familyName;
      styleName = quick.styleName;
      numGlyphs = quick.numGlyphs;

      const f = quick.font as Record<string, any> | null;
      if (f) {
        const names = f.names as Record<string, any> | undefined;
        version = names?.version?.en ?? "";
        postscriptName = names?.postScriptName?.en ?? "";
        preferredFamily = names?.preferredFamily?.en ?? undefined;
        preferredSubfamily = names?.preferredSubfamily?.en ?? undefined;
        isVariable = !!(f.tables as Record<string, any> | undefined)?.fvar;
        availableTables = Object.keys((f.tables as Record<string, any> | undefined) ?? {});

        const seen = new Set<string>();
        for (const feat of (f.tables as any)?.gsub?.features ?? []) {
          if (feat?.tag && !seen.has(feat.tag)) {
            seen.add(feat.tag);
            features.push(feat.tag);
          }
        }
        for (const feat of (f.tables as any)?.gpos?.features ?? []) {
          if (feat?.tag && !seen.has(feat.tag)) {
            seen.add(feat.tag);
            features.push(feat.tag);
          }
        }
      }
    }

    const displayFamily = preferredFamily ?? familyName;
    const displaySubfamily = preferredSubfamily ?? styleName;
    const tempId = `qs::${file.name}::${file.size}::${file.lastModified}`;

    const metadata: GeneralMetadata = {
      familyName,
      subfamilyName: styleName,
      fullName: `${displayFamily} ${displaySubfamily}`.trim(),
      version,
      postscriptName,
      copyright: "",
      manufacturer: "",
      designer: "",
      description: "",
      manufacturerURL: "",
      designerURL: "",
      license: "",
      licenseURL: "",
      preferredFamily,
      preferredSubfamily,
    };

    const misc: MiscellaneousData = {
      glyphCount: numGlyphs,
      weightClass: null,
      widthClass: null,
      italicAngle: null,
      fsSelection: { isItalic: false, isBold: false, isRegular: true, useTypoMetrics: false },
      fsType: null,
      fsTypeInterpreted: "",
      isFixedPitch: false,
      availableTables,
    };

    return {
      id: tempId,
      name: `${displayFamily} ${displaySubfamily}`.trim(),
      fileName: file.name,
      fileData: new ArrayBuffer(0),
      format,
      isVariable,
      glyphCount: numGlyphs,
      features,
      featureDetails: [],
      timestamp: file.lastModified,
      lastAccessed: Date.now(),
      fileSize: file.size,
      metadata,
      misc,
      _quickLoad: true,
    };
  } catch (err) {
    console.warn("[directoryScanner] Failed to quick scan font:", handle.name, err);
    return null;
  }
}
