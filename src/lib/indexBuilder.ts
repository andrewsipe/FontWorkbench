/**
 * Processed collection index: scan directory, parse fonts, store lightweight
 * IndexRecords in IndexedDB. No ArrayBuffer stored — only strings and numbers.
 */

import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import { findTableOffset } from "../engine/parsers/RawTableParser";
import type { CachedFont } from "../types/font.types";
import { collectFontHandlesWithParents, parseFontHandle } from "./directoryScanner";

export interface IndexRecord {
  filePath: string;
  fileName: string;
  familyName: string;
  /** Name ID 6. Used for L1 match. */
  psName: string;
  /** Name ID 4 full name. Used for L2 match. */
  fullName?: string;
  /** Name ID 2 subfamily. Used for L3/L4. */
  subfamilyName?: string;
  version: string;
  fontRevision: number;
  glyphCount: number;
  availableTables: string[];
  featureTags: string[];
  format: "otf" | "ttf" | "woff" | "woff2";
  /** File size in bytes. Optional for backwards compat with existing indexes. */
  fileSize?: number;
}

export interface Progress {
  scanned: number;
  total: number;
  currentFile: string;
}

export interface AppConfig {
  id: "config";
  processedDirName: string;
  unprocessedDirName: string;
  lastIndexed: number;
}

const DB_NAME = "font-workbench";
const DB_VERSION = 1;

interface FontWorkbenchDBSchema extends DBSchema {
  "processed-index": {
    key: string;
    value: IndexRecord;
    indexes: { "by-familyName": string };
  };
  "app-config": {
    key: string;
    value: AppConfig | { id: "processed-handle"; handle: FileSystemDirectoryHandle };
    indexes: Record<string, never>;
  };
}

function getFontRevisionFromBuffer(buffer: ArrayBuffer): number {
  const head = findTableOffset(buffer, "head");
  if (!head || head.length < 8) return 0;
  const view = new DataView(buffer, head.offset, head.length);
  const raw = view.getUint32(4, false);
  return raw / 65536;
}

function cachedFontToIndexRecord(
  cached: CachedFont,
  filePath: string,
  fileName: string
): IndexRecord {
  const familyName = cached.metadata?.preferredFamily ?? cached.metadata?.familyName ?? cached.name;
  const version = cached.metadata?.version ?? "";
  const psName = cached.metadata?.postscriptName ?? "";
  const fullName = cached.metadata?.fullName ?? "";
  const subfamilyName = cached.metadata?.subfamilyName ?? cached.metadata?.preferredSubfamily ?? "";
  const glyphCount = cached.glyphCount ?? cached.misc?.glyphCount ?? 0;
  const availableTables = cached.misc?.availableTables ?? [];
  const featureTags = cached.features ?? [];
  const fontRevision = cached.fileData ? getFontRevisionFromBuffer(cached.fileData) : 0;
  const fileSize = cached.fileData?.byteLength ?? 0;

  return {
    filePath,
    fileName,
    familyName,
    psName,
    fullName,
    subfamilyName,
    version,
    fontRevision,
    glyphCount,
    availableTables,
    featureTags,
    format: cached.format,
    fileSize,
  };
}

async function getDB(): Promise<IDBPDatabase<FontWorkbenchDBSchema>> {
  return openDB<FontWorkbenchDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("processed-index")) {
        const store = db.createObjectStore("processed-index", { keyPath: "fileName" });
        store.createIndex("by-familyName", "familyName");
      }
      if (!db.objectStoreNames.contains("app-config")) {
        db.createObjectStore("app-config", { keyPath: "id" });
      }
    },
  });
}

/** Persist processed directory handle for restore on next load (Chrome serialises permission reference). */
export async function saveProcessedHandle(
  handle: FileSystemDirectoryHandle
): Promise<void> {
  const db = await getDB();
  await db.put("app-config", { id: "processed-handle", handle });
  db.close();
}

/** Load persisted processed handle; call requestPermission before using. */
export async function loadProcessedHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await getDB();
  const row = await db.get("app-config", "processed-handle");
  db.close();
  const entry = row as { handle?: FileSystemDirectoryHandle } | undefined;
  return entry?.handle ?? null;
}

/**
 * Scan directory, parse each font, store IndexRecords in IndexedDB.
 * Progress callback receives { scanned, total, currentFile }.
 * Parsing is done first (so no long async gaps inside an IDB transaction).
 */
export async function buildIndex(
  dirHandle: FileSystemDirectoryHandle,
  onProgress: (p: Progress) => void
): Promise<void> {
  const { items } = await collectFontHandlesWithParents(dirHandle);
  const total = items.length;
  const records: IndexRecord[] = [];

  for (let i = 0; i < items.length; i++) {
    const { handle, filePath } = items[i];
    const fileName = handle.name;
    onProgress({ scanned: i, total, currentFile: fileName });
    const cached = await parseFontHandle(handle);
    if (cached) {
      records.push(cachedFontToIndexRecord(cached, filePath, fileName));
    }
  }
  onProgress({ scanned: total, total, currentFile: "" });

  const db = await getDB();
  const tx = db.transaction("processed-index", "readwrite");
  const store = tx.objectStore("processed-index");
  for (const record of records) {
    store.put(record);
  }
  await tx.done;

  const configTx = db.transaction("app-config", "readwrite");
  await configTx.objectStore("app-config").put({
    id: "config",
    processedDirName: dirHandle.name ?? "",
    unprocessedDirName: "",
    lastIndexed: Date.now(),
  });
  await configTx.done;
  db.close();
}

/**
 * Load existing index from IndexedDB. Returns null if no index exists.
 */
export async function loadIndex(): Promise<IndexRecord[] | null> {
  const db = await getDB();
  const all = await db.getAll("processed-index");
  db.close();
  if (all.length === 0) return null;
  return all;
}

/**
 * Clear processed-index and rebuild from directory.
 */
export async function rebuildIndex(
  dirHandle: FileSystemDirectoryHandle,
  onProgress: (p: Progress) => void
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("processed-index", "readwrite");
  await tx.objectStore("processed-index").clear();
  await tx.done;
  db.close();
  await buildIndex(dirHandle, onProgress);
}

/**
 * Load app config from IndexedDB (for Setup view: show last indexed, dir names).
 */
export async function getAppConfig(): Promise<AppConfig | null> {
  const db = await getDB();
  const config = await db.get("app-config", "config");
  db.close();
  return config ?? null;
}
