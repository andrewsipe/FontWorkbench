> From: https://claude.ai/chat/5de2ce3a-52b3-422c-a714-df0772174017

# you asked

[] core_file_collector.py

[] core_font_extension.py

[] core_font_metadata.py

[] core_font_utils.py

I have a collection of scripts for comparing font files, renaming font files and organizing font files.

They're mostly good scripts, but they're also kind of cumbersome to use (or remember how to use).

Before we get into making any alterations or creating a new script, let me explain what I'm struggling with. What my workflow is like.

I have a very large, but clean collection of font files (almost 200,000). They're sorted by filename into alphabetical directories (A/, B/, C/...). 

I also have an equally large collection of files that haven't been processed. These files could be duplicates of files I've already processed and added to my clean collection. They might be missing metadata or are older versions. They might be near duplicates where small differences in how the file is structured could be causing the SHA-256 deduplicator to skip them.

Normally I can handle a few hundred files and just take my time to visually inspect. But when I have thousands, this approach becomes laborious and a bit overwhelming. I don't mind manually going through and doing a final inspection, but I'd like to try and get my files sorted into groups to make this more manageable. So it doesn't feel so overwhelming.

Beyond sorting the files into groups that would allow this inspection stage to be more manageable, I'd also like to update the filenames to a state that I can use other scripts to address the metadata that might be missing (mostly name table data). I have a very competent collection of scripts that will update the name table naming from a complete filename. So getting the filenames to an acceptable format is part of the sorting process.

I've already run the SHA-256 Deduplicator comparing my primary collection to my secondary collection. The 1 for 1 duplicates in the secondary collection have been removed and the file extensions have been checked and updated.

The next step is the trickier where my scripts are clever but not very good. I think I need to funnel my files down into smaller collections for more targeted processing. I'm just not exactly sure how I should approach that or if there's something I'm not considering.

Sometimes it feels like I'm comparing grains of rice. Brown to White is easy, white to white or brown to brown, that's where it's less obvious.

---

# claude response

This is a really interesting problem, and your "grains of rice" analogy is apt. The hard part isn't the obvious duplicates — it's the *near-matches* where the content is essentially the same font but the files differ enough to fool byte-level or hash comparison.

Let me think through what you're actually dealing with before jumping to solutions.

---

**What you likely have in your unprocessed pile, after deduplication:**

1. **Version variants** — same font family/style, but an older or newer revision. The file content differs, but it's clearly "the same font."

2. **Metadata-corrupted files** — the font data (outlines, hinting) is identical or near-identical to something in your clean collection, but name table entries are wrong, missing, or malformed. This is why the SHA-256 check didn't catch them.

3. **Structural variants** — same visual font, but compiled differently. Maybe one is hinted, one isn't. Maybe one has extra GSUB tables. Same "rice," different processing.

4. **Legitimate new additions** — genuinely different fonts that just haven't been processed yet.

5. **Noise** — corrupt files, trial/demo versions, duplicates of duplicates from different sources.

---

**The core challenge you're facing**

Your existing tools work at two extremes: exact byte matches (SHA-256) or fully manual inspection. What you're missing is a *middle layer* that clusters files by family/style identity before you ever look at them.

The good news is your font files already carry structured identity data in their name tables. That's your sorting key — not the bytes, not the filename, but what the font *says it is*.

---

**A practical funnel approach, in stages:**

**Stage 1 — Identity extraction and filename normalization**

Before you can compare anything usefully, every file needs a consistent, readable filename. You already have scripts for this. Running your renamer on the unprocessed pile gives you filenames that reflect what the font actually claims to be. This is the foundation everything else builds on.

**Stage 2 — Family clustering**

Group files by their family name (name table ID 1 or 16). You don't need to decide anything yet — just put all the "Helvetica Neue" files in one bucket, all the "Garamond" files in another. This immediately breaks your thousands-of-files problem into dozens of smaller problems. Most families will have only a handful of files.

**Stage 3 — Cross-reference against your clean collection**

For each family cluster in your unprocessed pile, check what's already in your clean collection under that family name. This is where it gets interesting — you can now see "I have 3 versions of HelveticaNeue-Bold in the unprocessed pile, and my clean collection has 1." That's a meaningful, answerable question.

**Stage 4 — Version triage within each family**

Within a family cluster, sort by font revision (head table `fontRevision`) and version string. Older versions of something you already have are usually safe to discard or archive. Newer versions are candidates for replacing what you have.

**Stage 5 — Structural comparison for the stubborn ones**

The files that survive stages 3 and 4 — same family, same weight, same version, but different hash — these are your true near-duplicates. Here you compare glyph count, checksum, table checksums, file size. Often one of these signals will tell you which is "more complete."

---

**What I'd suggest building**

Rather than a new all-in-one script, I think you need a **triage report generator**. Something that scans your unprocessed pile and produces a structured report that sorts files into categories:

- **Definite duplicates** — family + style + version already exists in clean collection (exact match on those metadata fields, even if hash differs)
- **Version upgrades** — same family + style, but higher revision than what's in clean collection
- **Version downgrades** — older revision than clean collection
- **Orphans** — family exists in clean collection but this specific style/weight doesn't
- **New families** — nothing in clean collection matches this family name at all
- **Problem files** — corrupt, missing name table data, unreadable

That categorization alone would probably let you handle the bulk of files with simple rules ("discard all definite duplicates," "auto-promote all version upgrades," "manually review orphans"), leaving you with a much smaller set needing real attention.

---

**A few questions before we design anything:**

How reliable is the name table data in your unprocessed files? If a lot of them have corrupt or missing name entries, Stage 2 falls apart and filename normalization has to come first. Also, do your existing scripts already extract family name and style name, or are they working primarily from PostScript names? And finally — when you say "near duplicates where small differences in file structure" fool the SHA-256 deduplicator, do you have a sense of what those structural differences typically are? That would help design Stage 5.

---

# you asked

While your stages are accurate and are aligned with my current process. I have run the file renamer. I have several files with duplicate names (~001) counters added show this. I have them sorted into family/superfamily groupings.

What I don't have is a good automated process for comparing my processed collection to my unprocessed collection at this stage (Stage 3). I have to manually look at both groups. I don't manage the processed collection, I have a font manager that does that. So the file/directory sorting creation and sorting is done by that tool. For reference Image 1 is a screenshot of how those files are kept. A single file per directory. Directory is created using ID 4 and then sorted by the first letter of the directory name. If a file has the same name, the directory handles duplicate naming by added a number to the end (image 2).

I'd prefer not to upload my unprocessed files to my font manager as this creates additional issues.

What I need is a way to compare my processed file collection to my unprocessed collection. This can be several stages in itself. filename to filename. metadata to metadata. version to version. creation date to creation date… The processed file might be have more complete data points, but the unprocessed file might actually be the better of the two, it's information just needs refined.

I have files that don't have any name table data or might have some inaccurate metadata in other tables. One font might have more glyphs, while the other has more opentype features enabled (language subset vs a global variant, but released as a test not a full-feature). 

There's a ton of ways to sort files. I'm just trying to create tangible piles where I know what I'm looking for that might not have been easily quantified by the sort process. 

The goal would be to automate until we can't… then the human is the final quality control/ arbiter of what happens to the file. Keep or toss.

---

# claude response

The screenshots clarify a lot. Your processed collection has a very clean, predictable structure — one file per directory, directory named from ID 4 (full name), sorted alphabetically. That's actually a great foundation for automated comparison because it's queryable without needing a font manager API. You can just walk the directory tree and the structure itself tells you what's there.

Let me reframe the problem now that I can see both sides clearly.

---

**What you actually need is a comparison engine, not a sorter.**

Your unprocessed files have already been renamed and are in family groupings. Your processed collection is organized and browsable. The gap is a tool that can look at a file from the unprocessed pile, reach into your processed collection, find the best candidate(s) for comparison, and then produce a verdict with enough supporting data that you can make a quick keep/toss/replace decision without opening every file individually.

The output shouldn't be more folders to sort through. It should be a **report** — ideally one you can scan quickly, where the easy decisions are already flagged and only the ambiguous ones need your eyes.

---

**The comparison hierarchy that makes sense given your setup:**

The tool should try each level in order, stopping when it gets a confident match:

**Level 1 — Filename match** against your processed collection's directory names. If `XenonNue-Thin.otf` exists in your processed `X/Xenon Nue Thin/` directory, that's an immediate candidate. Fast, no metadata reading required.

**Level 2 — PostScript name match** when filename comparison is fuzzy or misses. PS names are more stable than filenames and survive a lot of metadata corruption.

**Level 3 — Family + style match** using name table IDs 1/2 (or 4/16 for preferred names). This catches cases where the font was renamed or the PS name differs between versions.

**Level 4 — Glyph count + file size as a similarity signal** for files where name data is too corrupt to match confidently. Not a definitive match, but a "probably related" flag.

**Level 5 — Unmatched** — no reasonable candidate found in the processed collection. Could be a genuinely new font, could be too corrupt to identify.

---

**For each match found, the report captures:**

- Which level matched (how confident is this pairing)
- Version comparison: processed revision vs. unprocessed revision (head table `fontRevision` + version string)
- Glyph count delta (more glyphs in unprocessed = potentially more complete)
- File size delta
- Head created/modified date comparison
- Name table completeness score (how many of the key IDs are populated vs. empty)
- OpenType feature table presence (GSUB, GPOS, KERN — just whether they exist and their sizes, not full analysis)
- A suggested action: **SKIP** (processed is clearly better), **REVIEW** (ambiguous), **UPGRADE** (unprocessed appears newer/more complete), **NEW** (no match found)

The suggested action is never final — it's a pre-sort to make your review pass faster.

---

**The ~001 duplicate situation**

This is worth handling explicitly. When your renamer added `~001` counters, that means you already know those files are name-conflicts. The comparison tool should strip the tilde counter before trying to match, and flag these files as "known conflict — manual resolution required" regardless of what the comparison finds. They need eyes on them.

---

**One thing worth clarifying before building this:**

Your processed collection — when you say it's organized by "ID 4 and sorted by first letter" — does every directory contain exactly one font file, or can a directory hold multiple files for the same full name? From Image 2, it looks like one file per directory, but I want to confirm before assuming the traversal logic. And when the font manager adds a number suffix to the directory (like "Apex Round 2"), is that number part of the actual font's full name, or is it the font manager's own collision-handling (like your `~001`)?

That distinction matters because if "Apex Round 2" is the font manager's deduplication, the real name being compared is "Apex Round" — but if "2" is actually in the font's name table, then it's a real name and should be matched as-is.

---

# you asked

Hrm… I'm not keen on a report.

I'd either want to build a tool that is interactive in some way or the tool would sort our files into tiers based on the findings.

Let me add more context around my current workflow.

When I manually review the font files, I'm mostly checking the files against the existing collection, I'm also updating the filenames (refining the results of the file renamer). Sometimes designers use abbreviated naming or they leave out something in the filename that exists in the font name (since my scripts can update the font name table from the filename, I try to update the filename to be a exact as possible so that data translates to the name table correctly).

If we sorted into tiers, that would give me a clearer idea of what level of processing would be needed. If the script were interactive, maybe it could integrate some of the functionality I do in the Finder. The nice thing about the Finder is I can see all the files that would be related in one place and open the files in a font viewer to see more details that might not be readily available in the Finder.

Maybe we could create a tool that combines the efficiency of the Finder, with report-like columns or a database that can be sorted or cross-referenced.

The challenge is not just being able to sort the files, but also review the files and update the files. I'm trying to refine my workflow so I can still have the human-element involved, but take out the tedious, repetitious step of weeding through the files one by one.

Your suggestions are good, they're touching the data levels that need to be reached to make more informed decisions about which fonts are good, which are good but need surface level refinement and which aren't worth keeping and should be jettisoned. 

Also: when you say it's organized by "ID 4 and sorted by first letter" — does every directory contain exactly one font file - One file per directory. {F/ Font Light Italic/ Font-LightItalic.otf}
A number is added when more than one font with that same filename is uploaded. But the filename can include a number. F/ Font Light Italic 2/ Font-LightItalic.otf (could be a different font entirely just the same name as the other font). F/ Font Light Italic 2/ Font-LightItalic2.otf could also exist. If that name exists, the font manager would just move onto the next number when creating a duplicate filename directory. F/ Font Light Italic 3/ Font-LightItalic.otf

---

# claude response

What you're describing is essentially a **custom font review workbench** — something that sits between a file manager and a database, purpose-built for this specific workflow. The Finder analogy is the right mental model: you want to *see* related files together, act on them, and move on.

A **terminal UI (TUI)** application would fit this well. Think of something like a two-panel layout — your unprocessed files on one side, matched candidates from your processed collection on the other — with comparison data surfaced inline and keyboard shortcuts to take action. It stays in the terminal so it plays nicely with your existing scripts, but it's interactive rather than just a report you read passively.

---

**What the interface could look like conceptually:**

The left panel shows your unprocessed files, grouped by family. You navigate through them. When you land on a file, the right panel populates with the best match(es) from your processed collection — or flags "no match found." A bottom strip shows the comparison data: version delta, glyph count, name table completeness, which tables are present.

From there, keyboard actions could handle the decisions you currently do manually:

- **R** — rename the unprocessed file (opens an inline editor, pre-filled with the current name so you're refining rather than retyping)
- **K** — mark to keep (queue it for import into processed collection)
- **S** — skip/defer (not sure yet, come back)
- **X** — mark to discard
- **O** — open in your font viewer (calls `open` on macOS, so it hands off to whatever app handles that file type)
- **C** — copy processed collection path to clipboard (so you can jump to it in Finder if you need the visual)

The tier/action queue builds up as you work through files, and at the end you confirm and the tool executes the file operations.

---

**The triage tiers would still exist**, but as output states rather than pre-sorted folders:

- **Confident match, processed is newer** → auto-flagged SKIP, you just confirm or override
- **Confident match, unprocessed is newer/more complete** → flagged UPGRADE, your decision
- **Confident match, ambiguous** → flagged REVIEW, requires your eyes
- **Name conflict (~001 files)** → flagged CONFLICT, always manual
- **No match** → flagged NEW, your decision
- **Unreadable/corrupt** → flagged PROBLEM, set aside

Most of your time gets spent on UPGRADE, REVIEW, and CONFLICT. The rest moves quickly.

---

**The rename workflow integration is key.** Since your downstream scripts can update name tables from a correct filename, getting the filename right *during* this review pass means you're not doing a separate filename cleanup step afterward. The inline rename with pre-fill makes that fast — you're editing, not typing from scratch.

---

Before I look at your existing scripts to understand what's already built and what needs to be written fresh, a few practical questions:

Are you comfortable with a Python TUI (using something like `textual` or `curses`)? Or would you prefer something that opens in the browser as a local web app — which gives you more flexibility for layout and could even embed font previews directly?

And for the "open in font viewer" action — what app do you typically use for that on macOS? That determines how to wire up the preview handoff.

---

# you asked

Here's an example of when two identically named files are added to the font manager (Font Explorer X Pro). The "Eastman Medium Alt Italic 2" was the added file (based on the time stamp) that matched an existing filename. They're actually the same files. I made a minor metadata change to the second file uploaded. I don't have a lot of examples because I try to keep my font collection organized and clean. If 2 fonts from different foundries have the same family name, I will add the foundry Vendor ID to the filename so that there isn't a duplicate name conflict.

Anyway, that's just additional information about how the font manager organizing the processed fonts. Small detail.

As for your TUI suggestion, I'm not particularly keen on TUIs. I've tried building them in the past and while they're unique and provide the "GUI" interface directly through python, they're also difficult to work with. Less ideal, but more forgiving would be to create a python server and with a browser-based GUI.

The more I'm thinking about your suggestions and what I want to accomplish, I think it might be beneficial to create an extraction tool that would pull the data from fonts and put it into a database for viewing, sorting and pushing back to the font file. If I can't see the data in an organized way, I can't interact with it as well. That's the Finder side of my workflow. The finder provides an interface that I can view the data, but also organize and then update (some) of the data directly. So building a tool that sort of mimics the Finder interface might be a good starting point that I can then adjust/adapt beyond what I can do within the Finder.

---

# claude response

The database-backed browser tool is the right call. It gives you something the Finder can't — sortable, filterable columns across *both* collections simultaneously, with the ability to write changes back to files. And a local web server is much more forgiving to build and iterate on than a TUI.

The Finder analogy is actually a really useful design constraint. What makes the Finder good for this work is:

- Files are visible as rows with metadata columns
- You can select multiple files and act on them together
- You can navigate by folder/family grouping
- You can open files externally with one action

What the Finder *can't* do that this tool could:

- Show your processed and unprocessed collections side by side, matched by identity
- Surface name table fields as sortable columns (not just filename/size/date)
- Flag conflicts, version deltas, completeness gaps automatically
- Let you edit a filename or metadata field inline and write it back
- Queue and batch-execute file operations

---

**The architecture I'd suggest:**

A **SQLite database** as the backbone. Both collections get scanned and their metadata extracted into the DB — one table for processed fonts, one for unprocessed, with a matches/comparison view that joins them. SQLite is fast enough for 200k records, queryable without a server, and the file is portable.

A **lightweight Python web server** (Flask or FastAPI) that serves the UI and handles actions — renaming files, writing metadata, moving files, marking decisions.

A **browser frontend** that looks and feels like a Finder list view but with font-specific columns and action buttons. Sortable columns, filterable by family/tier/status, two-panel when you select an unprocessed file to see its match.

---

**The columns that matter:**

For each file — filename, family name (ID 1), full name (ID 4), PS name (ID 6), version string, font revision, glyph count, file size, format, name table completeness score, match tier (SKIP/UPGRADE/REVIEW/NEW/CONFLICT/PROBLEM), and matched processed file path.

---

**One honest consideration before we start building:**

This is a reasonably substantial tool — the scanner/extractor, the database schema, the matching logic, the web server, and the frontend UI. It would be worth deciding upfront whether you want to build this incrementally (scanner first, verify the data looks right, then add the UI) or whether you want a more complete first version. The incremental approach is safer given how specific your collection's quirks are — better to confirm the matching logic is finding the right candidates before you build UI on top of it.

Which would you prefer? And do you have a preferred location/structure in mind for where this tool would live relative to your existing scripts?

---

# you asked

[] core_error_handling.py

[] core_font_style_dictionaries.py

[] core_logging_config.py

[] core_namerecord_matcher.py

[] core_string_utils.py

These are the other utility scripts in my FontCore group. I've created a lot of these tools for working with font files. So building the tool to collect, scan, and extract data would leverage these scripts for consistency (along with the other core_ scripts I shared earlier).

Building the tool to use my FontCore utilities should help simplify having to build everything from scratch. I also lean heavily into fonttools knowing it's well maintained.

Aside from that I would like to build incrementally.

Being able to extract the data is one portion, but also seeing that the data extracted correctly and seeing how the data is presented is also an important step. If the data isn't organized well initially, having sorting or funneling isn't going to matter.

I have an agentic developer in my IDE that has full access to my script database. So your role would be to provide build guidance (not actually build the tool). This way I can have my agent build with fuller context while leaning on you for technical expertise and direction.

If you provide a build guide that can be done incrementally, so I can test in stages, that would be the best approach. I think.

---

# claude response

This is the right approach — incremental, testable stages, leveraging what you've already built. Let me give you a build guide structured so each stage produces something you can actually evaluate before moving forward.

---

## Font Workbench — Incremental Build Guide

### Guiding principles

- Every stage builds on `FontCore` utilities already in your codebase
- `fonttools` for all font I/O
- SQLite as the data layer (no external DB dependencies)
- Flask as the web server (lightweight, minimal setup)
- Each stage ends with something runnable and verifiable

---

## Stage 1 — Database schema and scanner

**Goal:** Scan a directory of font files, extract metadata, store in SQLite. No UI yet. Verify data looks right by querying the DB directly.

### What to build

A single script: `workbench_scanner.py`

**Schema — two primary tables:**

```
fonts_processed
  id, file_path, dir_name, family_name, preferred_family,
  full_name, ps_name, style_name, preferred_style,
  version_string, font_revision, glyph_count, file_size,
  format, vendor_id, head_created, head_modified,
  name_completeness_score, has_gsub, has_gpos, has_kern,
  has_fvar, has_stat, scanned_at

fonts_unprocessed
  (same columns)
  + tilde_counter (bool — was ~001 suffix detected in filename)
  + original_filename (pre-normalization, if available)
```

**Name completeness score:** Count how many of the key name IDs are populated (1, 2, 4, 5, 6, 16, 17). Score is 0–7. This is a fast quality signal.

### Key implementation notes for your agent

- Use `core_file_collector.collect_font_files_with_progress()` for directory traversal
- Use `core_font_metadata.extract_metadata()` for the core extraction — it already handles TTF/OTF/TTC and returns a `FontMetadata` dataclass
- Use `core_font_metadata.get_vendor_id()` for vendor extraction
- Use `core_font_extension.detect_font_format()` for format confirmation
- For name IDs beyond what `extract_metadata()` returns (IDs 1, 2, 16, 17), open the font with `TTFont` directly and pull from `font["name"].getName(id, 3, 1, 0x409)`
- For table presence (GSUB, GPOS, KERN, fvar, STAT): `table_name in font` is sufficient — don't read the tables, just check existence
- Tilde counter detection: check if filename stem matches pattern `.*~\d{3}$` before stripping it for the stored name

### Verification step

After running, open the SQLite file with any DB browser (DB Browser for SQLite is free on macOS) and spot-check 10–15 records. Confirm:
- Family names look correct
- Completeness scores make sense (a font with missing name table should score low)
- Version strings are being captured, not just `fontRevision` floats
- Tilde-flagged files are correctly identified

---

## Stage 2 — Matching engine

**Goal:** For each unprocessed font, find the best candidate(s) in the processed collection. Store match results in a third table. Still no UI.

### What to build

A script `workbench_matcher.py` that reads both tables and populates:

```
font_matches
  id, unprocessed_id, processed_id,
  match_level (1–5), match_confidence (high/medium/low),
  version_delta (float — unprocessed revision minus processed revision),
  glyph_delta (int),
  size_delta (int),
  completeness_delta (int),
  suggested_action (SKIP/UPGRADE/REVIEW/NEW/CONFLICT/PROBLEM)
```

### Match levels (in priority order)

1. **PS name exact match** — most reliable cross-version identifier
2. **Full name exact match** (ID 4) — good but can vary between versions
3. **Preferred family + preferred style match** (IDs 16+17, fall back to 1+2) — catches renamed variants
4. **Family name match only** — same family, style differs — flag as ORPHAN subtype of REVIEW
5. **No match** — NEW

### Suggested action logic

```
CONFLICT   → tilde_counter == True (always, regardless of other signals)
SKIP       → match level 1–3, version_delta <= 0, glyph_delta <= 0
UPGRADE    → match level 1–3, version_delta > 0 OR glyph_delta > 10
REVIEW     → match level 1–3, signals are ambiguous or contradictory
             OR match level 4 (family only)
NEW        → match level 5 (no match)
PROBLEM    → extraction failed, completeness score == 0
```

The `version_delta` sign is the primary signal. Glyph delta is a secondary tiebreaker — a higher count often (not always) means more complete, but flag rather than decide.

### Verification step

Query the `font_matches` table and look at the distribution of suggested actions. If 90% are REVIEW, the matching logic is probably too conservative. If 90% are SKIP, check whether the matching logic is being too lenient. A healthy distribution for a real-world unprocessed pile should have a meaningful UPGRADE and NEW population.

Also manually verify 5 matches at each level — confirm the pairing makes sense by opening the actual files.

---

## Stage 3 — Web server and basic list view

**Goal:** Flask app that serves a sortable table of unprocessed fonts with their match data. This is where you evaluate how the data *reads* before adding any interaction.

### What to build

`workbench_app.py` — Flask application with two routes initially:

- `GET /` — main table view
- `GET /api/fonts` — JSON endpoint returning unprocessed fonts with match data joined

### Table columns (default view)

Filename | Family | Style | Format | Version | Glyphs | Size | Completeness | Action | Matched File

Every column should be sortable client-side. No server-side pagination needed at this scale — SQLite with a JOIN can return 10k rows fast enough to sort in the browser with a simple JS table library.

### Frontend recommendation

Use **Tabulator.js** (CDN, no build step). It gives you sortable, filterable columns, row grouping by family, and inline editing — all without needing a frontend build pipeline. It looks clean and is genuinely useful for this kind of data review work.

Serve everything from a single `templates/index.html`. Keep it self-contained at this stage.

### Verification step

This is your primary data quality gate. Before building any write-back functionality, spend time with the table:

- Sort by completeness score ascending — do the low-scoring files look like the bad ones you'd expect?
- Sort by version delta — do the UPGRADE candidates look plausible?
- Group by family — do the family groupings reflect reality?
- Filter to CONFLICT — are these actually the ~001 files?

If something looks wrong in the data at this stage, go back and fix the scanner or matcher before proceeding. Interaction built on bad data creates more problems than it solves.

---

## Stage 4 — Detail panel and file preview handoff

**Goal:** Click a row, see the full comparison panel. Wire up the "open in font viewer" action.

### What to add

- `GET /api/font/<id>` — returns full detail for one unprocessed font + its match
- Side panel or expanded row in the UI showing: all name table fields side by side (unprocessed vs. processed match), table presence comparison, all delta values
- **Open in viewer** button: calls `GET /api/open/<id>` which runs `subprocess.run(["open", filepath])` on macOS — hands off to whatever app handles that extension

### Side-by-side name table comparison

This is the core of what makes the tool useful over the Finder. Show a grid:

```
Name ID  | Label            | Processed Value      | Unprocessed Value    | Match?
1        | Family           | Eastman              | Eastman              | ✓
4        | Full Name        | Eastman Medium       | Eastman-Medium       | ~
6        | PS Name          | Eastman-Medium       | Eastman-Medium       | ✓
16       | Preferred Family | (empty)              | Eastman              | —
```

The `~` for near-match (same content, different formatting) and `—` for one side missing is more useful than a simple yes/no.

---

## Stage 5 — Actions and write-back

**Goal:** Decision buttons that queue operations, confirmation step, then execute.

### Actions per row (keyboard-friendly)

- **Mark KEEP** — queue for copy/move to a staging folder
- **Mark SKIP** — dismiss from view (don't delete)  
- **Mark DISCARD** — queue for deletion or move to discard folder
- **Rename** — inline filename editor, pre-filled, updates DB record
- **Override action** — change the suggested action manually

### Important design constraint

Don't execute file operations immediately. Collect all decisions into a queue table in SQLite, show a confirmation screen listing what will happen, then execute in batch. This gives you an undo point — if the batch hasn't run, nothing is permanent.

```
action_queue
  id, font_id, action_type, original_path, target_path, 
  new_filename, queued_at, executed_at, status
```

---

## What to defer (not now)

- Metadata write-back (updating name tables from filename) — your existing scripts handle this; the workbench just needs to hand files off to them correctly
- Batch rename across multiple selected rows — add after single-row rename is stable
- Any kind of automatic decision execution without confirmation

---

## Module dependencies summary for your agent

```
workbench_scanner.py imports:
  FontCore.core_file_collector  → collect_font_files_with_progress
  FontCore.core_font_metadata   → extract_metadata, get_vendor_id  
  FontCore.core_font_extension  → detect_font_format
  FontCore.core_string_utils    → normalize_empty, is_empty
  fonttools.ttLib               → TTFont (direct, for additional name IDs)
  sqlite3, pathlib, re, datetime

workbench_matcher.py imports:
  sqlite3 only (reads from DB, no font I/O)

workbench_app.py imports:
  flask, sqlite3, subprocess, pathlib
```

---

The incremental order matters here — Stage 1 data quality gates everything else. I'd suggest not moving to Stage 2 until you've spot-checked at least 50–100 records from both collections and are confident the extraction is reliable. The matching logic in Stage 2 is only as good as the data it's matching against.

---

# you asked

out of curiosity could you provide a visual idea of what this tool should look like? Maybe a dummy website that I could provide my agent with as reference (or a starting point)?

---

# claude response

Now I have a clear picture of the tool. Let me build a proper reference mockup — dark theme, dense data-focused layout, Finder-like sensibility but with the power columns you actually need.

Here's the interactive mockup — all the interactions work: clicking rows, collapsing family groups, the filter chips, rename inline edit, queue actions, and the search filter.

A few things worth pointing out in the design that were deliberate choices you might want to react to:

**The score pip bar** — 7 pips for the 7 key name IDs. All green = complete, blue = mostly complete, red = nothing. At a glance across hundreds of rows you can immediately spot the problem files without reading a number.

**The ~001 tilde flag** in the match column replaces the match level badge for conflict rows, so those files visually announce themselves differently from everything else.

**The name table comparison grid** in the detail panel uses ✓ / ~ / — symbols rather than colors alone — `~` for "same field, different value" (like version numbers that differ), `—` for "absent on both sides." This is where you'd see at a glance whether a rename is needed or whether metadata just needs a version bump.

**Table presence chips** use a four-state system: both have it (green), only unprocessed has it (blue — potentially more complete), only processed has it (gray — check if missing is a regression), neither has it (dim).

Things to give your agent feedback on before building: whether the detail panel width feels right, whether the delta cards are the right level of prominence, and whether you'd want the name table comparison to show *all* platform records or just the Windows/Unicode ones you primarily work with.

---

# you asked

Wow… this is definitely more advanced than I was imagining.

Maybe too advanced actually.

I'm looking at the design you came up with and I'm overwhelmed by the amount of information. This isn't saying what you've created is bad, but it is saying that maybe it's more complex than it needs to be.

---

# claude response

That's really useful feedback. The instinct to surface everything at once was wrong — it creates the same overwhelm you're trying to escape from.

Let me ask a more grounding question: when you're doing this manually in the Finder right now, what are the **two or three things** you're actually looking at to make a decision about a file? Not everything you *could* look at — the things that actually drive your keep/toss/rename call most of the time.

Because that's all the interface needs to show. Everything else can be one click deeper if you need it.

---

# you asked

Let me try to walk through my workflow.

I've processed through and removed the 1:1 duplicates. Then I've renamed the files, which highlight the (~001) name duplicates. I've grouped the files into families (superfamilies) so any font with a matching family name (not necessary part of that family, but sorted because it shares a name) is grouped into a directory. These are all in a Finder window (Image 1 as reference).

I then open my font manager to manually scan through and look for fonts with family matching names (image 2 as reference). This is when things start to get tedious because while I'm also scrolling through and checking each directory in my unprocessed collection against my processed collection. I'm also removing the name duplicates (~001) and updating the filenames to be more refined for my other scripts to process and update the metadata with. 

If I come across a font I have in my processed collection, I usually open one of the files in the font manager to see more details (like glyph count and opentype features). I also then use a font viewer like fontgauntlet.com to see the unprocessed font's details that aren't available in the Finder. This is simple since I can drag and drop the file into the browser window and see the additional details more clearly.

I typically believe that the fonts that I've already processed are newer than the ones in my unprocessed collection, so it they have matching versions, I usually assume that the ones in my processed collection are worth keeping and usually skip a deeper dive into the unprocessed version. This might actually be a mistake as the ones in my collection might be a Latin variant and the ones in the unprocessed collection might be a global variant (same version, but more glyphs, more features). But because of the tediousness of the process or just human error, I may be falsely assuming something isn't worth keeping because at this basic level I assume they're the same.

I also tend to believe that my scripting is accurate and that the versions of fonts that have a counter (~001) are the inferior in the unprocessed collection. Often time I'll scan over with my eyes and look at the file size and version number in the Finder and determine if this is correct and only review the files deeper in fontgauntlet.com when it's difficult to confirm which to keep (this usually is triggered when there are equal amount of duplicate named fonts in a collection. Then I have to be sure the script accurately did detect the superior of the two, which it usually does).

Since my scripts are good at updating the metadata consistently, I don't particularly care if the name ID 1-6, 16, and 17 are missing or incorrect. I also don't usually look to see if the metrics are correct either (I also update those with scripts). Actually any data in the name table can be updated and doesn't really impact my decision making, it's just a reference for how likely the font might be a full release vs a trial or subset variant. I also check the filenames for this information (Trial, Beta, v#.#, Test…) can all indicate that the font isn't a complete release (but that's not a trigger to delete, it's just a trigger to investigate the font closer to any that I might already have). 

If I don't have a font in my processed collection, I don't have to review the font as closely. I just update the filename to be as accurate to the full name as possible. So the tedium really comes from looking at each font family to see if I need to review it against one I already have vs. just updating the filename to be more refined for my other scripts to process.

---

# claude response

This is the clearest picture yet of your actual workflow. Let me reflect back what I'm hearing, because it's much simpler than the mockup suggested.

---

**The real decision tree is just two branches:**

**Branch 1 — Family already exists in processed collection**
This is where all the work happens. You need to compare the two and decide: keep unprocessed, skip it, or flag for deeper review. The signals you actually use are version number, file size, and whether the filename suggests it's a trial/subset/beta. Glyph count and feature tables only come in when those first signals are ambiguous.

**Branch 2 — Family not in processed collection**
Almost no decision needed. Just refine the filename so your other scripts can handle the rest. Move on.

Right now Branch 2 gets the same visual treatment as Branch 1, which is part of what makes the process feel exhausting. You're giving equal attention to things that don't need it.

---

**What the tool actually needs to do:**

Pre-sort your unprocessed files into those two branches *before you ever look at them.* The families with no match in your processed collection should be essentially invisible — maybe a separate queue you batch-process quickly with just a filename check. All your attention goes to the matched families.

Within the matched group, the tool surfaces just: version match/delta, file size delta, and whether the filename contains trial/beta/test keywords. That's it for the primary view. Everything else — glyph count, feature tables, fontgauntlet-level detail — stays one click away for when you actually need it.

The ~001 files are their own micro-problem. The question there isn't really about the processed collection at all — it's "did my script correctly identify which of these two is superior?" Version and file size answer that most of the time, and you've said your script is usually right. So those probably just need a quick confirm-or-override, not a full review.

---

**So the interface is really:**

A list sorted into three groups — **Matched** (needs comparison), **Conflict** (~001 pairs, needs quick confirm), and **New** (no match, just rename and move on). 

The Matched group shows: filename, version, size, and a flag if the name looks like a trial/subset. The processed collection match is shown alongside it. That's the whole primary view. No panels, no pip bars, no name table grids unless you ask for them.

Does that feel closer to the actual weight of the decisions you're making?

---

# you asked

This is correct. I'd add for the Branch 2, when I cross files that aren't in my processed collection, I usually refine the filename (this might be making sure words are capitalized or adding "-Regular" or maybe a vendor ID to the filename or updating abbreviations to full words. The refinement is usually something I can see without having to inspect the font closer in the browser font viewer. And I usually use the font viewer to make sure I'm adding the right subfamily if it's missing or the abbreviation is unclear. But I'd say 90 out of 100 times, I don't need to inspect the files particularly closely.

---

# claude response

That confirms it. Branch 2 is basically a light editing pass — you're reading the filename, making a small correction, and moving on. The font viewer is the exception, not the rule.

So the tool has one core interaction per branch:

**Branch 1 (Matched):** Side-by-side filename comparison with version and size delta visible. Quick decision — keep, skip, or flag for deeper look.

**Branch 2 (New):** Inline filename editor, pre-filled, you tweak and confirm. Open in font viewer available but rarely needed.

---

**The interface is essentially a triage queue with two modes.**

You work through Matched files first because they require actual judgment. New files are a fast editing pass you do after. Conflicts (~001) are a quick confirm-or-override pass — probably the fastest of the three since your script is usually right.

The primary view is a simple list. Three sections. Each row shows just enough to make the call without clicking anywhere. The detail/comparison view exists but you only go there when the primary signals don't give you a clear answer.

---

**Before a revised mockup, one practical question:**

For Branch 1, when you have a matched family — are you comparing one file at a time, or do you typically look at the whole family group together? For example, if you have 12 Technica files in your unprocessed pile and 14 in your processed collection, are you scanning the whole group at once to spot what's new or different, or going file by file?

That determines whether the matched view should group by family or just list individual file pairs.

---

# you asked

When I have a family in my processed collection that matches another family in my unprocessed collection, I do a quick overview to see if they families match (file count is a factor, then confirm style cohesion). If I see no differences, then I usually review one file closer in each set. This usually provides enough data to determine if one is more superior than the other (this is when I look at the glyph count and features and even table count if needed). Because there is more effort in refining the unprocessed files vs the processed ones, if the review shows very little differences, I often just keep the processed ones vs. going through the hassle of cleaning up and processing the unprocessed ones AND deleting the processed files I already have. So if the glyph count is off by like 10 or 20, that usually isn't enough to trigger a keep. Same for opentype features, some fonts might have 1 or 2 more features. Because designers might remove glyphs/features when refining versions of fonts, one font with just a few more or less glyphs/features does not mean it's the better of the two (so the version/creation date information is typically the final confirmation step. I don't use modification date because when I use TTX, I am often changing this date while using my scripts, so it's not reliable).

---

# claude response

This is really valuable — it clarifies the decision logic precisely.

The comparison isn't file-by-file, it's **family-level first, then one representative file if needed.** And the bar for "worth replacing" is deliberately high because the cost of processing isn't just time — it's also the risk of introducing errors by touching files that are already clean.

So the actual decision ladder for a matched family is:

1. **File count match?** If the counts are the same, lean toward keeping processed unless something else flags
2. **Style cohesion match?** Do the styles present in both collections align — are there styles missing or extra in the unprocessed pile?
3. **If something looks different — one representative file comparison:** version string and creation date (not modified) as the tiebreaker
4. **Glyph/feature delta only matters if it's significant** — not 10-20 glyphs, not 1-2 features. You're looking for a meaningful difference that suggests one is genuinely more complete

And the bias is always toward the processed collection unless the unprocessed file is clearly superior. The default action is skip, not keep.

---

**That reframes the whole tool.**

The primary job isn't comparison — it's **exception detection.** The tool should be looking for the things that break the "just skip it" default:

- File count mismatch between collections
- Styles present in unprocessed that aren't in processed (missing styles)
- Version in unprocessed is meaningfully higher
- Creation date in unprocessed is newer
- Filename contains trial/beta/test/subset keywords
- Significant glyph delta (probably needs a configurable threshold — maybe 50+?)

If none of those flags are present, the family gets a **"looks safe to skip"** status and you can batch-confirm those without reviewing them at all. That's probably a large portion of your pile.

If one or more flags are present, the family gets surfaced for your eyes. You look at it, make the call.

---

The interface then becomes very simple: a list of families, not files. Each family row shows the exception flags that were detected. Most rows have no flags — you confirm skip in bulk. The flagged ones you open and review.

That's a fundamentally different — and much lighter — tool than what we were designing before. Want me to sketch a revised mockup based on this?

---

# you asked

Yes.

Looking at your first preview, let me point out what I do like. I like the design. It's clean and compact. This is helpful because font families can be huge. A directory can run anywhere from 1 file to hundreds (I have some superfamilies that are close to 200 fonts in the family). Typically, I'd say families are around 16-20 files though. This usually covers the 9 main weights and italic variants and 2 variable fonts. Some of the larger families include 3-5 width variants, so 100 files is not uncommon.

You don't have a column that just lists the families. I think this would make the main column more useful in focusing on one family at a time. But I do see you have a group by family option.

I think your information columns in the main file column could be refined to show the filename, version number, creation date, glyph count, opentype feature count, file size, file type. If a duplicate exists, give it a different background color. That'll make scanning and seeing these in a font list easier. Being able to select all "duplicated" to queue them for removal would be nice. 

I typically use the Finder to update the filenames. I know in the browser this isn't a direct action but a queued action. I like the ability to change a filename and move on in the Finder. But since that's not as easy in the browser, let me make changes in the browser inline, like each filename reference is a text-input. Then, if the filename is changed, make it bold or some other indication that I've changed it. Provide a single Apply button that will then push all the changes to the files when pressed. This would be easier than having to apply the changes each time I make one (which would be annoying). (something similar to Image 4).

The apply button would also push any cued fonts for removal to the trash or a single directory that could be deleted later.

Image 1 is probably unnecessary if we create clearly highlighted data columns. Image 2 is can also be removed in the new preview as this is also unclear and overwhelming. Image 3 would be helpful for deep dives, but I'd make this a bottom panel and allow side-by-side comparison. Providing a tab that lists all the opentype features and a tab for a glyphs viewer would be exceptionally helpful.

I think your initial attempt was solid, it was just needs refinements that help make the decision making easier and clearer for the user (me).

---

# claude response

This is exactly the kind of feedback that sharpens a tool into something actually useful. Let me build a revised mockup based on everything you've described.

This version is considerably more focused. A few things to try in the mockup:

**Click filenames to edit them inline** — they highlight on hover, turn amber and bold when changed, and a single "Apply All Changes" button in the top right commits everything at once.

**Select Duplicates → Queue Removal** — the ~001 rows have a warm amber tint. Hit "Select Duplicates" to check them all, then "Queue Removal" to mark them crossed-out. They disappear when you Apply.

**Family sidebar** — colored dots indicate review status at a glance. The toolbar updates when you switch families to show the match status.

**Bottom panel** — Compare, Features, and Glyphs tabs for when you need to go deeper. Collapses out of the way when you don't.

The key structural decisions worth noting for your agent: unprocessed and processed rows appear in the same table under separate sticky section headers, so you're always scanning a single contiguous list rather than switching between views. The processed rows are visually dimmed and read-only — reference data, not editable. And the status line in the toolbar ("⚠ Review recommended", "✓ Safe to skip") gives the family-level verdict before you look at a single file.

---

# you asked

This is a lot more inline with a tool I'd use.

I like the comparison panel that highlights the differences. I might add a filter or search feature for the main files (and the ability to do batch renaming). 

curious how file upload would work? Would I have 2 input options one to specify the primary (processed) directory and one for the secondary (unprocessed) directory?

---

# claude response

Yes, exactly that — two directory pickers. On the web, browsers can't access your filesystem directly for security reasons, so there are two practical approaches for a local Flask app:

**Option A — Path input fields**
Two text inputs where you type or paste the full directory paths. A "Scan" button kicks off the scan. Simple, fast, no friction if you know your paths (which you likely do since these are fixed locations you work from regularly). You could even save the last-used paths so they pre-fill on next launch.

**Option B — Folder picker buttons**
Uses the browser's native `<input type="file" webkitdirectory>` to open a system folder picker dialog. More familiar, but has a catch — the browser reads the files itself rather than handing the path to Flask, which means the Python backend can't access those files by path for the actual font processing. You'd have to upload the file contents through the browser, which is slow and awkward for thousands of files.

**For your use case, Option A is the right call.** Your collections are large, fixed locations on your machine. Path inputs are instant and the Flask server can just walk those directories directly using your existing `core_file_collector` utilities. 

The setup screen would be straightforward — something you only see on first launch or when changing collections:

```
Processed Collection:  [/Users/you/Font Collection/_______________] [Browse]
Unprocessed Folder:    [/Users/you/Desktop/To Process/____________] [Browse]

                                              [Save & Scan →]
```

The "Browse" there would open a small native dialog via a Python `tkinter.filedialog` call on the backend — one endpoint that opens the OS folder picker and returns the selected path. That gives you the convenience of clicking without the browser file-access limitations.

Once paths are saved to a config file (simple JSON alongside the DB), subsequent launches go straight to the main view and auto-scan if the paths haven't changed. Does that approach work for how you'd set this up?

---

# you asked

Would Option A support drag and drop or would that only be available in Option B?

Instead of using fonttools/python, could we use opentype.js/fontkit to provide the deeper data? I am attempting to build a site that's similar to fontgauntlet and have had success using these APIs to extract data from fonts. In this workload, I don't know that I truly need fonttools to do what I'm doing. I'm not modifying the font content in this workload. I'm just sorting files, extracting data for decision making and modifying filenames. I use my other scripts to make the actual file contents changes. So maybe python isn't even necessary in this workflow.

---

# claude response

Both great points.

**On drag and drop:** Option A can absolutely support drag and drop — you'd drag a folder onto a drop zone and it captures the path from the drop event. However, the same browser security limitation applies: dragging a folder into a browser gives you the *files inside it* not the *path to the folder*. So if you want the path (which Flask needs to do server-side scanning), you'd still need the tkinter backend trick to resolve it. That said, if you go the pure browser route (no Flask), drag and drop becomes the natural input method and works perfectly.

**On dropping Python entirely:** This is actually the more interesting point, and I think you're right to question it.

If you're not modifying font file contents — just reading metadata, comparing, renaming files, and making decisions — Python/Flask may be overkill. Everything you described can be done in the browser:

- **opentype.js or fontkit** can extract all the data you need: name table records, glyph count, OpenType feature tags, table presence, head dates, version strings
- **File renaming** is the one catch — browsers can't rename files on disk directly. But you could queue all renames and export a shell script or a JSON manifest that your existing Python scripts consume. One lightweight Python script that just reads the manifest and executes the file operations, rather than a full Flask server
- **SQLite** goes away too — you'd hold state in memory or localStorage during a session, and persist decisions to that manifest file

The architecture becomes much simpler:

```
Browser app (HTML + JS)
  └── opentype.js / fontkit    → font data extraction
  └── File drag & drop API     → load fonts into memory
  └── IndexedDB or memory      → session state
  └── Export manifest (JSON)   → rename/remove instructions

Thin Python script (run separately)
  └── Reads manifest
  └── Executes renames and moves
  └── Done
```

The tradeoff is that you'd drag your unprocessed folder into the browser to load the fonts — which works fine for hundreds of files but could be slow for thousands since the browser has to read each file. Your processed collection is 198k files, so you wouldn't want to load that the same way. That side would still need some kind of indexed reference — either a pre-built JSON index of your processed collection, or the lightweight Python scanner that runs once and outputs that index.

So the realistic split might be: Python does one thing (scans your processed collection and outputs a JSON index on demand), and the browser app handles everything else. Does that feel like the right division?

---

# you asked

If I'm running locally, is that really a limitation? Would lazy loading be a way to offset this limitation too?

---

# claude response

Good challenge. You're right on both counts.

**On the local limitation:** The browser's file access restrictions are a security model designed for the web — protecting users from malicious sites reading their filesystem. When you're running a local app that *you* built and are deliberately pointing at your own directories, that threat model doesn't apply. Using the File System Access API (`showDirectoryPicker()`), which is well supported in Chrome and Edge, you can request persistent read/write access to a local directory and the browser will remember the permission. That's drag-and-drop *and* path access, locally, no server needed.

**On lazy loading:** Yes, completely viable. You don't need to parse 1,847 fonts upfront. The pattern would be:

- On folder load, just read the file listing first — names, sizes, modification dates. That's essentially free, no font parsing needed
- Parse font metadata on demand as you navigate to each family — opentype.js loads a single font file in milliseconds
- The processed collection index is the one place where pre-building makes sense, since you'd want that available for matching without loading 198k files. But that index is built once and cached, not rebuilt every session

**So the realistic architecture with no Python at all:**

```
File System Access API
  └── showDirectoryPicker() for both directories
  └── Lazy file reads as you navigate families
  └── Persistent permission handles saved in IndexedDB

opentype.js / fontkit
  └── Parse on demand per selected file
  └── Extract name records, glyph count, 
      feature tags, table list, head dates

Session state in memory
  └── Rename queue, removal queue
  └── Decisions per family

Processed collection index
  └── Built once on first scan, saved to IndexedDB
  └── Refreshed only when you rescan
  └── Just the key matching fields: filename, 
      PS name, family, style, version, glyph count

Export on Apply
  └── JSON manifest of all renames and removals
  └── You run a single trivial shell script or 
      Python one-liner to execute the file ops
```

The only reason to keep even a thin Python script is the final file operations — renaming and moving files. The File System Access API does support writing, so you could technically do the renames directly from the browser too, but handing that off to a script you already trust keeps it clean and auditable. Your existing scripts already handle the downstream metadata work anyway, so the manifest handoff fits naturally into that pipeline.

Does this feel like the right direction? If so, the build guide shifts considerably — Stage 1 becomes building the processed collection indexer as a pure JS module, which is a good contained starting point.

---

# you asked

I think the question now is, would python be a helper or a hindrance? If we started the script as a python build and called the app with python, but then the app shifts to open a browser and starts the backend servers that support the browser-based app, would shifting back to python at the end really be necessary or only when we commit/apply changes we've made in the app?

I have another script that does open a chromium browser that uses python primarily with playwright. This is for finding and extracting fonts in websites. So I know this is an option. I'm just curious where the bridging would be a benefit or a hindernance  and if we should keep a blend or abandon python completely, if it's not a significant add for this approach.

---

# claude response

Python as a launcher is a clean pattern and you've already validated it with your Playwright script. The question is really about where the value-add is versus where it's just adding a layer you have to maintain.

**Where Python genuinely helps:**

The file operations at commit time are the strongest case. Renaming files, moving them to trash or a discard folder, writing back to your existing pipeline — these are things your other scripts already do well, and keeping that logic in Python means the workbench output plugs directly into your existing workflow without translation. You're not rebuilding something you already have.

The processed collection index is the second case. Walking 198k files once and building a JSON index is something Python does quickly and reliably with your existing `core_file_collector` and `core_font_metadata` utilities. You could do it in JS too, but you'd be rewriting logic that already exists and is already tested.

**Where Python becomes friction:**

Everything in between. Session state, font parsing, comparison logic, the UI — if that all lives in JS/browser, having Python involved in any of it just means two languages need to agree on data formats and stay in sync. That's maintenance overhead for no gain.

**The natural split then is:**

```
Python does:
  - Launch the browser (like your Playwright script)
  - Build/refresh the processed collection index (run once)
  - Execute the commit manifest (renames, moves, deletions)
  - Nothing else

Browser/JS does:
  - Everything you see and interact with
  - Font parsing via opentype.js
  - All comparison and decision logic
  - Queue management
  - Export the commit manifest when you hit Apply
```

Python is bookends — start and finish. The middle is entirely JS. You could even make the Python involvement optional over time: if someone wanted to run it as a pure browser app without the launcher, the only thing that breaks is the auto-commit, and they could just run the manifest script manually. That's a nice property to have.

**The Playwright comparison is instructive though.** In your font scraper, Playwright is doing real work that JS alone can't — controlling a browser session, navigating pages, intercepting network requests. Python is earning its place there. In the workbench, the launcher pattern is mostly convenience, not necessity. The commit script is genuine value. So I'd frame it as: Python is optional at launch, useful at commit, and should stay out of the middle entirely.

The build guide would then start with the JS index builder and the browser app, and treat the Python launcher and commit script as add-ons you wire in once the core is working. Does that framing feel right before we revise the guide?

---

# you asked

What significantly changes if I didn't have any of the python utilities I've built? Do they really add anything to what this tool would be doing?

---

# claude response

Honestly? Not much for this specific tool.

Your Python utilities are valuable for what they were built to do — modifying font metadata, updating name tables, batch processing file contents. But the workbench doesn't do any of that. It reads, compares, decides, and renames. None of that requires fonttools or any of your core modules.

**What your Python utilities would have contributed:**

The processed collection index scan is the one place they'd have saved time — `core_file_collector` and `core_font_metadata` are already written and tested. But opentype.js can extract the same fields you need for matching and comparison: name records, version, glyph count, feature tags, table presence, head dates. You'd be rewriting maybe 50 lines of extraction logic, not hundreds.

**What you'd lose by dropping them entirely:**

Nothing that matters to this workflow. The name table comparison grid, the matching logic, the file listing — all of that is cleaner in JS given that the whole app is browser-based anyway.

**What this actually means:**

This tool has no meaningful Python dependency. It's a self-contained browser app that happens to output a JSON manifest at the end. The manifest gets consumed by your existing Python scripts — but the workbench itself doesn't need to know or care about them. They're downstream.

The honest answer is that you built those utilities for a different class of problem. They're the right tool when you're modifying fonts. For reading and deciding, opentype.js covers the ground and keeps the whole thing in one language.

So the real question flips — rather than "does Python add anything here," it's "is there any reason not to build this as a pure JS app?" And I can't think of one. Would you want a revised build guide written entirely around that approach?

---

# you asked

[] glyphExtraction.ts

[] AxisExtractor.ts

[] FeatureExtractor.ts

[] FeatureUtils.ts

[] InstanceExtractor.ts

[] MetadataExtractor.ts

[] MetricsExtractor.ts

[] NameExtractor.ts

[] FontValidator.ts

[] glyphUtils.ts

Let's explore pivoting away from python and towards a browser-based app.

Since I'm building a site that's similar to fontgauntlet.com I've explored uploading, parsing and extracting font data. I only upload one font at a time, so these scripts are built to process one file at a time. Which might be the biggest kink in the pipeline.

Regardless, I'm not committed to using these scripts in this build, but they might be a reference point that could be used to help streamline our build approach without having to start from scratch.

---

# claude response

Your existing extractors are genuinely well-built and directly relevant. Looking through them, the pipeline is already doing exactly what the workbench needs — name table extraction, feature extraction, glyph extraction, metrics, validation, axis/instance data for variable fonts. The architecture is solid.

The one-at-a-time limitation you mentioned isn't actually a problem for this use case, it's the right approach. You don't want to parse all 1,847 fonts upfront. You want to parse on demand as you navigate. The existing extractors slot in perfectly to that lazy-loading pattern.

---

**What maps directly to the workbench:**

`FontValidator.ts` — magic byte detection, runs before anything else, handles your corrupt/problem file detection without even needing to fully parse.

`NameExtractor.ts` — the merged opentype/fontkit name table is exactly what feeds the matching logic. Family name, PS name, version string, preferred names.

`MetadataExtractor.ts` — feeds the comparison panel directly. familyName, subfamilyName, postscriptName, version, preferredFamily, preferredSubfamily.

`FeatureExtractor.ts` — feeds the Features tab in the detail panel. The category sorting in `FeatureUtils.ts` is already done.

`glyphExtraction.ts` — feeds the Glyphs tab. Already GSUB-aware which is more than you'd get from a simple glyph count.

`MetricsExtractor.ts` — not critical for decision-making but available for the detail panel.

`AxisExtractor.ts` + `InstanceExtractor.ts` — variable font support, useful for flagging variable fonts in the family view.

---

**The one genuine adaptation needed:**

Your extractors take a `ParsedFont` object that comes from `FontLoader.ts` / `FontParser.ts` — a single-file load pipeline. The workbench needs to run that same pipeline against files coming from the File System Access API rather than a file input element. That's a thin adapter, not a rewrite. Instead of `file.arrayBuffer()` from an input event, you get `fileHandle.getFile().then(f => f.arrayBuffer())` from the directory handle. Same ArrayBuffer at the end, same extractors downstream.

---

**What the workbench-specific layer adds on top:**

The extractors give you per-file data. The workbench needs a thin layer above that for:

- The processed collection index — scan once, store family/PS name/version/glyph count per file in IndexedDB, use for matching without re-parsing
- The matching logic — compare unprocessed file metadata against the index
- The rename/removal queue — in-memory during session, exported as JSON manifest on Apply

None of that touches your extractors. They stay exactly as-is.

---

**Suggested build order given what you already have:**

**Stage 1 — File System Access adapter**
Wire `showDirectoryPicker()` to produce `FileSystemFileHandle` objects, add the thin adapter that feeds them into your existing `FontLoader` pipeline. Verify a single font parses correctly end-to-end through your existing extractors. This is the integration proof-of-concept — once this works, everything else follows.

**Stage 2 — Processed collection indexer**
Lazy-scan the processed directory, extract just the matching fields (PS name, family, version, glyph count, file path) per file, store in IndexedDB. This runs once and persists. Add a rescan trigger for when the collection changes.

**Stage 3 — Family grouping and sidebar**
Group unprocessed files by family name. Classify each family against the index (matched/new/conflict). Build the sidebar. This is pure logic, no UI complexity yet.

**Stage 4 — File table with inline editing**
The main table view per family. Lazy-parse each file as you navigate to it. Inline filename editing. Duplicate highlighting. Checkbox selection.

**Stage 5 — Detail panel**
Wire Compare, Features, and Glyphs tabs to your existing extractors. These are already built — it's mostly presentation work.

**Stage 6 — Queue and Apply**
Rename queue, removal queue, JSON manifest export. The Apply button either executes renames via the File System Access write API directly, or exports the manifest for your existing scripts.

---

The fact that you've already built the hard part — the extraction layer — means the workbench is mostly UI and orchestration work sitting on top of proven parsing code. Does this framing work as the basis for a revised build guide?

---

# you asked

[] FontSelector.tsx

[] filesystem.d.ts

[] extractors.types.ts

[] font.types.ts

[] fontkit.d.ts

I may already have that as well.

---

# claude response

You do. And this changes the build picture significantly.

Looking at `FontSelector.tsx`, you've already solved the hardest integration problem. The `showOpenFilePicker` / `showDirectoryPicker` pattern is implemented, the `FileSystemFileHandle` type definitions are complete in `filesystem.d.ts`, the live watch pattern is working, and `loadFontFile(file, fileHandle)` is already the entry point into your extraction pipeline.

The workbench isn't a new project. It's a new view built on infrastructure you already have.

---

**What you actually need to build:**

The extraction engine, the File System Access API wiring, the `ParsedFont` abstraction, the type system — all exists. The `CachedFont` type in `font.types.ts` already carries everything the workbench needs: `metadata`, `misc` (which has `glyphCount`, `availableTables`, `vendorID`), `featureDetails`, `axes`, `format`, `fileName`.

What doesn't exist yet is:

**1. Directory-mode scanning** — `FontSelector` opens single files via `showOpenFilePicker`. The workbench needs `showDirectoryPicker` and recursive iteration over `FileSystemDirectoryHandle`. The iteration pattern is in your `filesystem.d.ts` already (`entries()`, `values()`, `keys()` as async iterators). This is new code but it's a thin layer.

**2. The processed collection index** — scan once, store lightweight records in IndexedDB. Each record needs: `filePath`, `fileName`, `familyName`, `psName`, `version`, `glyphCount`, `availableTables`. This is a stripped-down `CachedFont` — call it `IndexRecord`.

**3. The matching and classification logic** — compare unprocessed `CachedFont` against `IndexRecord[]`. Pure functions, no UI dependency.

**4. The workbench UI itself** — the views you've been refining in the mockups.

**5. The rename/removal queue and Apply** — in-memory queue, write via `FileSystemWritableFileStream` (already typed in `filesystem.d.ts`), or export JSON manifest.

---

**The key architectural question before writing the build guide:**

Your existing app is React + TypeScript with a store pattern (`fontStore`, `uiStore`). The workbench is a different enough context — multiple fonts, two collections, family grouping, a queue — that it probably warrants its own store rather than extending `fontStore`.

Two options:

**Option A — Separate workbench store** (`workbenchStore.ts`). Keeps the workbench isolated from your existing font viewer. Clean separation, no risk of breaking what works. The workbench becomes essentially a second app that shares the extraction engine.

**Option B — Extend existing stores**. Add workbench-specific state to `fontStore`. More integration but higher risk of coupling things that should stay separate.

Option A is almost certainly right here. The workbench has fundamentally different state — two directories, a family index, a decision queue, rename operations — none of which belongs in a single-font viewer store.

Does that match how you're thinking about the project structure? And is this a new route/page within your existing app, or a standalone build?

---

# you asked

I think what I need now is a guide that my agentic developer can follow to borrow from Fontrapunkt-2 (my fontgauntlet.com clone) to build a new browser-based app with your design and functionality.

My agent is not very strong when it come to building websites (I also have a lot of annoying requests that it tries to adhere to), but I'll allow you to set the design guidance (and if that includes using specific frameworks and APIs, that's understood). I just want to build something that will work without having to spend a lot of time making tweaks and modifications (that's fun but also ends up creating so many tangents that I lose focus and the tool becomes a quagmire of loose ends that I end up not using it).

---

# claude response

This is the right call — a focused build guide with clear direction prevents the tangent problem. Let me write something your agent can follow without ambiguity.

---

# Font Workbench — Agent Build Guide

## Project overview

A standalone browser-based tool for comparing and triaging font files. Built as a separate app that borrows the extraction engine from Fontrapunkt-2. No server. No Python. Runs locally in Chrome.

---

## Tech stack — no debates, use these

- **React 18** with TypeScript
- **Vite** as the build tool
- **Zustand** for state (same pattern as Fontrapunkt-2)
- **opentype.js + fontkit** for font parsing (already working in Fontrapunkt-2)
- **File System Access API** for directory access (already typed in `filesystem.d.ts`)
- **IndexedDB** via `idb` (npm package) for the processed collection index
- **CSS Modules** for styling (same as Fontrapunkt-2)

No Tailwind. No UI component libraries. No additional dependencies beyond these.

---

## Project structure

Create as a sibling project to Fontrapunkt-2, not inside it.

```
font-workbench/
  src/
    engine/           ← copied from Fontrapunkt-2, do not modify
    types/            ← copied from Fontrapunkt-2, do not modify
    store/
      workbenchStore.ts
    lib/
      directoryScanner.ts
      indexBuilder.ts
      matcher.ts
      renameQueue.ts
    views/
      Setup/
      Workbench/
        FamilySidebar/
        FileTable/
        DetailPanel/
    styles/
      tokens.css
      global.css
    App.tsx
    main.tsx
```

### What to copy from Fontrapunkt-2 (copy, do not rewrite)

Copy these directories verbatim into `font-workbench/src/engine/` and `font-workbench/src/types/`:

- All extractor files: `NameExtractor`, `MetadataExtractor`, `FeatureExtractor`, `MetricsExtractor`, `MiscExtractor`, `AxisExtractor`, `InstanceExtractor`, `glyphExtraction`
- `FontLoader.ts`, `FontParser.ts`, `FontkitParser.ts`, `OpentypeParser.ts`, `RawTableParser.ts`
- `FontValidator.ts`
- All type files: `extractors.types.ts`, `font.types.ts`, `filesystem.d.ts`, `fontkit.d.ts`

These files are the extraction engine. The workbench calls them, never modifies them.

---

## Stage 1 — Project scaffold and engine wiring

**Goal:** Vite project runs, imports compile, one font file parses successfully through the copied engine.

**Steps:**

1. `npm create vite@latest font-workbench -- --template react-ts`
2. Install dependencies: `npm install zustand opentype.js fontkit idb`
3. Copy engine and type files as described above
4. Create `src/lib/directoryScanner.ts` — this is the only new engine-level file needed at this stage

**`directoryScanner.ts`** — implement these two functions only:

```typescript
// Recursively collect all FileSystemFileHandle objects from a directory
// that have font extensions (.ttf, .otf, .woff, .woff2)
export async function collectFontHandles(
  dirHandle: FileSystemDirectoryHandle
): Promise<FileSystemFileHandle[]>

// Given a FileSystemFileHandle, load and parse it through
// the existing FontLoader pipeline, returning a CachedFont
// This is the same call as FontSelector.tsx line ~45:
// const file = await fileHandle.getFile()
// const cachedFont = await loadFontFile(file, fileHandle)
export async function parseFontHandle(
  handle: FileSystemFileHandle
): Promise<CachedFont | null>
```

**Verification:** Write a temporary button that calls `showDirectoryPicker`, passes the result to `collectFontHandles`, takes the first handle, calls `parseFontHandle`, and logs the resulting `CachedFont` to the console. Confirm family name, glyph count, and feature list are populated. Delete the test button when passing.

---

## Stage 2 — Processed collection index

**Goal:** Scan the processed directory once, store a lightweight index in IndexedDB, retrieve it on subsequent loads without rescanning.

**Create `src/lib/indexBuilder.ts`**

Define `IndexRecord` — this is the only stored type:

```typescript
interface IndexRecord {
  filePath: string       // full path as string for display
  fileName: string       // e.g. "Eastman-Medium.otf"
  familyName: string     // name ID 1 or 16
  psName: string         // name ID 6
  version: string        // name ID 5
  fontRevision: number   // head.fontRevision as float
  glyphCount: number     // from misc.glyphCount
  availableTables: string[] // from misc.availableTables
  format: string         // 'otf' | 'ttf' | 'woff' | 'woff2'
}
```

Implement these functions:

```typescript
// Scan directory, parse each font lazily, store IndexRecords in IndexedDB
// Progress callback receives { scanned, total, currentFile }
export async function buildIndex(
  dirHandle: FileSystemDirectoryHandle,
  onProgress: (p: Progress) => void
): Promise<void>

// Load existing index from IndexedDB
// Returns null if no index exists
export async function loadIndex(): Promise<IndexRecord[] | null>

// Clear and rebuild
export async function rebuildIndex(
  dirHandle: FileSystemDirectoryHandle,
  onProgress: (p: Progress) => void
): Promise<void>
```

**IndexedDB schema** (use `idb` package):

```
database: 'font-workbench'
store: 'processed-index'   ← IndexRecord[], keyed by fileName
store: 'app-config'        ← { processedDirName, unprocessedDirName, lastIndexed }
```

**Important:** Do not store `ArrayBuffer` in IndexedDB. `IndexRecord` contains only strings and numbers. The actual font files stay on disk and are only read when needed.

**Verification:** Run the index builder against your processed collection. Query IndexedDB in DevTools Application tab. Confirm records exist and fields are populated correctly. Check that reloading the page retrieves the index without rescanning.

---

## Stage 3 — Matching logic

**Goal:** Pure functions that classify each unprocessed file against the index. No UI yet.

**Create `src/lib/matcher.ts`**

```typescript
// Match levels in priority order
type MatchLevel = 'L1_PS_NAME' | 'L2_FULL_NAME' | 'L3_FAMILY_STYLE' | 'L4_FAMILY_ONLY' | 'L5_NO_MATCH'

// Suggested actions
type SuggestedAction = 'SKIP' | 'UPGRADE' | 'REVIEW' | 'NEW' | 'CONFLICT' | 'PROBLEM'

interface MatchResult {
  level: MatchLevel
  action: SuggestedAction
  matchedRecord: IndexRecord | null
  versionDelta: number        // unprocessed revision minus processed revision
  glyphDelta: number          // positive = unprocessed has more
  flags: MatchFlag[]          // see below
}

type MatchFlag =
  | 'TILDE_COUNTER'           // filename contains ~001 pattern
  | 'TRIAL_KEYWORD'           // filename contains Trial/Beta/Test/Demo
  | 'VERSION_NEWER'           // unprocessed version is higher
  | 'VERSION_OLDER'           // unprocessed version is lower
  | 'GLYPH_COUNT_HIGHER'      // delta > 50
  | 'GLYPH_COUNT_LOWER'       // delta < -50
  | 'EXTRA_TABLES'            // unprocessed has tables processed does not
  | 'MISSING_TABLES'          // processed has tables unprocessed does not
```

Implement `matchFont(cachedFont: CachedFont, index: IndexRecord[]): MatchResult`

**Action logic:**

```
CONFLICT   → TILDE_COUNTER flag present (always, regardless of other signals)
PROBLEM    → cachedFont failed to parse, or glyphCount === 0
SKIP       → match L1-L3, versionDelta <= 0, no GLYPH_COUNT_HIGHER flag
UPGRADE    → match L1-L3, VERSION_NEWER or GLYPH_COUNT_HIGHER
REVIEW     → match L1-L3, signals contradict (newer version but fewer glyphs, etc.)
             OR match L4 (family only, style not found)
NEW        → L5, no match at all
```

Also implement `groupByFamily(fonts: CachedFont[]): Map<string, CachedFont[]>` — groups by `metadata.preferredFamily ?? metadata.familyName`.

**Verification:** Write a unit test file `matcher.test.ts`. Test each action case with mock `CachedFont` and `IndexRecord` objects. All cases should return the expected action before any UI is built.

---

## Stage 4 — Workbench store

**Goal:** Central state that the UI will read from. No UI yet.

**Create `src/store/workbenchStore.ts`** using Zustand.

State shape:

```typescript
interface WorkbenchState {
  // Directory handles (persisted across page reloads via IndexedDB)
  processedDirHandle: FileSystemDirectoryHandle | null
  unprocessedDirHandle: FileSystemDirectoryHandle | null

  // Data
  processedIndex: IndexRecord[]
  unprocessedFonts: CachedFont[]           // all parsed unprocessed fonts
  familyGroups: Map<string, CachedFont[]>  // grouped by family
  matchResults: Map<string, MatchResult>   // keyed by CachedFont.id

  // UI state
  selectedFamilyName: string | null
  selectedFontId: string | null
  activeDetailTab: 'compare' | 'features' | 'glyphs'
  isIndexBuilding: boolean
  indexBuildProgress: Progress | null
  isScanning: boolean

  // Queue
  renameQueue: Map<string, string>  // fontId -> new stem (without extension)
  removalQueue: Set<string>         // fontId

  // Actions
  setProcessedDir(handle: FileSystemDirectoryHandle): Promise<void>
  setUnprocessedDir(handle: FileSystemDirectoryHandle): Promise<void>
  scanUnprocessed(): Promise<void>
  selectFamily(name: string): void
  selectFont(id: string): void
  queueRename(fontId: string, newStem: string): void
  queueRemoval(fontId: string): void
  cancelQueueItem(fontId: string): void
  applyAll(): Promise<void>
  rebuildIndex(): Promise<void>
}
```

**Verification:** Import the store in `App.tsx`, call `setUnprocessedDir` with a test handle, confirm state updates. No UI required at this stage.

---

## Stage 5 — Setup view

**Goal:** The first screen a user sees. Two directory pickers. Leads into the main workbench.

**Create `src/views/Setup/Setup.tsx`**

Layout: centered, minimal. Two rows, each with a label, a directory name display, and a "Choose" button. A "Start" button that activates once both directories are selected.

Behaviour:
- "Choose" calls `showDirectoryPicker({ mode: 'readwrite' })` for unprocessed (needs write for renames), `showDirectoryPicker({ mode: 'read' })` for processed
- Store handles in workbench store
- If IndexedDB has a saved config with directory names, show them pre-filled with a note "Index from [date] — Rescan to refresh"
- "Start" triggers `scanUnprocessed()` and transitions to the Workbench view
- Show a progress bar during index build if index doesn't exist yet

**Note for agent:** Directory picker permission handles cannot be serialised to IndexedDB. Store the directory *name* string for display, but the user must re-pick directories each session. This is a browser security requirement, not a bug.

---

## Stage 6 — Workbench view and family sidebar

**Goal:** The main layout. Family list on the left, file table on the right. Bottom panel collapsed by default.

**Layout structure:**

```
<WorkbenchLayout>
  <Titlebar />            ← logo, collection stats, Apply button
  <ContentArea>
    <FamilySidebar />     ← family list with status dots
    <FileArea>
      <TableToolbar />    ← family name, file counts, status, Select Duplicates
      <ColumnHeader />    ← sortable column labels
      <FileTable />       ← the rows
    </FileArea>
  </ContentArea>
  <DetailPanel />         ← collapsed by default, tabs: Compare / Features / Glyphs
  <Statusbar />           ← ready state, pending changes count
</WorkbenchLayout>
```

**FamilySidebar:**
- List of family names from `familyGroups`
- Each item shows: status dot (amber=review, blue=new, violet=conflict, dim=skip), family name, file count
- Clicking selects the family, updates `selectedFamilyName` in store
- Search input filters the list
- Status dot color is the worst action in that family's match results (conflict > review > new > skip)

**Verification:** Family sidebar populates from store, clicking a family updates selected state, search filters correctly.

---

## Stage 7 — File table

**Goal:** The rows. Two sections per family — unprocessed files, then matched processed files below.

**FileTable rows:**

Columns in order: checkbox, filename (editable input), version, created date, glyph count, feature count, file size, format badge.

**Filename cell behaviour:**
- Renders as a text input, not a div
- `defaultValue` set to filename stem (without extension)
- On change: if value differs from original, add `data-modified` attribute, call `queueRename` in store
- Modified filenames display in amber, font-weight 500
- Extension displays as non-editable span after the input
- On blur with empty value: reset to original

**Duplicate rows:**
- Rows where `MatchFlag` includes `TILDE_COUNTER` get `data-duplicate="true"` CSS attribute
- Background: warm amber tint (`#1c1a12`), left border: amber
- A `~001` badge appears in the filename cell

**Section headers:**
- Sticky, background slightly darker than rows
- "Unprocessed — N files" and "Processed — Matched Collection — N files ✓ Count matches" (or "⚠ Count differs")
- Processed rows are read-only, 65% opacity, no checkbox

**Select Duplicates button:** checks all checkboxes on rows with `data-duplicate="true"`

**Queue Removal button:** calls `queueRemoval` for all checked rows, rows get `data-queued-remove="true"`, display with strikethrough and reduced opacity

**Verification:** Edit a filename, confirm store queue updates. Check Select Duplicates, confirm only tilde rows selected. Queue removal, confirm visual state.

---

## Stage 8 — Detail panel

**Goal:** Bottom panel with three tabs. Only populates when a row is selected.

**Three tabs:**

**Compare tab:**
Two columns, side by side. Left = selected unprocessed file. Right = its matched processed file (or "No match" state).

Each column shows:
- Filename
- Version (highlight in amber if different)
- Created date
- Glyph count (highlight in green if unprocessed is higher, red if lower)
- Feature count (same highlight logic)
- File size
- Format
- Table list as chips — green chip if both have it, blue chip if only this file has it, dim if only the other has it

Data comes from the already-parsed `CachedFont` (unprocessed) and a lazy parse of the matched `IndexRecord`'s file on demand.

**Features tab:**
Two columns. Each lists OpenType feature tags as chips with their full names (use `getFeatureName` from `FeatureUtils.ts`). Chips shared by both files are green, chips only in this file are blue. Count shown in column header.

**Glyphs tab:**
Two columns. Each shows a grid of glyph cells rendered using the actual font via `@font-face` injection. Use `extractGlyphsFromFont` from `glyphExtraction.ts` to get the glyph list. Render the character in each cell using an inline style that sets `font-family` to the injected face. Cell size 28×28px.

**Panel collapse:** Toggle button in tab bar. Collapsed height is 36px (tabs only visible). Expanded height 280px. CSS transition on height.

**Verification:** Select a row, confirm Compare tab populates. Switch tabs, confirm Features and Glyphs render. Collapse and expand panel.

---

## Stage 9 — Apply

**Goal:** Execute queued renames and removals. Single confirmation step.

**Apply button** in titlebar:
- Idle state (no queue): ghost button style, disabled appearance
- Active state (queue > 0): amber background, shows count badge
- Click: show a confirmation modal listing all pending operations before executing

**`applyAll()` in store:**

Renames:
```typescript
// For each entry in renameQueue:
const handle = unprocessedFontHandles.get(fontId)
const file = await handle.getFile()
const parent = await getParentHandle(handle)  // requires stored parent reference
// File System Access API does not have a rename method
// Write approach: create new file, write content, delete old file
const newHandle = await parent.getFileHandle(newName, { create: true })
const writable = await newHandle.createWritable()
await writable.write(file)
await writable.close()
await parent.removeEntry(file.name)
```

**Important note for agent:** The File System Access API has no native rename. The above write-new-delete-old pattern is the correct approach. Store the parent `FileSystemDirectoryHandle` alongside each file handle when scanning so `getParentHandle` is trivially a map lookup, not a tree traversal.

Removals:
- Move to a `_workbench_trash/` subdirectory within the unprocessed directory rather than permanent deletion
- Create the directory if it doesn't exist: `dirHandle.getDirectoryHandle('_workbench_trash', { create: true })`
- Same write-then-remove pattern

**After apply:**
- Clear queues
- Re-run `scanUnprocessed()` to reflect the new filenames
- Show a brief success toast in the statusbar

---

## Design tokens

Create `src/styles/tokens.css` — import this in `global.css`, reference everywhere via CSS custom properties:

```css
:root {
  --bg-base:    #0f1012;
  --bg-2:       #141517;
  --bg-3:       #191b1e;
  --bg-4:       #1e2023;

  --border:     #252729;
  --border-2:   #2e3033;

  --text:       #dde1e7;
  --text-2:     #7f8590;
  --text-3:     #454a52;
  --mono:       #c5cad3;

  --green:      #2dd4a0;
  --green-bg:   #0d2e22;
  --amber:      #f5a623;
  --amber-bg:   #2a1e06;
  --blue:       #4d9cff;
  --blue-bg:    #0e2040;
  --red:        #ff5e5e;
  --red-bg:     #2a0e0e;
  --violet:     #a78bfa;
  --violet-bg:  #1e1030;

  --font-mono:  'Geist Mono', 'JetBrains Mono', monospace;
  --font-sans:  'Geist', system-ui, sans-serif;

  --radius-sm:  3px;
  --radius-md:  5px;
}
```

Load Geist and Geist Mono from Google Fonts in `index.html`.

---

## Things the agent must not do

- Do not add animation libraries
- Do not add a CSS framework
- Do not add React Query, SWR, or any data fetching library — all async work goes through Zustand actions
- Do not add a router — this app has two views (Setup, Workbench), use a single state flag `appView: 'setup' | 'workbench'` in the store
- Do not split CSS into atomic utilities — use CSS Modules per component
- Do not modify any copied engine files from Fontrapunkt-2
- Do not add a testing framework beyond what Vite provides — the matcher unit test uses `console.assert` inline, not Jest
- Do not add ESLint or Prettier configuration — inherit from the existing project if needed

---

## Completion criteria per stage

Each stage is done when:
1. No TypeScript errors (`tsc --noEmit` passes)
2. The verification step described in that stage passes manually in the browser
3. No console errors at runtime

Move to the next stage only when the current one fully passes. Do not combine stages.

---

# you asked

I use Biome for my linting. This looks pretty solid. I'll give this outline to my agent now and see how well it works.

---

# claude response

Good catch — add this to the "Things the agent must not do" section:

> Do not add ESLint, Prettier, or any linting/formatting configuration. This project uses Biome. If the agent needs to reference a config, copy `biome.json` from Fontrapunkt-2 as-is.

One other thing worth flagging before you hand it off: the trickiest stage will be **Stage 2** (index builder). Scanning 198k files lazily sounds straightforward but the agent may try to parse all of them eagerly and lock up the browser. If you see it doing that, the fix is to process files in batches with `await new Promise(r => setTimeout(r, 0))` between chunks to yield back to the main thread. Worth watching for that specifically.

Good luck — curious to hear how far the agent gets before it needs intervention.

---

# you asked

Here's a summary of the build, so far and a screenshot of the current page after uploading 2 test directories:
Summary of what’s in place for **Stage 1** and **Stage 2**:
---
## Stage 1 — Project scaffold and engine wiring
**Goal:** Vite app runs, engine is wired, one font parses end-to-end.
**What’s there:**
- **Project:** `font-workbench/` under Website Builds (sibling to Fontrapunkt-2). React + TypeScript + Vite; deps: zustand, opentype.js, fontkit, idb, pako, woff2-encoder, wawoff2, uuid, buffer, vite-plugin-node-polyfills.
- **Engine (copied, not edited):** Full `src/engine/` (FontLoader, TwoPhaseLoader, FontParser, parsers, extractors, cache, resolvers, utils), `src/workers/fontParser.worker.ts`, and `src/types/` (extractors.types, font.types, filesystem.d.ts, fontkit.d.ts). Minimal `src/utils/` (debug, fontUtils, woffDecompressor) and stub stores so FontLoader’s reload path resolves.
- **`src/lib/directoryScanner.ts`:**
  - **`collectFontHandles(dir)`** — Recursively scans a directory (with `requestPermission` and explicit iterator so all entries are seen), returns `FileSystemFileHandle[]` for `.ttf` / `.otf` / `.woff` / `.woff2`.
  - **`parseFontHandle(handle)`** — `getFile()` then `loadFontFile(file, handle)`; returns `CachedFont | null`.
- **Verification UI:** “Pick directory & parse first font” runs the picker → `collectFontHandles` → `parseFontHandle(handles[0])` and shows “OK (1 of N): &lt;family&gt; — &lt;glyphs&gt; glyphs, &lt;features&gt; features” plus the full list of N filenames. Confirms we collect all fonts and parse one through the engine.
---
## Stage 2 — Processed collection index
**Goal:** Scan the “processed” directory once, store a small index in IndexedDB, reuse it on later loads without rescanning.
**What’s there:**
- **`src/lib/indexBuilder.ts`:**
  - **`IndexRecord`** — One row per font: `filePath`, `fileName`, `familyName`, `psName`, `version`, `fontRevision`, `glyphCount`, `availableTables`, `format`. No `ArrayBuffer`, only strings/numbers.
  - **`Progress`** — `{ scanned, total, currentFile }` for progress.
  - **`AppConfig`** — Single config row: `processedDirName`, `unprocessedDirName`, `lastIndexed`.
  - **IndexedDB** (via `idb`): DB name `font-workbench`, version 1.
    - Store **`processed-index`**: keyPath `fileName`, value `IndexRecord`; index `by-familyName`.
    - Store **`app-config`**: keyPath `id`; one row with `id: "config"`.
  - **`buildIndex(dirHandle, onProgress)`** — Recursively collects font handles + paths, parses each with `parseFontHandle`, builds `IndexRecord` (including `fontRevision` from head table), then in **one short transaction** writes all records to `processed-index`, then writes app config (processedDirName, lastIndexed). No long async work inside the transaction (fixes “transaction has finished”).
  - **`loadIndex()`** — Returns all `IndexRecord[]` from `processed-index`, or `null` if empty.
  - **`rebuildIndex(dirHandle, onProgress)`** — Clears `processed-index`, then runs `buildIndex`.
  - **`getAppConfig()`** — Returns the single app config row or `null`.
- **Verification UI:** On load, app calls `loadIndex()` and `getAppConfig()` and shows “Index: N records (last built &lt;date&gt;).” or “No index. Build index to populate.” “Build index (Stage 2)” runs the picker → `buildIndex` with progress (“Indexing… 3/12 — …”) → “Index built: N records. Reload page to load from IDB.”
**Result:** Processed directory is scanned once; index lives in IndexedDB; reload restores it without rescanning. Ready to feed **Stage 3** (matching unprocessed fonts against this index).

---

# claude response

Stages 1 and 2 are working cleanly — the index is persisting and reloading correctly, which is the foundation everything else builds on. The agent did well staying focused.

A few things to watch as you hand off Stage 3:

The `fontRevision` field from the head table is the right number to use for `versionDelta` comparisons, not the version string from name ID 5. Version strings are inconsistently formatted across foundries (`Version 2.000`, `2.0`, `v2`, etc.) and will cause false matches. `fontRevision` is a float in the head table that's reliably comparable. Make sure the matcher uses `IndexRecord.fontRevision` directly.

The `by-familyName` index you added in Stage 2 is good — Stage 3's `groupByFamily` should query against that rather than loading all records and filtering in memory. At 198k records that distinction matters.

One thing the summary doesn't mention: did the agent store the parent `FileSystemDirectoryHandle` alongside each file handle during the Stage 2 scan? That's needed in Stage 9 for the write-new-delete-old rename pattern. If it didn't, it's worth adding a `Map<string, FileSystemDirectoryHandle>` to the scanner output now while the scan logic is fresh, rather than retrofitting it later.

Otherwise this looks exactly right. Stage 3 is pure logic with no UI dependencies — it should be one of the cleaner stages for the agent to get through. The verification step (console.assert tests for each action case) is worth enforcing strictly before moving to Stage 4, since the matching logic is the core of the whole tool.

---

# you asked

I'm curious why the agent is using table row/data/cell for styling at all. Haven't we replaced that with grid/flexbox styling? I'm just kind of surprised is all.

I'll give your recommendations to my agent and hopefully that'll get us back on track.

---

# claude response

Let me read the current state of the code before advising.

Good — I have a clear picture now. The structure is solid, the logic is mostly right, but there are three distinct problems the agent needs to fix. Let me give you a targeted correction guide rather than a full rewrite.

---

# Font Workbench — Correction Guide

## Problem 1: Visual design — the table rows have too much padding and wrong density

The biggest visual difference between the screenshots and the prototype is row height. The agent used `var(--space-sm) var(--space-md)` padding on `th` and `td`, which is too generous. The prototype targets 34px row height with tight padding.

**In `FileTable.module.css`, replace all `th` and `td` padding:**

```css
.table th,
.table td {
  padding: 0 10px;
  text-align: left;
  border-bottom: 1px solid #16181a;
  height: 34px;
  vertical-align: middle;
}
```

Also fix the `tableScroll` — remove the padding that's pushing content away from edges:

```css
.tableScroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}
```

The `tableScroll` should have no padding. The table itself provides horizontal spacing via cell padding.

---

## Problem 2: The Family/Match/Actions columns shouldn't exist

Looking at the screenshots, the agent added `Family`, `Match`, and `Actions` as table columns. These should not be columns. The design intent is:

- **Family name** is visible in the sidebar when you filter by family, and in the TableToolbar when a family is selected. It does not need its own column — this creates a wide, sparse table.
- **Match/action** (Skip, Conflict, etc.) belongs in the `WATCH` column position, but only shows for the currently selected context — it should not be a persistent column that makes every row show "Conflict" in a red badge.
- **Actions** (the Remove button) is correct to have but it should be a compact icon or minimal text, not a full-width button cell.

**In `FileTable.tsx`, remove the `<th>` and `<td>` cells for Family, Match, and Actions columns**, and replace the Remove button with something inline in the filename cell or as a hover-reveal action. The current table has 11 columns — it should have 8: Select, Filename, Version, Created, Glyphs, Feat., Size, Type.

The match action indicator should move to the `WATCH` position in the TableToolbar status line, not per-row.

---

## Problem 3: The detail panel is incomplete — two specific gaps to close

**Gap A: Features tab shows processed side as placeholder**

In `DetailPanel.tsx` the Features tab right column says "Feature list from index not shown here yet." Fix this by storing feature tags in `IndexRecord`. 

Add `featureTags: string[]` to the `IndexRecord` interface in `indexBuilder.ts`:

```typescript
interface IndexRecord {
  // ... existing fields
  featureTags: string[]   // font.features ?? []
}
```

Populate it in `buildIndex` the same way `glyphCount` is populated. Then in the Features tab, render the matched record's `featureTags` the same way the unprocessed side renders `font.features`.

To show shared vs. unique features, compute the intersection client-side in the component:

```typescript
const unprocessedTags = new Set(selected.font.features ?? [])
const processedTags = new Set(matchedRecord?.featureTags ?? [])
const shared = [...unprocessedTags].filter(t => processedTags.has(t))
const onlyUnprocessed = [...unprocessedTags].filter(t => !processedTags.has(t))
const onlyProcessed = [...processedTags].filter(t => !unprocessedTags.has(t))
```

Apply the chip color classes accordingly: `tblChipShared` for shared, `tblChipOnly` for exclusive to that side.

**Gap B: Glyphs tab is a placeholder**

The glyph grid requires injecting a `@font-face` rule and rendering characters. Here is the exact pattern to use:

```typescript
// In DetailPanel.tsx, add this hook:
function useInjectedFont(font: CachedFont | null): string | null {
  const [fontFamily, setFontFamily] = useState<string | null>(null)

  useEffect(() => {
    if (!font?.fileData) return
    const id = `wb-preview-${font.id}`
    const existing = document.getElementById(id)
    if (existing) { setFontFamily(id); return }

    const blob = new Blob([font.fileData], { type: 'font/otf' })
    const url = URL.createObjectURL(blob)
    const style = document.createElement('style')
    style.id = id
    style.textContent = `@font-face { font-family: "${id}"; src: url("${url}"); }`
    document.head.appendChild(style)
    setFontFamily(id)

    return () => URL.revokeObjectURL(url)
  }, [font?.id, font?.fileData])

  return fontFamily
}
```

Then in the Glyphs tab, call `useInjectedFont(selected.font)` and render a basic character grid:

```tsx
const fontFamily = useInjectedFont(selected?.font ?? null)

// In the glyphs tab JSX:
<div className={styles.glyphGrid}>
  {PREVIEW_CHARS.map(char => (
    <div
      key={char}
      className={styles.glyphCell}
      style={fontFamily ? { fontFamily: `"${fontFamily}"` } : undefined}
    >
      {char}
    </div>
  ))}
</div>
```

Where `PREVIEW_CHARS` is defined outside the component:

```typescript
const PREVIEW_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&?ÀÁÂÄÇÉÑÖÜàáâäçéñöü'.split('')
```

For the processed side, the glyph grid can't render without loading the file — keep it as a glyph count display for now with a note "Open in viewer to inspect glyphs." That's an honest limitation, not a placeholder.

---

## Problem 4: The two-section layout (Unprocessed / Processed) is missing from the table

The current `FileTable` only shows unprocessed rows. The prototype shows both sections in the same scrollable table — unprocessed rows first, then a second sticky section header "Processed — Matched Collection", then the matched processed files at reduced opacity.

For each selected family, the processed section should show the matched `IndexRecord`s. Add this after the unprocessed `<tbody>`:

```tsx
{/* Processed section */}
{matchedProcessedRecords.length > 0 && (
  <>
    <tbody>
      <tr>
        <td colSpan={8} className={styles.sectionHeaderRow}>
          <span className={styles.sectionLabel}>Processed — Matched Collection</span>
          <span className={styles.sectionCount}>{matchedProcessedRecords.length} files</span>
          {itemsToShow.length === matchedProcessedRecords.length
            ? <span className={styles.countMatch}>✓ Count matches</span>
            : <span className={styles.countMismatch}>⚠ Count differs</span>
          }
        </td>
      </tr>
    </tbody>
    <tbody className={styles.processedSection}>
      {matchedProcessedRecords.map(record => (
        <tr key={record.fileName} className={styles.rowProcessed}>
          <td className={styles.cellCheck} /> {/* no checkbox */}
          <td className={styles.cellName}>
            <span className={styles.fnameStem}>{splitStemExt(record.fileName).stem}</span>
            <span className={styles.fnameExt}>{splitStemExt(record.fileName).ext}</span>
          </td>
          <td><span className={styles.cv}>{record.version}</span></td>
          <td><span className={styles.cv}>—</span></td>
          <td className={styles.cellGlyphs}><span className={styles.cv}>{record.glyphCount}</span></td>
          <td className={styles.cellFeat}><span className={styles.cv}>—</span></td>
          <td className={styles.cellSize}><span className={styles.cv}>—</span></td>
          <td className={styles.cellType}>
            <span className={`${styles.typeBadge} ${styles[TYPE_BADGE_CLASS[record.format] ?? 'typeOtf']}`}>
              {record.format.toUpperCase()}
            </span>
          </td>
        </tr>
      ))}
    </tbody>
  </>
)}
```

Add to CSS:

```css
.processedSection tr {
  opacity: 0.65;
}

.rowProcessed td {
  pointer-events: none;
}

.countMatch {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--wb-green);
  margin-left: 8px;
}

.countMismatch {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--wb-amber);
  margin-left: 8px;
}
```

`matchedProcessedRecords` is computed from `processedIndex` filtered to the current family:

```typescript
const matchedProcessedRecords = useMemo(() =>
  processedIndex.filter(r => r.familyName === selectedFamily),
  [processedIndex, selectedFamily]
)
```

---

## Summary for the agent

Four targeted changes, in order of priority:

1. **CSS density** — fix row height and remove excess padding from `tableScroll`
2. **Remove surplus columns** — strip Family, Match, Actions columns from the table; 8 columns only
3. **Add processed section** — second sticky section header + dimmed processed rows below unprocessed rows
4. **Complete the detail panel** — add `featureTags` to `IndexRecord`, implement feature comparison with shared/exclusive chip colors, implement glyph grid with `@font-face` injection

Do not refactor the store or matcher for these changes. All four fixes are UI-layer only except adding `featureTags` to `IndexRecord`, which requires a one-line addition to `indexBuilder.ts` and a one-line addition to the `buildIndex` function.

---

# claude response

Totally valid observation. HTML `<table>` elements aren't wrong for tabular data — semantically they're actually correct here since you're displaying rows of structured font records with comparable columns. Screen readers and accessibility tools understand table semantics well.

That said, the practical reality is that `<table>` is harder to control for the kind of dense, custom-styled rows the mockup shows. Sticky section headers, variable column widths, the editable filename cell that needs to stretch flexibly, duplicate row highlighting with left border accents — all of that is more straightforward with CSS Grid or Flexbox rows where you have full layout control without fighting table's formatting model.

The agent probably defaulted to `<table>` because it's the conventional choice for "data with columns." It's not broken, but if the rows start feeling stiff or the column widths are fighting you, that's why.

If you want to redirect it: each row should be a `<div>` with `display: grid` using a shared `grid-template-columns` definition on a CSS custom property, so all rows — including the column header — use identical column widths without coordination overhead. Something like:

```css
.row {
  display: grid;
  grid-template-columns: 28px 1fr 110px 110px 72px 60px 72px 52px;
}
```

Define that once on a parent container and inherit it into `.col-header`, `.font-row`, and `.section-header`. Changing a column width then means changing one value in one place.

---

# you asked

It's getting better each time. Pushed update to github as well.

Still not populating features under feature tab and glyphs seems incomplete as well.

Families aren't grouped in family sidebar either.

---

# claude response

Good progress — the layout is coming together and the core data is flowing. Three specific issues to fix:

---

**1. Features showing 0**

The feature count in the table is showing 0 and the Features tab says "No feature list." This means `featureDetails` isn't making it onto the `CachedFont` after parsing. The extractor pipeline runs features through `FeatureExtractor.ts` but the result needs to be mapped onto `cachedFont.featureDetails` in `FontLoader.ts` or wherever the `CachedFont` is assembled.

Tell your agent to check: after `parseFontHandle` returns a `CachedFont`, log `cachedFont.featureDetails` and `cachedFont.features` to the console. If both are empty or undefined, the issue is in how the extraction suite results are mapped onto the `CachedFont` object — likely `featureDetails` isn't being assigned from `extractionSuite.features.data`. It should mirror exactly how Fontrapunkt-2 assembles the `CachedFont` after full extraction.

---

**2. Glyphs tab only showing left side**

The right side says "Open in viewer to inspect glyphs. Glyph count from matched record." This means the agent didn't implement lazy parsing of the matched processed file — it fell back to a placeholder. The processed file needs to be parsed on demand when the Glyphs tab is opened, same as the unprocessed file. The file handle for the matched record should be retrievable from the processed directory handle using `processedDirHandle.getFileHandle(matchedRecord.fileName)` — though this only works if the matched file is at the root, not in a subdirectory. If files are in subdirectories the agent needs to store the relative path in `IndexRecord` and traverse it.

---

**3. Family sidebar not grouping**

Each font is appearing as its own entry rather than being grouped. The `groupByFamily` function in `matcher.ts` is either not being called or the sidebar is iterating over individual fonts instead of the Map it returns. The sidebar should iterate over `familyGroups.keys()`, not over `unprocessedFonts`. Tell the agent to verify that `workbenchStore.familyGroups` is a `Map<string, CachedFont[]>` and that the sidebar is reading from that, not from the raw font list.

---

# you asked

Better yet. Still floundering on the processed glyphs.
The headers aren't selectable either, so I can't sort the tables by selecting them. The tables aren't sorted in any way that I can tell. Just random.

For reference: The unprocessed files are just duplicates of the processed files with ~001 added to the file name. No actual changes to the files. So the content should be identical other than the filename.

---

# claude response

Good progress — features and grouping are both working now. Three things to fix:

**Processed glyphs error**

"A requested file or directory could not be found" means the agent is trying to call `processedDirHandle.getFileHandle(fileName)` but the processed files are inside subdirectories, not at the root. The `IndexRecord` needs to store the relative path segments so the lookup can traverse them. Tell the agent:

```
When resolving a processed file for the Glyphs tab, use the filePath 
stored in IndexRecord to traverse the directory tree from the root 
processedDirHandle. Split filePath by '/' and walk each segment using 
getDirectoryHandle() before the final getFileHandle() call.
```

**Sorting**

The table needs default sort on filename alphabetically, ascending. Tell the agent to sort the unprocessed fonts array by `fileName` before rendering, and make each column header clickable — clicking once sorts ascending, again sorts descending, third click returns to default. Store `sortColumn` and `sortDirection` in local component state, not the Zustand store (it's display-only state). The `~001` files will naturally sort adjacent to their base file alphabetically, which is exactly what you want for scanning duplicates.

**~001 files not highlighted**

Looking at Image 5, the `~001` rows have no visual distinction from regular rows — same background, no amber tint, no badge. The `TILDE_COUNTER` flag detection in the matcher should be catching these but the styling isn't applied. The row needs `data-duplicate="true"` and the CSS rule targeting that attribute needs to set the warm amber background. Worth checking whether the matcher is actually setting the flag or whether the flag is set but the CSS selector isn't matching.

The two-section layout in Image 5 is exactly right — unprocessed on top, matched processed below with the count indicator. That's the correct structure.