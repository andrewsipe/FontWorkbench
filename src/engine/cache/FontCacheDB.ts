// @ts-nocheck — Untyped third-party APIs (IndexedDB); type checking disabled for this file.
/**
 * Font Cache Database Schema
 * Multi-store IndexedDB implementation for hash-based font storage
 * Phase 4: Storage Layer - Deduplication and persistent caching
 *
 * Architecture:
 * - fontFiles: Stores binary data, keyed by fileHash (deduplication)
 * - fontMetadata: Stores extraction results, keyed by UUID, indexed by fileHash/familyName/postscriptName
 *
 * This separation allows multiple metadata entries to reference a single file entry,
 * enabling deduplication when the same font file is loaded multiple times.
 */

import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import type { FontExtractionSuite } from "../../types/extractors.types";
import type { FontMetadata } from "../../types/font.types";

/**
 * Database schema definition
 */
interface FontCacheDBSchema extends DBSchema {
  /**
   * Font Files Store
   * Stores the actual binary font data (ArrayBuffer/Blob)
   * Primary Key: fileHash (string) - SHA-256 hash of file content
   *
   * Deduplication: Multiple metadata entries can reference the same fileHash
   */
  fontFiles: {
    key: string; // fileHash (SHA-256 hex string)
    value: {
      fileHash: string;
      fileData: ArrayBuffer; // Decompressed font data (for parsing)
      originalFileData?: ArrayBuffer; // Original compressed data (for WOFF/WOFF2)
      format: "ttf" | "otf" | "woff" | "woff2";
      size: number; // Total size in bytes
      timestamp: number; // When file was first stored
      lastAccessed: number; // Last access time (for LRU eviction)
    };
    indexes: {
      "by-timestamp": number;
      "by-lastAccessed": number;
      "by-format": string;
    };
  };

  /**
   * Font Metadata Store
   * Stores the extracted font metadata and extraction suite
   * Primary Key: id (UUID string)
   * Indexed by: fileHash, lastAccessed
   *
   * Single-font model: Only one metadata entry per fileHash (overwrites on update)
   */
  fontMetadata: {
    key: string; // id (UUID)
    value: {
      id: string; // UUID
      fileHash: string; // Reference to fontFiles store
      fileName: string; // Original filename
      familyName: string;
      styleName: string;
      postscriptName?: string; // Optional PostScript name

      // Full extraction suite
      extractionSuite: FontExtractionSuite;

      // Convenience fields (derived from extractionSuite)
      isVariable: boolean;
      glyphCount: number;

      // Cache management
      timestamp: number; // When metadata was created
      lastAccessed: number; // Last access time
      cacheVersion: number; // Schema version for migration
    };
    indexes: {
      "by-fileHash": string; // Find metadata for a file (single entry)
      "by-timestamp": number;
      "by-lastAccessed": number;
    };
  };
}

const DB_NAME = "font-cache-db-v3";
const DB_VERSION = 3; // Increment when schema changes (v3: Removed fontSources store, removed unused indexes, simplified to single-font model)

/**
 * Initialize the font cache database
 * Creates stores and indexes if they don't exist
 */
export async function initFontCacheDB(): Promise<IDBPDatabase<FontCacheDBSchema>> {
  return openDB<FontCacheDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      console.log(`[FontCacheDB] Upgrading database from version ${oldVersion} to ${newVersion}`);

      // Create fontFiles store
      if (!db.objectStoreNames.contains("fontFiles")) {
        const fileStore = db.createObjectStore("fontFiles", {
          keyPath: "fileHash",
        });
        fileStore.createIndex("by-timestamp", "timestamp");
        fileStore.createIndex("by-lastAccessed", "lastAccessed");
        fileStore.createIndex("by-format", "format");
        console.log("[FontCacheDB] Created fontFiles store");
      }

      // Create fontMetadata store
      if (!db.objectStoreNames.contains("fontMetadata")) {
        const metadataStore = db.createObjectStore("fontMetadata", {
          keyPath: "id",
        });
        metadataStore.createIndex("by-fileHash", "fileHash");
        metadataStore.createIndex("by-timestamp", "timestamp");
        metadataStore.createIndex("by-lastAccessed", "lastAccessed");
        console.log("[FontCacheDB] Created fontMetadata store");
      }

      // Handle migrations from old schema versions
      if (oldVersion < 1) {
        // Future migration logic here
        console.log("[FontCacheDB] Running migration from version", oldVersion);
      }

      if (oldVersion < 2 && newVersion !== null && newVersion < 3) {
        // Migration to v2: Add fontSources store if upgrading (deprecated in v3)
        // Note: This store is removed in v3, so we skip creating it if upgrading directly to v3
        // Use type assertion since this store is not in the schema (it's temporary for migration)
        const dbAny = db as any;
        if (!dbAny.objectStoreNames.contains("fontSources")) {
          const sourcesStore = dbAny.createObjectStore("fontSources", {
            keyPath: "id",
          });
          sourcesStore.createIndex("by-type", "type");
          sourcesStore.createIndex("by-timestamp", "timestamp");
          sourcesStore.createIndex("by-lastAccessed", "lastAccessed");
          console.log("[FontCacheDB] Added fontSources store in migration (will be removed in v3)");
        }
      }

      if (oldVersion < 3) {
        // Migration to v3: Remove fontSources store, remove unused indexes
        // Remove fontSources store if it exists (use type assertion since it's not in schema)
        const dbAny = db as any;
        if (dbAny.objectStoreNames.contains("fontSources")) {
          dbAny.deleteObjectStore("fontSources");
          console.log("[FontCacheDB] Removed fontSources store in v3 migration");
        }

        // Remove unused indexes from fontMetadata
        // Use the transaction parameter provided to the upgrade function
        if (db.objectStoreNames.contains("fontMetadata")) {
          const metadataStore = transaction.objectStore("fontMetadata");
          try {
            // Use type assertion for index deletion since these indexes aren't in the schema
            if ((metadataStore.indexNames as any).contains("by-familyName")) {
              (metadataStore as any).deleteIndex("by-familyName");
              console.log("[FontCacheDB] Removed by-familyName index in v3 migration");
            }
          } catch {
            // Index may not exist, ignore
          }
          try {
            if ((metadataStore.indexNames as any).contains("by-postscriptName")) {
              (metadataStore as any).deleteIndex("by-postscriptName");
              console.log("[FontCacheDB] Removed by-postscriptName index in v3 migration");
            }
          } catch {
            // Index may not exist, ignore
          }
        }
      }
    },
  });
}

/**
 * Get database instance (lazy initialization)
 */
let dbPromise: Promise<IDBPDatabase<FontCacheDBSchema>> | null = null;

export function getDB(): Promise<IDBPDatabase<FontCacheDBSchema>> {
  if (!dbPromise) {
    dbPromise = initFontCacheDB().catch((error) => {
      // If initialization fails, reset the promise so we can retry
      console.error("[FontCacheDB] Database initialization failed:", error);
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

/**
 * Check if a font file exists in the cache by hash
 */
export async function hasFontFile(fileHash: string): Promise<boolean> {
  const db = await getDB();
  const file = await db.get("fontFiles", fileHash);
  return !!file;
}

/**
 * Get font file from cache by hash
 */
export async function getFontFile(
  fileHash: string
): Promise<FontCacheDBSchema["fontFiles"]["value"] | null> {
  const db = await getDB();
  const file = await db.get("fontFiles", fileHash);

  if (file) {
    // Update last accessed time
    file.lastAccessed = Date.now();
    await db.put("fontFiles", file);
  }

  return file || null;
}

/**
 * Store font file in cache
 * Returns the fileHash (which is the key)
 */
export async function storeFontFile(
  fileHash: string,
  fileData: ArrayBuffer,
  originalFileData: ArrayBuffer | undefined,
  format: "ttf" | "otf" | "woff" | "woff2"
): Promise<string> {
  const db = await getDB();

  // Check if file already exists
  const existing = await db.get("fontFiles", fileHash);
  if (existing) {
    // Update last accessed time
    existing.lastAccessed = Date.now();
    await db.put("fontFiles", existing);
    return fileHash;
  }

  // Store new file
  const fileEntry: FontCacheDBSchema["fontFiles"]["value"] = {
    fileHash,
    fileData,
    originalFileData,
    format,
    size: fileData.byteLength,
    timestamp: Date.now(),
    lastAccessed: Date.now(),
  };

  await db.put("fontFiles", fileEntry);
  return fileHash;
}

/**
 * Get font metadata by ID
 */
export async function getFontMetadata(
  id: string
): Promise<FontCacheDBSchema["fontMetadata"]["value"] | null> {
  const db = await getDB();
  const metadata = await db.get("fontMetadata", id);

  if (metadata) {
    // Update last accessed time
    metadata.lastAccessed = Date.now();
    await db.put("fontMetadata", metadata);
  }

  return metadata || null;
}

/**
 * Get the last cached font (most recently accessed)
 * Single-font model: Returns the single most recent font
 */
export async function getLastCachedFont(): Promise<{
  metadata: FontCacheDBSchema["fontMetadata"]["value"];
  file: FontCacheDBSchema["fontFiles"]["value"];
} | null> {
  const db = await getDB();

  // Ensure database is still open
  if (db.objectStoreNames.length === 0) {
    throw new Error("Database connection is closed or invalid");
  }

  const tx = db.transaction("fontMetadata", "readonly");
  const index = tx.store.index("by-lastAccessed");

  // Get all entries and sort by lastAccessed (descending)
  const allMetadata = await index.getAll();
  await tx.done; // Wait for transaction to complete

  if (allMetadata.length === 0) {
    return null;
  }

  // Sort by lastAccessed descending and get the most recent
  const sortedMetadata = allMetadata.sort((a, b) => b.lastAccessed - a.lastAccessed);
  const mostRecent = sortedMetadata[0];

  // Get the associated file
  const file = await db.get("fontFiles", mostRecent.fileHash);
  if (!file) {
    return null;
  }

  return {
    metadata: mostRecent,
    file,
  };
}

/**
 * Get font metadata entry for a given file hash
 * Single-font model: Returns single entry (most recent if multiple exist)
 */
export async function getMetadataByFileHash(
  fileHash: string,
  retryCount: number = 0
): Promise<FontCacheDBSchema["fontMetadata"]["value"] | null> {
  const MAX_RETRIES = 2;

  try {
    const db = await getDB();

    // Ensure database is still open
    if (db.objectStoreNames.length === 0) {
      if (retryCount < MAX_RETRIES) {
        console.warn("[FontCacheDB] Database connection appears closed, retrying...");
        // Reset promise and retry
        dbPromise = null;
        await new Promise((resolve) => setTimeout(resolve, 100)); // Brief delay
        return getMetadataByFileHash(fileHash, retryCount + 1);
      }
      throw new Error("Database connection is closed or invalid after retries");
    }

    const tx = db.transaction("fontMetadata", "readonly");
    const index = tx.store.index("by-fileHash");
    const results = await index.getAll(fileHash);
    await tx.done; // Wait for transaction to complete

    // Return most recent entry (by lastAccessed) or null
    if (results.length === 0) return null;
    if (results.length === 1) return results[0];
    // If multiple exist (legacy data), return most recently accessed
    return results.sort((a, b) => b.lastAccessed - a.lastAccessed)[0];
  } catch (error) {
    if (
      retryCount < MAX_RETRIES &&
      error instanceof Error &&
      (error.message.includes("closing") || error.message.includes("InvalidStateError"))
    ) {
      console.warn("[FontCacheDB] Database connection error, retrying...", error.message);
      // Reset promise and retry
      dbPromise = null;
      await new Promise((resolve) => setTimeout(resolve, 100)); // Brief delay
      return getMetadataByFileHash(fileHash, retryCount + 1);
    }
    throw error;
  }
}

/**
 * @deprecated Removed in v3 - single-font model doesn't need family name lookup
 * Kept for backward compatibility but returns empty array
 */
export async function getMetadataByFamilyName(
  _familyName: string
): Promise<FontCacheDBSchema["fontMetadata"]["value"][]> {
  console.warn("[FontCacheDB] getMetadataByFamilyName is deprecated in v3 (single-font model)");
  return [];
}

/**
 * @deprecated Removed in v3 - single-font model doesn't need PostScript name lookup
 * Kept for backward compatibility but returns null
 */
export async function getMetadataByPostscriptName(
  _postscriptName: string
): Promise<FontCacheDBSchema["fontMetadata"]["value"] | null> {
  console.warn("[FontCacheDB] getMetadataByPostscriptName is deprecated in v3 (single-font model)");
  return null;
}

/**
 * Store font metadata in cache
 * Single-font model: Overwrites existing metadata entry for the same fileHash
 */
export async function storeFontMetadata(
  id: string,
  fileHash: string,
  fileName: string,
  extractionSuite: FontExtractionSuite,
  metadata: FontMetadata,
  cacheVersion: number = 1
): Promise<string> {
  const db = await getDB();

  // Verify file exists
  const file = await db.get("fontFiles", fileHash);
  if (!file) {
    throw new Error(`Cannot store metadata: font file with hash ${fileHash} does not exist`);
  }

  // Single-font model: Check if metadata already exists for this fileHash
  const existingMetadata = await getMetadataByFileHash(fileHash);
  if (existingMetadata) {
    // Overwrite existing entry (use existing ID to maintain continuity)
    id = existingMetadata.id;
    console.log(
      `[FontCacheDB] Overwriting existing metadata for fileHash ${fileHash.slice(0, 8)}...`
    );
  }

  // Extract convenience fields
  const postscriptName =
    extractionSuite.metadata.success && extractionSuite.metadata.data
      ? extractionSuite.metadata.data.postscriptName
      : undefined;

  const metadataEntry: FontCacheDBSchema["fontMetadata"]["value"] = {
    id,
    fileHash,
    fileName,
    familyName: metadata.familyName,
    styleName: metadata.styleName,
    postscriptName,
    extractionSuite,
    isVariable: metadata.isVariable,
    glyphCount: metadata.glyphCount,
    timestamp: existingMetadata?.timestamp || Date.now(), // Preserve original timestamp if overwriting
    lastAccessed: Date.now(),
    cacheVersion,
  };

  await db.put("fontMetadata", metadataEntry);
  return id;
}

/**
 * Delete font metadata by ID
 * Note: This does NOT delete the associated file (files are shared)
 */
export async function deleteFontMetadata(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("fontMetadata", id);
}

/**
 * Delete font file by hash
 * WARNING: This will fail if any metadata entries reference this file
 * Use deleteFontFileWithMetadata() to delete both file and all associated metadata
 */
export async function deleteFontFile(fileHash: string): Promise<void> {
  const db = await getDB();

  // Check if any metadata references this file
  const metadataEntry = await getMetadataByFileHash(fileHash);
  if (metadataEntry) {
    throw new Error(
      `Cannot delete file: metadata entry still references it (id: ${metadataEntry.id})`
    );
  }

  await db.delete("fontFiles", fileHash);
}

/**
 * Delete font file and all associated metadata entries
 */
export async function deleteFontFileWithMetadata(fileHash: string): Promise<void> {
  const db = await getDB();

  // Ensure database is still open
  if (db.objectStoreNames.length === 0) {
    throw new Error("Database connection is closed or invalid");
  }

  const tx = db.transaction(["fontFiles", "fontMetadata"], "readwrite");

  // Delete all metadata entries
  const metadataIndex = tx.objectStore("fontMetadata").index("by-fileHash");
  const metadataEntries = await metadataIndex.getAll(fileHash);
  for (const entry of metadataEntries) {
    await tx.objectStore("fontMetadata").delete(entry.id);
  }

  // Delete file
  await tx.objectStore("fontFiles").delete(fileHash);

  await tx.done;
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  fileCount: number;
  metadataCount: number;
  totalFileSize: number;
  oldestFile: number;
  newestFile: number;
}> {
  const db = await getDB();

  const files = await db.getAll("fontFiles");
  const metadata = await db.getAll("fontMetadata");

  const totalFileSize = files.reduce((sum, file) => sum + file.size, 0);
  const timestamps = files.map((f) => f.timestamp);
  const oldestFile = timestamps.length > 0 ? Math.min(...timestamps) : 0;
  const newestFile = timestamps.length > 0 ? Math.max(...timestamps) : 0;

  return {
    fileCount: files.length,
    metadataCount: metadata.length,
    totalFileSize,
    oldestFile,
    newestFile,
  };
}

/**
 * Clear all cache data
 */
export async function clearCache(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["fontFiles", "fontMetadata"], "readwrite");

  await tx.objectStore("fontFiles").clear();
  await tx.objectStore("fontMetadata").clear();

  await tx.done;
}
