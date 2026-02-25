/**
 * Status bar: apply result message and queue summary (Apply/Clear live in titlebar).
 */

import styles from "./ApplyBar.module.css";

interface ApplyBarProps {
  applyResult: { renames: number; removals: number; error?: string } | null;
  renameCount: number;
  removalCount: number;
}

function ApplyBar({ applyResult, renameCount, removalCount }: ApplyBarProps) {
  const hasQueue = renameCount + removalCount > 0;
  const message = applyResult
    ? applyResult.error
      ? applyResult.error
      : [
          applyResult.renames > 0 && `${applyResult.renames} renamed`,
          applyResult.removals > 0 && `${applyResult.removals} moved to _workbench_trash/`,
        ]
          .filter(Boolean)
          .join("; ") || "Done."
    : null;

  return (
    <footer className={styles.statusbar}>
      <div className={styles.sb}>
        <span
          className={styles.sbDot}
          style={{
            background: message && !applyResult?.error ? "var(--wb-green)" : "var(--wb-txt3)",
          }}
          aria-hidden
        />
        {message ?? "Ready"}
      </div>
      {hasQueue && !message && (
        <div className={styles.sb}>
          <span className={styles.sbDot} style={{ background: "var(--wb-amber)" }} aria-hidden />
          <strong>{renameCount + removalCount}</strong> pending
        </div>
      )}
      {removalCount > 0 && !message && (
        <div className={styles.sb}>
          <span className={styles.sbDot} style={{ background: "var(--wb-red)" }} aria-hidden />
          <strong>{removalCount}</strong> queued for removal
        </div>
      )}
    </footer>
  );
}

export default ApplyBar;
