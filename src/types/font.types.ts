/**
 * Font-related type definitions
 */

import type { FontMetrics, GeneralMetadata, MiscellaneousData } from "./extractors.types";

export interface VariableAxis {
  tag: string; // 'wght', 'wdth', 'slnt', etc.
  name: string; // Display name
  min: number;
  max: number;
  default: number;
  current: number;
}

export interface OpenTypeFeature {
  tag: string; // 'ss01', 'liga', 'case', etc.
  name: string; // Human-readable name
  enabled: boolean;
  category: "stylistic" | "ligature" | "script" | "figure" | "capital" | "positional" | "other";
  uinameid?: number; // UI Name ID from font name table
}

export interface InstanceSnapshot {
  coordinates: Record<string, number>;
  subfamilyNameID: number | null;
  sources: string[]; // Track where instance came from: 'fontkit', 'fvar', etc.
  postScriptNameID?: number | null; // OpenType 1.8+ per-instance PostScript name ID
  // NO name field - names resolved later
}

export interface NamedVariation {
  name: string;
  coordinates: Record<string, number>; // axis tag -> value
}

export interface CachedFont {
  id: string; // UUID
  name: string;
  fileName: string;
  fileData: ArrayBuffer; // Always decompressed (for parsing)
  originalFileData?: ArrayBuffer; // Original compressed (only for WOFF/WOFF2, for browser loading)
  format: "ttf" | "otf" | "woff" | "woff2";
  isVariable: boolean;
  axes?: VariableAxis[];
  features?: string[];
  featureDetails?: OpenTypeFeature[];
  namedVariations?: NamedVariation[];
  timestamp: number;
  lastAccessed: number;
  cacheVersion?: number; // Version number for cache invalidation when parsing logic improves
  // Phase 3: Enhanced metadata from extractors
  metadata?: GeneralMetadata; // Full general metadata from MetadataExtractor
  metrics?: FontMetrics; // Font metrics from MetricsExtractor
  misc?: MiscellaneousData; // Miscellaneous data from MiscExtractor
  /** Glyph count (quick-load display or from misc) */
  glyphCount?: number;
  /** File size in bytes — set during quick scan when fileData is not stored */
  fileSize?: number;

  /** True when font was shown via two-phase quick load; full metadata still loading */
  _quickLoad?: boolean;
}

export interface FontMetadata {
  familyName: string;
  styleName: string;
  isVariable: boolean;
  axes?: VariableAxis[];
  features: string[];
  featureDetails?: OpenTypeFeature[];
  namedVariations?: NamedVariation[];
  glyphCount: number;
  // Phase 3: Enhanced metadata from extractors
  metadata?: GeneralMetadata; // Full general metadata from MetadataExtractor
  metrics?: FontMetrics; // Font metrics from MetricsExtractor
  misc?: MiscellaneousData; // Miscellaneous data from MiscExtractor
}

export type ViewMode = "plain" | "waterfall" | "styles" | "glyphs" | "present";
