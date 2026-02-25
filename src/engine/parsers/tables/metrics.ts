/**
 * Metrics table parsers: hmtx, vmtx.
 */

import { findTableOffset } from "../RawTableParser";
import { parseStub } from "./stub";

export type ParseMetricsResult = {
  parsed: unknown;
  status: "complete" | "partial" | "not_implemented" | "error";
};

function result(
  parsed: unknown,
  status: "complete" | "partial" | "not_implemented" | "error"
): ParseMetricsResult {
  return { parsed, status };
}

export function parseMetrics(
  tag: string,
  buffer: ArrayBuffer,
  offset: number,
  length: number
): ParseMetricsResult {
  const view = new DataView(buffer, offset, length);
  try {
    switch (tag) {
      case "hmtx": {
        const hhea = findTableOffset(buffer, "hhea");
        const maxp = findTableOffset(buffer, "maxp");
        if (!hhea || !maxp || hhea.length < 36 || maxp.length < 6) {
          return result({ _: "hmtx (needs hhea + maxp)", size: length }, "partial");
        }
        const hv = new DataView(buffer, hhea.offset, hhea.length);
        const mv = new DataView(buffer, maxp.offset, maxp.length);
        const numHMetrics = hv.getUint16(34, false);
        const numGlyphs = mv.getUint16(4, false);
        if (numGlyphs === 0) {
          return result(
            {
              numberOfHMetrics: numHMetrics,
              numGlyphs: 0,
              advances: [],
              leftSideBearings: [],
            },
            "complete"
          );
        }
        const lastAdvance =
          numHMetrics > 0 && (numHMetrics - 1) * 4 + 2 <= length
            ? view.getUint16((numHMetrics - 1) * 4, false)
            : 0;
        const advances: number[] = [];
        const leftSideBearings: number[] = [];
        let _note: string | undefined;
        let status: "complete" | "partial" = "complete";
        for (let i = 0; i < numGlyphs; i++) {
          if (i < numHMetrics) {
            if (i * 4 + 4 <= length) {
              advances.push(view.getUint16(i * 4, false));
              leftSideBearings.push(view.getInt16(i * 4 + 2, false));
            } else {
              advances.push(lastAdvance);
              leftSideBearings.push(0);
              if (!_note) {
                _note = "Table truncated";
                status = "partial";
              }
            }
          } else {
            advances.push(lastAdvance);
            const lsbOff = numHMetrics * 4 + (i - numHMetrics) * 2;
            if (lsbOff + 2 <= length) {
              leftSideBearings.push(view.getInt16(lsbOff, false));
            } else {
              leftSideBearings.push(0);
              if (!_note) {
                _note = "Table truncated";
                status = "partial";
              }
            }
          }
        }
        const out: Record<string, unknown> = {
          numberOfHMetrics: numHMetrics,
          numGlyphs,
          advances,
          leftSideBearings,
        };
        if (_note) out._note = _note;
        return result(out, status);
      }

      case "vmtx": {
        const vhea = findTableOffset(buffer, "vhea");
        const maxp = findTableOffset(buffer, "maxp");
        if (!vhea || !maxp || vhea.length < 36 || maxp.length < 6) {
          return result({ _: "vmtx (needs vhea + maxp)", size: length }, "partial");
        }
        const vv = new DataView(buffer, vhea.offset, vhea.length);
        const mv = new DataView(buffer, maxp.offset, maxp.length);
        const numVMetrics = vv.getUint16(34, false);
        const numGlyphs = mv.getUint16(4, false);
        if (numGlyphs === 0) {
          return result(
            {
              numOfLongVerMetrics: numVMetrics,
              numGlyphs: 0,
              advances: [],
              topSideBearings: [],
            },
            "complete"
          );
        }
        const lastAdvance =
          numVMetrics > 0 && (numVMetrics - 1) * 4 + 2 <= length
            ? view.getUint16((numVMetrics - 1) * 4, false)
            : 0;
        const advances: number[] = [];
        const topSideBearings: number[] = [];
        let _note: string | undefined;
        let status: "complete" | "partial" = "complete";
        for (let i = 0; i < numGlyphs; i++) {
          if (i < numVMetrics) {
            if (i * 4 + 4 <= length) {
              advances.push(view.getUint16(i * 4, false));
              topSideBearings.push(view.getInt16(i * 4 + 2, false));
            } else {
              advances.push(lastAdvance);
              topSideBearings.push(0);
              if (!_note) {
                _note = "Table truncated";
                status = "partial";
              }
            }
          } else {
            advances.push(lastAdvance);
            const tsbOff = numVMetrics * 4 + (i - numVMetrics) * 2;
            if (tsbOff + 2 <= length) {
              topSideBearings.push(view.getInt16(tsbOff, false));
            } else {
              topSideBearings.push(0);
              if (!_note) {
                _note = "Table truncated";
                status = "partial";
              }
            }
          }
        }
        const out: Record<string, unknown> = {
          numOfLongVerMetrics: numVMetrics,
          numGlyphs,
          advances,
          topSideBearings,
        };
        if (_note) out._note = _note;
        return result(out, status);
      }

      default:
        return result(parseStub(tag, length), "not_implemented");
    }
  } catch {
    return result(parseStub(tag, length), "error");
  }
}
