/**
 * Standalone fontkit test to diagnose immediate failures
 * Run this in browser console or as a test
 */

import * as fontkit from "fontkit";

export interface FontkitTestResult {
  success: boolean;
  error?: string;
  errorType?: string;
  stack?: string;
  fontkitAvailable: boolean;
  createFunctionExists: boolean;
  testBufferCreated: boolean;
  fontkitCreateCalled: boolean;
  details: {
    fontkitType: string;
    fontkitKeys: string[];
    bufferType: string;
    bufferSize: number;
    firstBytes: number[];
  };
}

/**
 * Test fontkit with a minimal valid TTF buffer
 */
export function testFontkitStandalone(testBuffer?: ArrayBuffer): FontkitTestResult {
  const result: FontkitTestResult = {
    success: false,
    fontkitAvailable: false,
    createFunctionExists: false,
    testBufferCreated: false,
    fontkitCreateCalled: false,
    details: {
      fontkitType: "unknown",
      fontkitKeys: [],
      bufferType: "unknown",
      bufferSize: 0,
      firstBytes: [],
    },
  };

  // Check if fontkit is available
  try {
    result.fontkitAvailable = typeof fontkit !== "undefined" && fontkit !== null;
    result.details.fontkitType = typeof fontkit;
    result.details.fontkitKeys = result.fontkitAvailable ? Object.keys(fontkit) : [];
    result.createFunctionExists = typeof fontkit?.create === "function";
  } catch (e) {
    result.error = `Fontkit import failed: ${e instanceof Error ? e.message : String(e)}`;
    return result;
  }

  if (!result.fontkitAvailable || !result.createFunctionExists) {
    result.error = "Fontkit not available or create function missing";
    return result;
  }

  // Create or use provided buffer
  let buffer: ArrayBuffer;
  if (testBuffer) {
    buffer = testBuffer;
    result.details.bufferType = buffer.constructor.name;
    result.details.bufferSize = buffer.byteLength;
    result.details.firstBytes = Array.from(new Uint8Array(buffer.slice(0, 12)));
  } else {
    // Create minimal valid TTF header
    const minimalTTF = new Uint8Array([
      0x00,
      0x01,
      0x00,
      0x00, // TTF signature
      0x00,
      0x0a, // numTables
      0x00,
      0x00,
      0x00,
      0x10, // searchRange
      0x00,
      0x00,
      0x00,
      0x0a, // entrySelector
      0x00,
      0x00,
      0x00,
      0x14, // rangeShift
    ]);
    buffer = minimalTTF.buffer;
    result.testBufferCreated = true;
    result.details.bufferType = buffer.constructor.name;
    result.details.bufferSize = buffer.byteLength;
    result.details.firstBytes = Array.from(minimalTTF);
  }

  // Try to create font
  try {
    result.fontkitCreateCalled = true;
    const font = fontkit.create(buffer);
    result.success = !!font;
    if (font) {
      console.log("✅ Fontkit test SUCCESS - font created:", {
        familyName: font.familyName,
        postscriptName: font.postscriptName,
        numGlyphs: font.numGlyphs,
      });
    }
  } catch (e) {
    result.success = false;
    if (e instanceof Error) {
      result.error = e.message;
      result.errorType = e.name;
      result.stack = e.stack;
    } else {
      result.error = String(e);
    }
    console.error("❌ Fontkit test FAILED:", {
      error: result.error,
      errorType: result.errorType,
      buffer: result.details,
    });
  }

  return result;
}

/**
 * Test with a real font file buffer
 */
export async function testFontkitWithFile(file: File): Promise<FontkitTestResult> {
  const arrayBuffer = await file.arrayBuffer();
  return testFontkitStandalone(arrayBuffer);
}
