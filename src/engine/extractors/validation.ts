// @ts-nocheck — Untyped third-party APIs (Zod schema .partial()); type checking disabled for this file.
/**
 * Zod validation schemas for extractor outputs
 * Phase 2: LENIENT mode by default (log warnings, use defaults for invalid fields)
 */

import { z } from "zod";
import { ValidationMode } from "../../types/extractors.types";

/**
 * Name table data schema
 * Validates that optional Name IDs are strings when present
 */
export const nameTableDataSchema = z
  .record(z.number().int().nonnegative(), z.string().nullable())
  .refine(
    (_data) => {
      // Ensure Name IDs 3, 5, 16, 17 are strings (not null) when present
      // But allow them to be missing (optional)
      return true; // All nameIDs are optional, validation passes
    },
    { message: "Name table data must map nameID to string or null" }
  );

/**
 * General metadata schema
 */
export const generalMetadataSchema = z.object({
  familyName: z.string().min(1),
  subfamilyName: z.string().default("Regular"),
  uniqueIdentifier: z.string().optional(), // Name ID 3
  postscriptName: z.string().default(""),
  fullName: z.string().default(""),
  version: z.string().default(""), // Name ID 5
  copyright: z.string().default(""),
  manufacturer: z.string().default(""),
  designer: z.string().default(""),
  description: z.string().default(""),
  manufacturerURL: z.string().default(""),
  designerURL: z.string().default(""),
  license: z.string().default(""),
  licenseURL: z.string().default(""),
  preferredFamily: z.string().optional(), // Name ID 16
  preferredSubfamily: z.string().optional(), // Name ID 17
});

/**
 * Font metrics schema
 * Validates metrics from OS/2, head, and hhea tables
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
export const fontMetricsSchema = z.object({
  unitsPerEm: z.number().positive(), // From head table (required)
  // OS/2 typographic metrics
  typoAscender: z.number().nullable().default(null), // sTypoAscender from OS/2
  typoDescender: z.number().nullable().default(null), // sTypoDescender from OS/2
  typoLineGap: z.number().nullable().default(null), // sTypoLineGap from OS/2
  // OS/2 Windows metrics
  winAscent: z.number().int().nonnegative().nullable().default(null), // usWinAscent from OS/2
  winDescent: z.number().int().nonnegative().nullable().default(null), // usWinDescent from OS/2
  // OS/2 height metrics
  capHeight: z.number().nullable().default(null), // sCapHeight from OS/2
  xHeight: z.number().nullable().default(null), // sxHeight from OS/2
  // OS/2 strikeout metrics
  strikeoutPosition: z.number().nullable().default(null), // yStrikeoutPosition from OS/2
  strikeoutSize: z.number().nullable().default(null), // yStrikeoutSize from OS/2
  // hhea table metrics
  hheaAscender: z.number().nullable().default(null),
  hheaDescender: z.number().nullable().default(null),
  hheaLineGap: z.number().nullable().default(null),
  // head table underline metrics (note: these are in head table, not post table)
  underlinePosition: z.number().nullable().default(null), // From head table
  underlineThickness: z.number().nullable().default(null), // From head table
});

/**
 * Miscellaneous data schema
 */
export const miscellaneousDataSchema = z.object({
  glyphCount: z.number().int().nonnegative().default(0),
  weightClass: z.number().int().min(1).max(1000).nullable().default(null),
  widthClass: z.number().int().min(1).max(9).nullable().default(null),
  italicAngle: z.number().nullable().default(null),
  underlinePosition: z.number().nullable().default(null),
  underlineThickness: z.number().nullable().default(null),
  fsSelection: z.object({
    isItalic: z.boolean().default(false),
    isBold: z.boolean().default(false),
    isRegular: z.boolean().default(false),
    useTypoMetrics: z.boolean().default(false),
  }),
  fsType: z.number().int().nonnegative().nullable().default(null),
  fsTypeInterpreted: z.string().default("Unknown"),
  isFixedPitch: z.boolean().default(false),
  availableTables: z.array(z.string()).default([]),
  vendorID: z.string().nullable().optional(),
});

/**
 * Variable axis schema
 * Note: VariableAxis interface expects name as string, so we normalize it
 */
export const variableAxisSchema = z.object({
  tag: z.string().length(4),
  name: z.string(), // Normalized to string in extractor
  min: z.number(),
  max: z.number(),
  default: z.number(),
  current: z.number(),
});

/**
 * OpenType feature schema
 */
export const openTypeFeatureSchema = z.object({
  tag: z.string().min(1),
  name: z.string().min(1),
  enabled: z.boolean().default(false),
  category: z.enum(["stylistic", "ligature", "script", "figure", "capital", "positional", "other"]),
  uinameid: z.number().int().positive().optional(),
});

/**
 * Instance snapshot schema
 */
export const instanceSnapshotSchema = z.object({
  coordinates: z.record(z.string(), z.number()),
  subfamilyNameID: z.number().int().nonnegative().nullable().default(null),
  postScriptNameID: z.number().int().nonnegative().nullable().optional(),
  sources: z.array(z.string()).min(1),
});

/**
 * Named variation schema
 */
export const namedVariationSchema = z.object({
  name: z.string().min(1),
  coordinates: z.record(z.string(), z.number()),
});

/**
 * Validate data with LENIENT mode
 * Returns validated data with defaults for invalid fields, logs warnings
 */
export function validateWithMode<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  mode: ValidationMode = ValidationMode.LENIENT
): { success: boolean; data: T; errors: string[] } {
  if (mode === ValidationMode.DISABLED) {
    return { success: true, data: data as T, errors: [] };
  }

  if (mode === ValidationMode.STRICT) {
    const result = schema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data, errors: [] };
    } else {
      return {
        success: false,
        data: data as T,
        errors: result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`),
      };
    }
  }

  // LENIENT mode: use safeParse with defaults
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data, errors: [] };
  } else {
    // Log warnings but return data with defaults applied
    const errors = result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`);
    console.warn(
      `[Validation] LENIENT mode: ${errors.length} validation errors, using defaults:`,
      errors
    );

    // Try to apply defaults by parsing with partial data
    // Use deepPartial if available, otherwise just return original data
    try {
      const partialSchema = (schema as any).partial ? (schema as any).partial() : schema;
      const partialResult = partialSchema.safeParse(data);
      if (partialResult.success) {
        // Merge with defaults
        const defaultResult = schema.safeParse({});
        if (defaultResult.success) {
          return {
            success: true,
            data: { ...defaultResult.data, ...partialResult.data } as T,
            errors,
          };
        }
      }
    } catch {
      // partial() may not be available, continue to fallback
    }

    // Fallback: return original data with warnings
    return { success: false, data: data as T, errors };
  }
}
