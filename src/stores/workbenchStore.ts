/**
 * Workbench state: processed/unprocessed dirs, index, unprocessed fonts with
 * match results, family grouping, selection, and rename/removal queues.
 */

import { create } from "zustand";
import { collectFontHandlesWithParents, parseFontHandle } from "../lib/directoryScanner";
import type { IndexRecord, Progress } from "../lib/indexBuilder";
import {
  getAppConfig,
  loadIndex,
  loadProcessedHandle,
  rebuildIndex as rebuildIndexDb,
  saveProcessedHandle,
} from "../lib/indexBuilder";
import type { MatchResult } from "../lib/matcher";
import { matchFont } from "../lib/matcher";
import type { CachedFont } from "../types/font.types";

export interface UnprocessedItem {
  font: CachedFont;
  filePath: string;
  parentDirHandle: FileSystemDirectoryHandle;
}

export interface RenameQueueItem {
  filePath: string;
  newFileName: string;
  parentDirHandle: FileSystemDirectoryHandle;
}

export interface RemovalQueueItem {
  filePath: string;
  parentDirHandle: FileSystemDirectoryHandle;
}

function getFamily(font: CachedFont): string {
  return font.metadata?.preferredFamily ?? font.metadata?.familyName ?? font.name;
}

function groupItemsByFamily(items: UnprocessedItem[]): Map<string, UnprocessedItem[]> {
  const map = new Map<string, UnprocessedItem[]>();
  for (const item of items) {
    const family = getFamily(item.font);
    const list = map.get(family) ?? [];
    list.push(item);
    map.set(family, list);
  }
  return map;
}

export type AppView = "setup" | "workbench";

export interface WorkbenchState {
  appView: AppView;

  // Dir handles (in-memory only; re-pick on reload)
  processedDirHandle: FileSystemDirectoryHandle | null;
  unprocessedDirHandle: FileSystemDirectoryHandle | null;

  // Processed collection: index from IndexedDB
  processedIndex: IndexRecord[];
  indexLoaded: boolean;
  appConfig: { processedDirName: string; unprocessedDirName: string; lastIndexed: number } | null;

  // Unprocessed: from last scan
  unprocessedItems: UnprocessedItem[];
  matchResults: Map<string, MatchResult>;
  familyGroups: Map<string, UnprocessedItem[]>;

  // Selection
  selectedFamily: string | null;
  selectedFontFilePath: string | null;

  // Queues for Apply (Stage 9)
  renameQueue: RenameQueueItem[];
  removalQueue: RemovalQueueItem[];

  // Loading / progress
  scanProgress: Progress | null;
  indexProgress: Progress | null;

  /** True when a persisted processed handle exists but permission was not granted on init (show re-auth banner). */
  processedHandleNeedsReauth: boolean;
}

export interface WorkbenchActions {
  setAppView: (view: AppView) => void;
  setProcessedDir: (handle: FileSystemDirectoryHandle | null) => Promise<void>;
  setUnprocessedDir: (handle: FileSystemDirectoryHandle | null) => void;
  loadProcessedIndex: () => Promise<void>;
  restoreProcessedHandle: () => Promise<void>;
  scanUnprocessed: (onProgress?: (p: Progress) => void) => Promise<void>;
  selectFamily: (family: string | null) => void;
  selectFont: (filePath: string | null) => void;
  queueRename: (filePath: string, newFileName: string) => void;
  queueRemoval: (filePath: string) => void;
  cancelQueueItem: (filePath: string) => void;
  applyAll: () => Promise<{ renames: number; removals: number; error?: string }>;
  rebuildIndex: (onProgress?: (p: Progress) => void) => Promise<void>;
  clearSelection: () => void;
  clearQueues: () => void;
}

export type WorkbenchStore = WorkbenchState & WorkbenchActions;

const initialState: WorkbenchState = {
  appView: "setup",
  processedDirHandle: null,
  unprocessedDirHandle: null,
  processedIndex: [],
  indexLoaded: false,
  appConfig: null,
  unprocessedItems: [],
  matchResults: new Map(),
  familyGroups: new Map(),
  selectedFamily: null,
  selectedFontFilePath: null,
  renameQueue: [],
  removalQueue: [],
  scanProgress: null,
  indexProgress: null,
  processedHandleNeedsReauth: false,
};

export const useWorkbenchStore = create<WorkbenchStore>((set, get) => ({
  ...initialState,

  setAppView: (view) => set({ appView: view }),

  setProcessedDir: async (handle) => {
    set({
      processedDirHandle: handle,
      processedIndex: [],
      indexLoaded: false,
      appConfig: handle ? await getAppConfig().then((c) => (c ? { ...c } : null)) : null,
      processedHandleNeedsReauth: false,
    });
    if (!handle) {
      set({ appConfig: null });
      return;
    }
    await saveProcessedHandle(handle);
    const records = await loadIndex();
    set({
      processedIndex: records ?? [],
      indexLoaded: true,
    });
  },

  setUnprocessedDir: (handle) => {
    set({
      unprocessedDirHandle: handle,
      unprocessedItems: [],
      matchResults: new Map(),
      familyGroups: new Map(),
      selectedFamily: null,
      selectedFontFilePath: null,
      renameQueue: [],
      removalQueue: [],
    });
  },

  loadProcessedIndex: async () => {
    const records = await loadIndex();
    const config = await getAppConfig();
    set({
      processedIndex: records ?? [],
      indexLoaded: true,
      appConfig: config ? { ...config } : null,
    });
  },

  restoreProcessedHandle: async () => {
    const handle = await loadProcessedHandle();
    if (!handle) return;
    const permission =
      typeof handle.requestPermission === "function"
        ? await handle.requestPermission({ mode: "read" })
        : "granted";
    if (permission === "granted") {
      set({
        processedDirHandle: handle,
        processedIndex: [],
        indexLoaded: false,
        processedHandleNeedsReauth: false,
      });
      const records = await loadIndex();
      const config = await getAppConfig();
      set({
        processedIndex: records ?? [],
        indexLoaded: true,
        appConfig: config ? { ...config } : null,
      });
    } else {
      set({ processedHandleNeedsReauth: true });
    }
  },

  scanUnprocessed: async (onProgress) => {
    const { unprocessedDirHandle, processedIndex } = get();
    if (!unprocessedDirHandle) return;

    set({ scanProgress: { scanned: 0, total: 0, currentFile: "" } });
    const { items } = await collectFontHandlesWithParents(unprocessedDirHandle);
    const total = items.length;
    const unprocessedItems: UnprocessedItem[] = [];
    const matchResults = new Map<string, MatchResult>();

    for (let i = 0; i < items.length; i++) {
      const { handle, filePath, parentDirHandle } = items[i];
      onProgress?.({ scanned: i, total, currentFile: handle.name });
      set({ scanProgress: { scanned: i, total, currentFile: handle.name } });
      const font = await parseFontHandle(handle);
      if (font) {
        unprocessedItems.push({ font, filePath, parentDirHandle });
        matchResults.set(filePath, matchFont(font, processedIndex));
      }
    }
    onProgress?.({ scanned: total, total, currentFile: "" });
    const familyGroups = groupItemsByFamily(unprocessedItems);
    set({
      unprocessedItems,
      matchResults,
      familyGroups,
      scanProgress: null,
      selectedFamily: null,
      selectedFontFilePath: null,
    });
  },

  selectFamily: (family) => {
    set({
      selectedFamily: family,
      selectedFontFilePath: null,
    });
  },

  selectFont: (filePath) => {
    set({ selectedFontFilePath: filePath });
  },

  clearSelection: () => {
    set({ selectedFamily: null, selectedFontFilePath: null });
  },

  queueRename: (filePath, newFileName) => {
    const item = get().unprocessedItems.find((i) => i.filePath === filePath);
    if (!item) return;
    const existing = get().renameQueue.find((q) => q.filePath === filePath);
    if (existing) {
      set((s) => ({
        renameQueue: s.renameQueue.map((q) =>
          q.filePath === filePath ? { ...q, newFileName } : q
        ),
      }));
      return;
    }
    set((s) => ({
      renameQueue: [
        ...s.renameQueue,
        { filePath, newFileName, parentDirHandle: item.parentDirHandle },
      ],
    }));
  },

  queueRemoval: (filePath) => {
    const item = get().unprocessedItems.find((i) => i.filePath === filePath);
    if (!item) return;
    set((s) => ({
      removalQueue: [...s.removalQueue, { filePath, parentDirHandle: item.parentDirHandle }],
    }));
  },

  cancelQueueItem: (filePath) => {
    set((s) => ({
      renameQueue: s.renameQueue.filter((q) => q.filePath !== filePath),
      removalQueue: s.removalQueue.filter((q) => q.filePath !== filePath),
    }));
  },

  clearQueues: () => {
    set({ renameQueue: [], removalQueue: [] });
  },

  applyAll: async () => {
    const { renameQueue, removalQueue } = get();
    let renames = 0;
    let removals = 0;
    let error: string | undefined;

    const basename = (path: string) => path.split("/").pop() ?? path;

    const dirsToWrite = new Set<FileSystemDirectoryHandle>([
      ...renameQueue.map((q) => q.parentDirHandle),
      ...removalQueue.map((q) => q.parentDirHandle),
    ]);
    for (const dir of dirsToWrite) {
      if (typeof dir.requestPermission === "function") {
        const perm = await dir.requestPermission({ mode: "readwrite" });
        if (perm !== "granted") {
          return { renames: 0, removals: 0, error: "Write permission denied for directory." };
        }
      }
    }

    try {
      for (const { filePath, newFileName, parentDirHandle } of renameQueue) {
        const fileName = basename(filePath);
        const targetName = (newFileName ?? "").trim() || fileName;
        if (targetName === fileName) {
          renames++;
          continue;
        }
        if (targetName.includes("/") || targetName.includes("\\")) continue;
        const fileHandle = await parentDirHandle.getFileHandle(fileName);
        if (!(fileHandle instanceof FileSystemFileHandle)) continue;
        const file = await fileHandle.getFile();
        const newHandle = await parentDirHandle.getFileHandle(targetName, { create: true });
        if (!(newHandle instanceof FileSystemFileHandle)) continue;
        const writable = await newHandle.createWritable();
        await writable.write(await file.arrayBuffer());
        await writable.close();
        await parentDirHandle.removeEntry(fileName);
        renames++;
      }

      // Move removed files to _workbench_trash/ in the same directory (recoverable)
      const TRASH_DIR = "_workbench_trash";
      for (const { filePath, parentDirHandle } of removalQueue) {
        const fileName = basename(filePath);
        try {
          const fileHandle = await parentDirHandle.getFileHandle(fileName);
          if (!(fileHandle instanceof FileSystemFileHandle)) continue;
          const file = await fileHandle.getFile();
          const trashDir = await parentDirHandle.getDirectoryHandle(TRASH_DIR, { create: true });
          const lastDot = fileName.lastIndexOf(".");
          const base = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
          const ext = lastDot > 0 ? fileName.slice(lastDot) : "";
          const trashFileName = `${base}_${Date.now()}${ext}`;
          const trashFile = await trashDir.getFileHandle(trashFileName, { create: true });
          if (!(trashFile instanceof FileSystemFileHandle)) continue;
          const writable = await trashFile.createWritable();
          await writable.write(await file.arrayBuffer());
          await writable.close();
          await parentDirHandle.removeEntry(fileName);
          removals++;
        } catch (e) {
          error = error ?? (e instanceof Error ? e.message : String(e));
        }
      }

      if (renames > 0 || removals > 0) {
        const donePaths = new Set([
          ...renameQueue.map((q) => q.filePath),
          ...removalQueue.map((q) => q.filePath),
        ]);
        set((s) => {
          const nextItems = s.unprocessedItems.filter((i) => !donePaths.has(i.filePath));
          const nextFamilies = groupItemsByFamily(nextItems);
          const nextMatchResults = new Map(s.matchResults);
          for (const path of donePaths) nextMatchResults.delete(path);
          const selectedGone = s.selectedFontFilePath && donePaths.has(s.selectedFontFilePath);
          return {
            renameQueue: s.renameQueue.filter((q) => !donePaths.has(q.filePath)),
            removalQueue: s.removalQueue.filter((q) => !donePaths.has(q.filePath)),
            unprocessedItems: nextItems,
            familyGroups: nextFamilies,
            matchResults: nextMatchResults,
            ...(selectedGone ? { selectedFontFilePath: null as string | null } : {}),
          };
        });
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    return { renames, removals, error };
  },

  rebuildIndex: async (onProgress) => {
    const { processedDirHandle } = get();
    if (!processedDirHandle) return;
    set({ indexProgress: { scanned: 0, total: 0, currentFile: "" } });
    await rebuildIndexDb(processedDirHandle, (p) => {
      set({ indexProgress: p });
      onProgress?.(p);
    });
    set({ indexProgress: null });
    const records = await loadIndex();
    set({ processedIndex: records ?? [] });
  },
}));
