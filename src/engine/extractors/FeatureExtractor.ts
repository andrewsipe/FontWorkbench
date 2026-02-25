// @ts-nocheck — Untyped third-party APIs (opentype.js / fontkit feature shapes); type checking disabled for this file.
/**
 * Feature extractor
 * Extracts GSUB and GPOS features with UINameID resolution
 * Phase 2: Requires NameExtractor for feature name resolution
 */

import type { ExtractionResult, ParsedFont } from "../../types/extractors.types";
import { ValidationMode } from "../../types/extractors.types";
import type { OpenTypeFeature } from "../../types/font.types";
import { lookupFontkitName, lookupOpentypeName } from "../resolvers/NameResolver";
import { getFeatureName, mapFeatureToCategory, resolveNameId, sortFeatures } from "./FeatureUtils";
import { extractorLogger } from "./logger";
import { extractNameTableFromMultiple } from "./NameExtractor";
import { openTypeFeatureSchema, validateWithMode } from "./validation";

/**
 * Extract OpenType features from parsed fonts
 * Handles UINameID extraction and name resolution.
 * When rawGsubFeatureParams is provided (from binary GSUB parse), it takes precedence
 * over opentype.js/fontkit FeatureParams so ss01–ss20 and cv01–cv99 show correct names.
 */
export function extractFeatures(
  opentypeFont: ParsedFont | null,
  fontkitFont: ParsedFont | null,
  rawGsubFeatureParams?: Record<string, Record<string, unknown>>
): ExtractionResult<OpenTypeFeature[]> {
  const startTime = Date.now();
  extractorLogger.info("FeatureExtractor", "extract", {
    hasOpentype: !!opentypeFont,
    hasFontkit: !!fontkitFont,
    hasRawGsubParams: !!rawGsubFeatureParams && Object.keys(rawGsubFeatureParams ?? {}).length > 0,
  });

  if (!opentypeFont) {
    extractorLogger.error("FeatureExtractor", "extract", {
      error: "Opentype font required for feature extraction",
    });
    return {
      success: false,
      error: "Opentype font required for feature extraction",
    };
  }

  try {
    // Extract name table for UINameID resolution
    const nameTableResult = extractNameTableFromMultiple(opentypeFont, fontkitFont);
    const nameTable = nameTableResult.success ? nameTableResult.data : null;

    const result: Array<{
      tag: string;
      label: string | null;
      uinameid: number | null;
    }> = [];
    const seen = new Set<string>();

    // Process both GSUB and GPOS
    const gsubTable = opentypeFont.getGsubTable();
    const gposTable = opentypeFont.getGposTable();

    // Process GSUB features
    if (gsubTable?.features) {
      for (const feature of gsubTable.features) {
        if (!feature.tag || seen.has(feature.tag)) continue;
        seen.add(feature.tag);

        const extracted = extractFeatureUINameID(
          feature,
          opentypeFont,
          fontkitFont,
          "gsub",
          rawGsubFeatureParams
        );
        result.push(extracted);
      }
    }

    // Process GPOS features
    if (gposTable?.features) {
      for (const feature of gposTable.features) {
        if (!feature.tag || seen.has(feature.tag)) continue;
        seen.add(feature.tag);

        const extracted = extractFeatureUINameID(
          feature,
          opentypeFont,
          fontkitFont,
          "gpos",
          undefined
        );
        result.push(extracted);
      }
    }

    // Resolve feature names using name table
    const features: OpenTypeFeature[] = result.map((f) => {
      let label: string | null = null;

      // Try to resolve name from UINameID
      if (f.uinameid && f.uinameid > 0) {
        if (nameTable) {
          label = nameTable.get(f.uinameid);
        }

        // Fallback to direct lookup if name table didn't work
        if (!label && fontkitFont?.raw) {
          label = lookupFontkitName(fontkitFont.raw, f.uinameid);
        }

        if (!label && opentypeFont?.raw) {
          label = lookupOpentypeName(opentypeFont.raw, f.uinameid);
        }
      }

      // Fallback to calculated name
      if (!label) {
        label = getFeatureName(f.tag);
      }

      return {
        tag: f.tag,
        name: label || f.tag,
        enabled: false,
        category: mapFeatureToCategory(f.tag),
        uinameid: f.uinameid || undefined,
      };
    });

    // Validate each feature with LENIENT mode
    const validatedFeatures: OpenTypeFeature[] = [];
    let validationErrors = 0;

    for (const feature of features) {
      const validation = validateWithMode(openTypeFeatureSchema, feature, ValidationMode.LENIENT);
      if (validation.success) {
        validatedFeatures.push(validation.data);
      } else {
        validationErrors++;
        // Still include feature even if validation fails (LENIENT mode)
        validatedFeatures.push(feature);
      }
    }

    if (validationErrors > 0) {
      extractorLogger.warn("FeatureExtractor", "validation", {
        errors: validationErrors,
        totalFeatures: features.length,
      });
    }

    const sortedFeatures = sortFeatures(validatedFeatures);

    extractorLogger.timed("info", "FeatureExtractor", "extract", startTime, {
      featureCount: sortedFeatures.length,
      validationErrors,
    });

    return {
      success: true,
      data: sortedFeatures,
      warnings:
        validationErrors > 0 ? [`Validation: ${validationErrors} feature errors`] : undefined,
    };
  } catch (error) {
    extractorLogger.error("FeatureExtractor", "extract", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error extracting features",
    };
  }
}

/**
 * Extract UINameID from feature
 * Handles multiple strategies for finding UINameID.
 * Strategy 0 (raw GSUB) takes precedence when opentype.js/fontkit do not expose FeatureParams.
 */
function extractFeatureUINameID(
  feature: { tag: string; featureParams?: any },
  opentypeFont: ParsedFont,
  fontkitFont: ParsedFont | null,
  tableTag: "gsub" | "gpos",
  rawGsubFeatureParams?: Record<string, Record<string, unknown>>
): { tag: string; label: string | null; uinameid: number | null } {
  let uinameid: number | null = null;
  let fromRawGsub = false;

  // Strategy 0: From binary GSUB parse (correct UINameID/FeatUILabelNameID for ss*/cv*)
  if (tableTag === "gsub" && rawGsubFeatureParams?.[feature.tag]) {
    const raw = rawGsubFeatureParams[feature.tag];
    uinameid = resolveNameId(raw?.UINameID ?? raw?.uiNameID ?? raw?.uinameid ?? raw);
    if (uinameid != null) fromRawGsub = true;
  }

  // Strategy 1: Extract from opentype featureParams
  if (!uinameid) {
    const params = feature.featureParams;
    if (params) {
      uinameid = resolveNameId(params?.UINameID ?? params?.uiNameID ?? params?.uinameid ?? params);
    }
  }

  // Strategy 2: Extract from fontkit FeatureParams
  if (!uinameid && fontkitFont?.raw) {
    const fkTable = tableTag === "gsub" ? fontkitFont.raw.GSUB : fontkitFont.raw.GPOS;
    if (fkTable?.featureList) {
      let fkFeature: any = null;

      if (Array.isArray(fkTable.featureList)) {
        fkFeature = fkTable.featureList.find((f: any) => f.tag === feature.tag);
      } else if (typeof fkTable.featureList === "object") {
        fkFeature = fkTable.featureList[feature.tag];
      }

      if (fkFeature) {
        const fp =
          fkFeature.FeatureParams ||
          fkFeature.featureParams ||
          fkFeature.params ||
          fkFeature.feature?.FeatureParams ||
          fkFeature.feature?.featureParams;

        if (fp) {
          uinameid = resolveNameId(fp?.UINameID ?? fp?.uiNameID ?? fp?.uinameid ?? fp);
        }
      }
    }
  }

  // Strategy 3: Calculate for stylistic sets (ss01-ss20)
  let calculatedUINameID: number | null = null;
  const ssMatch = feature.tag.match(/^ss(\d{2})$/);
  if (ssMatch) {
    const ssNumber = parseInt(ssMatch[1], 10);
    if (ssNumber >= 1 && ssNumber <= 20) {
      calculatedUINameID = ssNumber - 1 + 256;
    }
  }

  // If found UINameID doesn't exist in name table, use calculated value for stylistic sets
  // (Skip when we got uinameid from raw GSUB — that value is authoritative.)
  if (!fromRawGsub && uinameid && calculatedUINameID && feature.tag.match(/^ss\d{2}$/)) {
    const nameTableHasFoundID = checkNameTableHasID(opentypeFont, uinameid);
    if (!nameTableHasFoundID) {
      uinameid = calculatedUINameID;
    }
  }

  // Use calculated value only if no UINameID was found from any source
  if (!uinameid && calculatedUINameID) {
    uinameid = calculatedUINameID;
  }

  return {
    tag: feature.tag,
    label: null, // Will be resolved later
    uinameid,
  };
}

/**
 * Check if nameID exists in name table
 */
function checkNameTableHasID(opentypeFont: ParsedFont, nameID: number): boolean {
  try {
    const nameTable = opentypeFont.getNameTable();
    if (!nameTable) return false;

    // Check if nameID exists in name table
    const raw = opentypeFont.raw;
    if (raw?.tables?.name?.records) {
      return raw.tables.name.records.some((r: any) => r.nameID === nameID);
    }
    return false;
  } catch {
    return false;
  }
}
