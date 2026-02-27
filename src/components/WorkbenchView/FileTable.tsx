/**
 * Table of unprocessed fonts (filtered by selected family). Shows match result,
 * editable rename target, and queue actions. Toolbar: family name, counts, status,
 * Select Duplicates / Queue Removal. Checkbox column and row styling for duplicates/queued-remove.
 */

import { useCallback, useMemo, useState } from "react";
import type { SuggestedAction } from "../../lib/matcher";
import type { UnprocessedItem } from "../../stores/workbenchStore";
import { useWorkbenchStore } from "../../stores/workbenchStore";
import { getFamilyStatus } from "./FamilySidebar";
import styles from "./FileTable.module.css";
import TableToolbar from "./TableToolbar";

type SortColumnId = "filename" | "version" | "date" | "glyphs" | "feat" | "size" | "type";

function sortKey(item: UnprocessedItem, col: SortColumnId): string | number {
  const fileName = item.font.fileName ?? item.filePath.split("/").pop() ?? item.filePath;
  switch (col) {
    case "filename":
      return fileName;
    case "version":
      return item.font.metadata?.version ?? "";
    case "date":
      return ""; // no date data yet
    case "glyphs":
      return item.font.glyphCount ?? item.font.misc?.glyphCount ?? 0;
    case "feat":
      return (item.font.features ?? []).length;
    case "size":
      return item.font.fileSize ?? item.font.fileData?.byteLength ?? 0;
    case "type":
      return item.font.format ?? "";
    default:
      return fileName;
  }
}

function isValidFileName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.includes("/") || trimmed.includes("\\")) return false;
  return true;
}

/** Split "Name.ttf" → { stem: "Name", ext: ".ttf" }; extension stays fixed when editing. */
function splitStemExt(fileName: string): { stem: string; ext: string } {
  const i = fileName.lastIndexOf(".");
  if (i <= 0) return { stem: fileName, ext: "" };
  return { stem: fileName.slice(0, i), ext: fileName.slice(i) };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const TYPE_BADGE_CLASS: Record<string, string> = {
  otf: "typeOtf",
  ttf: "typeTtf",
  woff: "typeWoff",
  woff2: "typeWoff2",
};

function isDuplicate(
  filePath: string,
  matchResults: Map<string, { action: SuggestedAction; flags?: string[] }>
): boolean {
  const result = matchResults.get(filePath);
  if (!result) return false;
  return result.action === "CONFLICT" || (result.flags ?? []).includes("TILDE_COUNTER");
}

function FileTable() {
  const {
    unprocessedItems,
    familyGroups,
    selectedFamily,
    selectedFontFilePath,
    matchResults,
    renameQueue,
    removalQueue,
    processedIndex,
    selectFont,
    queueRename,
    queueRemoval,
    cancelQueueItem,
  } = useWorkbenchStore();

  const [selectedFilePaths, setSelectedFilePaths] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ column: SortColumnId; direction: "asc" | "desc" }>({
    column: "filename",
    direction: "asc",
  });

  const itemsToShow = useMemo(() => {
    if (!selectedFamily) return unprocessedItems;
    return familyGroups.get(selectedFamily) ?? [];
  }, [unprocessedItems, familyGroups, selectedFamily]);

  const sortedItems = useMemo(() => {
    const list = [...itemsToShow];
    const mult = sort.direction === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const va = sortKey(a, sort.column);
      const vb = sortKey(b, sort.column);
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), undefined, { sensitivity: "base" });
      return mult * cmp;
    });
    return list;
  }, [itemsToShow, sort.column, sort.direction]);

  const familyStatus = useMemo(
    () => getFamilyStatus(itemsToShow, matchResults),
    [itemsToShow, matchResults]
  );

  const processedCount = useMemo(() => {
    if (!selectedFamily) return processedIndex.length;
    return processedIndex.filter((r) => r.familyName === selectedFamily).length;
  }, [processedIndex, selectedFamily]);

  const duplicateFilePaths = useMemo(
    () =>
      new Set(
        itemsToShow.filter((i) => isDuplicate(i.filePath, matchResults)).map((i) => i.filePath)
      ),
    [itemsToShow, matchResults]
  );

  const matchedProcessedRecords = useMemo(
    () => (selectedFamily ? processedIndex.filter((r) => r.familyName === selectedFamily) : []),
    [processedIndex, selectedFamily]
  );

  const isInRenameQueue = (filePath: string) => renameQueue.some((q) => q.filePath === filePath);
  const isInRemovalQueue = (filePath: string) => removalQueue.some((q) => q.filePath === filePath);
  const getQueuedNewName = (filePath: string) =>
    renameQueue.find((q) => q.filePath === filePath)?.newFileName ?? "";

  const handleSelectDuplicates = useCallback(() => {
    setSelectedFilePaths(new Set(duplicateFilePaths));
  }, [duplicateFilePaths]);

  const handleQueueRemoval = useCallback(() => {
    for (const path of selectedFilePaths) queueRemoval(path);
    setSelectedFilePaths(new Set());
  }, [selectedFilePaths, queueRemoval]);

  const toggleRowSelection = useCallback((filePath: string) => {
    setSelectedFilePaths((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  }, []);

  const handleFilenameBlur = useCallback(
    (filePath: string, currentFileName: string, ext: string, value: string) => {
      const stem = value.trim();
      const newName = stem + ext;
      if (!isValidFileName(newName) || newName === currentFileName) {
        if (renameQueue.some((q) => q.filePath === filePath)) cancelQueueItem(filePath);
        return;
      }
      queueRename(filePath, newName);
    },
    [queueRename, cancelQueueItem, renameQueue]
  );

  const handleSort = useCallback((col: SortColumnId) => {
    setSort((prev) => {
      if (prev.column !== col) return { column: col, direction: "asc" };
      if (prev.direction === "asc") return { column: col, direction: "desc" };
      return { column: "filename", direction: "asc" };
    });
  }, []);

  return (
    <div className={styles.wrapper}>
      <TableToolbar
        familyName={selectedFamily}
        unprocessedCount={itemsToShow.length}
        processedCount={processedCount}
        status={familyStatus}
        onSelectDuplicates={handleSelectDuplicates}
        onQueueRemoval={handleQueueRemoval}
        hasSelection={selectedFilePaths.size > 0}
        duplicateCount={duplicateFilePaths.size}
      />
      {itemsToShow.length === 0 ? (
        <div className={styles.empty}>
          {selectedFamily ? "No fonts in this family." : "No unprocessed fonts."}
        </div>
      ) : (
        <div className={styles.tableScroll}>
          <div className={styles.sectionHeader} role="presentation">
            <span className={styles.sectionLabel}>Unprocessed</span>
            <span className={styles.sectionCount}>{itemsToShow.length} files</span>
          </div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col" className={styles.colCheck}>
                  <span className={styles.colHeader}>Select</span>
                </th>
                <th
                  scope="col"
                  className={styles.colName}
                  aria-sort={
                    sort.column === "filename"
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <button
                    type="button"
                    className={styles.colSortBtn}
                    onClick={() => handleSort("filename")}
                  >
                    Filename
                  </button>
                </th>
                <th
                  scope="col"
                  className={styles.colVer}
                  aria-sort={
                    sort.column === "version"
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <button
                    type="button"
                    className={styles.colSortBtn}
                    onClick={() => handleSort("version")}
                  >
                    Version
                  </button>
                </th>
                <th
                  scope="col"
                  className={styles.colDate}
                  aria-sort={
                    sort.column === "date"
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <button
                    type="button"
                    className={styles.colSortBtn}
                    onClick={() => handleSort("date")}
                  >
                    Created
                  </button>
                </th>
                <th
                  scope="col"
                  className={styles.colGlyphs}
                  aria-sort={
                    sort.column === "glyphs"
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <button
                    type="button"
                    className={styles.colSortBtn}
                    onClick={() => handleSort("glyphs")}
                  >
                    Glyphs
                  </button>
                </th>
                <th
                  scope="col"
                  className={styles.colFeat}
                  aria-sort={
                    sort.column === "feat"
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <button
                    type="button"
                    className={styles.colSortBtn}
                    onClick={() => handleSort("feat")}
                  >
                    Feat.
                  </button>
                </th>
                <th
                  scope="col"
                  className={styles.colSize}
                  aria-sort={
                    sort.column === "size"
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <button
                    type="button"
                    className={styles.colSortBtn}
                    onClick={() => handleSort("size")}
                  >
                    Size
                  </button>
                </th>
                <th
                  scope="col"
                  className={styles.colType}
                  aria-sort={
                    sort.column === "type"
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <button
                    type="button"
                    className={styles.colSortBtn}
                    onClick={() => handleSort("type")}
                  >
                    Type
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item) => {
                const { font, filePath } = item;
                const result = matchResults.get(filePath);
                const fileName = font.fileName ?? filePath.split("/").pop() ?? filePath;
                const { stem: defaultStem, ext } = splitStemExt(fileName);
                const queuedName = getQueuedNewName(filePath);
                const displayStem = queuedName ? splitStemExt(queuedName).stem : defaultStem;
                const version = font.metadata?.version ?? "—";
                const glyphCount = font.glyphCount ?? font.misc?.glyphCount ?? 0;
                const featCount = (font.features ?? []).length;
                const sizeBytes = font.fileSize ?? (font.fileData?.byteLength ?? 0);
                const sizeStr = sizeBytes > 0 ? formatBytes(sizeBytes) : "—";
                const typeBadgeKey = TYPE_BADGE_CLASS[font.format] ?? "typeOtf";
                const typeLabel =
                  font.format === "woff2"
                    ? "WOFF2"
                    : font.format === "woff"
                      ? "WOFF"
                      : font.format.toUpperCase();
                const isSelected = selectedFontFilePath === filePath;
                const inRename = isInRenameQueue(filePath);
                const inRemoval = isInRemovalQueue(filePath);
                const isDuplicateRow = isDuplicate(filePath, matchResults);
                const isChecked = selectedFilePaths.has(filePath);
                const matchedRecord = result?.matchedRecord;
                const glyphHighlight = matchedRecord && glyphCount !== matchedRecord.glyphCount;

                const rowClasses = [
                  isSelected ? styles.rowSelected : null,
                  isDuplicateRow ? styles.rowDuplicate : null,
                  inRemoval ? styles.rowQueuedRemove : null,
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <tr
                    key={filePath}
                    className={rowClasses || undefined}
                    data-duplicate={isDuplicateRow ? "true" : undefined}
                    onClick={() => selectFont(isSelected ? null : filePath)}
                  >
                    <td
                      className={styles.cellCheck}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleRowSelection(filePath)}
                        aria-label={`Select ${fileName}`}
                      />
                    </td>
                    <td
                      className={styles.cellName}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <div className={styles.cellNameWrap}>
                        <input
                          type="text"
                          className={`${styles.fnameStem} ${inRename && queuedName !== fileName ? styles.modified : ""}`}
                          value={displayStem}
                          placeholder="Edit filename"
                          onChange={(e) => queueRename(filePath, e.target.value + ext)}
                          onBlur={(e) =>
                            handleFilenameBlur(filePath, fileName, ext, e.target.value)
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                          aria-label={`Filename for ${fileName}`}
                        />
                        {ext ? <span className={styles.fnameExt}>{ext}</span> : null}
                        {font._quickLoad && (
                          <span className={styles.loadingPip} aria-hidden title="Loading details…" />
                        )}
                        <span className={styles.cellNameActions}>
                          {inRemoval ? (
                            <button
                              type="button"
                              className={styles.inlineRemove}
                              onClick={(e) => {
                                e.stopPropagation();
                                cancelQueueItem(filePath);
                              }}
                            >
                              Cancel remove
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={styles.inlineRemove}
                              onClick={(e) => {
                                e.stopPropagation();
                                queueRemoval(filePath);
                              }}
                            >
                              Remove
                            </button>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className={styles.cellVer}>
                      <span className={styles.cv}>{version}</span>
                    </td>
                    <td className={styles.cellDate}>
                      <span className={styles.cv}>—</span>
                    </td>
                    <td className={styles.cellGlyphs}>
                      <span className={glyphHighlight ? `${styles.cv} ${styles.cvPos}` : styles.cv}>
                        {glyphCount || "—"}
                      </span>
                    </td>
                    <td className={styles.cellFeat}>
                      <span className={styles.cv}>{featCount}</span>
                    </td>
                    <td className={styles.cellSize}>
                      <span className={styles.cv}>{sizeStr}</span>
                    </td>
                    <td className={styles.cellType}>
                      <span className={`${styles.typeBadge} ${styles[typeBadgeKey]}`}>
                        {typeLabel}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {matchedProcessedRecords.length > 0 && (
              <>
                <tbody>
                  <tr>
                    <td className={styles.cellCheck} aria-hidden />
                    <td colSpan={7} className={styles.sectionHeaderRow}>
                      <span className={styles.sectionLabel}>Processed — Matched Collection</span>
                      <span className={styles.sectionBadge}>
                        {matchedProcessedRecords.length} files
                      </span>
                      {itemsToShow.length === matchedProcessedRecords.length ? (
                        <span className={styles.sectionMatch}>✓ Count matches</span>
                      ) : (
                        <span className={styles.countMismatch}>⚠ Count differs</span>
                      )}
                    </td>
                  </tr>
                </tbody>
                <tbody className={styles.processedSection}>
                  {matchedProcessedRecords.map((record) => (
                    <tr key={record.filePath} className={styles.rowProcessed}>
                      <td className={styles.cellCheck} aria-hidden />
                      <td className={`${styles.cellName} ${styles.cellNameInline}`}>
                        <span className={styles.fnameStem}>
                          {splitStemExt(record.fileName).stem}
                        </span>
                        <span className={styles.fnameExt}>{splitStemExt(record.fileName).ext}</span>
                      </td>
                      <td className={styles.cellVer}>
                        <span className={styles.cv}>{record.version || "—"}</span>
                      </td>
                      <td className={styles.cellDate}>
                        <span className={styles.cv}>—</span>
                      </td>
                      <td className={styles.cellGlyphs}>
                        <span className={styles.cv}>{record.glyphCount}</span>
                      </td>
                      <td className={styles.cellFeat}>
                        <span className={styles.cv}>—</span>
                      </td>
                      <td className={styles.cellSize}>
                        <span className={styles.cv}>—</span>
                      </td>
                      <td className={styles.cellType}>
                        <span
                          className={`${styles.typeBadge} ${styles[TYPE_BADGE_CLASS[record.format] ?? "typeOtf"]}`}
                        >
                          {record.format.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

export default FileTable;
