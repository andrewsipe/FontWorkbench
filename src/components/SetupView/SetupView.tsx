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

  const processedName = processedDirHandle?.name ?? appConfig?.processedDirName ?? "—";
  const unprocessedName = unprocessedDirHandle?.name ?? "—";
  const lastIndexed = appConfig?.lastIndexed
    ? new Date(appConfig.lastIndexed).toLocaleString()
    : "—";

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

  return (
    <div className={styles.setup}>
      <h1 className={styles.title}>Font Workbench</h1>
      <p className={styles.subtitle}>Setup</p>

      <section className={styles.section} aria-labelledby="processed-heading">
        <h2 id="processed-heading" className={styles.sectionTitle}>
          Processed collection
        </h2>
        <p className={styles.meta}>
          Directory: <strong>{processedName}</strong>
          {indexLoaded && (
            <>
              {" "}
              · Index: <strong>{processedIndex.length}</strong> records
              {lastIndexed !== "—" && ` · Last built ${lastIndexed}`}
            </>
          )}
        </p>
        <div className={styles.actions}>
          <button type="button" onClick={handlePickProcessed} disabled={indexing}>
            {processedDirHandle ? "Change processed directory" : "Pick processed directory"}
          </button>
          <button
            type="button"
            onClick={handleBuildIndex}
            disabled={!processedDirHandle || indexing}
          >
            {indexLoaded ? "Rebuild index" : "Build index"}
          </button>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="unprocessed-heading">
        <h2 id="unprocessed-heading" className={styles.sectionTitle}>
          Unprocessed directory
        </h2>
        <p className={styles.meta}>
          Directory: <strong>{unprocessedName}</strong>
        </p>
        <div className={styles.actions}>
          <button type="button" onClick={handlePickUnprocessed} disabled={scanning}>
            {unprocessedDirHandle ? "Change unprocessed directory" : "Pick unprocessed directory"}
          </button>
        </div>
      </section>

      <div className={styles.actions}>
        <button
          type="button"
          onClick={handleOpenWorkbench}
          disabled={!unprocessedDirHandle || scanning}
          className={styles.primary}
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
  );
}

export default SetupView;
