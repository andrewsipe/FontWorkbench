/**
 * Bottom collapsible detail panel: Compare (unprocessed vs matched), Features, Glyphs.
 * Prototype-aligned: tabs in header, collapse button, left/right compare layout.
 */

import { useEffect, useState } from "react";
import { loadFontFile } from "../../engine/FontLoader";
import { extractGlyphsFromFont, type GlyphInfo } from "../../lib/glyphExtraction";
import type { IndexRecord } from "../../lib/indexBuilder";
import { useWorkbenchStore } from "../../stores/workbenchStore";
import type { CachedFont } from "../../types/font.types";
import styles from "./DetailPanel.module.css";

async function getFileByPath(
  root: FileSystemDirectoryHandle,
  relativePath: string,
  fallbackFileName?: string
): Promise<File> {
  const path = ((relativePath ?? "").trim() || fallbackFileName) ?? "";
  let parts = path.split("/").filter(Boolean);
  if (parts.length === 0) throw new Error("No file path or fallback fileName");

  // directoryScanner prefixes every filePath with dirHandle.name as the first segment.
  // Since root IS that directory, strip that first segment before traversing.
  if (parts.length > 1 && parts[0] === root.name) {
    parts = parts.slice(1);
  }

  if (parts.length === 1) {
    const f = await root.getFileHandle(parts[0]);
    return f.getFile();
  }
  let dir = root;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i]);
  }
  const f = await dir.getFileHandle(parts[parts.length - 1]);
  return f.getFile();
}

type DetailTab = "compare" | "features" | "glyphs";

function useInjectedFont(font: CachedFont | null): string | null {
  const [fontFamily, setFontFamily] = useState<string | null>(null);

  useEffect(() => {
    if (!font?.fileData) {
      setFontFamily(null);
      return;
    }
    const id = `wb-preview-${font.id}`;
    const existing = document.getElementById(id);
    if (existing) {
      setFontFamily(id);
      return;
    }

    const mime =
      font.format === "otf"
        ? "font/otf"
        : font.format === "ttf"
          ? "font/ttf"
          : font.format === "woff2"
            ? "font/woff2"
            : "font/woff";
    const blob = new Blob([font.fileData], { type: mime });
    const url = URL.createObjectURL(blob);
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `@font-face { font-family: "${id}"; src: url("${url}"); }`;
    document.head.appendChild(style);
    setFontFamily(id);

    return () => {
      URL.revokeObjectURL(url);
      const el = document.getElementById(id);
      if (el) el.remove();
      setFontFamily(null);
    };
  }, [font?.id, font?.fileData, font?.format]);

  return fontFamily;
}

function DetailPanel() {
  const { unprocessedItems, selectedFontFilePath, matchResults, processedDirHandle } =
    useWorkbenchStore();

  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>("compare");
  const [processedFont, setProcessedFont] = useState<CachedFont | null>(null);
  const [processedFontError, setProcessedFontError] = useState<string | null>(null);

  const [unprocessedGlyphs, setUnprocessedGlyphs] = useState<GlyphInfo[]>([]);
  const [unprocessedGlyphsLoading, setUnprocessedGlyphsLoading] = useState(false);
  const [processedGlyphs, setProcessedGlyphs] = useState<GlyphInfo[]>([]);
  const [processedGlyphsLoading, setProcessedGlyphsLoading] = useState(false);

  const selected = selectedFontFilePath
    ? unprocessedItems.find((i) => i.filePath === selectedFontFilePath)
    : null;
  const result = selectedFontFilePath ? matchResults.get(selectedFontFilePath) : null;
  const matchedRecord = result?.matchedRecord ?? null;

  const selectedFileName = selected
    ? (selected.font.fileName ?? selected.filePath.split("/").pop() ?? selected.filePath)
    : null;

  const injectedFontFamily = useInjectedFont(selected?.font ?? null);
  const injectedProcessedFontFamily = useInjectedFont(processedFont);

  useEffect(() => {
    if (activeTab !== "glyphs" || !selected?.font?.fileData) {
      setUnprocessedGlyphs([]);
      setUnprocessedGlyphsLoading(false);
      return;
    }
    let cancelled = false;
    setUnprocessedGlyphsLoading(true);
    extractGlyphsFromFont(selected.font)
      .then((glyphs) => {
        if (!cancelled) {
          setUnprocessedGlyphs(glyphs);
          setUnprocessedGlyphsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setUnprocessedGlyphsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, selected?.font]);

  useEffect(() => {
    if (activeTab !== "glyphs" || !processedDirHandle || !matchedRecord) {
      setProcessedFont(null);
      setProcessedFontError(null);
      setProcessedGlyphs([]);
      setProcessedGlyphsLoading(false);
      return;
    }
    let cancelled = false;
    getFileByPath(processedDirHandle, matchedRecord.filePath, matchedRecord.fileName)
      .then((file) => loadFontFile(file))
      .then((font) => {
        if (!cancelled) {
          setProcessedFont(font);
          setProcessedFontError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setProcessedFontError(e instanceof Error ? e.message : String(e));
          setProcessedFont(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, processedDirHandle, matchedRecord]);

  useEffect(() => {
    if (!processedFont?.fileData) {
      setProcessedGlyphs([]);
      setProcessedGlyphsLoading(false);
      return;
    }
    let cancelled = false;
    setProcessedGlyphsLoading(true);
    extractGlyphsFromFont(processedFont)
      .then((glyphs) => {
        if (!cancelled) {
          setProcessedGlyphs(glyphs);
          setProcessedGlyphsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setProcessedGlyphsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [processedFont]);

  const isLoadingProcessedFont =
    activeTab === "glyphs" && !!matchedRecord && !processedFont && !processedFontError;

  return (
    <section
      className={`${styles.panel} ${collapsed ? styles.collapsed : ""}`}
      aria-label="Font comparison and details"
    >
      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === "compare" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("compare")}
          aria-pressed={activeTab === "compare"}
        >
          Compare
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === "features" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("features")}
          aria-pressed={activeTab === "features"}
        >
          Features
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === "glyphs" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("glyphs")}
          aria-pressed={activeTab === "glyphs"}
        >
          Glyphs
        </button>
        <span className={styles.selectedName} aria-hidden>
          {selectedFileName ?? "Select a font"}
        </span>
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand panel" : "Collapse panel"}
        >
          {collapsed ? "▴ Expand" : "▾ Collapse"}
        </button>
      </div>

      {!collapsed && (
        <div className={styles.content}>
          {!selected ? (
            <p className={styles.placeholder}>
              Select a font from the table to compare and inspect.
            </p>
          ) : (
            <>
              {activeTab === "compare" && (
                <div className={styles.tabCompare}>
                  <div className={styles.compareLeft}>
                    <div className={styles.cmpLabel}>
                      Unprocessed <span className={styles.badgeSelected}>Selected</span>
                    </div>
                    <div className={styles.cmpFilename}>{selectedFileName}</div>
                    <CompareGrid font={selected.font} matchedRecord={matchedRecord} />
                  </div>
                  <div className={styles.compareRight}>
                    <div className={styles.cmpLabel}>
                      Processed <span className={styles.badgeMatched}>Matched</span>
                    </div>
                    <div className={styles.cmpFilename}>{matchedRecord?.fileName ?? "—"}</div>
                    {matchedRecord ? (
                      <MatchedSummary record={matchedRecord} />
                    ) : (
                      <p className={styles.muted}>No match in processed collection.</p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "features" && (
                <FeatureComparison
                  unprocessedFeatures={selected.font.features ?? []}
                  processedFeatures={matchedRecord?.featureTags ?? []}
                  unprocessedFileName={selectedFileName ?? ""}
                  processedFileName={matchedRecord?.fileName ?? "—"}
                />
              )}

              {activeTab === "glyphs" && (
                <div className={styles.tabGlyphs}>
                  <div className={styles.glyphSide}>
                    <div className={styles.glyphLabel}>
                      Unprocessed —{" "}
                      {unprocessedGlyphs.length > 0
                        ? unprocessedGlyphs.length
                        : (selected.font.glyphCount ?? selected.font.misc?.glyphCount ?? 0)}{" "}
                      glyphs
                    </div>
                    {unprocessedGlyphsLoading ? (
                      <p className={styles.muted}>Extracting glyphs…</p>
                    ) : injectedFontFamily && unprocessedGlyphs.length > 0 ? (
                      <div className={styles.glyphGrid}>
                        {unprocessedGlyphs.map((glyph) => (
                          <div
                            key={glyph.unicode}
                            className={styles.glyphCell}
                            style={{ fontFamily: `"${injectedFontFamily}"` }}
                            title={`${glyph.char}  ${glyph.unicode} — ${glyph.name}`}
                          >
                            {glyph.char}
                          </div>
                        ))}
                      </div>
                    ) : !injectedFontFamily ? (
                      <p className={styles.muted}>Loading font…</p>
                    ) : null}
                  </div>

                  <div className={styles.glyphSide}>
                    <div className={styles.glyphLabel}>
                      Processed —{" "}
                      {processedGlyphs.length > 0
                        ? processedGlyphs.length
                        : (matchedRecord?.glyphCount ?? "—")}{" "}
                      glyphs
                    </div>
                    {processedFontError && (
                      <p className={styles.muted} role="alert">
                        {processedFontError}
                      </p>
                    )}
                    {isLoadingProcessedFont && (
                      <p className={styles.muted}>Loading processed font…</p>
                    )}
                    {processedGlyphsLoading && (
                      <p className={styles.muted}>Extracting glyphs…</p>
                    )}
                    {processedGlyphs.length > 0 && injectedProcessedFontFamily && (
                      <div className={styles.glyphGrid}>
                        {processedGlyphs.map((glyph) => (
                          <div
                            key={glyph.unicode}
                            className={styles.glyphCell}
                            style={{ fontFamily: `"${injectedProcessedFontFamily}"` }}
                            title={`${glyph.char}  ${glyph.unicode} — ${glyph.name}`}
                          >
                            {glyph.char}
                          </div>
                        ))}
                      </div>
                    )}
                    {!matchedRecord && !processedFontError && (
                      <p className={styles.muted}>No match in processed collection.</p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function FeatureComparison({
  unprocessedFeatures,
  processedFeatures,
  unprocessedFileName,
  processedFileName,
}: {
  unprocessedFeatures: string[];
  processedFeatures: string[];
  unprocessedFileName: string;
  processedFileName: string;
}) {
  const unprocessedTags = new Set(unprocessedFeatures);
  const processedTags = new Set(processedFeatures);
  const shared = unprocessedFeatures.filter((t) => processedTags.has(t));
  const onlyUnprocessed = unprocessedFeatures.filter((t) => !processedTags.has(t));
  const onlyProcessed = processedFeatures.filter((t) => !unprocessedTags.has(t));

  return (
    <div className={styles.tabFeatures}>
      <div className={styles.featSide}>
        <div className={styles.featLabel}>
          Unprocessed — {unprocessedFileName} ({unprocessedFeatures.length} features)
        </div>
        <div className={styles.featGrid}>
          {shared.map((tag) => (
            <span key={tag} className={`${styles.featTag} ${styles.featTagShared}`}>
              {tag}
            </span>
          ))}
          {onlyUnprocessed.map((tag) => (
            <span key={tag} className={`${styles.featTag} ${styles.featTagOnly}`}>
              {tag}
            </span>
          ))}
          {unprocessedFeatures.length === 0 && (
            <span className={styles.muted}>No feature list</span>
          )}
        </div>
        {onlyUnprocessed.length > 0 && (
          <p className={styles.featNote}>
            <span className={styles.featNoteDot} aria-hidden /> {onlyUnprocessed.length} features
            only in unprocessed
          </p>
        )}
      </div>
      <div className={styles.featSide}>
        <div className={styles.featLabel}>
          Processed — {processedFileName} ({processedFeatures.length} features)
        </div>
        <div className={styles.featGrid}>
          {shared.map((tag) => (
            <span key={tag} className={`${styles.featTag} ${styles.featTagShared}`}>
              {tag}
            </span>
          ))}
          {onlyProcessed.map((tag) => (
            <span key={tag} className={styles.featTag}>
              {tag}
            </span>
          ))}
          {processedFeatures.length === 0 && <span className={styles.muted}>No feature list</span>}
        </div>
      </div>
    </div>
  );
}

function CompareGrid({
  font,
  matchedRecord,
}: {
  font: CachedFont;
  matchedRecord: IndexRecord | null;
}) {
  const family = font.metadata?.preferredFamily ?? font.metadata?.familyName ?? font.name;
  const version = font.metadata?.version ?? "—";
  const glyphCount = font.glyphCount ?? font.misc?.glyphCount ?? 0;
  const featureCount = (font.features ?? []).length;
  const tables = font.misc?.availableTables ?? [];
  const versionDiff = matchedRecord && version !== matchedRecord.version;
  const glyphDiff = matchedRecord && glyphCount !== matchedRecord.glyphCount;
  const sizeStr = font.fileData ? `${(font.fileData.byteLength / 1024).toFixed(0)} KB` : "—";
  const formatStr =
    font.format === "otf" ? "OTF (CFF)" : font.format === "ttf" ? "TTF" : font.format.toUpperCase();

  return (
    <>
      <div className={styles.cmpGrid}>
        <span className={styles.cgKey}>Version</span>
        <span className={versionDiff ? `${styles.cgVal} ${styles.cgValWarn}` : styles.cgVal}>
          {version}
        </span>
        <span className={styles.cgKey}>Family</span>
        <span className={styles.cgVal}>{family}</span>
        <span className={styles.cgKey}>Glyphs</span>
        <span className={glyphDiff ? `${styles.cgVal} ${styles.cgValHighlight}` : styles.cgVal}>
          {glyphCount}
        </span>
        <span className={styles.cgKey}>Features</span>
        <span className={styles.cgVal}>{featureCount}</span>
        <span className={styles.cgKey}>File size</span>
        <span className={styles.cgVal}>{sizeStr}</span>
        <span className={styles.cgKey}>Format</span>
        <span className={styles.cgVal}>{formatStr}</span>
      </div>
      <div className={styles.cmpTablesSection}>
        <div className={styles.cmpTablesLabel}>Tables</div>
        <div className={styles.cmpTables}>
          {tables.map((tag) => {
            const inMatched = matchedRecord?.availableTables?.includes(tag);
            return (
              <span key={tag} className={inMatched ? styles.tblChipShared : styles.tblChipOnly}>
                {tag}
              </span>
            );
          })}
        </div>
      </div>
    </>
  );
}

function formatBytes(n: number): string {
  if (n === 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function MatchedSummary({ record }: { record: IndexRecord }) {
  const glyphCount = record.glyphCount ?? 0;
  const tables = record.availableTables ?? [];
  const sizeStr = record.fileSize ? formatBytes(record.fileSize) : "—";

  return (
    <>
      <div className={styles.cmpGrid}>
        <span className={styles.cgKey}>Version</span>
        <span className={styles.cgVal}>{record.version ?? "—"}</span>
        <span className={styles.cgKey}>Family</span>
        <span className={styles.cgVal}>{record.familyName ?? "—"}</span>
        <span className={styles.cgKey}>Glyphs</span>
        <span className={styles.cgVal}>{glyphCount}</span>
        <span className={styles.cgKey}>Features</span>
        <span className={styles.cgVal}>{(record.featureTags ?? []).length || "—"}</span>
        <span className={styles.cgKey}>File size</span>
        <span className={styles.cgVal}>{sizeStr}</span>
        <span className={styles.cgKey}>Format</span>
        <span className={styles.cgVal}>
          {record.format === "otf" ? "OTF (CFF)" : record.format.toUpperCase()}
        </span>
      </div>
      <div className={styles.cmpTablesSection}>
        <div className={styles.cmpTablesLabel}>Tables</div>
        <div className={styles.cmpTables}>
          {tables.map((tag) => (
            <span key={tag} className={styles.tblChipShared}>
              {tag}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

export default DetailPanel;
