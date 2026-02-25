/**
 * WOFF/WOFF2 decompression utilities
 * Handles decompression of compressed font formats before parsing
 */

// @ts-expect-error - pako types may not be installed
import pako from "pako";
// Use woff2-encoder by default (works for most fonts)
import decompressWOFF2Default from "woff2-encoder/decompress";
// wawoff2 will be dynamically imported only for variable fonts

/**
 * Detect font format from magic bytes
 */
export function detectFontFormat(
  buffer: ArrayBuffer
): "ttf" | "otf" | "woff" | "woff2" | "unknown" {
  const view = new Uint8Array(buffer);
  if (view.length < 4) return "unknown";

  const magic = String.fromCharCode(...view.slice(0, 4));

  if (magic === "wOFF") return "woff";
  if (magic === "wOF2") return "woff2";
  if (magic === "\x00\x01\x00\x00" || magic.startsWith("ttcf")) return "ttf";
  if (magic === "OTTO") return "otf";

  return "unknown";
}

/**
 * Decompress WOFF file (Zlib/Deflate)
 * Uses pako library for Zlib/Deflate decompression
 */
async function decompressWOFF(compressedBuffer: ArrayBuffer): Promise<ArrayBuffer> {
  try {
    console.log("[woffDecompressor] Starting WOFF decompression...");
    console.log("[woffDecompressor] Input buffer size:", compressedBuffer.byteLength);

    const view = new Uint8Array(compressedBuffer);
    const dataView = new DataView(compressedBuffer);

    // Read WOFF header
    const signature = String.fromCharCode(...view.slice(0, 4));
    const flavor = dataView.getUint32(4, false);
    const length = dataView.getUint32(8, false);
    const numTables = dataView.getUint16(12, false);
    const reserved = dataView.getUint16(14, false);
    const totalSfntSize = dataView.getUint32(16, false);
    const majorVersion = dataView.getUint16(20, false);
    const minorVersion = dataView.getUint16(22, false);
    const metaOffset = dataView.getUint32(24, false);
    const metaLength = dataView.getUint32(28, false);
    const privOffset = dataView.getUint32(32, false);
    const privLength = dataView.getUint32(36, false);

    console.log("[woffDecompressor] WOFF Header:", {
      signature,
      flavor: `0x${flavor.toString(16)}`,
      length,
      numTables,
      reserved,
      totalSfntSize,
      version: `${majorVersion}.${minorVersion}`,
      metaOffset,
      metaLength,
      privOffset,
      privLength,
    });

    // Calculate offset to compressed data (after header and table directory)
    const tableDirectorySize = numTables * 20; // Each entry is 20 bytes
    const headerSize = 44;
    const compressedDataOffset = headerSize + tableDirectorySize;

    console.log("[woffDecompressor] Table directory info:", {
      headerSize,
      tableDirectorySize,
      compressedDataOffset,
      remainingBytes: compressedBuffer.byteLength - compressedDataOffset,
    });

    // Read table directory entries
    const tableEntries = [];
    for (let i = 0; i < numTables; i++) {
      const offset = headerSize + i * 20;
      const tag = String.fromCharCode(
        view[offset],
        view[offset + 1],
        view[offset + 2],
        view[offset + 3]
      );
      const offsetInFile = dataView.getUint32(offset + 4, false);
      const compLength = dataView.getUint32(offset + 8, false);
      const origLength = dataView.getUint32(offset + 12, false);
      const origChecksum = dataView.getUint32(offset + 16, false);

      tableEntries.push({
        tag,
        offsetInFile,
        compLength,
        origLength,
        origChecksum,
      });
    }

    console.log("[woffDecompressor] Table directory entries:", tableEntries);

    // Reconstruct SFNT file from individual compressed tables
    // WOFF stores each table's compressed data separately, not as one block

    // 1. Build SFNT header (12 bytes)
    const sfntHeader = new ArrayBuffer(12);
    const sfntHeaderView = new DataView(sfntHeader);
    const sfntHeaderArray = new Uint8Array(sfntHeader);

    // Write SFNT signature (use flavor from WOFF header)
    sfntHeaderArray.set(
      [(flavor >>> 24) & 0xff, (flavor >>> 16) & 0xff, (flavor >>> 8) & 0xff, flavor & 0xff],
      0
    );
    sfntHeaderView.setUint16(4, numTables, false); // numTables
    // Calculate searchRange, entrySelector, rangeShift
    const searchRange = 2 ** Math.floor(Math.log2(numTables)) * 16;
    const entrySelector = Math.floor(Math.log2(numTables));
    const rangeShift = numTables * 16 - searchRange;
    sfntHeaderView.setUint16(6, searchRange, false);
    sfntHeaderView.setUint16(8, entrySelector, false);
    sfntHeaderView.setUint16(10, rangeShift, false);

    // 2. Decompress each table and collect them
    const decompressedTables: Array<{
      tag: string;
      data: Uint8Array;
      checksum: number;
      origLength: number;
    }> = [];

    for (const entry of tableEntries) {
      console.log(`[woffDecompressor] Decompressing table: ${entry.tag}`, {
        offsetInFile: entry.offsetInFile,
        compLength: entry.compLength,
        origLength: entry.origLength,
        fileSize: compressedBuffer.byteLength,
        offsetValid: entry.offsetInFile + entry.compLength <= compressedBuffer.byteLength,
      });

      // Validate offset and length
      if (entry.offsetInFile + entry.compLength > compressedBuffer.byteLength) {
        throw new Error(
          `Table ${entry.tag}: offset ${entry.offsetInFile} + length ${entry.compLength} exceeds file size ${compressedBuffer.byteLength}`
        );
      }

      // Extract table data from WOFF file
      const tableData = view.slice(entry.offsetInFile, entry.offsetInFile + entry.compLength);

      console.log(`[woffDecompressor] Table ${entry.tag} data:`, {
        size: tableData.length,
        compLength: entry.compLength,
        origLength: entry.origLength,
        isUncompressed: entry.compLength === entry.origLength,
        firstBytes: Array.from(tableData.slice(0, 10))
          .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
          .join(" "),
        lastBytes: Array.from(tableData.slice(-10))
          .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
          .join(" "),
      });

      // Decompress this table's data (or use as-is if uncompressed)
      let decompressedTable: Uint8Array;

      // Check if table is stored uncompressed (compLength == origLength)
      if (entry.compLength === entry.origLength) {
        console.log(`[woffDecompressor] Table ${entry.tag} is stored uncompressed, using as-is`);
        decompressedTable = new Uint8Array(tableData);
      } else {
        // Table is compressed, decompress it
        // WOFF spec says raw deflate, but some files use zlib-wrapped deflate
        // Detect by checking for zlib header (0x78 0x01, 0x78 0x9C, 0x78 0xDA, etc.)
        const hasZlibHeader =
          tableData.length >= 2 &&
          tableData[0] === 0x78 &&
          (tableData[1] === 0x01 ||
            tableData[1] === 0x9c ||
            tableData[1] === 0xda ||
            tableData[1] === 0x5e);

        try {
          if (hasZlibHeader) {
            console.log(
              `[woffDecompressor] Table ${entry.tag} appears to be zlib-wrapped, using inflate`
            );
            decompressedTable = pako.inflate(tableData);
          } else {
            console.log(`[woffDecompressor] Table ${entry.tag} using raw deflate`);
            decompressedTable = pako.inflateRaw(tableData);
          }
        } catch (decompressError) {
          // If raw deflate failed and we haven't tried zlib yet, try zlib
          if (!hasZlibHeader) {
            try {
              console.log(
                `[woffDecompressor] Raw deflate failed for ${entry.tag}, trying zlib-wrapped`
              );
              decompressedTable = pako.inflate(tableData);
            } catch (zlibError) {
              console.error(
                `[woffDecompressor] Both decompression methods failed for table ${entry.tag}`
              );
              console.error(`[woffDecompressor] Raw deflate error:`, decompressError);
              console.error(`[woffDecompressor] Zlib error:`, zlibError);
              console.error(`[woffDecompressor] Compressed data details:`, {
                size: tableData.length,
                first20Bytes: Array.from(tableData.slice(0, 20))
                  .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
                  .join(" "),
                last20Bytes: Array.from(tableData.slice(-20))
                  .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
                  .join(" "),
                hasZlibHeader,
              });
              throw new Error(
                `Failed to decompress table ${entry.tag}: Both raw deflate and zlib methods failed`
              );
            }
          } else {
            console.error(
              `[woffDecompressor] Failed to decompress table ${entry.tag}:`,
              decompressError
            );
            console.error(`[woffDecompressor] Compressed data details:`, {
              size: tableData.length,
              first20Bytes: Array.from(tableData.slice(0, 20))
                .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
                .join(" "),
              last20Bytes: Array.from(tableData.slice(-20))
                .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
                .join(" "),
              hasZlibHeader,
            });
            throw new Error(
              `Failed to decompress table ${entry.tag}: ${decompressError instanceof Error ? decompressError.message : String(decompressError)}`
            );
          }
        }
      }

      console.log(`[woffDecompressor] Table ${entry.tag} decompressed:`, {
        compressed: entry.compLength,
        decompressed: decompressedTable.byteLength,
        expected: entry.origLength,
        match: decompressedTable.byteLength === entry.origLength,
      });

      decompressedTables.push({
        tag: entry.tag,
        data: decompressedTable,
        checksum: entry.origChecksum,
        origLength: entry.origLength,
      });
    }

    // 3. Sort tables by tag (required by SFNT spec)
    decompressedTables.sort((a, b) => a.tag.localeCompare(b.tag));

    // Calculate offsets for sorted tables
    let dataOffset = 12 + numTables * 16;
    const tableOffsets = new Map<string, number>();

    for (const table of decompressedTables) {
      tableOffsets.set(table.tag, dataOffset);
      dataOffset += table.data.byteLength;
      // Pad to 4-byte boundary
      dataOffset = (dataOffset + 3) & ~3;
    }

    // 4. Build table directory (16 bytes per table) - sorted by tag
    const tableDirectory = new ArrayBuffer(numTables * 16);
    const tableDirectoryView = new DataView(tableDirectory);
    const tableDirectoryArray = new Uint8Array(tableDirectory);

    for (let i = 0; i < decompressedTables.length; i++) {
      const table = decompressedTables[i];
      const offset = i * 16;

      // Write tag (4 bytes)
      tableDirectoryArray.set(
        [
          table.tag.charCodeAt(0),
          table.tag.charCodeAt(1),
          table.tag.charCodeAt(2),
          table.tag.charCodeAt(3),
        ],
        offset
      );

      // Write checksum (4 bytes)
      tableDirectoryView.setUint32(offset + 4, table.checksum, false);

      // Write offset (4 bytes)
      const tableOffset = tableOffsets.get(table.tag);
      if (tableOffset === undefined) {
        throw new Error(`Table offset not found for tag: ${table.tag}`);
      }
      tableDirectoryView.setUint32(offset + 8, tableOffset, false);

      // Write length (4 bytes)
      tableDirectoryView.setUint32(offset + 12, table.data.byteLength, false);
    }

    // 5. Assemble final SFNT file
    const sfntSize = dataOffset;
    const sfntFile = new ArrayBuffer(sfntSize);
    const sfntFileArray = new Uint8Array(sfntFile);
    const sfntFileView = new DataView(sfntFile);

    // Copy SFNT header
    sfntFileArray.set(new Uint8Array(sfntHeader), 0);

    // Copy table directory
    sfntFileArray.set(new Uint8Array(tableDirectory), 12);

    // Copy decompressed tables in sorted order
    dataOffset = 12 + numTables * 16;
    for (const table of decompressedTables) {
      sfntFileArray.set(table.data, dataOffset);
      dataOffset += table.data.byteLength;
      // Pad to 4-byte boundary
      dataOffset = (dataOffset + 3) & ~3;
    }

    console.log("[woffDecompressor] SFNT reconstruction complete:", {
      totalSize: sfntFile.byteLength,
      expectedSize: totalSfntSize,
      sizeMatch: sfntFile.byteLength === totalSfntSize,
      firstBytes: Array.from(sfntFileArray.slice(0, 20))
        .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
        .join(" "),
    });

    // Check if decompressed data looks like valid SFNT
    const sfntSignature = String.fromCharCode(...sfntFileArray.slice(0, 4));
    const sfntNumTables = sfntFileView.getUint16(4, false);

    console.log("[woffDecompressor] Decompressed SFNT header check:", {
      signature: sfntSignature,
      numTables: sfntNumTables,
      isValid:
        sfntSignature === "\x00\x01\x00\x00" ||
        sfntSignature === "OTTO" ||
        sfntSignature.startsWith("ttcf"),
    });

    return sfntFile;
  } catch (e) {
    console.error("[woffDecompressor] WOFF decompression error:", e);
    throw new Error(
      `Failed to decompress WOFF file: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

/**
 * Decompress WOFF2 file using woff2-encoder (default) or wawoff2 (for variable fonts)
 *
 * Strategy:
 * - Use woff2-encoder by default (works for most fonts, including static fonts)
 * - Use wawoff2 for variable fonts (better variable font table reconstruction)
 *
 * Since we can't detect if a font is variable before decompressing, we:
 * 1. Try woff2-encoder first (fast, works for most fonts)
 * 2. If it fails or if variable font detection shows issues, fall back to wawoff2
 */
async function decompressWOFF2File(
  compressedBuffer: ArrayBuffer,
  isVariable?: boolean
): Promise<ArrayBuffer> {
  // If we know it's a variable font, use wawoff2 directly
  if (isVariable === true) {
    return await decompressWOFF2WithWawoff2(compressedBuffer);
  }

  // Otherwise, try woff2-encoder first (works for most fonts)
  try {
    console.log("[woffDecompressor] Decompressing WOFF2 file using woff2-encoder...");
    console.log("[woffDecompressor] Input buffer size:", compressedBuffer.byteLength);

    const decompressed = await decompressWOFF2Default(compressedBuffer);

    console.log("[woffDecompressor] WOFF2 decompression result (woff2-encoder):", {
      decompressedSize: decompressed.byteLength,
      inputSize: compressedBuffer.byteLength,
      compressionRatio: `${((compressedBuffer.byteLength / decompressed.byteLength) * 100).toFixed(1)}%`,
    });

    // Check if decompressed data looks like valid SFNT
    const decompressedView = new Uint8Array(decompressed);
    const sfntSignature = String.fromCharCode(...decompressedView.slice(0, 4));
    const sfntNumTables = new DataView(decompressed.buffer).getUint16(4, false);

    console.log("[woffDecompressor] Decompressed SFNT header check:", {
      signature: sfntSignature,
      numTables: sfntNumTables,
      isValid:
        sfntSignature === "\x00\x01\x00\x00" ||
        sfntSignature === "OTTO" ||
        sfntSignature.startsWith("ttcf"),
    });

    // Note: woff2-encoder works well for both static and variable fonts
    // We skip the wawoff2 step since it can hang and woff2-encoder is sufficient

    // Convert Uint8Array to ArrayBuffer for consistency
    const newBuffer = new ArrayBuffer(decompressed.byteLength);
    new Uint8Array(newBuffer).set(decompressed);
    return newBuffer;
  } catch (error) {
    console.warn("[woffDecompressor] woff2-encoder failed, falling back to wawoff2:", error);
    // Fall back to wawoff2 if woff2-encoder fails
    return await decompressWOFF2WithWawoff2(compressedBuffer);
  }
}

/**
 * Decompress WOFF2 file using wawoff2 package (for variable fonts)
 *
 * Uses wawoff2 (WebAssembly wrapper around Google's official C++ WOFF2 code)
 * for bit-perfect reconstruction of variable font tables. This is critical for
 * proper variable font support in opentype.js canvas rendering.
 *
 * Uses dynamic import to handle CommonJS compatibility with Vite.
 */
async function decompressWOFF2WithWawoff2(compressedBuffer: ArrayBuffer): Promise<ArrayBuffer> {
  try {
    console.log(
      "[woffDecompressor] Decompressing WOFF2 file using wawoff2 (WASM Google reference)..."
    );
    console.log("[woffDecompressor] Input buffer size:", compressedBuffer.byteLength);

    // Dynamically import wawoff2 to handle CommonJS compatibility with Vite
    console.log("[woffDecompressor] Importing wawoff2 module...");
    const wawoff2 = await import("wawoff2");
    console.log("[woffDecompressor] wawoff2 module imported, checking exports...", {
      hasDecompress: typeof wawoff2.decompress === "function",
      hasDefault: !!wawoff2.default,
      defaultType: typeof wawoff2.default,
      keys: Object.keys(wawoff2),
    });

    // Type for wawoff2 module which can have different export formats
    type Wawoff2Module = {
      decompress?: (buffer: Uint8Array) => Promise<Uint8Array> | Uint8Array;
      default?:
        | {
            decompress?: (buffer: Uint8Array) => Promise<Uint8Array> | Uint8Array;
          }
        | ((buffer: Uint8Array) => Promise<Uint8Array> | Uint8Array);
    };

    const wawoff2Typed = wawoff2 as Wawoff2Module;
    const decompress =
      wawoff2Typed.decompress ||
      (typeof wawoff2Typed.default === "object" && wawoff2Typed.default?.decompress) ||
      (typeof wawoff2Typed.default === "function" ? wawoff2Typed.default : undefined);

    if (!decompress || typeof decompress !== "function") {
      console.error(
        "[woffDecompressor] wawoff2.decompress not found. Available exports:",
        Object.keys(wawoff2)
      );
      throw new Error("wawoff2.decompress function not found");
    }

    console.log("[woffDecompressor] Calling wawoff2.decompress...");
    // wawoff2.decompress expects Uint8Array and returns Uint8Array
    // This handles complex 'glyf' table reconstruction correctly for variable fonts
    // Add timeout to prevent hanging (10 seconds should be enough for most fonts)
    const decompressPromise = decompress(new Uint8Array(compressedBuffer));
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("wawoff2.decompress timeout after 10 seconds")), 10000);
    });

    const decompressed = await Promise.race([decompressPromise, timeoutPromise]);
    console.log(
      "[woffDecompressor] wawoff2.decompress completed, result size:",
      decompressed.byteLength
    );

    console.log("[woffDecompressor] WOFF2 decompression result (wawoff2):", {
      decompressedSize: decompressed.byteLength,
      inputSize: compressedBuffer.byteLength,
      compressionRatio: `${((compressedBuffer.byteLength / decompressed.byteLength) * 100).toFixed(1)}%`,
    });

    // Check if decompressed data looks like valid SFNT
    const decompressedView = new Uint8Array(decompressed);
    const sfntSignature = String.fromCharCode(...decompressedView.slice(0, 4));
    const sfntNumTables = new DataView(decompressed.buffer).getUint16(4, false);

    console.log("[woffDecompressor] Decompressed SFNT header check:", {
      signature: sfntSignature,
      numTables: sfntNumTables,
      isValid:
        sfntSignature === "\x00\x01\x00\x00" ||
        sfntSignature === "OTTO" ||
        sfntSignature.startsWith("ttcf"),
    });

    // Convert Uint8Array to ArrayBuffer for consistency
    const newBuffer = new ArrayBuffer(decompressed.byteLength);
    new Uint8Array(newBuffer).set(decompressed);
    return newBuffer;
  } catch (error) {
    console.error("[woffDecompressor] WOFF2 decompression error (wawoff2):", error);

    // Provide helpful error messages
    if (error instanceof Error) {
      throw new Error(`Failed to decompress WOFF2 file with wawoff2: ${error.message}`);
    }

    throw new Error("Failed to decompress WOFF2 file: Unknown error");
  }
}

/**
 * Decompress WOFF or WOFF2 file to raw TTF/OTF format
 * Returns the decompressed ArrayBuffer ready for opentype.js parsing
 */
export async function decompressFont(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const format = detectFontFormat(buffer);

  console.log(`[woffDecompressor] Detected format: ${format}`);

  switch (format) {
    case "woff":
      console.log("[woffDecompressor] Decompressing WOFF file...");
      return await decompressWOFF(buffer);

    case "woff2":
      console.log("[woffDecompressor] Decompressing WOFF2 file...");
      try {
        return await decompressWOFF2File(buffer);
      } catch (error) {
        console.error("[woffDecompressor] WOFF2 decompression failed:", error);
        throw error;
      }

    case "ttf":
    case "otf":
      // Already uncompressed, return as-is
      console.log("[woffDecompressor] File is already uncompressed TTF/OTF");
      return buffer;

    default:
      throw new Error(`Unsupported font format. Expected TTF, OTF, WOFF, or WOFF2.`);
  }
}
