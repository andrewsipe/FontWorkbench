import { useEffect, useMemo, useRef, useState } from "react";
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
  PROBLEM:  styles.dotProblem,
  REVIEW:   styles.dotReview,
  UPGRADE:  styles.dotUpgrade,
  NEW:      styles.dotNew,
  SKIP:     styles.dotSkip,
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

type SortBy = "alpha-asc" | "alpha-desc" | "count-asc" | "count-desc" | "status";
type FilterStatus = "all" | SuggestedAction;

function getFilteredCount(
  items: UnprocessedItem[],
  matchResults: Map<string, { action: SuggestedAction }>,
  filter: FilterStatus
): number {
  if (filter === "all") return items.length;
  return items.filter((i) => matchResults.get(i.filePath)?.action === filter).length;
}

const STATUS_OPTIONS: { value: FilterStatus; label: string; dot: string }[] = [
  { value: "all",      label: "All",      dot: styles.dotAll      },
  { value: "CONFLICT", label: "Conflict", dot: styles.dotConflict },
  { value: "REVIEW",   label: "Review",   dot: styles.dotReview   },
  { value: "UPGRADE",  label: "Upgrade",  dot: styles.dotUpgrade  },
  { value: "NEW",      label: "New",      dot: styles.dotNew      },
  { value: "SKIP",     label: "Skip",     dot: styles.dotSkip     },
  { value: "PROBLEM",  label: "Problem",  dot: styles.dotProblem  },
];

const SORT_OPTIONS: { value: SortBy; label: string; icon: string }[] = [
  { value: "alpha-asc",  label: "Alpha",  icon: "🡇" },
  { value: "alpha-desc", label: "Alpha",  icon: "🡅" },
  { value: "count-desc", label: "Count",  icon: "🡇" },
  { value: "count-asc",  label: "Count",  icon: "🡅" },
  { value: "status",     label: "Status", icon: "⦿" },
];

function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  return { open, setOpen, ref };
}

function FamilySidebar() {
  const { familyGroups, selectedFamily, selectFamily, matchResults } = useWorkbenchStore();
  const [searchQuery, setSearchQuery]   = useState("");
  const [sortBy, setSortBy]             = useState<SortBy>("alpha-asc");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  const statusDropdown = useDropdown();
  const sortDropdown   = useDropdown();

  const familyStatuses = useMemo(() => {
    const map = new Map<string, SuggestedAction>();
    for (const [family, items] of familyGroups) {
      map.set(family, getFamilyStatus(items, matchResults));
    }
    return map;
  }, [familyGroups, matchResults]);

  const sortedFamilies = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = Array.from(familyGroups.keys());
    if (q) list = list.filter((n) => n.toLowerCase().includes(q));
    if (filterStatus !== "all")
      list = list.filter((n) => familyStatuses.get(n) === filterStatus);

    list.sort((a, b) => {
      if (sortBy === "alpha-asc")  return a.localeCompare(b, undefined, { sensitivity: "base" });
      if (sortBy === "alpha-desc") return b.localeCompare(a, undefined, { sensitivity: "base" });
      if (sortBy === "count-desc") return (familyGroups.get(b)?.length ?? 0) - (familyGroups.get(a)?.length ?? 0);
      if (sortBy === "count-asc")  return (familyGroups.get(a)?.length ?? 0) - (familyGroups.get(b)?.length ?? 0);
      // status
      const sa = ACTION_SEVERITY[familyStatuses.get(a) ?? "SKIP"];
      const sb = ACTION_SEVERITY[familyStatuses.get(b) ?? "SKIP"];
      return sa !== sb ? sa - sb : a.localeCompare(b, undefined, { sensitivity: "base" });
    });

    return list;
  }, [searchQuery, filterStatus, sortBy, familyGroups, familyStatuses]);

  const isEmpty       = familyGroups.size === 0;
  const activeStatus  = STATUS_OPTIONS.find((o) => o.value === filterStatus)!;
  const activeSort    = SORT_OPTIONS.find((o) => o.value === sortBy)!;

  return (
    <div className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <div className={styles.sidebarTitle}>Families</div>

        <div className={styles.toolRow}>
          {/* ── Status filter dropdown ── */}
          <div className={styles.dropdownWrap} ref={statusDropdown.ref}>
            <button
              type="button"
              className={styles.dropdownTrigger}
              onClick={() => statusDropdown.setOpen((o) => !o)}
              disabled={isEmpty}
              aria-haspopup="listbox"
              aria-expanded={statusDropdown.open}
              aria-label="Filter by status"
            >
              <span className={`${styles.dropdownTriggerDot} ${activeStatus.dot}`} aria-hidden />
              <span className={styles.dropdownTriggerLabel}>{activeStatus.label}</span>
              <span className={styles.dropdownChevron} aria-hidden>▾</span>
            </button>
            {statusDropdown.open && (
              <div className={styles.dropdownMenu} role="listbox">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={filterStatus === opt.value}
                    className={[
                      styles.dropdownOption,
                      filterStatus === opt.value ? styles.dropdownOptionActive : "",
                    ].filter(Boolean).join(" ")}
                    onClick={() => { setFilterStatus(opt.value); statusDropdown.setOpen(false); }}
                  >
                    <span className={`${styles.dropdownOptionDot} ${opt.dot}`} aria-hidden />
                    {opt.label}
                    <span className={styles.dropdownOptionCheck} aria-hidden>✓</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Sort dropdown ── */}
          <div className={styles.dropdownWrap} ref={sortDropdown.ref}>
            <button
              type="button"
              className={styles.dropdownTrigger}
              onClick={() => sortDropdown.setOpen((o) => !o)}
              disabled={isEmpty}
              aria-haspopup="listbox"
              aria-expanded={sortDropdown.open}
              aria-label="Sort families"
            >
              <span className={styles.dropdownTriggerLabel}>{activeSort.label}</span>
              <span className={styles.dropdownTriggerIcon} aria-hidden>{activeSort.icon}</span>
              <span className={styles.dropdownChevron} aria-hidden>▾</span>
            </button>
            {sortDropdown.open && (
              <div className={styles.dropdownMenu} role="listbox">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={sortBy === opt.value}
                    className={[
                      styles.dropdownOption,
                      sortBy === opt.value ? styles.dropdownOptionActive : "",
                    ].filter(Boolean).join(" ")}
                    onClick={() => { setSortBy(opt.value); sortDropdown.setOpen(false); }}
                  >
                    <span className={styles.dropdownTriggerIcon} aria-hidden>{opt.icon}</span>
                    {opt.label}
                    <span className={styles.dropdownOptionCheck} aria-hidden>✓</span>
                  </button>
                ))}
              </div>
            )}
          </div>
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
            const items  = familyGroups.get(family) ?? [];
            const action = familyStatuses.get(family) ?? "SKIP";
            const isSelected = selectedFamily === family;
            const isDim = filterStatus === "all" && action === "SKIP";
            const count = filterStatus === "all"
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
                    isDim      ? styles.familyItemDim    : "",
                  ].filter(Boolean).join(" ")}
                  aria-pressed={isSelected}
                >
                  <span className={`${styles.fiFlag} ${DOT_CLASS[action]}`} aria-hidden />
                  <span className={styles.fiName}>{family}</span>
                  <span className={styles.fiCount} aria-hidden>{count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {isEmpty && (
        <div className={styles.empty}><p>No families</p></div>
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