/**
 * Minimal font store stub for engine compatibility.
 * FontLoader's reloadWatchedFile() dynamically imports this.
 * Font Workbench does not use font tabs; this only satisfies the import.
 */

import { create } from "zustand";
import type { CachedFont } from "../types/font.types";

interface FontState {
  fonts: Map<string, CachedFont>;
  fontsByFileName: Map<string, string>;
}

export const useFontStore = create<FontState>(() => ({
  fonts: new Map(),
  fontsByFileName: new Map(),
}));
