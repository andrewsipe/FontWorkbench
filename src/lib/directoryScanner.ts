/**
 * Directory scanner for font files.
 * Recursively collects font file handles and parses them via the FontLoader pipeline.
 * Tracks parent directory per file for Stage 9 rename (write-new-delete-old).
 */

import { loadFontFile } from "../engine/FontLoader";
import type { CachedFont } from "../types/font.types";

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
