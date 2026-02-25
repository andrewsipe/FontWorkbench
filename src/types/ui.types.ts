/**
 * Minimal UI types for engine compatibility (FontLoader reload path).
 * Full UI types are not used by Font Workbench.
 */

export interface TabSettings {
  axisValues: Record<string, number>;
  [key: string]: unknown;
}

export interface FontTab {
  id: string;
  fontId: string;
  settings: TabSettings;
  [key: string]: unknown;
}
