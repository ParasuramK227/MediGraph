# Style Spec — Admin Graph Panel & Knowledge Graph Pages

**This is a visual/styling spec only — no functionality, routes, or API wiring described here.** Use alongside `06_task_admin_graph_panel.md` (functional spec) and `07_task_graph_views.md`. Attach the Neo4j Browser reference screenshots whenever you send this prompt — this document describes what's in them, it doesn't replace them.

This spec is derived directly from the attached Neo4j Browser screenshots. Where a value can't be read precisely from a screenshot (exact hex codes, precise pixel spacing), it's marked **[approximate — verify against screenshot]** rather than invented outright.

---

## 1. Surface & background colors

- **App background (admin panel only):** near-black, slightly warm-neutral dark gray — not pure `#000000`. **[approximate: `#1a1a1a`–`#1e1e1e`]**
- **Panel/sidebar background:** same as app background or one step lighter — panels are not visually boxed with heavy borders; separation comes mostly from subtle spacing and the graph canvas being pure black rather than a hard divider line.
- **Graph canvas background:** true or near-true black, darker than the surrounding chrome — the canvas reads as a distinct "viewport" against the rest of the UI.
- **Query input bar:** same dark background as the canvas area, with a thin lighter-gray border/outline to indicate it's an input field.
- This background treatment applies to the **admin panel only**. Per-feature graph views (Task 07) sit inside the app's normal light/dark theme — they do not force this dark palette when the app is in light mode.

## 2. Typography

- **Query bar and all Cypher text:** monospace font (`neo4j$` prompt prefix, query text itself).
- **Stat/count numbers** (node counts, relationship counts, timing footer numbers): should map to the project's `--font-mono-stat` (Departure Mono) token — the reference screenshots use a monospace-leaning numeric style here, which is exactly what that token is for.
- **Chip/pill labels** (node labels, relationship types, property keys): a clean sans-serif, small size, medium weight, all-caps is **not** used — labels appear in their natural casing (`ClinicalStudy`, `HAS_DIAGNOSIS`).
- **Body/UI text** (panel headers like "Database information," "Results overview"): sans-serif, slightly larger and lighter weight than the chip text.
- **Timing footer text** ("Started streaming N records after Xms and completed after Yms"): small, muted gray, sans-serif — clearly de-emphasized relative to the result content above it.
- **Table view cell text:** monospace or mono-leaning, especially for ID-like values (`BATCH-1001`) — these render in an accent color (see Section 3) rather than plain white/gray.

## 3. Color system — node/relationship labels

Each node label and relationship type gets **one fixed, distinct color**, used consistently everywhere that label appears: the Database Information chip, every node of that label in every graph canvas, and the corresponding chip in the Results Overview panel. This mapping must be identical across the admin panel and all per-feature graph views (Task 07) — a `Patient` node is the same color everywhere in the app.

Observed color groupings from the reference screenshots **[exact hex values approximate — sample directly from screenshots if pixel-perfect matching is required]**:

| Label | Observed color family |
|---|---|
| `ClinicalStudy` | Purple / lavender |
| `Disease` | Blue |
| `Distributor` | Green |
| `Doctor` | Teal / cyan |
| `DrugBatch` | Green (distinct shade from Distributor) |
| `Evidence` | Orange / amber |
| `Hospital` | Pink / magenta |
| `LabTest` | Tan / khaki |
| `Manufacturer` | Tan (distinct shade from LabTest) |
| `MedicalRecord` | Tan (distinct shade) |
| `Medication` | Teal |
| `Patient` | Tan / warm gold |
| `Pharmacy` | Teal (distinct shade) |
| `Supplier` | Pink |
| `Symptom` | Tan |
| `Treatment` | Pink |
| `Warehouse` | Tan |
| `ConsultationNote` *(new — not in reference)* | Assign an unused color from the same palette family, distinct from all above |

This is the standard Neo4j Browser auto-assigned category palette — a fixed rotating set of muted, desaturated colors (blues, tans/golds, pinks, greens, teals, purples, oranges) applied in label-declaration order. Implement it the same way: define a fixed ordered palette array and assign colors to labels deterministically (e.g. by hash of label name, or by first-seen order), rather than randomly, so colors stay stable across reloads.

**Chip styling:** rounded/pill-shaped, solid fill in the label's color, dark/black text on the lighter chips and white text on the darker chips (match whichever reads better per color — the reference alternates based on chip lightness).

**Node styling in the graph canvas:** solid-filled circles in the label's color, label name displayed inside or truncated with ellipsis if the node's display text is too long for the circle (e.g. `"Lakshm-i..."` truncation pattern visible in the reference). No stroke/border on nodes — flat fill only.

**Relationship line styling:** thin gray/muted lines (not colored per-type — only nodes carry the color, edges stay neutral gray), with the relationship type name rendered directly along the line, rotated to match the line's angle, in small uppercase-tracked gray text.

## 4. Layout components

### 4.1 Top status bar
- Full-width, single row, dark background.
- Left-aligned: green connection-status dot, `Instance: neo4j://localhost:7687` (or equivalent AuraDB URI), `Database: neo4j` with a dropdown chevron, `User: neo4j` with a dropdown chevron. Each of these three is a small pill/segment.
- Right-aligned: "Connect your instance to AuraDB for more tools and features ↗" as a blue/accent-colored link with an external-link arrow.

### 4.2 Left icon rail
- Narrow fixed-width vertical strip, icons stacked with generous vertical spacing.
- Icons (top to bottom): database/stack icon, bookmark, clock/history, book/docs, dev-tools braces `{}`, settings gear.
- One icon (typically the top database icon) is highlighted/active with a colored left-border accent or filled background, distinguishing it from the others which are muted gray.

### 4.3 Database Information panel
- Header: "Database information" in slightly larger text.
- "Nodes (N)" subheading, followed by wrapped rows of colored label chips (see Section 3), including a `*` chip representing "all."
- "Relationships (N)" subheading, same chip treatment for relationship types.
- "Property keys" subheading, chips in a neutral gray (not colored — property keys aren't label-colored).
- If the property key list is long, show roughly 20 by default with a **"Show all property keys (N more)"** expandable link/button below the visible ones, styled as a small blue text link with a chevron icon.
- Footer: "Last update: [time]" with a small refresh/reload icon, muted gray text.

### 4.4 Query bar
- `neo4j$` prompt prefix in monospace, muted color, followed by the typed query in a brighter/white monospace.
- Right-aligned within the bar: a bookmark icon and a circular play/run button (accent-colored circle with a triangle).
- Below the active query bar, previous query+result pairs stack in the same pattern, scrollable — this is a running history, not a single replaced view.

### 4.5 Result block (per query)
- Tab row: **Graph | Table | RAW** — text tabs, active tab underlined or highlighted, inactive tabs muted gray.
- Canvas/table/raw content area below the tabs, occupying the majority of the block's width.
- Canvas top-right controls: search (magnifying glass), download (arrow into tray), and a panel-layout toggle icon — small, muted, icon-only buttons in a row.
- Canvas bottom-right controls: a small cluster containing a pointer/select-mode dropdown, zoom in (+), zoom out (–), fit-to-view (expand icon), and a layout/physics icon (sparkle/atom-like icon) — all small circular or square icon buttons.
- A **Results Overview** panel sits to the right of the canvas (not below), same width roughly as the Database Information panel, showing:
  - "Nodes (N)" with colored chips per label present in this result, each chip showing a count (e.g. `Disease (22)`).
  - "Relationships (N)" same treatment.
  - A small up/down sort-arrow icon next to the "Nodes (N)" heading.
- Footer line beneath the whole result block, small muted gray text: `Started streaming N records after Xms and completed after Yms.`

### 4.6 Table view
- Plain data grid: column headers in a slightly bolder/brighter text, row values below.
- Row index numbers shown in a narrow leftmost gutter column.
- Values that look like identifiers/codes (e.g. `batch_id` values like `"BATCH-1001"`) render in an accent color (amber/orange in the reference) rather than plain white — this distinguishes "data values" from structural text (e.g. the literal string `"node"` in a neutral/lavender tone in the same table).
- Alternating row shading is minimal to none in the reference — rows are separated mostly by whitespace/thin dividers, not strong zebra-striping.

## 5. Spacing & shape

- Generous padding inside all panels — nothing feels cramped; the reference uses noticeably more whitespace than a dense data-tool would.
- Chips: fully rounded (pill-shaped), small padding, small gap between chips in a wrapped row.
- Icon buttons (canvas controls): small rounded-square or circular buttons, subtle background on hover, no visible border in idle state.
- No heavy drop shadows anywhere — separation between elements comes from background-color contrast and spacing, not shadow/elevation effects.

## 6. Icons

- All icons should come from **Lucide**, matching the outline/stroke style visible throughout the reference (thin stroke weight, no filled icons except the run/play button and the active-state indicators).

## 7. Consistency requirement

Every color, spacing value, and font used in this spec must be pulled from the project's centralized design-token system (`tokens.css`) — introduce new token variables here if the existing token set (built in Task 04) doesn't yet cover dark-panel-specific values (e.g. `--admin-bg`, `--admin-canvas-bg`, `--node-color-patient`, `--node-color-disease`, etc.). Do not hardcode any of the values in this document directly into component files.
