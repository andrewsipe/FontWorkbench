/**
 * Minimal UI store stub for engine compatibility.
 * FontLoader's reloadWatchedFile() dynamically imports this.
 * Font Workbench does not use tabs; this only satisfies the import.
 */

import { create } from "zustand";
import type { FontTab, TabSettings } from "../types/ui.types";

interface UIState {
  tabs: FontTab[];
  updateTabSettings: (tabId: string, settings: Partial<TabSettings>) => void;
}

export const useUIStore = create<UIState>(() => ({
  tabs: [],
  updateTabSettings: () => {},
}));
