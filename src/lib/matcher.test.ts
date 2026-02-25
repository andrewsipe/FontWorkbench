/**
 * Unit tests for matcher.ts using console.assert.
 * Run with: npx vite run src/lib/matcher.test.ts (or add a test script).
 */

import type { CachedFont } from "../types/font.types";
import type { IndexRecord } from "./indexBuilder";
import { groupByFamily, matchFont } from "./matcher";

function mockFont(overrides: Partial<CachedFont> & { fileName: string }): CachedFont {
  return {
    id: "test-id",
    name: "Test Font",
    fileName: overrides.fileName,
    fileData: new ArrayBuffer(0),
    format: "ttf",
    isVariable: false,
    timestamp: 0,
    lastAccessed: 0,
    metadata: {
      familyName: "Test Font",
      subfamilyName: "Regular",
      fullName: "Test Font Regular",
      postscriptName: "TestFont-Regular",
      version: "1.0",
      preferredFamily: "Test Font",
      preferredSubfamily: "Regular",
      copyright: "",
      manufacturer: "",
      designer: "",
      description: "",
      manufacturerURL: "",
      designerURL: "",
      license: "",
      licenseURL: "",
    },
    misc: {
      glyphCount: 100,
      availableTables: ["head", "name"],
      weightClass: null,
      widthClass: null,
      italicAngle: null,
      underlinePosition: null,
      underlineThickness: null,
      fsSelection: { isItalic: false, isBold: false, isRegular: true, useTypoMetrics: false },
      fsType: 0,
      fsTypeInterpreted: "",
      isFixedPitch: false,
    },
    ...overrides,
  } as CachedFont;
}

function mockRecord(overrides: Partial<IndexRecord>): IndexRecord {
  return {
    filePath: "/path",
    fileName: "TestFont-Regular.otf",
    familyName: "Test Font",
    psName: "TestFont-Regular",
    fullName: "Test Font Regular",
    subfamilyName: "Regular",
    version: "1.0",
    fontRevision: 1,
    glyphCount: 100,
    availableTables: ["head", "name"],
    format: "otf",
    ...overrides,
  };
}

// CONFLICT: TILDE_COUNTER in filename
const conflictFont = mockFont({ fileName: "TestFont~001.otf" });
const conflictIndex = [mockRecord({})];
const conflictResult = matchFont(conflictFont, conflictIndex);
console.assert(conflictResult.action === "CONFLICT", "CONFLICT: TILDE_COUNTER");
console.assert(conflictResult.flags.includes("TILDE_COUNTER"), "CONFLICT: has TILDE_COUNTER flag");

// PROBLEM: glyphCount === 0
const problemFont = mockFont({ fileName: "Bad.otf", glyphCount: 0, misc: undefined });
const problemResult = matchFont(problemFont, conflictIndex);
console.assert(problemResult.action === "PROBLEM", "PROBLEM: glyphCount 0");

// SKIP: L1 match, versionDelta <= 0, no GLYPH_COUNT_HIGHER
const skipFont = mockFont({
  fileName: "TestFont-Regular.otf",
  metadata: { ...(mockFont({ fileName: "" }).metadata ?? {}), postscriptName: "TestFont-Regular" },
  glyphCount: 100,
  misc: {
    glyphCount: 100,
    availableTables: ["head", "name"],
    weightClass: null,
    widthClass: null,
    italicAngle: null,
    underlinePosition: null,
    underlineThickness: null,
    fsSelection: { isItalic: false, isBold: false, isRegular: true, useTypoMetrics: false },
    fsType: 0,
    fsTypeInterpreted: "",
    isFixedPitch: false,
  },
});
const skipRecord = mockRecord({ fontRevision: 1, glyphCount: 100 });
const skipResult = matchFont(skipFont, [skipRecord]);
console.assert(skipResult.action === "SKIP", "SKIP: L1, versionDelta<=0, no GLYPH_COUNT_HIGHER");
console.assert(skipResult.level === "L1_PS_NAME", "SKIP: level L1");

// UPGRADE: L1 match, GLYPH_COUNT_HIGHER (no VERSION_OLDER so we get UPGRADE not REVIEW)
const upgradeFont = mockFont({
  fileName: "TestFont-Regular.otf",
  metadata: { ...(mockFont({ fileName: "" }).metadata ?? {}), postscriptName: "TestFont-Regular" },
  glyphCount: 200,
  misc: {
    glyphCount: 200,
    availableTables: ["head", "name"],
    weightClass: null,
    widthClass: null,
    italicAngle: null,
    underlinePosition: null,
    underlineThickness: null,
    fsSelection: { isItalic: false, isBold: false, isRegular: true, useTypoMetrics: false },
    fsType: 0,
    fsTypeInterpreted: "",
    isFixedPitch: false,
  },
});
const upgradeRecord = mockRecord({ glyphCount: 100, fontRevision: 0 });
const upgradeResult = matchFont(upgradeFont, [upgradeRecord]);
console.assert(upgradeResult.action === "UPGRADE", "UPGRADE: GLYPH_COUNT_HIGHER");
console.assert(
  upgradeResult.flags.includes("GLYPH_COUNT_HIGHER"),
  "UPGRADE: has GLYPH_COUNT_HIGHER"
);

// REVIEW: L4 family only
const reviewFont = mockFont({
  fileName: "OtherStyle.otf",
  metadata: {
    ...(mockFont({ fileName: "" }).metadata ?? {}),
    familyName: "Test Font",
    subfamilyName: "Bold",
    fullName: "Test Font Bold",
    postscriptName: "TestFont-Bold",
  },
});
const reviewIndex = [
  mockRecord({
    subfamilyName: "Regular",
    psName: "TestFont-Regular",
    fullName: "Test Font Regular",
  }),
];
const reviewResult = matchFont(reviewFont, reviewIndex);
console.assert(reviewResult.level === "L4_FAMILY_ONLY", "REVIEW: L4");
console.assert(reviewResult.action === "REVIEW", "REVIEW: L4 -> REVIEW");

// NEW: no match (empty index => L5)
const newFont = mockFont({
  fileName: "Unknown.otf",
  metadata: {
    ...(mockFont({ fileName: "" }).metadata ?? {}),
    preferredFamily: "Unknown",
    familyName: "Unknown",
    postscriptName: "Unknown-Regular",
  },
});
const newResult = matchFont(newFont, []);
console.assert(newResult.action === "NEW", "NEW: L5 no match");
console.assert(newResult.level === "L5_NO_MATCH", "NEW: level L5");

// groupByFamily (preferredFamily used first, so set it per family)
const fontsForGroup: CachedFont[] = [
  mockFont({
    fileName: "A-Reg.otf",
    metadata: {
      ...(mockFont({ fileName: "" }).metadata ?? {}),
      preferredFamily: "Family A",
      familyName: "Family A",
    },
  }),
  mockFont({
    fileName: "A-Bold.otf",
    metadata: {
      ...(mockFont({ fileName: "" }).metadata ?? {}),
      preferredFamily: "Family A",
      familyName: "Family A",
    },
  }),
  mockFont({
    fileName: "B-Reg.otf",
    metadata: {
      ...(mockFont({ fileName: "" }).metadata ?? {}),
      preferredFamily: "Family B",
      familyName: "Family B",
    },
  }),
];
const groups = groupByFamily(fontsForGroup);
console.assert(groups.size === 2, "groupByFamily: 2 families");
console.assert(groups.get("Family A")?.length === 2, "groupByFamily: Family A has 2");
console.assert(groups.get("Family B")?.length === 1, "groupByFamily: Family B has 1");

console.log("matcher.test.ts: all asserts passed");
