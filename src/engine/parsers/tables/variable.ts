/**
 * Variable font table parsers: fvar, avar, MVAR, STAT, HVAR, VVAR, cvar, gvar.
 */

import { parseFvarTable } from "../RawTableParser";
import { resolveNameIDs } from "./decoders";
import { tag4, u16ToBinary } from "./formatters";
import { parseStub } from "./stub";

export type ParseVariableResult = { parsed: unknown; status: string };

function result(
  parsed: unknown,
  status: "complete" | "partial" | "not_implemented" | "error"
): ParseVariableResult {
  return { parsed, status };
}

function parseItemVariationStore(
  buffer: ArrayBuffer,
  storeOffset: number,
  tableOffset: number,
  _tableLength: number
): {
  format: number;
  variationRegionListOffset: number;
  itemVariationDataCount: number;
  regionAxisCount?: number;
  regionCount?: number;
} | null {
  try {
    const absoluteOffset = tableOffset + storeOffset;
    if (absoluteOffset + 8 > buffer.byteLength) return null;
    const view = new DataView(buffer, absoluteOffset);
    const format = view.getUint16(0, false);
    const variationRegionListOffset = view.getUint32(2, false);
    const itemVariationDataCount = view.getUint16(6, false);
    const out: {
      format: number;
      variationRegionListOffset: number;
      itemVariationDataCount: number;
      regionAxisCount?: number;
      regionCount?: number;
    } = {
      format,
      variationRegionListOffset,
      itemVariationDataCount,
    };

    if (variationRegionListOffset > 0) {
      const regionListOffset = absoluteOffset + variationRegionListOffset;
      if (regionListOffset + 4 <= buffer.byteLength) {
        const rView = new DataView(buffer, regionListOffset);
        out.regionAxisCount = rView.getUint16(0, false);
        out.regionCount = rView.getUint16(2, false);
      }
    }
    return out;
  } catch (error) {
    console.warn("[parseItemVariationStore] Parse failed:", error);
    return null;
  }
}

export function parseVariable(
  tag: string,
  buffer: ArrayBuffer,
  offset: number,
  length: number
): ParseVariableResult {
  const view = new DataView(buffer, offset, length);
  try {
    switch (tag) {
      case "fvar": {
        const parsed = parseFvarTable(buffer, offset, length);
        if (!parsed) return result(parseStub(tag, length), "error");

        const axesArrayOffset = view.getUint16(4, false);
        const axisSize = view.getUint16(10, false);
        const axisCount = view.getUint16(8, false);

        const nameIDs: number[] = [];
        for (let i = 0; i < axisCount; i++) {
          const axisNameID = view.getUint16(axesArrayOffset + i * axisSize + 18, false);
          if (axisNameID !== 0xffff) nameIDs.push(axisNameID);
        }
        parsed.instances?.forEach((inst) => {
          if (inst.subfamilyNameID != null && inst.subfamilyNameID !== 0xffff)
            nameIDs.push(inst.subfamilyNameID);
          if (inst.postScriptNameID != null && inst.postScriptNameID !== 0xffff)
            nameIDs.push(inst.postScriptNameID);
        });

        const nameMap = resolveNameIDs(buffer, nameIDs);

        const axesWithNames = parsed.axes?.map((axis, i) => {
          const axisNameID = view.getUint16(axesArrayOffset + i * axisSize + 18, false);
          return {
            ...axis,
            name: axisNameID !== 0xffff ? (nameMap.get(axisNameID) ?? null) : null,
            nameID: axisNameID !== 0xffff ? axisNameID : undefined,
          };
        });

        const instancesWithNames = parsed.instances?.map((inst) => ({
          ...inst,
          subfamilyName:
            inst.subfamilyNameID != null ? (nameMap.get(inst.subfamilyNameID) ?? null) : undefined,
          postScriptName:
            inst.postScriptNameID != null
              ? (nameMap.get(inst.postScriptNameID) ?? null)
              : undefined,
        }));

        return result(
          {
            majorVersion: view.getUint16(0, false),
            minorVersion: view.getUint16(2, false),
            axesArrayOffset,
            axisCount,
            axisSize,
            instanceCount: view.getUint16(12, false),
            instanceSize: view.getUint16(14, false),
            axes: axesWithNames ?? parsed.axes,
            instances: instancesWithNames ?? parsed.instances,
          },
          "complete"
        );
      }

      case "avar": {
        if (length < 8) return result(parseStub(tag, length), "not_implemented");

        const majorVersion = view.getUint16(0, false);
        const minorVersion = view.getUint16(2, false);
        const axisCount = view.getUint16(6, false);

        const axisSegmentMaps: Array<{
          positionMapCount: number;
          firstMappings?: Array<{ fromCoordinate: number; toCoordinate: number }>;
        }> = [];

        let currentOffset = 8;
        for (let i = 0; i < axisCount && currentOffset + 2 <= length; i++) {
          const positionMapCount = view.getUint16(currentOffset, false);
          currentOffset += 2;
          axisSegmentMaps.push({ positionMapCount });
          currentOffset += positionMapCount * 4;
        }

        return result(
          {
            version: `${majorVersion}.${minorVersion}`,
            axisCount,
            axisSegmentMaps,
          },
          "complete"
        );
      }

      case "HVAR": {
        if (length < 20) return result(parseStub(tag, length), "not_implemented");

        const majorVersion = view.getUint16(0, false);
        const minorVersion = view.getUint16(2, false);
        const itemVariationStoreOffset = view.getUint32(4, false);
        const advanceWidthMappingOffset = view.getUint32(8, false);
        const lsbMappingOffset = view.getUint32(12, false);
        const rsbMappingOffset = view.getUint32(16, false);

        const varStore =
          itemVariationStoreOffset > 0
            ? parseItemVariationStore(buffer, itemVariationStoreOffset, offset, length)
            : null;

        return result(
          {
            version: `${majorVersion}.${minorVersion}`,
            itemVariationStoreOffset,
            advanceWidthMappingOffset,
            lsbMappingOffset,
            rsbMappingOffset,
            itemVariationStore: varStore,
          },
          "complete"
        );
      }

      case "VVAR": {
        if (length < 20) return result(parseStub(tag, length), "not_implemented");

        const majorVersion = view.getUint16(0, false);
        const minorVersion = view.getUint16(2, false);
        const itemVariationStoreOffset = view.getUint32(4, false);
        const advanceHeightMappingOffset = view.getUint32(8, false);
        const tsbMappingOffset = view.getUint32(12, false);
        const bsbMappingOffset = view.getUint32(16, false);
        const vOrgMappingOffset = length >= 24 ? view.getUint32(20, false) : undefined;

        const varStore =
          itemVariationStoreOffset > 0
            ? parseItemVariationStore(buffer, itemVariationStoreOffset, offset, length)
            : null;

        return result(
          {
            version: `${majorVersion}.${minorVersion}`,
            itemVariationStoreOffset,
            advanceHeightMappingOffset,
            tsbMappingOffset,
            bsbMappingOffset,
            vOrgMappingOffset,
            itemVariationStore: varStore,
          },
          "complete"
        );
      }

      case "MVAR": {
        if (length < 12) return result(parseStub(tag, length), "not_implemented");

        const majorVersion = view.getUint16(0, false);
        const minorVersion = view.getUint16(2, false);
        const valueRecordSize = view.getUint16(4, false);
        const valueRecordCount = view.getUint16(6, false);
        const itemVariationStoreOffset = view.getUint32(8, false);

        const varStore =
          itemVariationStoreOffset > 0
            ? parseItemVariationStore(buffer, itemVariationStoreOffset, offset, length)
            : null;

        return result(
          {
            version: `${majorVersion}.${minorVersion}`,
            valueRecordSize,
            valueRecordCount,
            itemVariationStoreOffset,
            itemVariationStore: varStore,
          },
          "complete"
        );
      }

      case "STAT": {
        if (length < 8) return result(parseStub(tag, length), "not_implemented");

        const majorVersion = view.getUint16(0, false);
        const minorVersion = view.getUint16(2, false);
        const designAxisSize = view.getUint16(4, false);
        const designAxisCount = view.getUint16(6, false);
        const designAxisOffset = view.getUint32(8, false);

        // STAT 1.1+ header: axisValueCount at 12, offsetToAxisValueOffsets at 14, elidedFallbackNameID at 18
        let axisValueCount = 0;
        let offsetToAxisValueOffsets: number | undefined;
        let elidedFallbackNameID: number | undefined;
        if (majorVersion >= 1 && minorVersion >= 1 && length >= 20) {
          axisValueCount = view.getUint16(12, false);
          offsetToAxisValueOffsets = view.getUint32(14, false);
          elidedFallbackNameID = view.getUint16(18, false);
        }

        const axes: Array<{
          index: number;
          axisTag: string;
          axisNameID: number;
          axisOrdering: number;
        }> = [];

        if (designAxisOffset > 0 && designAxisOffset < length) {
          for (
            let i = 0;
            i < designAxisCount && designAxisOffset + i * designAxisSize + 8 <= length;
            i++
          ) {
            const axisOffset = designAxisOffset + i * designAxisSize;
            const tagBytes = new Uint8Array(buffer, offset + axisOffset, 4);
            const axisTag = tag4(tagBytes[0], tagBytes[1], tagBytes[2], tagBytes[3]);
            const axisNameID = view.getUint16(axisOffset + 4, false);
            const axisOrdering = view.getUint16(axisOffset + 6, false);

            axes.push({
              index: i,
              axisTag,
              axisNameID,
              axisOrdering,
            });
          }
        }

        // Parse Axis Value array (formats 1–4). Offsets are from the start of the axis value offsets array.
        type AxisValueRec = {
          index: number;
          format: number;
          axisIndex: number;
          axisIndexName?: string | null;
          flags: number;
          valueNameID: number;
          value?: number;
          valueName?: string | null;
          nominalValue?: number;
          rangeMinValue?: number;
          rangeMaxValue?: number;
          linkedValue?: number;
          axisCount?: number;
          axisValues?: Array<{ axisIndex: number; value: number }>;
        };

        const axisValueArray: AxisValueRec[] = [];
        const valueNameIDs: number[] = [];

        if (
          axisValueCount > 0 &&
          offsetToAxisValueOffsets != null &&
          offsetToAxisValueOffsets > 0 &&
          offsetToAxisValueOffsets + 2 * axisValueCount <= length
        ) {
          const arrStart = offsetToAxisValueOffsets;
          for (let i = 0; i < axisValueCount; i++) {
            const off16 = view.getUint16(arrStart + i * 2, false);
            const pos = arrStart + off16;
            if (pos + 2 > length) continue;
            const fmt = view.getUint16(pos, false);
            // Format 4 has axisCount at +2, not axisIndex; others have axisIndex at +2
            const axisIndex = fmt !== 4 && pos + 2 <= length ? view.getUint16(pos + 2, false) : 0;
            const rec: AxisValueRec = {
              index: i,
              format: fmt,
              axisIndex,
              flags: pos + 4 <= length ? view.getUint16(pos + 4, false) : 0,
              valueNameID: pos + 6 <= length ? view.getUint16(pos + 6, false) : 0,
            };
            if (fmt === 1 && pos + 12 <= length) {
              rec.value = view.getInt32(pos + 8, false) / 65536;
              valueNameIDs.push(rec.valueNameID);
            } else if (fmt === 2 && pos + 20 <= length) {
              rec.nominalValue = view.getInt32(pos + 8, false) / 65536;
              rec.rangeMinValue = view.getInt32(pos + 12, false) / 65536;
              rec.rangeMaxValue = view.getInt32(pos + 16, false) / 65536;
              valueNameIDs.push(rec.valueNameID);
            } else if (fmt === 3 && pos + 16 <= length) {
              rec.value = view.getInt32(pos + 8, false) / 65536;
              rec.linkedValue = view.getInt32(pos + 12, false) / 65536;
              valueNameIDs.push(rec.valueNameID);
            } else if (fmt === 4 && pos + 10 <= length) {
              const ac = view.getUint16(pos + 2, false);
              rec.axisCount = ac;
              rec.axisValues = [];
              for (let j = 0; j < ac && pos + 8 + (j + 1) * 6 <= length; j++) {
                rec.axisValues.push({
                  axisIndex: view.getUint16(pos + 8 + j * 6, false),
                  value: view.getInt32(pos + 8 + j * 6 + 2, false) / 65536,
                });
              }
              valueNameIDs.push(rec.valueNameID);
            } else if (rec.valueNameID !== 0 && rec.valueNameID !== 0xffff) {
              valueNameIDs.push(rec.valueNameID);
            }
            axisValueArray.push(rec);
          }
        }

        // Count axis values per axis (formats 1–3: single axisIndex; format 4: axisValues[].axisIndex)
        const axisValueCounts: Record<string, number> = {};
        axisValueArray.forEach((av) => {
          if (av.format >= 1 && av.format <= 3) {
            const axisTag = axes[av.axisIndex]?.axisTag;
            if (axisTag) axisValueCounts[axisTag] = (axisValueCounts[axisTag] ?? 0) + 1;
          } else if (av.format === 4 && av.axisValues) {
            av.axisValues.forEach((axVal) => {
              const axisTag = axes[axVal.axisIndex]?.axisTag;
              if (axisTag) axisValueCounts[axisTag] = (axisValueCounts[axisTag] ?? 0) + 1;
            });
          }
        });

        const axisNameIDs = axes.map((a) => a.axisNameID).filter((id) => id !== 0xffff);
        if (elidedFallbackNameID != null && elidedFallbackNameID !== 0xffff)
          axisNameIDs.push(elidedFallbackNameID);
        const allNameIDs = [...new Set([...axisNameIDs, ...valueNameIDs])].filter(
          (id) => id !== 0xffff
        );
        const nameMap = resolveNameIDs(buffer, allNameIDs);

        const axesWithNames = axes.map((ax) => ({
          ...ax,
          axisName: ax.axisNameID !== 0xffff ? (nameMap.get(ax.axisNameID) ?? null) : undefined,
          valueCount: axisValueCounts[ax.axisTag] ?? 0,
        }));
        const elidedFallbackName =
          elidedFallbackNameID != null && elidedFallbackNameID !== 0xffff
            ? (nameMap.get(elidedFallbackNameID) ?? undefined)
            : undefined;

        for (const av of axisValueArray) {
          av.valueName =
            av.valueNameID !== 0 && av.valueNameID !== 0xffff
              ? (nameMap.get(av.valueNameID) ?? null)
              : undefined;
          // Formats 1–3 have a single axisIndex; format 4 has multiple in axisValues
          if (av.format >= 1 && av.format <= 3) {
            av.axisIndexName = axesWithNames[av.axisIndex]?.axisName ?? undefined;
          }
        }

        const versionHex = `0x${majorVersion.toString(16).padStart(4, "0")}${minorVersion.toString(16).padStart(4, "0")}`;

        return result(
          {
            version: `${majorVersion}.${minorVersion}`,
            versionHex,
            designAxisSize,
            designAxisCount,
            designAxisOffset,
            axes: axesWithNames.length > 0 ? axesWithNames : undefined,
            axisValueCount,
            offsetToAxisValueOffsets,
            axisValueArray: axisValueArray.length > 0 ? axisValueArray : undefined,
            elidedFallbackNameID,
            elidedFallbackName,
            summary: `${designAxisCount} design axes; ${axisValueCount} named positions`,
          },
          "complete"
        );
      }

      case "cvar": {
        if (length < 4) return result(parseStub(tag, length), "not_implemented");

        const majorVersion = view.getUint16(0, false);
        const minorVersion = view.getUint16(2, false);

        const tupleVariationCount = length >= 6 ? view.getUint16(4, false) : undefined;
        const dataOffset = length >= 8 ? view.getUint16(6, false) : undefined;

        return result(
          {
            version: `${majorVersion}.${minorVersion}`,
            tupleVariationCount,
            dataOffset,
            size: length,
          },
          "complete"
        );
      }

      case "gvar": {
        if (length < 20) return result(parseStub(tag, length), "not_implemented");

        const majorVersion = view.getUint16(0, false);
        const minorVersion = view.getUint16(2, false);
        const axisCount = view.getUint16(4, false);
        const sharedTupleCount = view.getUint16(6, false);
        const sharedTuplesOffset = view.getUint32(8, false);
        const glyphCount = view.getUint16(12, false);
        const flags = view.getUint16(14, false);
        const glyphVariationDataArrayOffset = view.getUint32(16, false);

        const flagsDecoded = {
          longOffsets: !!(flags & 0x0001),
        };

        return result(
          {
            version: `${majorVersion}.${minorVersion}`,
            axisCount,
            sharedTupleCount,
            sharedTuplesOffset,
            glyphCount,
            flags: u16ToBinary(flags),
            _flagsDecoded: flagsDecoded,
            glyphVariationDataArrayOffset,
            size: length,
          },
          "complete"
        );
      }

      default:
        return result(parseStub(tag, length), "not_implemented");
    }
  } catch (error) {
    console.warn(`[parseVariable] Failed to parse ${tag}:`, error);
    return result(parseStub(tag, length), "error");
  }
}
