/**
 * Lists font families from unprocessed scan with search, sort, and status filter.
 * Selection filters the file table.
 */

import { useMemo, useState } from "react";
import type { SuggestedAction } from "../../lib/matcher";
import type { UnprocessedItem } from "../../stores/workbenchStore";
import { useWorkbenchStore } from "../../stores/workbenchStore";
import styles from "./FamilySidebar.module.css";

const ACTION_SEVERITY: Record<SuggestedAction, number> = {
  CONFLICT: 0,
  PROBLEM: 1,
  REVIEW: 2,
  UPGRADE: 3,
  NEW: 4,
  SKIP: 5,
};

const DOT_CLASS: Record<SuggestedAction, string> = {
  CONFLICT: styles.dotConflict,
  PROBLEM: styles.dotProblem,
  REVIEW: styles.dotReview,
  UPGRADE: styles.dotUpgrade,
  NEW: styles.dotNew,
  SKIP: styles.dotSkip,
};

export function getFamilyStatus(
  items: UnprocessedItem[],
  matchResults: Map<string, { action: SuggestedAction }>
): SuggestedAction {
  let worst: SuggestedAction = "SKIP";
  let worstSeverity = ACTION_SEVERITY.SKIP;
  for (const item of items) {
    const action = matchResults.get(item.filePath)?.action;
    if (!action) continue;
    const severity = ACTION_SEVERITY[action] ?? 999;
    if (severity < worstSeverity) {
      worst = action;
      worstSeverity = severity;
    }
  }
  return worst;
}

type SortBy = "alpha" | "count" | "status";
type FilterStatus = "all" | SuggestedAction;

function getFilteredCount(
  items: UnprocessedItem[],
  matchResults: Map<string, { action: SuggestedAction }>,
  filter: FilterStatus
): number {
  if (filter === "all") return items.length;
  return items.filter((item) => matchResults.get(item.filePath)?.action === filter).length;
}

function FamilySidebar() {
  const { familyGroups, selectedFamily, selectFamily, matchResults } = useWorkbenchStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("alpha");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  const familyStatuses = useMemo(() => {
    const map = new Map<string, SuggestedAction>();
    for (const [family, items] of familyGroups) {
      map.set(family, getFamilyStatus(items, matchResults));
    }
    return map;
  }, [familyGroups, matchResults]);

  const searchFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const all = Array.from(familyGroups.keys());
    return q ? all.filter((name) => name.toLowerCase().includes(q)) : all;
  }, [familyGroups, searchQuery]);

  const statusFiltered = useMemo(() => {
    if (filterStatus === "all") return searchFiltered;
    return searchFiltered.filter((name) => familyStatuses.get(name) === filterStatus);
  }, [searchFiltered, filterStatus, familyStatuses]);

  const sortedFamilies = useMemo(() => {
    const list = [...statusFiltered];
    if (sortBy === "alpha") {
      list.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    } else if (sortBy === "count") {
      list.sort((a, b) => (familyGroups.get(b)?.length ?? 0) - (familyGroups.get(a)?.length ?? 0));
    } else {
      list.sort((a, b) => {
        const sa = ACTION_SEVERITY[familyStatuses.get(a) ?? "SKIP"];
        const sb = ACTION_SEVERITY[familyStatuses.get(b) ?? "SKIP"];
        return sa !== sb ? sa - sb : a.localeCompare(b, undefined, { sensitivity: "base" });
      });
    }
    return list;
  }, [statusFiltered, sortBy, familyGroups, familyStatuses]);

  const isEmpty = familyGroups.size === 0;

  return (
    <div className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <div className={styles.sidebarTitle}>Families</div>
        <div className={styles.toolRow}>
          <select
            className={styles.sortSelect}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
            disabled={isEmpty}
            aria-label="Filter by status"
          >
            <option value="all">All</option>
            <option value="CONFLICT">Conflict</option>
            <option value="REVIEW">Review</option>
            <option value="UPGRADE">Upgrade</option>
            <option value="NEW">New</option>
            <option value="SKIP">Skip</option>
            <option value="PROBLEM">Problem</option>
          </select>
          <select
            className={styles.sortSelect}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            disabled={isEmpty}
            aria-label="Sort families"
          >
            <option value="alpha">Alpha</option>
            <option value="count">Count ↓</option>
            <option value="status">Status</option>
          </select>
        </div>
        <input
          type="search"
          className={styles.sidebarSearch}
          placeholder="Search families…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search families"
          disabled={isEmpty}
        />
      </div>
      <nav className={styles.familyList} aria-label="Font families">
        <ul className={styles.list}>
          {sortedFamilies.map((family) => {
            const items = familyGroups.get(family) ?? [];
            const action = familyStatuses.get(family) ?? "SKIP";
            const isSelected = selectedFamily === family;
            const isDim = filterStatus === "all" && action === "SKIP";
            const count =
              filterStatus === "all"
                ? items.length
                : getFilteredCount(items, matchResults, filterStatus);
            return (
              <li key={family}>
                <button
                  type="button"
                  onClick={() => selectFamily(isSelected ? null : family)}
                  className={[
                    styles.familyItem,
                    isSelected ? styles.familyItemActive : "",
                    isDim ? styles.familyItemDim : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-pressed={isSelected}
                >
                  <span className={`${styles.fiFlag} ${DOT_CLASS[action]}`} aria-hidden />
                  <span className={styles.fiName}>{family}</span>
                  <span className={styles.fiCount} aria-hidden>
                    {count}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      {isEmpty && (
        <div className={styles.empty}>
          <p>No families</p>
        </div>
      )}
      {!isEmpty && sortedFamilies.length === 0 && (
        <div className={styles.empty}>
          <p>
            {searchQuery
              ? `No families match "${searchQuery}"`
              : "No families match this filter"}
          </p>
        </div>
      )}
    </div>
  );
}

export default FamilySidebar;
