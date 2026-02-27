/**
 * Toolbar above the file table: family name, counts, status line, Select Duplicates / Queue Removal.
 */

import type { SuggestedAction } from "../../lib/matcher";
import styles from "./TableToolbar.module.css";

const STATUS_CONFIG: Record<SuggestedAction, { label: string; className: string }> = {
  CONFLICT: { label: "⊛ Name conflicts detected", className: styles.statusConflict },
  PROBLEM:  { label: "✕ Problem detected", className: styles.statusProblem },
  REVIEW:   { label: "⚠ Review recommended", className: styles.statusReview },
  UPGRADE:  { label: "↑ Upgrade available", className: styles.statusUpgrade },
  NEW:      { label: "✦ Not in processed collection", className: styles.statusNew },
  SKIP:     { label: "✓ Safe to skip", className: styles.statusSkip },
};

export interface TableToolbarProps {
  familyName: string | null;
  unprocessedCount: number;
  processedCount: number;
  status: SuggestedAction;
  onSelectDuplicates: () => void;
  onQueueRemoval: () => void;
  hasSelection: boolean;
  duplicateCount: number;
}

function TableToolbar({
  familyName,
  unprocessedCount,
  processedCount,
  status,
  onSelectDuplicates,
  onQueueRemoval,
  hasSelection,
  duplicateCount,
}: TableToolbarProps) {
  const { label, className } = STATUS_CONFIG[status];

  return (
    <div className={styles.toolbar}>
      <span className={styles.familyName}>{familyName ?? "All families"}</span>
      <div className={styles.meta}>
        <span>
          Unprocessed <strong>{unprocessedCount.toLocaleString()}</strong>
        </span>
        <span>
          Processed <strong>{processedCount.toLocaleString()}</strong>
        </span>
        <span className={className}>{label}</span>
      </div>
      <div className={styles.right}>
        <button
          type="button"
          onClick={onSelectDuplicates}
          disabled={duplicateCount === 0}
          className={styles.selBtn}
          title="Select rows with duplicate/counter fonts (~001 etc.)"
        >
          Select Duplicates
        </button>
        <button
          type="button"
          onClick={onQueueRemoval}
          disabled={!hasSelection}
          className={styles.selBtnDanger}
          title="Queue selected rows for removal"
        >
          Queue Removal
        </button>
      </div>
    </div>
  );
}

export default TableToolbar;
