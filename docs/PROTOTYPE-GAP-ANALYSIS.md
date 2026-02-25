# Font Workbench: Prototype vs Build — Gap Analysis

Comparison of `fontworkbench-prototype.html` (expectation) vs the current React build.

---

## 1. Visual & theme

| Prototype | Build |
|-----------|--------|
| Dark-only theme; hex palette (`--bg`, `--bg2`, `--border`, `--txt`, `--green`, `--amber`, `--blue`, `--red`, `--violet`) | OKLCH + `prefers-color-scheme` light/dark |
| Geist + Geist Mono (Google Fonts) | system-ui, `--font-mono` |
| 13px base; compact UI | Similar scale |
| Amber primary CTA (Apply); green accent; status colors (amber/blue/violet/red) | Accent from variables; no consistent status palette |

**Gap:** Different theme and typography. Prototype is a dark, IDE-like toolbar + panes layout.

---

## 2. Titlebar / header

| Prototype | Build |
|-----------|--------|
| 44px titlebar: logo (icon + "FONT WORKBENCH"), divider, **stats** (Unprocessed / Processed / Families), right: Rescan (ghost) + **Apply All Changes** (amber, with badge count) | Header: title, Rescan, Rebuild index, Setup. Apply is in a **footer** bar with summary text |
| Apply is the primary CTA in the titlebar | Apply lives in bottom ApplyBar |

**Gap:** Titlebar has no logo, no global stats, no Apply button. Apply is below the table instead of top-right.

---

## 3. Family sidebar

| Prototype | Build |
|-----------|--------|
| "Families" label + **search** (filter families) | No search |
| Each family: **status dot** (needs-review=amber, new=blue, clean=gray, conflict=violet) + name + count | Name + count only; no status indicator |
| 220px width; same as build | Same |

**Gap:** No family search; no per-family status dot (review/new/clean/conflict).

---

## 4. File table

| Prototype | Build |
|-----------|--------|
| **Toolbar above table**: family name, Unprocessed N / Processed N, status line ("⚠ Review recommended", "✓ Safe to skip", etc.), "Select Duplicates", "Queue Removal" | No toolbar above table |
| **Columns**: Checkbox, Filename (stem + .ext, inline editable), Version, Created, Glyphs, Feat., Size, Type | File (button), Family, Match, New name, Actions |
| **Sections**: Sticky "Unprocessed (N files)" then rows; sticky "Processed — Matched Collection (N files)" then **matched processed rows** (dimmed, read-only) | Only unprocessed rows; no processed rows in table |
| **Row states**: duplicate (amber tint), queued-remove (opacity + line-through); checkbox to select | Per-row Rename/Remove buttons; no checkboxes, no duplicate styling |
| Filename: inline input for stem, fixed `.ext` | Full filename in "New name" column when in rename queue |

**Gap:** No table toolbar; different columns (no Version/Date/Glyphs/Feat/Size/Type); no processed section; no checkboxes or "Select Duplicates" / "Queue Removal"; no duplicate or queued-remove row styling.

---

## 5. Detail panel

| Prototype | Build |
|-----------|--------|
| **Position**: Bottom of workspace, 280px height, **collapsible** (▾ Collapse / ▴ Expand) | Right side, fixed width ~280px |
| **Tabs**: Compare | Features | Glyphs; selected filename shown | Single view: Details + Match (level, action, matched file, deltas, flags) |
| **Compare tab**: Side-by-side "Unprocessed (Selected)" vs "Processed (Matched)" — Version, Created, Glyphs, Features, Size, Format; table chips (shared / only-here) | We show match level/action and matched filename; no side-by-side compare, no table chips |
| **Features tab**: Feature tags (shared / only in unprocessed) | Not present |
| **Glyphs tab**: Glyph grids for unprocessed vs processed | Not present |

**Gap:** Panel is right-side and single-view; no bottom panel, no collapse, no Compare/Features/Glyphs tabs, no side-by-side or feature/glyph data.

---

## 6. Status bar

| Prototype | Build |
|-----------|--------|
| Bottom strip: Ready, DB name, "N pending changes", "N queued for removal" | None |

**Gap:** No status bar.

---

## 7. Setup

| Prototype | Build |
|-----------|--------|
| No Setup view in the HTML; workbench-only | Separate Setup view (pick dirs, build index, Open Workbench) |

**Gap:** Prototype doesn’t show setup flow; we do. Keeping Setup is correct for real usage.

---

## Summary: what to align

1. **Theme & typography** — Adopt prototype’s dark palette and Geist/Geist Mono (or mirror with CSS variables) so the app looks like the prototype.
2. **Titlebar** — Logo, global stats (Unprocessed / Processed / Families), Rescan, **Apply in titlebar** with badge.
3. **Sidebar** — Family search; status dot per family (derived from worst action: REVIEW→amber, NEW→blue, CONFLICT→violet, SKIP/clean→gray).
4. **Table** — Toolbar above table (family name, counts, status line, Select Duplicates, Queue Removal); consider Version/Date/Glyphs/Feat/Size/Type; optional processed section; checkboxes + bulk Queue Removal; duplicate/queued-remove row styling.
5. **Detail panel** — Move to bottom, collapsible, tabs (Compare, Features, Glyphs); Compare = side-by-side unprocessed vs matched with metadata and table chips.
6. **Status bar** — Thin bottom strip with Ready, DB/index hint, pending count, removal count.

Recommended order: (1) theme + titlebar, (2) sidebar search + status dots, (3) table toolbar + columns + row states, (4) detail panel position + collapse + Compare tab, (5) status bar. Features/Glyphs tabs and processed rows in table can follow once core UX matches.
