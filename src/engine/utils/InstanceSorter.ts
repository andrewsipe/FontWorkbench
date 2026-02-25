/**
 * Instance Sorter Utility
 * Provides sorting functions for variable font instances
 * Phase 6: Performance & Rendering - Sort tool for instance menus
 */

import type { NamedVariation } from "../../types/font.types";

/**
 * Sort instances by numerical weight (Thin to Black)
 * Primary sort: Weight (wght) axis value
 * Secondary sort: Alphabetical by name
 *
 * @param instances - Array of NamedVariation instances
 * @returns Sorted array of instances
 */
export function sortInstancesByWeight(instances: NamedVariation[]): NamedVariation[] {
  return [...instances].sort((a, b) => {
    // Sort by Weight (wght) axis value if it exists
    const weightA = a.coordinates.wght;
    const weightB = b.coordinates.wght;

    if (weightA !== undefined && weightB !== undefined && weightA !== weightB) {
      return weightA - weightB; // 100 -> 900
    }

    // Alphabetical fallback for style variants (Italic vs Upright)
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
}

/**
 * Sort instances with default instance first, then by weight
 *
 * @param instances - Array of NamedVariation instances
 * @param defaultCoordinates - Coordinates that match the default instance
 * @returns Sorted array of instances
 */
export function sortInstancesWithDefault(
  instances: NamedVariation[],
  defaultCoordinates: Record<string, number>
): NamedVariation[] {
  return [...instances].sort((a, b) => {
    // Check if instance matches default coordinates
    const aIsDefault = Object.keys(defaultCoordinates).every(
      (key) => a.coordinates[key] === defaultCoordinates[key]
    );
    const bIsDefault = Object.keys(defaultCoordinates).every(
      (key) => b.coordinates[key] === defaultCoordinates[key]
    );

    // Default instance always at the top
    if (aIsDefault && !bIsDefault) return -1;
    if (!aIsDefault && bIsDefault) return 1;

    // Sort by Weight (wght) axis value if it exists
    const weightA = a.coordinates.wght;
    const weightB = b.coordinates.wght;

    if (weightA !== undefined && weightB !== undefined && weightA !== weightB) {
      return weightA - weightB; // 100 -> 900
    }

    // Alphabetical fallback for style variants (Italic vs Upright)
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
}

/**
 * Sort instances alphabetically by name
 *
 * @param instances - Array of NamedVariation instances
 * @returns Sorted array of instances
 */
export function sortInstancesAlphabetically(instances: NamedVariation[]): NamedVariation[] {
  return [...instances].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}
