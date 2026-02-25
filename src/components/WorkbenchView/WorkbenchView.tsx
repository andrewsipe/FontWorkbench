/**
 * Workbench view: Prototype-aligned titlebar, family sidebar, file table, detail panel, status bar.
 */

import { useState } from "react";
import { useWorkbenchStore } from "../../stores/workbenchStore";
import ApplyBar from "./ApplyBar";
import DetailPanel from "./DetailPanel";
import FamilySidebar from "./FamilySidebar";
import FileTable from "./FileTable";
import "../../styles/workbench-theme.css";
import styles from "./WorkbenchView.module.css";

function WorkbenchView() {
  const {
    appView,
    setAppView,
    unprocessedItems,
    processedIndex,
    familyGroups,
    unprocessedDirHandle,
    processedDirHandle,
    renameQueue,
    removalQueue,
    applyAll,
    clearQueues,
    scanUnprocessed,
    scanProgress,
    rebuildIndex,
    indexProgress,
  } = useWorkbenchStore();

  const [applyResult, setApplyResult] = useState<{
    renames: number;
    removals: number;
    error?: string;
  } | null>(null);

  if (appView !== "workbench") return null;

  const hasContent = unprocessedItems.length > 0;
  const isScanning = scanProgress !== null;
  const isIndexing = indexProgress !== null;
  const isBusy = isScanning || isIndexing;
  const queueTotal = renameQueue.length + removalQueue.length;
  const hasQueue = queueTotal > 0;

  const handleRescan = async () => {
    if (!unprocessedDirHandle || isBusy) return;
    await scanUnprocessed();
  };

  const handleRebuildIndex = async () => {
    if (!processedDirHandle || isBusy) return;
    await rebuildIndex();
  };

  const handleApply = async () => {
    if (!hasQueue) return;
    setApplyResult(null);
    const result = await applyAll();
    setApplyResult(result);
  };

  const handleClearQueue = () => {
    clearQueues();
    setApplyResult(null);
  };

  return (
    <div className={`theme-workbench ${styles.workbench}`} data-workbench-root>
      <header className={styles.titlebar}>
        <div className={styles.logo}>
          <div className={styles.logoIcon} aria-hidden>
            W
          </div>
          <span className={styles.logoText}>FONT WORKBENCH</span>
        </div>
        <div className={styles.tbDivider} aria-hidden />
        <div className={styles.tbStats}>
          <span className={styles.tbStat}>
            Unprocessed <strong>{unprocessedItems.length.toLocaleString()}</strong>
          </span>
          <span className={styles.tbStat}>
            Processed <strong>{processedIndex.length.toLocaleString()}</strong>
          </span>
          <span className={styles.tbStat}>
            Families <strong>{familyGroups.size.toLocaleString()}</strong>
          </span>
        </div>
        <div className={styles.tbRight}>
          {scanProgress && (
            <span className={styles.tbProgress} aria-live="polite">
              {scanProgress.total > 0
                ? `Scanning… ${scanProgress.scanned}/${scanProgress.total}`
                : "Scanning…"}
            </span>
          )}
          {indexProgress && !scanProgress && (
            <span className={styles.tbProgress} aria-live="polite">
              {indexProgress.total > 0
                ? `Indexing… ${indexProgress.scanned}/${indexProgress.total}`
                : "Indexing…"}
            </span>
          )}
          <button
            type="button"
            onClick={handleRescan}
            disabled={!unprocessedDirHandle || isBusy}
            className={styles.btnGhost}
            aria-label="Rescan unprocessed directory"
            title={
              !unprocessedDirHandle
                ? "Pick unprocessed directory in Setup first"
                : "Rescan unprocessed directory"
            }
          >
            ↺ Rescan
          </button>
          <button
            type="button"
            onClick={handleRebuildIndex}
            disabled={!processedDirHandle || isBusy}
            className={styles.btnGhost}
            aria-label="Rebuild processed index"
            title={
              !processedDirHandle
                ? "Pick processed directory in Setup first"
                : "Rebuild processed collection index"
            }
          >
            Rebuild index
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!hasQueue || isBusy}
            className={hasQueue ? styles.btnApply : styles.btnApplyIdle}
            aria-label={hasQueue ? `Apply ${queueTotal} queued change(s)` : "No queued changes"}
          >
            Apply All Changes
            {hasQueue && <span className={styles.applyBadge}>{queueTotal}</span>}
          </button>
          <button
            type="button"
            onClick={handleClearQueue}
            disabled={!hasQueue}
            className={styles.btnGhost}
            aria-label="Clear queue"
          >
            Clear queue
          </button>
          <button
            type="button"
            onClick={() => setAppView("setup")}
            className={styles.btnGhost}
            aria-label="Back to Setup"
          >
            Setup
          </button>
        </div>
      </header>

      {!hasContent ? (
        <>
          <div className={styles.empty}>
            <p>
              No unprocessed fonts loaded. Go to Setup and pick an unprocessed directory, then Open
              Workbench.
            </p>
          </div>
          <ApplyBar applyResult={null} renameCount={0} removalCount={0} />
        </>
      ) : (
        <>
          <div className={styles.main}>
            <aside className={styles.sidebar} aria-label="Families">
              <FamilySidebar />
            </aside>
            <div className={styles.content}>
              <div className={styles.tableArea}>
                <FileTable />
              </div>
              <DetailPanel />
            </div>
          </div>
          <ApplyBar
            applyResult={applyResult}
            renameCount={renameQueue.length}
            removalCount={removalQueue.length}
          />
        </>
      )}
    </div>
  );
}

export default WorkbenchView;
