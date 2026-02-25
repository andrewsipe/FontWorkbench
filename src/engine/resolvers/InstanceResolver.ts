// @ts-nocheck — Untyped third-party APIs (opentype.js / fontkit); type checking disabled for this file.
/**
 * Instance resolver
 * Sorts instances and resolves names
 * Phase 2: Deferred name resolution
 */

import type { NameTable } from "../../types/extractors.types";
import type { InstanceSnapshot, NamedVariation, VariableAxis } from "../../types/font.types";
import { resolveName } from "./NameResolver";

/**
 * Sort instances by coordinates
 * Primary: fvar axis order, then alphabetical
 */
export function sortInstances(
  instances: InstanceSnapshot[],
  axes: VariableAxis[] | undefined
): InstanceSnapshot[] {
  // Compute axis order once outside sort function
  const axisOrder = axes?.map((ax) => ax.tag) || [];

  return [...instances].sort((a, b) => {
    // Use pre-computed axis order
    for (const axisTag of axisOrder) {
      const aVal = a.coordinates[axisTag] ?? 0;
      const bVal = b.coordinates[axisTag] ?? 0;
      if (aVal !== bVal) {
        return aVal - bVal;
      }
    }

    // Fallback: sort by all axis tags alphabetically
    const allTags = new Set([...Object.keys(a.coordinates), ...Object.keys(b.coordinates)]);
    for (const tag of Array.from(allTags).sort()) {
      const aVal = a.coordinates[tag] ?? 0;
      const bVal = b.coordinates[tag] ?? 0;
      if (aVal !== bVal) {
        return aVal - bVal;
      }
    }
    return 0;
  });
}

/**
 * Resolve instance names
 * Tries subfamilyNameID first, then postScriptNameID, then fallback to "Instance N"
 */
export function resolveInstanceNames(
  instances: InstanceSnapshot[],
  nameTable: NameTable | null,
  opentypeFont: any,
  fontkitFont: any
): NamedVariation[] {
  return instances.map((snapshot, index) => {
    let resolvedName: string | null = null;

    // Strategy 1: Try subfamilyNameID (preferred)
    if (snapshot.subfamilyNameID != null) {
      resolvedName = resolveName(snapshot.subfamilyNameID, nameTable, opentypeFont, fontkitFont);
    }

    // Strategy 2: Try postScriptNameID if subfamilyNameID didn't work
    if (!resolvedName && snapshot.postScriptNameID != null) {
      resolvedName = resolveName(snapshot.postScriptNameID, nameTable, opentypeFont, fontkitFont);
    }

    // Final fallback: index-based name (only after all instances known)
    if (!resolvedName) {
      resolvedName = `Instance ${index + 1}`;
    }

    return {
      name: resolvedName,
      coordinates: snapshot.coordinates,
    };
  });
}
