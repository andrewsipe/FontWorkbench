/**
 * Setup view: pick processed and unprocessed directories, build/rebuild index, open workbench.
 */

import { useCallback, useState } from "react";
import { useWorkbenchStore } from "../../stores/workbenchStore";
import styles from "./SetupView.module.css";

const hasPicker = typeof window !== "undefined" && "showDirectoryPicker" in window;

function SetupView() {
  const {
    processedDirHandle,
    unprocessedDirHandle,
    processedIndex,
    indexLoaded,
    appConfig,
    indexProgress,
    processedHandleNeedsReauth,
    setProcessedDir,
    setUnprocessedDir,
    loadProcessedIndex,
    rebuildIndex,
    setAppView,
    scanUnprocessed,
    scanProgress,
  } = useWorkbenchStore();

  const [status, setStatus] = useState<string>("");
  const [scanStatus, setScanStatus] = useState<string>("");
  const [processedDragOver, setProcessedDragOver] = useState(false);
  const [unprocessedDragOver, setUnprocessedDragOver] = useState(false);

  const processedName = processedDirHandle?.name ?? appConfig?.processedDirName ?? "—";
  const unprocessedName = unprocessedDirHandle?.name ?? "—";
  const lastIndexed = appConfig?.lastIndexed
    ? new Date(appConfig.lastIndexed).toLocaleString()
    : "—";

  const handleDrop = useCallback(
    async (e: React.DragEvent, target: "processed" | "unprocessed") => {
      e.preventDefault();
      if (target === "processed") setProcessedDragOver(false);
      else setUnprocessedDragOver(false);
      const items = Array.from(e.dataTransfer.items);
      for (const item of items) {
        const handle = await item.getAsFileSystemHandle?.();
        if (handle?.kind === "directory") {
          if (target === "processed") {
            await setProcessedDir(handle as FileSystemDirectoryHandle);
          } else {
            setUnprocessedDir(handle as FileSystemDirectoryHandle);
          }
        }
      }
    },
    [setProcessedDir, setUnprocessedDir]
  );

  const handlePickProcessed = useCallback(async () => {
    if (!hasPicker) {
      setStatus("File System Access API not supported.");
      return;
    }
    const picker = (
      window as Window & {
        showDirectoryPicker?: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
      }
    ).showDirectoryPicker;
    if (!picker) return;
    try {
      setStatus("Opening directory picker…");
      const handle = await picker({ mode: "read" });
      await setProcessedDir(handle);
      setStatus(
        `Processed directory: ${handle.name}. Index: ${useWorkbenchStore.getState().processedIndex.length} records.`
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }, [setProcessedDir]);

  const handleBuildIndex = useCallback(async () => {
    if (!processedDirHandle) {
      setStatus("Pick a processed directory first.");
      return;
    }
    try {
      setStatus("Building index…");
      await rebuildIndex((p) => {
        setStatus(`Indexing… ${p.scanned}/${p.total}${p.currentFile ? ` — ${p.currentFile}` : ""}`);
      });
      await loadProcessedIndex();
      setStatus(`Index built: ${useWorkbenchStore.getState().processedIndex.length} records.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }, [processedDirHandle, rebuildIndex, loadProcessedIndex]);

  const handlePickUnprocessed = useCallback(async () => {
    if (!hasPicker) {
      setStatus("File System Access API not supported.");
      return;
    }
    const picker = (
      window as Window & {
        showDirectoryPicker?: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
      }
    ).showDirectoryPicker;
    if (!picker) return;
    try {
      setStatus("Opening directory picker…");
      const handle = await picker({ mode: "read" });
      setUnprocessedDir(handle);
      setStatus(`Unprocessed directory: ${handle.name}.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }, [setUnprocessedDir]);

  const handleOpenWorkbench = useCallback(async () => {
    if (!unprocessedDirHandle) {
      setStatus("Pick an unprocessed directory first.");
      return;
    }
    setStatus("");
    setScanStatus("Scanning unprocessed fonts…");
    try {
      await scanUnprocessed((p) => {
        setScanStatus(
          p.total > 0
            ? `Scanning… ${p.scanned}/${p.total}${p.currentFile ? ` — ${p.currentFile}` : ""}`
            : "Scanning…"
        );
      });
      setAppView("workbench");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setScanStatus("");
    }
  }, [unprocessedDirHandle, setAppView, scanUnprocessed]);

  const indexing = indexProgress !== null;
  const scanning = scanProgress !== null;

  const processedIndexStatus =
    indexLoaded && processedIndex.length > 0 && appConfig
      ? `${processedName} · ${processedIndex.length} records · Last built ${lastIndexed}`
      : null;

  return (
    <div className={styles.setup}>
      <div className={styles.card}>
        <h1 className={styles.title}>Font Workbench</h1>
        <p className={styles.subtitle}>Setup</p>

        {processedHandleNeedsReauth && (
          <p className={styles.reauthBanner} role="status">
            Re-authorize processed collection to skip rescanning.
          </p>
        )}

        <section className={styles.section} aria-labelledby="processed-heading">
          <h2 id="processed-heading" className={styles.sectionTitle}>
            Processed collection
          </h2>
          {processedIndexStatus ? (
            <p className={styles.indexStatus}>
              {processedIndexStatus}
              {" · "}
              <button
                type="button"
                className={styles.linkButton}
                onClick={handleBuildIndex}
                disabled={!processedDirHandle || indexing}
              >
                Rebuild index
              </button>
            </p>
          ) : (
            <p className={styles.indexStatus}>No index built yet. Pick a directory to scan.</p>
          )}
          <div
            role="button"
            tabIndex={0}
            className={`${styles.dropZone} ${processedDirHandle ? styles.hasDir : ""} ${processedDragOver ? styles.dragOver : ""}`}
            onClick={handlePickProcessed}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handlePickProcessed();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setProcessedDragOver(true);
            }}
            onDragLeave={() => setProcessedDragOver(false)}
            onDrop={(e) => handleDrop(e, "processed")}
            aria-label="Choose processed directory"
          >
            {processedName !== "—" ? processedName : "Drop folder here or click to choose"}
          </div>
        </section>

        <section className={styles.section} aria-labelledby="unprocessed-heading">
          <h2 id="unprocessed-heading" className={styles.sectionTitle}>
            Unprocessed directory
          </h2>
          <div
            role="button"
            tabIndex={0}
            className={`${styles.dropZone} ${unprocessedDirHandle ? styles.hasDir : ""} ${unprocessedDragOver ? styles.dragOver : ""}`}
            onClick={handlePickUnprocessed}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handlePickUnprocessed();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setUnprocessedDragOver(true);
            }}
            onDragLeave={() => setUnprocessedDragOver(false)}
            onDrop={(e) => handleDrop(e, "unprocessed")}
            aria-label="Choose unprocessed directory"
          >
            {unprocessedName !== "—" ? unprocessedName : "Drop folder here or click to choose"}
          </div>
        </section>

        <div className={styles.actions}>
          <button
            type="button"
            onClick={handleOpenWorkbench}
            disabled={!unprocessedDirHandle || scanning}
            className={styles.btnPrimary}
          >
            Open Workbench
          </button>
        </div>

        {status ? (
          <p className={styles.status} style={{ whiteSpace: "pre-line" }}>
            {status}
          </p>
        ) : null}
        {scanStatus ? <p className={styles.status}>{scanStatus}</p> : null}
      </div>
    </div>
  );
}

export default SetupView;
