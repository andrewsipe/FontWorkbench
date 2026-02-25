/**
 * Bottom collapsible detail panel: Compare (unprocessed vs matched), Features, Glyphs.
 * Prototype-aligned: tabs in header, collapse button, left/right compare layout.
 */

import { useState } from "react";
import type { IndexRecord } from "../../lib/indexBuilder";
import { useWorkbenchStore } from "../../stores/workbenchStore";
import type { CachedFont } from "../../types/font.types";
import styles from "./DetailPanel.module.css";

type DetailTab = "compare" | "features" | "glyphs";

function DetailPanel() {
  const { unprocessedItems, selectedFontFilePath, matchResults } = useWorkbenchStore();
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>("compare");

  const selected = selectedFontFilePath
    ? unprocessedItems.find((i) => i.filePath === selectedFontFilePath)
    : null;
  const result = selectedFontFilePath ? matchResults.get(selectedFontFilePath) : null;
  const matchedRecord = result?.matchedRecord ?? null;

  const selectedFileName = selected
    ? (selected.font.fileName ?? selected.filePath.split("/").pop() ?? selected.filePath)
    : null;

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
                      Unprocessed <span className={styles.badgeLabel}>Selected</span>
                    </div>
                    <div className={styles.cmpFilename}>{selectedFileName}</div>
                    <CompareGrid font={selected.font} filePath={selected.filePath} />
                  </div>
                  <div className={styles.compareRight}>
                    <div className={styles.cmpLabel}>
                      Processed <span className={styles.badgeLabel}>Matched</span>
                    </div>
                    <div className={styles.cmpFilename}>{matchedRecord?.fileName ?? "—"}</div>
                    {matchedRecord ? (
                      <MatchedSummary
                        record={matchedRecord}
                        unprocessedGlyphs={
                          selected.font.glyphCount ?? selected.font.misc?.glyphCount ?? 0
                        }
                        unprocessedFeatures={(selected.font.features ?? []).length}
                      />
                    ) : (
                      <p className={styles.muted}>No match in processed collection.</p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "features" && (
                <div className={styles.tabFeatures}>
                  <div className={styles.featSide}>
                    <div className={styles.featLabel}>
                      Unprocessed — {selectedFileName} ({(selected.font.features ?? []).length}{" "}
                      features)
                    </div>
                    <div className={styles.featGrid}>
                      {(selected.font.features ?? []).map((tag) => (
                        <span key={tag} className={styles.featTag}>
                          {tag}
                        </span>
                      ))}
                      {(selected.font.features ?? []).length === 0 && (
                        <span className={styles.muted}>No feature list</span>
                      )}
                    </div>
                  </div>
                  <div className={styles.featSide}>
                    <div className={styles.featLabel}>
                      Processed — {matchedRecord?.fileName ?? "—"} (matched collection)
                    </div>
                    <p className={styles.muted}>Feature list from index not shown here yet.</p>
                  </div>
                </div>
              )}

              {activeTab === "glyphs" && (
                <div className={styles.tabGlyphs}>
                  <div className={styles.glyphSide}>
                    <div className={styles.glyphLabel}>
                      Unprocessed —{" "}
                      {selected.font.glyphCount ?? selected.font.misc?.glyphCount ?? 0} glyphs
                    </div>
                    <p className={styles.muted}>
                      Glyph grid requires per-glyph data; count only for now.
                    </p>
                  </div>
                  <div className={styles.glyphSide}>
                    <div className={styles.glyphLabel}>
                      Processed — {matchedRecord ? "see index" : "—"} glyphs
                    </div>
                    <p className={styles.muted}>Glyph count from matched record when available.</p>
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

function CompareGrid({ font }: { font: CachedFont; filePath: string }) {
  const family = font.metadata?.preferredFamily ?? font.metadata?.familyName ?? font.name;
  const version = font.metadata?.version ?? font.misc?.version ?? "—";
  const glyphCount = font.glyphCount ?? font.misc?.glyphCount ?? 0;
  const featureCount = (font.features ?? []).length;

  return (
    <div className={styles.cmpGrid}>
      <span className={styles.cgKey}>Version</span>
      <span className={styles.cgVal}>{version}</span>
      <span className={styles.cgKey}>Family</span>
      <span className={styles.cgVal}>{family}</span>
      <span className={styles.cgKey}>Glyphs</span>
      <span className={styles.cgVal}>{glyphCount}</span>
      <span className={styles.cgKey}>Features</span>
      <span className={styles.cgVal}>{featureCount}</span>
    </div>
  );
}

function MatchedSummary({
  record,
  unprocessedGlyphs,
}: {
  record: IndexRecord;
  unprocessedGlyphs: number;
  unprocessedFeatures: number;
}) {
  const glyphCount = record.glyphCount ?? 0;
  const glyphHighlight = glyphCount !== unprocessedGlyphs;

  return (
    <div className={styles.cmpGrid}>
      <span className={styles.cgKey}>Version</span>
      <span className={styles.cgVal}>{record.version ?? "—"}</span>
      <span className={styles.cgKey}>Family</span>
      <span className={styles.cgVal}>{record.familyName ?? "—"}</span>
      <span className={styles.cgKey}>Glyphs</span>
      <span className={`${styles.cgVal} ${glyphHighlight ? styles.cgValHighlight : ""}`}>
        {glyphCount}
      </span>
      <span className={styles.cgKey}>Features</span>
      <span className={styles.cgVal}>—</span>
    </div>
  );
}

export default DetailPanel;
