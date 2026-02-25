/**
 * Lists font families from unprocessed scan with search and status dots.
 * Selection filters the file table.
 */

import { useMemo, useState } from "react";
import type { SuggestedAction } from "../../lib/matcher";
import type { UnprocessedItem } from "../../stores/workbenchStore";
import { useWorkbenchStore } from "../../stores/workbenchStore";
import styles from "./FamilySidebar.module.css";

export type FamilyStatus = "conflict" | "needs-review" | "new" | "clean";

export function getFamilyStatus(
  items: UnprocessedItem[],
  matchResults: Map<string, { action: SuggestedAction }>
): FamilyStatus {
  const actions = items
    .map((i) => matchResults.get(i.filePath)?.action)
    .filter(Boolean) as SuggestedAction[];
  if (actions.some((a) => a === "CONFLICT")) return "conflict";
  if (actions.some((a) => a === "REVIEW" || a === "UPGRADE" || a === "PROBLEM"))
    return "needs-review";
  if (actions.some((a) => a === "NEW")) return "new";
  return "clean";
}

function FamilySidebar() {
  const { familyGroups, selectedFamily, selectFamily, matchResults } = useWorkbenchStore();
  const [searchQuery, setSearchQuery] = useState("");

  const families = useMemo(
    () =>
      Array.from(familyGroups.keys()).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
      ),
    [familyGroups]
  );

  const filteredFamilies = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return families;
    return families.filter((name) => name.toLowerCase().includes(q));
  }, [families, searchQuery]);

  if (families.length === 0) {
    return (
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarTitle}>Families</div>
          <input
            type="search"
            className={styles.sidebarSearch}
            placeholder="Search families…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search families"
            disabled
          />
        </div>
        <div className={styles.empty}>
          <p>No families</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <div className={styles.sidebarTitle}>Families</div>
        <input
          type="search"
          className={styles.sidebarSearch}
          placeholder="Search families…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search families"
        />
      </div>
      <nav className={styles.familyList} aria-label="Font families">
        <ul className={styles.list}>
          {filteredFamilies.map((family) => {
            const items = familyGroups.get(family) ?? [];
            const count = items.length;
            const status = getFamilyStatus(items, matchResults);
            const isSelected = selectedFamily === family;
            return (
              <li key={family}>
                <button
                  type="button"
                  onClick={() => selectFamily(isSelected ? null : family)}
                  className={`${styles.familyItem} ${isSelected ? styles.familyItemActive : ""}`}
                  aria-pressed={isSelected}
                >
                  <span className={`${styles.fiFlag} ${styles[`fiFlag_${status}`]}`} aria-hidden />
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
      {filteredFamilies.length === 0 && (
        <div className={styles.empty}>
          <p>No families match &quot;{searchQuery}&quot;</p>
        </div>
      )}
    </div>
  );
}

export default FamilySidebar;
