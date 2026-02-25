/**
 * Font validation utility
 * Checks font integrity before parsing
 * Phase 1: Foundation validation
 */

export interface ValidationResult {
  isValid: boolean;
  format: "ttf" | "otf" | "woff" | "woff2" | null;
  errors: string[];
  warnings: string[];
}

/**
 * Check font magic numbers to determine format
 */
function detectFormat(buffer: ArrayBuffer): "ttf" | "otf" | "woff" | "woff2" | null {
  const view = new Uint8Array(buffer);

  if (view.length < 4) {
    return null;
  }

  // Check magic numbers
  const magic = String.fromCharCode(...view.slice(0, 4));

  if (magic === "\x00\x01\x00\x00" || magic.startsWith("ttcf")) {
    return "ttf";
  }

  if (magic === "OTTO") {
    return "otf";
  }

  if (magic === "wOFF") {
    return "woff";
  }

  if (magic === "wOF2") {
    return "woff2";
  }

  return null;
}

/**
 * Validate font file structure
 * Checks magic numbers, table structure, and required tables
 */
export function validateFont(buffer: ArrayBuffer): ValidationResult {
  const result: ValidationResult = {
    isValid: false,
    format: null,
    errors: [],
    warnings: [],
  };

  // Check minimum size (must have at least SFNT header)
  if (buffer.byteLength < 12) {
    result.errors.push("File too small to be a valid font");
    return result;
  }

  // Detect format
  result.format = detectFormat(buffer);
  if (!result.format) {
    result.errors.push("Unknown font format (not TTF, OTF, WOFF, or WOFF2)");
    return result;
  }

  // For WOFF/WOFF2, we can't validate table structure without decompression
  // Decompression happens later, so we just validate magic number
  if (result.format === "woff" || result.format === "woff2") {
    result.isValid = true;
    return result;
  }

  // For TTF/OTF, validate SFNT structure
  try {
    const view = new DataView(buffer);

    // Check SFNT version
    const sfntVersion = view.getUint32(0, false);
    const validVersions = [0x00010000, 0x4f54544f]; // TTF, OTF
    if (!validVersions.includes(sfntVersion) && sfntVersion !== 0x74746366) {
      // ttcf
      result.errors.push(`Invalid SFNT version: 0x${sfntVersion.toString(16)}`);
      return result;
    }

    // Check number of tables
    const numTables = view.getUint16(4, false);
    if (numTables === 0 || numTables > 100) {
      result.errors.push(`Invalid number of tables: ${numTables}`);
      return result;
    }

    // Check if file is large enough for table directory
    const minSize = 12 + numTables * 16;
    if (buffer.byteLength < minSize) {
      result.errors.push(`File too small for ${numTables} tables`);
      return result;
    }

    // Check for required tables (name, head, maxp)
    const requiredTables = ["name", "head", "maxp"];
    const foundTables = new Set<string>();

    for (let i = 0; i < numTables; i++) {
      const offset = 12 + i * 16;
      if (offset + 16 > buffer.byteLength) {
        result.errors.push(`Table directory entry ${i} extends beyond file`);
        return result;
      }

      const tag = String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3)
      );

      foundTables.add(tag);

      // Validate table offset and length
      const tableOffset = view.getUint32(offset + 8, false);
      const tableLength = view.getUint32(offset + 12, false);

      if (tableOffset + tableLength > buffer.byteLength) {
        result.warnings.push(`Table ${tag} extends beyond file boundaries`);
      }
    }

    // Check for required tables
    for (const required of requiredTables) {
      if (!foundTables.has(required)) {
        result.warnings.push(`Missing recommended table: ${required}`);
      }
    }

    result.isValid = true;
  } catch (error) {
    result.errors.push(
      `Validation error: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return result;
}
