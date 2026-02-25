/**
 * Matching logic: classify each unprocessed font against the processed index.
 * Pure functions only; no UI.
 */

import { findTableOffset } from "../engine/parsers/RawTableParser";
import type { CachedFont } from "../types/font.types";
import type { IndexRecord } from "./indexBuilder";

export type MatchLevel =
  | "L1_PS_NAME"
  | "L2_FULL_NAME"
  | "L3_FAMILY_STYLE"
  | "L4_FAMILY_ONLY"
  | "L5_NO_MATCH";

export type SuggestedAction = "SKIP" | "UPGRADE" | "REVIEW" | "NEW" | "CONFLICT" | "PROBLEM";

export type MatchFlag =
  | "TILDE_COUNTER"
  | "TRIAL_KEYWORD"
  | "VERSION_NEWER"
  | "VERSION_OLDER"
  | "GLYPH_COUNT_HIGHER"
  | "GLYPH_COUNT_LOWER"
  | "EXTRA_TABLES"
  | "MISSING_TABLES";

export interface MatchResult {
  level: MatchLevel;
  action: SuggestedAction;
  matchedRecord: IndexRecord | null;
  versionDelta: number;
  glyphDelta: number;
  flags: MatchFlag[];
}

const TRIAL_PATTERN = /Trial|Beta|Test|Demo/i;
const TILDE_COUNTER_PATTERN = /~\d+/;

function getFontRevisionFromBuffer(buffer: ArrayBuffer): number {
  try {
    const head = findTableOffset(buffer, "head");
    if (!head || head.length < 8) return 0;
    const view = new DataView(buffer, head.offset, head.length);
    return view.getUint32(4, false) / 65536;
  } catch {
    return 0;
  }
}

function getFontRevision(font: CachedFont): number {
  return font.fileData ? getFontRevisionFromBuffer(font.fileData) : 0;
}

function getFamily(font: CachedFont): string {
  return font.metadata?.preferredFamily ?? font.metadata?.familyName ?? font.name;
}

function getFullName(font: CachedFont): string {
  return (
    font.metadata?.fullName ??
    `${getFamily(font)} ${font.metadata?.subfamilyName ?? font.metadata?.preferredSubfamily ?? ""}`.trim()
  );
}

function getSubfamily(font: CachedFont): string {
  return font.metadata?.subfamilyName ?? font.metadata?.preferredSubfamily ?? "";
}

function getPsName(font: CachedFont): string {
  return font.metadata?.postscriptName ?? "";
}

function getGlyphCount(font: CachedFont): number {
  return font.glyphCount ?? font.misc?.glyphCount ?? 0;
}

function getAvailableTables(font: CachedFont): string[] {
  return font.misc?.availableTables ?? [];
}

function collectFlags(
  font: CachedFont,
  matched: IndexRecord | null,
  versionDelta: number,
  glyphDelta: number
): MatchFlag[] {
  const flags: MatchFlag[] = [];
  const fileName = font.fileName ?? "";

  if (TILDE_COUNTER_PATTERN.test(fileName)) flags.push("TILDE_COUNTER");
  if (TRIAL_PATTERN.test(fileName)) flags.push("TRIAL_KEYWORD");
  if (versionDelta > 0) flags.push("VERSION_NEWER");
  if (versionDelta < 0) flags.push("VERSION_OLDER");
  if (glyphDelta > 50) flags.push("GLYPH_COUNT_HIGHER");
  if (glyphDelta < -50) flags.push("GLYPH_COUNT_LOWER");

  if (matched) {
    const unprocTables = new Set(getAvailableTables(font));
    const procTables = new Set(matched.availableTables ?? []);
    for (const t of unprocTables) {
      if (!procTables.has(t)) {
        flags.push("EXTRA_TABLES");
        break;
      }
    }
    for (const t of procTables) {
      if (!unprocTables.has(t)) {
        flags.push("MISSING_TABLES");
        break;
      }
    }
  }

  return flags;
}

function findBestMatch(
  font: CachedFont,
  index: IndexRecord[]
): { level: MatchLevel; record: IndexRecord | null } {
  const psName = getPsName(font);
  const fullName = getFullName(font);
  const family = getFamily(font);
  const subfamily = getSubfamily(font);
  const familyNorm = family.toLowerCase().trim();
  const subfamilyNorm = subfamily.toLowerCase().trim();
  const fullNameNorm = fullName.toLowerCase().trim();
  const psNameNorm = psName.toLowerCase().trim();

  for (const r of index) {
    const rPs = (r.psName ?? "").toLowerCase().trim();
    if (psNameNorm && rPs && psNameNorm === rPs) {
      return { level: "L1_PS_NAME", record: r };
    }
  }

  for (const r of index) {
    const rFull = (r.fullName ?? "").toLowerCase().trim();
    if (fullNameNorm && rFull && fullNameNorm === rFull) {
      return { level: "L2_FULL_NAME", record: r };
    }
  }

  for (const r of index) {
    const rFamily = (r.familyName ?? "").toLowerCase().trim();
    const rSub = (r.subfamilyName ?? "").toLowerCase().trim();
    if (familyNorm === rFamily && subfamilyNorm === rSub) {
      return { level: "L3_FAMILY_STYLE", record: r };
    }
  }

  for (const r of index) {
    const rFamily = (r.familyName ?? "").toLowerCase().trim();
    if (familyNorm === rFamily) {
      return { level: "L4_FAMILY_ONLY", record: r };
    }
  }

  return { level: "L5_NO_MATCH", record: null };
}

function decideAction(
  level: MatchLevel,
  flags: MatchFlag[],
  versionDelta: number,
  _glyphDelta: number
): SuggestedAction {
  if (flags.includes("TILDE_COUNTER")) return "CONFLICT";

  if (flags.includes("VERSION_NEWER") && flags.includes("GLYPH_COUNT_LOWER")) return "REVIEW";
  if (flags.includes("VERSION_OLDER") && flags.includes("GLYPH_COUNT_HIGHER")) return "REVIEW";

  switch (level) {
    case "L1_PS_NAME":
    case "L2_FULL_NAME":
    case "L3_FAMILY_STYLE":
      if (flags.includes("VERSION_NEWER") || flags.includes("GLYPH_COUNT_HIGHER")) return "UPGRADE";
      if (versionDelta <= 0 && !flags.includes("GLYPH_COUNT_HIGHER")) return "SKIP";
      return "REVIEW";
    case "L4_FAMILY_ONLY":
      return "REVIEW";
    case "L5_NO_MATCH":
      return "NEW";
    default:
      return "REVIEW";
  }
}

/**
 * Classify one unprocessed font against the processed index.
 */
export function matchFont(cachedFont: CachedFont, index: IndexRecord[]): MatchResult {
  const glyphCount = getGlyphCount(cachedFont);
  if (glyphCount === 0) {
    return {
      level: "L5_NO_MATCH",
      action: "PROBLEM",
      matchedRecord: null,
      versionDelta: 0,
      glyphDelta: 0,
      flags: [],
    };
  }

  const { level, record } = findBestMatch(cachedFont, index);
  const fontRev = getFontRevision(cachedFont);
  const matchedRev = record?.fontRevision ?? 0;
  const versionDelta = fontRev - matchedRev;
  const matchedGlyphs = record?.glyphCount ?? 0;
  const glyphDelta = glyphCount - matchedGlyphs;

  const flags = collectFlags(cachedFont, record, versionDelta, glyphDelta);
  const action = decideAction(level, flags, versionDelta, glyphDelta);

  return {
    level,
    action,
    matchedRecord: record ?? null,
    versionDelta,
    glyphDelta,
    flags,
  };
}

/**
 * Group fonts by family (preferredFamily ?? familyName).
 */
export function groupByFamily(fonts: CachedFont[]): Map<string, CachedFont[]> {
  const map = new Map<string, CachedFont[]>();
  for (const font of fonts) {
    const family = font.metadata?.preferredFamily ?? font.metadata?.familyName ?? font.name;
    const list = map.get(family) ?? [];
    list.push(font);
    map.set(family, list);
  }
  return map;
}
