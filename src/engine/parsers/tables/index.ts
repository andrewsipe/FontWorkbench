/**
 * Dispatcher for on-demand table parsing.
 * Routes to core, variable, layout, outlines, bitmap, other, or stub.
 */

import { parseStub } from "./stub";

export type ParseTableResult = { parsed: unknown; status: string };

export const GROUP_ORDER = ["core", "variable", "layout", "outlines", "bitmap", "other"] as const;

export type TableGroup = (typeof GROUP_ORDER)[number];

export function getGroupForTag(tag: string): TableGroup | null {
  // Core tables (required/common metadata, including metrics)
  const core = new Set([
    "head",
    "maxp",
    "hhea",
    "vhea",
    "name",
    "OS/2",
    "post",
    "cmap",
    "hmtx",
    "vmtx",
  ]);
  if (core.has(tag)) return "core";

  // Variable font tables
  const variable = new Set(["fvar", "avar", "MVAR", "STAT", "HVAR", "VVAR", "cvar", "gvar"]);
  if (variable.has(tag)) return "variable";

  // Layout tables (OpenType and AAT)
  const layout = new Set(["GSUB", "GPOS", "GDEF", "JSTF", "kern", "morx", "mort", "feat"]);
  if (layout.has(tag)) return "layout";

  // Outline/glyph tables
  const outlines = new Set(["loca", "glyf", "CFF ", "CFF2", "cvt ", "prep", "fpgm"]);
  if (outlines.has(tag)) return "outlines";

  // Bitmap/color tables
  const bitmap = new Set([
    "EBDT",
    "ebdt",
    "EBLC",
    "eblc",
    "EBSC",
    "CBDT",
    "cbdt",
    "CBLC",
    "cblc",
    "sbix",
  ]);
  if (bitmap.has(tag)) return "bitmap";

  // Other tables (rendering hints, metadata, specialized, FontForge)
  const other = new Set([
    "gasp",
    "VORG",
    "DSIG",
    "LTSH",
    "vdmx",
    "VDMX",
    "hdmx",
    "HDMX",
    "COLR",
    "CPAL",
    "meta",
    "SVG ",
    "BASE",
    "MATH",
    "PCLT",
    "MERG",
    "bsln",
    "acnt",
    "ankr",
    "trak",
    "ltag",
    "Zapf",
    "Silf",
    "Glat",
    "Gloc",
    "Feat",
    "Sill",
    "PfEd",
    "FFTM",
    "TeX ",
    "BDF ",
  ]);
  if (other.has(tag)) return "other";

  return null;
}

export async function parseTable(
  tag: string,
  buffer: ArrayBuffer,
  offset: number,
  length: number
): Promise<ParseTableResult> {
  const group = getGroupForTag(tag);

  if (group === "core") {
    const core = await import("./core");
    return core.parseCore(tag, buffer, offset, length);
  }
  if (group === "variable") {
    const m = await import("./variable");
    return m.parseVariable(tag, buffer, offset, length);
  }
  if (group === "layout") {
    const m = await import("./layout");
    return m.parseLayout(tag, buffer, offset, length);
  }
  if (group === "outlines") {
    const m = await import("./outlines");
    return m.parseOutlines(tag, buffer, offset, length);
  }
  if (group === "bitmap") {
    const m = await import("./bitmap");
    return m.parseBitmap(tag, buffer, offset, length);
  }
  if (group === "other") {
    const m = await import("./other");
    return m.parseOther(tag, buffer, offset, length);
  }

  return { parsed: parseStub(tag, length), status: "not_implemented" };
}
