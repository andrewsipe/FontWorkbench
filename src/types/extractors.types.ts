/**
 * Type definitions for extractor architecture
 * Phase 1: Foundation types and interfaces
 */

import type { InstanceSnapshot, NamedVariation, OpenTypeFeature } from "./font.types";

/**
 * Name table data structure
 * Maps nameID to resolved string value
 */
export interface NameTableData {
  [nameID: number]: string | null;
}

/**
 * Metrics table data
 * Contains typographic and OS/2 metrics from font tables
 *
 * OS/2 table fields:
 * - typoAscender (sTypoAscender), typoDescender (sTypoDescender), typoLineGap (sTypoLineGap)
 * - winAscent (usWinAscent), winDescent (usWinDescent)
 * - capHeight (sCapHeight), xHeight (sxHeight)
 * - strikeoutPosition (yStrikeoutPosition), strikeoutSize (yStrikeoutSize)
 *
 * head table fields:
 * - unitsPerEm (required)
 * - underlinePosition, underlineThickness (note: these are in head table, not post table)
 *
 * hhea table fields:
 * - hheaAscender, hheaDescender, hheaLineGap
 */
export interface MetricsTableData {
  unitsPerEm?: number; // From head table (required)
  // OS/2 typographic metrics
  typoAscender?: number; // sTypoAscender from OS/2
  typoDescender?: number; // sTypoDescender from OS/2
  typoLineGap?: number; // sTypoLineGap from OS/2
  // OS/2 Windows metrics
  winAscent?: number; // usWinAscent from OS/2
  winDescent?: number; // usWinDescent from OS/2
  // OS/2 height metrics
  capHeight?: number; // sCapHeight from OS/2
  xHeight?: number; // sxHeight from OS/2
  // OS/2 strikeout metrics
  strikeoutPosition?: number; // yStrikeoutPosition from OS/2
  strikeoutSize?: number; // yStrikeoutSize from OS/2
  // hhea table metrics
  hheaAscender?: number;
  hheaDescender?: number;
  hheaLineGap?: number;
  // head table underline metrics (note: these are in head table, not post table)
  underlinePosition?: number; // From head table
  underlineThickness?: number; // From head table
}

/**
 * Variable axis data
 */
export interface AxisData {
  tag: string;
  name: string | { en?: string } | null;
  min: number;
  max: number;
  default: number;
}

/**
 * Fvar table data
 */
export interface FvarTableData {
  axes?: AxisData[];
  instances?: Array<{
    coordinates: Record<string, number> | number[];
    subfamilyNameID?: number;
    postScriptNameID?: number;
  }>;
  rawData?: Uint8Array; // For binary parsing
}

/**
 * GSUB table data
 */
export interface GsubTableData {
  features?: Array<{
    tag: string;
    featureParams?: unknown;
  }>;
}

/**
 * GPOS table data
 */
export interface GposTableData {
  features?: Array<{
    tag: string;
    featureParams?: unknown;
  }>;
}

/**
 * Unified ParsedFont interface
 * Abstracts differences between fontkit and opentype.js
 * Uses accessor methods to prevent library-specific property access
 */
export interface ParsedFont {
  source: "fontkit" | "opentype";

  // Accessor methods (not direct properties)
  getNameTable(): NameTableData | null;
  getMetricsTable(): MetricsTableData | null;
  getVariationAxes(): AxisData[] | null;
  getFvarTable(): FvarTableData | null;
  getGsubTable(): GsubTableData | null;
  getGposTable(): GposTableData | null;

  // Raw access for edge cases (extractors should prefer accessors)
  raw: unknown; // FontkitFont | OpentypeFont — untyped third-party
}

/**
 * Extraction result pattern
 * Allows extractors to return partial success or failure
 */
export interface ExtractionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  warnings?: string[];
}

/**
 * Name table interface
 * Provides unified API for name lookups
 */
export interface NameTable {
  get(nameID: number): string | null;
  getAll(): NameTableData;
}

/**
 * General metadata (name table entries)
 */
export interface GeneralMetadata {
  familyName: string;
  subfamilyName: string;
  uniqueIdentifier?: string; // Name ID 3
  fullName: string;
  version: string;
  postscriptName: string;
  copyright: string;
  manufacturer: string;
  designer: string;
  description: string;
  manufacturerURL: string;
  designerURL: string;
  license: string;
  licenseURL: string;
  preferredFamily?: string; // Name ID 16
  preferredSubfamily?: string; // Name ID 17
}

/**
 * Font metrics
 * Contains metrics from OS/2, head, and hhea tables
 *
 * OS/2 table metrics:
 * - typoAscender, typoDescender, typoLineGap (sTypoAscender, sTypoDescender, sTypoLineGap)
 * - winAscent, winDescent (usWinAscent, usWinDescent)
 * - capHeight, xHeight (sCapHeight, sxHeight)
 * - strikeoutPosition, strikeoutSize (yStrikeoutPosition, yStrikeoutSize)
 *
 * head table metrics:
 * - unitsPerEm (required)
 * - underlinePosition, underlineThickness (note: these are in head table, not post table)
 *
 * hhea table metrics:
 * - hheaAscender, hheaDescender, hheaLineGap
 */
export interface FontMetrics {
  unitsPerEm: number; // From head table (required)
  // OS/2 typographic metrics
  typoAscender: number | null; // sTypoAscender from OS/2
  typoDescender: number | null; // sTypoDescender from OS/2
  typoLineGap: number | null; // sTypoLineGap from OS/2
  // OS/2 Windows metrics
  winAscent: number | null; // usWinAscent from OS/2
  winDescent: number | null; // usWinDescent from OS/2
  // OS/2 height metrics
  capHeight: number | null; // sCapHeight from OS/2
  xHeight: number | null; // sxHeight from OS/2
  // OS/2 strikeout metrics
  strikeoutPosition: number | null; // yStrikeoutPosition from OS/2
  strikeoutSize: number | null; // yStrikeoutSize from OS/2
  // hhea table metrics
  hheaAscender: number | null;
  hheaDescender: number | null;
  hheaLineGap: number | null;
  // head table underline metrics (note: these are in head table, not post table)
  underlinePosition: number | null; // From head table
  underlineThickness: number | null; // From head table
}

/**
 * Miscellaneous font data
 */
export interface MiscellaneousData {
  glyphCount: number;
  weightClass: number | null;
  widthClass: number | null;
  italicAngle: number | null;
  underlinePosition: number | null;
  underlineThickness: number | null;
  fsSelection: {
    isItalic: boolean;
    isBold: boolean;
    isRegular: boolean;
    useTypoMetrics: boolean;
  };
  fsType: number | null;
  fsTypeInterpreted: string;
  isFixedPitch: boolean;
  availableTables: string[]; // 4-character table tags
  vendorID?: string | null; // 4-character achVendID from OS/2
}

/**
 * Union of all extractor outputs
 */
export interface ExtractedMetadata {
  metadata?: GeneralMetadata;
  metrics?: FontMetrics;
  misc?: MiscellaneousData;
}

/**
 * Complete extraction suite containing all extractor results
 * Used for parallel extraction pipeline
 */
export interface FontExtractionSuite {
  nameTable: ExtractionResult<NameTable>;
  metadata: ExtractionResult<GeneralMetadata>;
  metrics: ExtractionResult<FontMetrics>;
  misc: ExtractionResult<MiscellaneousData>;
  features: ExtractionResult<OpenTypeFeature[]>;
  axes: ExtractionResult<AxisData[]>;
  instances: ExtractionResult<InstanceSnapshot[] | NamedVariation[]>;
}

/**
 * Extractor dependency graph
 * Defines explicit execution order and dependencies
 */
export const EXTRACTION_ORDER: {
  phase1: string[];
  phase2Independent: string[];
  phase3RequiresName: string[];
  phase4RequiresAxes: string[];
  phase5Resolvers: string[];
} = {
  // Phase 1: Name extraction (required by others)
  phase1: ["NameExtractor"],

  // Phase 2: Independent extractors (can run in parallel)
  phase2Independent: ["MetricsExtractor", "MiscExtractor"],

  // Phase 3: Extractors that require NameExtractor
  phase3RequiresName: ["MetadataExtractor", "FeatureExtractor"],

  // Phase 4: Extractors that might need axes data
  phase4RequiresAxes: ["InstanceExtractor"],

  // Phase 5: Resolvers (require all extraction complete)
  phase5Resolvers: ["NameResolver", "InstanceResolver"],
};

/**
 * Validation mode for metadata validation
 */
export const ValidationMode = {
  STRICT: "strict" as const, // Reject entire font if any field invalid
  LENIENT: "lenient" as const, // Use default/null for invalid fields, log warning
  DISABLED: "disabled" as const, // Development mode only
} as const;

export type ValidationMode = (typeof ValidationMode)[keyof typeof ValidationMode];

/**
 * Structured log entry
 */
export interface LogEntry {
  timestamp: number;
  level: "info" | "warn" | "error" | "debug";
  extractor: string;
  action: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}
